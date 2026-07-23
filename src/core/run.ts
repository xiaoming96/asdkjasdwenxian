/**
 * 冒险层 reducer（策划案 §9–§12）
 * 引擎唯一入口：next = reduce(state, action)。
 */
import type {
  Action, EventScreen, Profile, RewardScreen, RunState, Screen,
  ShopItem, ShopScreen,
} from './types';
import { initRngState, rngInt, rngPick, rngShuffle, rngWeighted } from './rng';
import { generateActMap, findNode, selectableNodes, baiduJump } from './map';
import {
  startBattle, playCard, endTurn, resolveChoice, usePotionInBattle, makeCard,
} from './combat';
import { CARDS, getCard, cardsByRarity } from '../data/cards';
import { relicsByGrade } from '../data/relics';
import { COMMON_POTIONS, POTION_IDS, POTIONS } from '../data/potions';
import { eventPool, getEvent, type EventOutcome } from '../data/events';
import { BREAKTHROUGH_IDS, BREAKTHROUGHS } from '../data/breakthroughs';
import { CHARACTERS, lockedCardIds } from '../data/unlocks';
import type { Rarity } from './types';

// ---------- 新局 ----------

export function newRun(
  profile: Profile, seed: string, ascension: number,
  character = 'jianxiu', dailyFlag?: string,
): RunState {
  const run: RunState = {
    seed, ascension: Math.max(0, Math.min(9, ascension)),
    act: 1, floor: -1, nodeId: null,
    hp: 80, maxHp: 80,
    gold: profile.unlocked.includes('qiankundai') ? 15 : 0,
    deck: [], relics: [], potions: [], potionCap: 3,
    breakthroughs: [], liushuiBonus: 0.25, liushuiRefundCap: 2,
    drawPerTurn: 5, energyMax: 3, battleStartBlock: 0,
    map: { act: 1, layers: [] }, battle: null, screen: { kind: 'map' },
    rng: initRngState(seed),
    stats: { elitesKilled: 0, bossesKilled: 0, potionsUsed: 0, cardsUpgraded: 0, damageTaken: 0, battles: 0 },
    removeCostBase: 75, usedEvents: [], uidCounter: 0, flags: {}, gongdeBattles: 0, over: false,
  };
  const chr = CHARACTERS[character] ?? CHARACTERS['jianxiu'];
  for (const id of chr.deck) run.deck.push(makeCard(run, id));
  if (dailyFlag) {
    run.flags[dailyFlag] = 1;
    if (dailyFlag === 'dailyLingchao') {
      // 灵潮汹涌：灵气 4，抽牌 4（§11.3）
      run.energyMax = 4;
      run.drawPerTurn = 4;
    }
    if (dailyFlag === 'dailyDadao') {
      // 大道五十：起始牌库扩为 25 张
      while (run.deck.length < 25) {
        const r = rngPick(run.rng, 'misc', chr.deck);
        run.rng = r.state;
        run.deck.push(makeCard(run, r.value));
      }
    }
    if (dailyFlag === 'dailyXinmo') run.deck.push(makeCard(run, 'xinmo_curse'));
  }
  // 四重天：起始 +1 尘缘（§11.2）
  if (run.ascension >= 4) run.deck.push(makeCard(run, 'chenyuan'));
  run.map = generateActMap(run, 1);
  return run;
}

// ---------- 深拷贝（对调用方保持不可变） ----------

export function cloneRun(run: RunState): RunState {
  if (typeof structuredClone === 'function') return structuredClone(run);
  return JSON.parse(JSON.stringify(run)) as RunState;
}

// ---------- 卡牌奖励池 ----------

function rewardRarity(run: RunState, kind: 'normal' | 'elite' | 'boss'): Rarity {
  let weights: [number, number, number, number];
  if (kind === 'normal') weights = [70, 25, 5, 0];
  else if (kind === 'elite') weights = [50, 38, 12, 0];
  else weights = [0, 55, 40, 5]; // Boss：稀 55/史 40/传 5
  const r = rngWeighted(run.rng, 'cardReward', weights);
  run.rng = r.state;
  return (['common', 'rare', 'epic', 'legendary'] as Rarity[])[r.value];
}

function cardPool(run: RunState, rarity: Rarity, unlocked: string[]): string[] {
  const locked = lockedCardIds(unlocked);
  let pool = cardsByRarity(rarity).map((c) => c.id).filter((id) => !locked.has(id));
  // 传说需"传说觅踪"解锁
  if (rarity === 'legendary' && !unlocked.includes('chuanshuomizong')) pool = [];
  // 每日天机·五行归一：只出某一行
  if (run.flags['dailyGuiyi']) {
    const els = ['metal', 'wood', 'water', 'fire', 'earth'];
    const el = els[Math.abs(run.seed.length + run.act) % 5];
    const onlyEl = pool.filter((id) => CARDS[id].element === el || CARDS[id].element === 'none');
    if (onlyEl.length >= 3) pool = onlyEl;
  }
  // 已拥有 2 张的传说/史诗不再出现
  if (rarity === 'legendary' || rarity === 'epic') {
    pool = pool.filter((id) => run.deck.filter((c) => c.cardId === id).length < 2);
  }
  return pool;
}

function rollCardChoices(run: RunState, kind: 'normal' | 'elite' | 'boss', unlocked: string[]): { cardId: string; upgraded: boolean }[] {
  const out: { cardId: string; upgraded: boolean }[] = [];
  for (let i = 0; i < 3; i++) {
    for (let attempt = 0; attempt < 10; attempt++) {
      let rar = rewardRarity(run, kind);
      let pool = cardPool(run, rar, unlocked);
      if (pool.length === 0) { pool = cardPool(run, 'common', unlocked); rar = 'common'; }
      const r = rngPick(run.rng, 'cardReward', pool);
      run.rng = r.state;
      if (out.some((c) => c.cardId === r.value)) continue; // 同批不重复
      out.push({ cardId: r.value, upgraded: false });
      break;
    }
  }
  return out;
}

function randomPotion(run: RunState, allowRare = true): string {
  const pool = allowRare ? POTION_IDS : COMMON_POTIONS;
  const r = rngPick(run.rng, 'misc', pool);
  run.rng = r.state;
  return r.value;
}

function randomRelic(run: RunState, grades: ('fan' | 'ling' | 'xian' | 'jie')[]): string | null {
  const pool = grades.flatMap((g) => relicsByGrade(g)).map((x) => x.id)
    .filter((id) => !run.relics.includes(id)); // 同名法宝不重复
  if (pool.length === 0) return null;
  const r = rngPick(run.rng, 'misc', pool);
  run.rng = r.state;
  return r.value;
}

export function gainRelic(run: RunState, id: string) {
  if (run.relics.includes(id)) return;
  run.relics.push(id);
  if (id === 'yuhulu') run.potionCap += 1;
  if (id === 'pantao') { run.maxHp += 20; run.hp = run.maxHp; }
  if (id === 'xinmozhong') run.energyMax += 1;
}

export function gainPotion(run: RunState, id: string): boolean {
  if (run.potions.length >= run.potionCap) return false;
  run.potions.push(id);
  return true;
}

// ---------- 战斗结束 → 奖励（§4.7） ----------

function battleRewards(run: RunState, unlocked: string[]) {
  const b = run.battle!;
  const kind = b.battleType;
  run.stats.battles += 1;
  if (kind === 'elite') run.stats.elitesKilled += 1;
  if (kind === 'boss') run.stats.bossesKilled += 1;
  if (run.gongdeBattles > 0) run.gongdeBattles -= 1;

  let goldMin = 10, goldMax = 20;
  if (kind === 'elite') { goldMin = 25; goldMax = 35; }
  if (kind === 'boss') { goldMin = 68; goldMax = 82; }
  const g = rngInt(run.rng, 'misc', goldMin, goldMax);
  run.rng = g.state;
  let gold = g.value;
  if (run.flags['shiyue']) gold = Math.floor(gold * 1.5); // 蚀月之夜
  if (run.relics.includes('moyupixiu')) gold += 3;

  // 丹药掉落：普通 8% / 精英 20%
  let potion: string | null = null;
  const p = rngInt(run.rng, 'misc', 1, 100);
  run.rng = p.state;
  if ((kind === 'normal' && p.value <= 8) || (kind === 'elite' && p.value <= 20)) {
    potion = randomPotion(run, false);
  }
  // 青铜丹炉：每 3 场战斗 1 枚
  if (run.relics.includes('qingtongdanlu') && run.stats.battles % 3 === 0) {
    if (!potion) potion = randomPotion(run, false);
  }

  // 法宝：精英必掉；每日天机·杀劫掉落翻倍（第二件直接入囊）
  let relic: string | null = null;
  if (kind === 'elite') {
    relic = randomRelic(run, ['fan', 'ling']);
    if (run.flags['dailyShajie']) {
      const extra = randomRelic(run, ['fan', 'ling']);
      if (extra) gainRelic(run, extra);
    }
  }

  const cards = rollCardChoices(run, kind, unlocked);
  const screen: RewardScreen = { kind: 'reward', gold, cards, relic, potion, goldTaken: false };
  run.screen = screen;
  run.battle = null;

  // 灵狐报恩：两幕后赠灵品法宝（简化为战斗次数计数）
  if (run.flags['linghu'] && run.stats.battles >= 8) {
    delete run.flags['linghu'];
    const bonus = randomRelic(run, ['ling']);
    if (bonus) gainRelic(run, bonus);
  }
  // 放生池：2 层后鲤跃
  if (run.flags['fangsheng']) {
    run.flags['fangshengCount'] = (run.flags['fangshengCount'] ?? 0) + 1;
    if (run.flags['fangshengCount'] >= 2) {
      delete run.flags['fangsheng'];
      const r = rngInt(run.rng, 'misc', 1, 100);
      run.rng = r.state;
      const grade = r.value <= 30 ? 'xian' : 'ling';
      const bonus = randomRelic(run, [grade]);
      if (bonus) gainRelic(run, bonus);
    }
  }
}

/** 战后特殊事件奖励 */
function eventBattleReward(run: RunState) {
  const tag = run.flags['eventBattleReward'];
  delete run.flags['eventBattleReward'];
  switch (tag) {
    case 1: { // 走火入魔：胜得史诗牌
      const pool = cardsByRarity('epic').map((c) => c.id);
      const r = rngPick(run.rng, 'cardReward', pool);
      run.rng = r.state;
      run.deck.push(makeCard(run, r.value));
      break;
    }
    case 2: { // 义庄：胜得法宝
      const relic = randomRelic(run, ['fan', 'ling']);
      if (relic) gainRelic(run, relic);
      break;
    }
    case 3: // 剑冢：胜得万剑诀
      run.deck.push(makeCard(run, 'wanjianjue'));
      break;
    case 4: { // 尸变客栈：胜得灵品法宝
      const relic = randomRelic(run, ['ling']);
      if (relic) gainRelic(run, relic);
      break;
    }
    case 5: { // 童子求救：仙品 40%/灵品 60%
      const r = rngInt(run.rng, 'misc', 1, 100);
      run.rng = r.state;
      const relic = randomRelic(run, [r.value <= 40 ? 'xian' : 'ling']);
      if (relic) gainRelic(run, relic);
      break;
    }
  }
}

// ---------- 坊市（§9.3） ----------

function makeShop(run: RunState, unlocked: string[], discountOverride?: number): ShopScreen {
  const items: ShopItem[] = [];
  const priceOf = (lo: number, hi: number) => {
    const r = rngInt(run.rng, 'shop', lo, hi);
    run.rng = r.state;
    let p = r.value;
    if (run.flags['dailyPinji']) p = Math.floor(p * 1.5);
    return p;
  };
  // 卡牌 5 张：3 普 2 稀；10% 其中 1 张升格史诗，5% 传说
  const rarities: Rarity[] = ['common', 'common', 'common', 'rare', 'rare'];
  const up = rngInt(run.rng, 'shop', 1, 100);
  run.rng = up.state;
  if (up.value <= 5 && unlocked.includes('chuanshuomizong')) rarities[4] = 'legendary';
  else if (up.value <= 15) rarities[4] = 'epic';
  const usedIds = new Set<string>();
  for (const rar of rarities) {
    const pool = cardPool(run, rar, unlocked).filter((id) => !usedIds.has(id));
    if (pool.length === 0) continue;
    const r = rngPick(run.rng, 'shop', pool);
    run.rng = r.state;
    usedIds.add(r.value);
    const price =
      rar === 'common' ? priceOf(45, 55) : rar === 'rare' ? priceOf(68, 82)
      : rar === 'epic' ? priceOf(118, 140) : 180;
    items.push({ kind: 'card', id: r.value, price, sold: false });
  }
  // 法宝 2 件
  for (let i = 0; i < 2; i++) {
    const g = rngWeighted(run.rng, 'shop', [55, 35, 10]);
    run.rng = g.state;
    const grade = (['fan', 'ling', 'xian'] as const)[g.value];
    const id = randomRelic(run, [grade]);
    if (!id) continue;
    const price = grade === 'fan' ? priceOf(88, 108) : grade === 'ling' ? priceOf(143, 157) : 220;
    items.push({ kind: 'relic', id, price, sold: false });
  }
  // 丹药 3 枚
  for (let i = 0; i < 3; i++) {
    const id = randomPotion(run);
    let price = POTIONS[id].rare ? priceOf(90, 110) : priceOf(48, 72);
    if (run.flags['danshi']) price = Math.floor(price * 0.6); // 救炼丹师：丹药 6 折
    items.push({ kind: 'potion', id, price, sold: false });
  }
  const discount = discountOverride ?? (run.relics.includes('tongqianjian') ? 0.9 : 1);
  return {
    kind: 'shop', items,
    removePrice: run.flags['dailyPinji'] ? 0 : run.removeCostBase,
    removeUsed: false, discount,
  };
}

// ---------- 事件（§10） ----------

function enterEvent(run: RunState, eventId?: string) {
  let id = eventId;
  if (!id) {
    const pool = eventPool(run.act, run.usedEvents);
    const r = rngPick(run.rng, 'event', pool);
    run.rng = r.state;
    id = r.value.id;
  }
  run.usedEvents.push(id);
  run.screen = { kind: 'event', eventId: id, stage: 0, resultText: null, disabled: [] } as EventScreen;
}

/** 当前局外解锁（reduce 入口设置，供事件/坊市生成读取） */
let currentUnlocks: string[] = [];

function applyOutcome(run: RunState, o: EventOutcome, screen: EventScreen) {
  if (o.gold) run.gold = Math.max(0, run.gold + o.gold);
  if (o.hp) {
    if (o.hp > 0) run.hp = Math.min(run.maxHp, run.hp + o.hp);
    else run.hp = Math.max(1, run.hp + o.hp); // 事件失血不致死（保底 1）
  }
  if (o.maxHp) {
    run.maxHp = Math.max(10, run.maxHp + o.maxHp);
    run.hp = Math.min(run.hp, run.maxHp);
  }
  if (o.heal === 'full') run.hp = run.maxHp;
  if (o.heal === 'half') run.hp = Math.max(1, Math.floor(run.hp / 2));
  if (typeof o.heal === 'number') run.hp = Math.min(run.maxHp, run.hp + o.heal);
  if (o.gainCardRarity) {
    const pool = cardsByRarity(o.gainCardRarity).map((c) => c.id);
    const r = rngPick(run.rng, 'event', pool);
    run.rng = r.state;
    run.deck.push(makeCard(run, r.value));
    screen.resultText = (screen.resultText ?? o.text) + `\n获得【${getCard(r.value).name}】`;
  }
  if (o.gainCardId) {
    run.deck.push(makeCard(run, o.gainCardId, o.gainCardUpgraded));
  }
  if (o.gainCurse) run.deck.push(makeCard(run, o.gainCurse));
  if (o.gainPotion) {
    for (let i = 0; i < o.gainPotion; i++) gainPotion(run, randomPotion(run));
  }
  if (o.gainRelicGrade) {
    const id = randomRelic(run, [o.gainRelicGrade]);
    if (id) gainRelic(run, id);
  }
  if (o.gainRelicId) gainRelic(run, o.gainRelicId);
  if (o.upgradeRandom) {
    const cands = run.deck.filter((c) => !c.upgraded && getCard(c.cardId).type !== 'curse');
    const r = rngShuffle(run.rng, 'event', cands);
    run.rng = r.state;
    for (const c of r.value.slice(0, o.upgradeRandom)) {
      c.upgraded = true;
      run.stats.cardsUpgraded += 1;
    }
  }
  if (o.flag) run.flags[o.flag] = o.flagValue ?? 1;

  // 特殊脚本
  switch (o.special) {
    case 'gongde':
      run.gold = 0;
      run.gongdeBattles = 3;
      break;
    case 'baidu':
    case 'baidu_relic':
      if (o.special === 'baidu_relic' && run.relics.length > 0) run.relics.pop();
      baiduJump(run);
      break;
    case 'jinEpic': {
      const pool = cardsByRarity('epic').map((c) => c.id).filter((id) => CARDS[id].element === 'metal');
      const r = rngPick(run.rng, 'event', pool);
      run.rng = r.state;
      run.deck.push(makeCard(run, r.value));
      break;
    }
    case 'zuidao': {
      // 醉道人：随机 2 项
      const effects = ['maxhp', 'remove', 'potion', 'weak'];
      const r = rngShuffle(run.rng, 'event', effects);
      run.rng = r.state;
      const picked = r.value.slice(0, 2);
      const texts: string[] = [];
      for (const fx of picked) {
        if (fx === 'maxhp') { run.maxHp += 6; run.hp += 6; texts.push('气血上限 +6'); }
        if (fx === 'remove') { texts.push('肚中翻江倒海，杂念随酒气散去（进入删牌）'); }
        if (fx === 'potion') { gainPotion(run, randomPotion(run)); texts.push('得 1 枚丹药'); }
        if (fx === 'weak') { run.flags['zuidaoWeak'] = 2; texts.push('下场战斗虚弱 2'); }
      }
      screen.resultText = '三碗下肚：' + texts.join('；');
      if (picked.includes('remove')) {
        run.screen = { kind: 'cardPick', mode: 'remove', count: 1, reason: '酒后吐真：删 1 张牌', next: null };
        return;
      }
      break;
    }
    case 'shenlou':
      run.screen = makeShop(run, currentUnlocks, 0.8);
      return;
    case 'muxin':
      run.deck.push(makeCard(run, 'luoshi', true), makeCard(run, 'luoshi', true));
      break;
    case 'beiming':
      run.deck.push(makeCard(run, 'beimingtuntian'), makeCard(run, 'chenyuan'));
      break;
    case 'tianshu': {
      const r = rngInt(run.rng, 'event', 1, 100);
      run.rng = r.state;
      const rarity = r.value <= 5 ? 'legendary' : 'epic';
      const pool = cardsByRarity(rarity).map((c) => c.id);
      const p = rngPick(run.rng, 'event', pool);
      run.rng = p.state;
      run.deck.push(makeCard(run, p.value), makeCard(run, 'yezhang'));
      screen.resultText = `天书入体！获得【${getCard(p.value).name}】，业障缠身`;
      break;
    }
    case 'huangliang':
      run.hp = Math.min(run.maxHp, run.hp + Math.floor(run.maxHp * 0.25));
      run.flags['huangliang'] = 1;
      break;
    case 'freeCave':
      run.screen = { kind: 'cave', free: true };
      return;
    case 'huolang':
    case 'huolang_cheap':
    case 'huolang_expensive': {
      // 游方货郎：3 件凡品法宝 + 1 丹药
      const items: ShopItem[] = [];
      for (let i = 0; i < 3; i++) {
        const id = randomRelic(run, ['fan']);
        if (!id) break;
        const pr = rngInt(run.rng, 'shop', 55, 75);
        run.rng = pr.state;
        items.push({ kind: 'relic', id, price: pr.value, sold: false });
      }
      const pid = randomPotion(run);
      const pp = rngInt(run.rng, 'shop', 48, 72);
      run.rng = pp.state;
      items.push({ kind: 'potion', id: pid, price: pp.value, sold: false });
      const discount = o.special === 'huolang_cheap' ? 0.8 : o.special === 'huolang_expensive' ? 1.1 : 1;
      run.screen = { kind: 'shop', items, removePrice: 0, removeUsed: true, discount };
      return;
    }
    case 'extraBattle':
      // "多走 1 节点"的代价：立即多打一场普通战（§10.20 / §10.26）
      startBattle(run, 'normal');
      return;
    case 'zouhuoReward': run.flags['eventBattleReward'] = 1; break;
    case 'yizhuangReward': run.flags['eventBattleReward'] = 2; break;
    case 'jianzhongReward': run.flags['eventBattleReward'] = 3; break;
    case 'kezhanReward': run.flags['eventBattleReward'] = 4; break;
    case 'tongziReward': run.flags['eventBattleReward'] = 5; break;
  }

  // 删牌/参悟界面
  if (o.removeCards) {
    run.screen = { kind: 'cardPick', mode: 'remove', count: o.removeCards, reason: o.text, next: null };
    return;
  }
  if (o.upgradeCards) {
    run.screen = { kind: 'cardPick', mode: 'upgrade', count: o.upgradeCards, reason: o.text, next: null };
    return;
  }
  // 战斗事件
  if (o.battle || o.battleElite) {
    if (o.battleElite) {
      startBattle(run, 'elite');
    } else if (o.battle === 'zhinian_x2') {
      startBattle(run, 'normal', ['zhinian', 'zhinian']);
    } else if (o.battle === 'tiaoshi_x2') {
      startBattle(run, 'normal', ['tiaoshi', 'tiaoshi']);
    } else if (o.battle === 'shiqun') {
      startBattle(run, 'normal', ['shiqun', 'shiqun', 'shiqun', 'shiqun']);
    } else {
      startBattle(run, 'normal', [o.battle!]);
    }
    return;
  }
}

// ---------- 洞府（§9.4） ----------

function caveRest(run: RunState) {
  const pct = run.ascension >= 5 ? 0.2 : 0.3; // 五重天：休整 30%→20%
  let heal = Math.floor(run.maxHp * pct);
  if (run.relics.includes('pinganfu')) heal += 8;
  run.hp = Math.min(run.maxHp, run.hp + heal);
}

// ---------- 突破（§9.5） ----------

function rollBreakthroughs(run: RunState): string[] {
  const pool = BREAKTHROUGH_IDS.filter((id) => !run.breakthroughs.includes(id));
  const r = rngShuffle(run.rng, 'misc', pool);
  run.rng = r.state;
  const count = run.ascension >= 7 ? 2 : 3; // 七重天：三选一 → 二选一
  return r.value.slice(0, count);
}

function applyBreakthrough(run: RunState, id: string) {
  run.breakthroughs.push(id);
  switch (id) {
    case 'jindanningcheng': run.energyMax += 1; break;
    case 'roushenchengsheng': run.maxHp += 12; run.hp += 12; run.battleStartBlock += 5; break;
    case 'shenshidazhang': run.drawPerTurn += 1; run.maxHp -= 8; run.hp = Math.min(run.hp, run.maxHp); break;
    case 'wuxingtiaohe': run.liushuiBonus = 0.4; break;
    case 'yaowangchuancheng':
      run.potionCap += 2;
      gainPotion(run, randomPotion(run));
      gainPotion(run, randomPotion(run));
      break;
    case 'dadaozhijian':
      run.maxHp += 10; run.hp += 10;
      run.screen = { kind: 'cardPick', mode: 'remove', count: 2, reason: '大道至简：删除至多 2 张牌', next: 'afterBreakthrough' };
      return;
    // jianxin_genji / houde_genji / tianshengdaoti 在战斗引擎中检查
  }
  afterBreakthrough(run);
}

function afterBreakthrough(run: RunState) {
  // 进入下一幕
  if (run.act >= 3) {
    finishRun(run, true, '白日飞升');
    return;
  }
  run.act = (run.act + 1) as 2 | 3;
  run.floor = -1;
  run.nodeId = null;
  run.map = generateActMap(run, run.act);
  delete run.flags['shiyue'];
  if (run.flags['dailyXinmo']) run.deck.push(makeCard(run, 'xinmo_curse'));
  run.screen = { kind: 'map' };
}

// ---------- 结算（§12.4 / §11.1） ----------

export function computeScore(run: RunState, victory: boolean): number {
  const actsPassed = victory ? 3 : run.act - 1;
  const turnsTotal = run.flags['turnsTotal'] ?? 0;
  const score =
    300 * actsPassed +
    30 * run.stats.elitesKilled +
    80 * run.stats.bossesKilled +
    run.hp * 2 +
    run.potions.length * 10 +
    (run.flags['zhoutianTotal'] ?? 0) * 40;
  return Math.max(0, Math.floor(score * (1 + 0.15 * run.ascension)) - turnsTotal);
}

export function computeDaowei(run: RunState, victory: boolean): number {
  const actsPassed = victory ? 3 : run.act - 1;
  const score = computeScore(run, victory);
  return Math.max(5, 10 * actsPassed + 3 * run.stats.elitesKilled + 10 * run.stats.bossesKilled + Math.floor(score / 100));
}

/** 依据构筑生成道号（§3.3） */
export function makeDaohao(run: RunState): string {
  const counts: Record<string, number> = {};
  for (const c of run.deck) {
    const el = getCard(c.cardId).element;
    counts[el] = (counts[el] ?? 0) + 1;
  }
  const top = Object.entries(counts).filter(([k]) => k !== 'none').sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';
  const names: Record<string, string> = {
    metal: '万剑真君', wood: '青木上仙', water: '玄溟道君', fire: '焚天真君', earth: '镇岳天尊', none: '太一散人',
  };
  return names[top];
}

function finishRun(run: RunState, victory: boolean, cause: string) {
  run.over = true;
  if (run.battle) {
    run.flags['turnsTotal'] = (run.flags['turnsTotal'] ?? 0) + run.battle.turnsTotal;
    run.flags['zhoutianTotal'] = (run.flags['zhoutianTotal'] ?? 0) + run.battle.zhoutianTotal;
    run.battle = null;
  }
  const score = computeScore(run, victory);
  const daowei = computeDaowei(run, victory);
  run.screen = {
    kind: 'end', victory, cause, score, daowei,
    daohao: victory ? makeDaohao(run) : null,
  };
}

// ---------- 进入节点 ----------

function enterNode(run: RunState, nodeId: string, unlocked: string[]) {
  const node = findNode(run, nodeId);
  if (!node) return;
  run.floor = node.layer;
  run.nodeId = nodeId;
  run.flags[`visited_${nodeId}`] = 1; // 结算路线缩略用

  let type = node.type;
  if (type === 'unknown') {
    type = node.revealedType ?? 'battle';
    // 砸神像：下个未知节点必为精英
    if (run.flags['zashen']) {
      type = 'elite';
      delete run.flags['zashen'];
    }
  }

  switch (type) {
    case 'battle': startBattle(run, 'normal'); applyPreBattleFlags(run); break;
    case 'elite': startBattle(run, 'elite'); applyPreBattleFlags(run); break;
    case 'boss': startBattle(run, 'boss'); applyPreBattleFlags(run); break;
    case 'event': enterEvent(run); break;
    case 'shop': run.screen = makeShop(run, unlocked); break;
    case 'cave': run.screen = { kind: 'cave', free: false }; break;
    default: startBattle(run, 'normal');
  }
}

function applyPreBattleFlags(run: RunState) {
  const b = run.battle;
  if (!b) return;
  // 醉道人：下场战斗虚弱 2
  if (run.flags['zuidaoWeak']) {
    b.player.statuses.xuruo = (b.player.statuses.xuruo ?? 0) + run.flags['zuidaoWeak'];
    delete run.flags['zuidaoWeak'];
  }
  // 蚀月之夜：敌人 +1 罡气
  if (run.flags['shiyue']) {
    for (const e of b.enemies) e.statuses.gangqi = (e.statuses.gangqi ?? 0) + 1;
  }
  // 每日天机·万物有灵：敌人随机换五行
  if (run.flags['dailyWanwu']) {
    for (const e of b.enemies) {
      const r = rngPick(run.rng, 'enemyAI', ['metal', 'wood', 'water', 'fire', 'earth'] as const);
      run.rng = r.state;
      e.element = r.value;
    }
  }
}

// ---------- 主 reducer ----------

export function reduce(prev: RunState, action: Action, unlocked: string[] = []): RunState {
  if (prev.over) return prev;
  const run = cloneRun(prev);
  currentUnlocks = unlocked;

  // ---- 战斗内 ----
  if (run.battle) {
    const b = run.battle;
    switch (action.t) {
      case 'PLAY_CARD': playCard(run, b, action.uid, action.target); break;
      case 'END_TURN': endTurn(run, b); break;
      case 'USE_POTION': usePotionInBattle(run, b, action.potion, action.target); break;
      case 'RESOLVE_CHOICE': resolveChoice(run, b, action.picks); break;
      default: return prev;
    }
    // 战斗结束判定
    if (run.battle && run.battle.outcome === 'victory') {
      run.flags['turnsTotal'] = (run.flags['turnsTotal'] ?? 0) + run.battle.turnsTotal;
      run.flags['zhoutianTotal'] = (run.flags['zhoutianTotal'] ?? 0) + run.battle.zhoutianTotal;
      const wasBoss = run.battle.battleType === 'boss';
      const eventReward = run.flags['eventBattleReward'];
      if (wasBoss) {
        run.stats.bossesKilled += 1;
        run.stats.battles += 1;
        run.battle = null;
        if (run.act >= 3) {
          finishRun(run, true, '渡过九重天劫，白日飞升');
        } else {
          run.screen = { kind: 'breakthrough', options: rollBreakthroughs(run) };
        }
      } else if (eventReward) {
        run.stats.battles += 1;
        run.battle = null;
        eventBattleReward(run);
        run.screen = { kind: 'map' };
      } else {
        battleRewards(run, unlocked);
      }
    } else if (run.battle && run.battle.outcome === 'defeat') {
      finishRun(run, false, `身死道消于${run.battle.enemies.find((e) => e.hp > 0)?.name ?? '天劫'}之手`);
    }
    return run;
  }

  // ---- 冒险层 ----
  const screen = run.screen;
  switch (action.t) {
    case 'CHOOSE_NODE': {
      if (screen.kind !== 'map') return prev;
      if (!selectableNodes(run).includes(action.node)) return prev;
      enterNode(run, action.node, unlocked);
      return run;
    }
    case 'USE_POTION': { // 地图上使用 ⊙ 丹药
      const p = POTIONS[action.potion];
      if (!p?.mapUsable || !run.potions.includes(action.potion)) return prev;
      run.potions.splice(run.potions.indexOf(action.potion), 1);
      run.stats.potionsUsed += 1;
      if (action.potion === 'huixuedan') run.hp = Math.min(run.maxHp, run.hp + 12);
      if (action.potion === 'niepansan') run.hp = Math.min(run.maxHp, run.hp + Math.floor(run.maxHp * 0.3));
      if (action.potion === 'wudaodan') {
        run.screen = { kind: 'cardPick', mode: 'upgrade', count: 1, reason: '悟道丹：参悟 1 张牌', next: screenKindToNext(screen) };
      }
      return run;
    }
    case 'DISCARD_POTION': {
      const i = run.potions.indexOf(action.potion);
      if (i >= 0) run.potions.splice(i, 1);
      return run;
    }
    case 'PICK_REWARD_CARD': {
      if (screen.kind !== 'reward' || !screen.cards) return prev;
      if (action.index >= 0 && action.index < screen.cards.length) {
        const pick = screen.cards[action.index];
        run.deck.push(makeCard(run, pick.cardId, pick.upgraded));
        (run.screen as RewardScreen).cards = null;
      } else {
        // 跳过；竹简：换 8 灵石
        if (run.relics.includes('zhujian')) run.gold += 8;
        (run.screen as RewardScreen).cards = null;
      }
      return run;
    }
    case 'TAKE_REWARD_GOLD': {
      if (screen.kind !== 'reward' || screen.goldTaken) return prev;
      run.gold += screen.gold;
      (run.screen as RewardScreen).goldTaken = true;
      return run;
    }
    case 'TAKE_REWARD_RELIC': {
      if (screen.kind !== 'reward' || !screen.relic) return prev;
      gainRelic(run, screen.relic);
      (run.screen as RewardScreen).relic = null;
      return run;
    }
    case 'TAKE_REWARD_POTION': {
      if (screen.kind !== 'reward' || !screen.potion) return prev;
      if (gainPotion(run, screen.potion)) (run.screen as RewardScreen).potion = null;
      return run;
    }
    case 'LEAVE_REWARD': {
      if (screen.kind !== 'reward') return prev;
      if (!screen.goldTaken) run.gold += screen.gold; // 离开自动拾取灵石
      run.screen = { kind: 'map' };
      return run;
    }
    case 'BUY_ITEM': {
      if (screen.kind !== 'shop') return prev;
      const item = screen.items[action.index];
      if (!item || item.sold) return prev;
      let price = Math.floor(item.price * screen.discount);
      if (item.kind === 'card' && run.relics.includes('tongqianjian')) price = Math.floor(item.price * 0.9 * (screen.discount === 0.9 ? 1 : screen.discount));
      if (run.gold < price) return prev;
      if (item.kind === 'potion' && run.potions.length >= run.potionCap) return prev;
      run.gold -= price;
      const sc = run.screen as ShopScreen;
      sc.items[action.index].sold = true;
      if (item.kind === 'card') run.deck.push(makeCard(run, item.id, item.upgraded));
      if (item.kind === 'relic') gainRelic(run, item.id);
      if (item.kind === 'potion') gainPotion(run, item.id);
      return run;
    }
    case 'SHOP_REMOVE_CARD': {
      if (screen.kind !== 'shop' || screen.removeUsed) return prev;
      if (run.gold < Math.floor(screen.removePrice * 1)) return prev;
      const i = run.deck.findIndex((c) => c.uid === action.uid);
      if (i < 0) return prev;
      run.gold -= screen.removePrice;
      run.deck.splice(i, 1);
      run.removeCostBase += 25; // 每次购买后 +25（全局累计）
      (run.screen as ShopScreen).removeUsed = true;
      return run;
    }
    case 'LEAVE_SHOP': {
      if (screen.kind !== 'shop') return prev;
      run.screen = { kind: 'map' };
      return run;
    }
    case 'EVENT_OPTION': {
      if (screen.kind !== 'event' || screen.resultText) return prev;
      const ev = getEvent(screen.eventId);
      const opt = ev.options[action.option];
      if (!opt) return prev;
      if (opt.requireGold && run.gold < opt.requireGold) return prev;
      if (opt.requireRelic && run.relics.length === 0) return prev;
      // 掷后果
      let outcome: EventOutcome;
      if (opt.outcomes.length === 1) outcome = opt.outcomes[0];
      else {
        const r = rngWeighted(run.rng, 'event', opt.outcomes.map((x) => x.weight ?? 1));
        run.rng = r.state;
        outcome = opt.outcomes[r.value];
        // 九尾狐毫：负面结果重掷（每局一次）
        const isNegative = (outcome.hp ?? 0) < 0 || outcome.gainCurse || (outcome.maxHp ?? 0) < 0;
        if (isNegative && run.relics.includes('jiuweihuhao') && !run.flags['huhaoUsed']) {
          run.flags['huhaoUsed'] = 1;
          const r2 = rngWeighted(run.rng, 'event', opt.outcomes.map((x) => x.weight ?? 1));
          run.rng = r2.state;
          outcome = opt.outcomes[r2.value];
        }
      }
      const sc = run.screen as EventScreen;
      sc.resultText = outcome.text;
      applyOutcome(run, outcome, sc);
      return run;
    }
    case 'LEAVE_EVENT': {
      if (screen.kind !== 'event') return prev;
      run.screen = { kind: 'map' };
      return run;
    }
    case 'CAVE_OPTION': {
      if (screen.kind !== 'cave') return prev;
      if (action.option === 'rest') {
        caveRest(run);
        run.screen = { kind: 'map' };
      } else if (action.option === 'upgrade') {
        if (run.relics.includes('putuan')) run.hp = Math.min(run.maxHp, run.hp + 6);
        run.screen = { kind: 'cardPick', mode: 'upgrade', count: 1, reason: '洞府参悟：升级 1 张牌', next: null };
      } else if (action.option === 'alchemy') {
        if (!unlocked.includes('dongfuliandan')) return prev;
        gainPotion(run, randomPotion(run));
        run.screen = { kind: 'map' };
      }
      return run;
    }
    case 'PICK_CARD_SCREEN': {
      if (screen.kind !== 'cardPick') return prev;
      if (action.uid === -1) {
        // 跳过剩余
        run.screen = screen.next === 'afterBreakthrough' ? run.screen : { kind: 'map' };
        if (screen.next === 'afterBreakthrough') { afterBreakthrough(run); return run; }
        return run;
      }
      const i = run.deck.findIndex((c) => c.uid === action.uid);
      if (i < 0) return prev;
      if (screen.mode === 'remove') {
        run.deck.splice(i, 1);
      } else if (screen.mode === 'upgrade') {
        if (run.deck[i].upgraded || getCard(run.deck[i].cardId).type === 'curse') return prev;
        run.deck[i].upgraded = true;
        run.stats.cardsUpgraded += 1;
      }
      const sc = run.screen as Extract<Screen, { kind: 'cardPick' }>;
      sc.count -= 1;
      if (sc.count <= 0) {
        if (sc.next === 'afterBreakthrough') afterBreakthrough(run);
        else run.screen = { kind: 'map' };
      }
      return run;
    }
    case 'PICK_BREAKTHROUGH': {
      if (screen.kind !== 'breakthrough') return prev;
      if (!screen.options.includes(action.id) || !BREAKTHROUGHS[action.id]) return prev;
      applyBreakthrough(run, action.id);
      return run;
    }
    default:
      return prev;
  }
}

function screenKindToNext(_s: Screen): string | null {
  return null;
}
