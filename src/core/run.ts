/**
 * 冒险层 reducer v3（策划案 §4.7/4.8、§9–§12）
 * 引擎唯一入口：next = reduce(state, action)，入口深拷贝，对调用方保持不可变。
 *
 * 与并行模块的接口假设（集成核对用）：
 * - combat.ts：startBattle(run, tier, enemyIds?) / playCard(run,b,uid,target?,dualPick?)
 *   / endTurn(run,b,sleeveUids?) / resolveChoice(run,b,picks) / useElixirInBattle(run,b,elixirId,target?)
 *   / makeCard(run,cardId,upgraded?)。
 * - 战斗内服丹：useElixirInBattle 只结算战斗内效果；丹的移除、丹毒累积、stats.elixirsUsed
 *   由本文件统一处理（若 combat 已自行移除则不重复）。
 * - combat 读取的 run 侧字段/flag：demon（诅咒投影）、toxin（≥4 开局真伤）、karma、fruits、
 *   gongdeBattles、flags：chain_xianghuo / daolei_minus30 / jianji / xiaqian / huangliang /
 *   daoxin / dailyLingchao / dailyWenluan / dailyTianhuo / dailyMuxing。
 */
import type {
  Action, CardPickScreen, CaveScreen, EventOutcome, EventScreen, MaterialId, Profile,
  Rarity, RewardScreen, RunState, ShopItem, ShopScreen,
} from './types';
import type { CardElement } from './wuxing';
import { initRngState, rngInt, rngPick, rngShuffle, rngWeighted } from './rng';
import { generateActMap, findNode, selectableNodes, flyTargets, jumpToLayer } from './map';
import {
  startBattle, playCard, endTurn, resolveChoice, useElixirInBattle, makeCard,
} from './combat';
import { CARDS, getCard, cardsByRarity } from '../data/cards';
import { relicsByGrade } from '../data/relics';
import { COMMON_RECIPES, RECIPE_IDS, RECIPES, getRecipe } from '../data/alchemy';
import { DAOGUO, DAOGUO_IDS } from '../data/daoguo';
import { CHARACTERS } from '../data/milestones';
import { eventPool, getEvent } from '../data/events';

const MATERIAL_IDS: MaterialId[] = ['lingcao', 'yusui', 'yaodan', 'leisha'];

// ---------- 新局（§3.1/§11.1/§11.2/§11.3） ----------

export function newRun(
  profile: Profile, seed: string, ascension: number,
  character = 'jianxiu', dailyFlag?: string,
): RunState {
  const asc = Math.max(0, Math.min(9, ascension));
  const run: RunState = {
    seed, ascension: asc,
    act: 1, floor: -1, nodeId: null,
    realm: 'lianqi',
    hp: 108, maxHp: 108,
    gold: 0,
    lifespan: 60,
    demon: 0, toxin: 0, toxinMaxHpApplied: false,
    karma: 0,
    materials: { lingcao: 0, yusui: 0, yaodan: 0, leisha: 0 },
    recipes: ['huiyuandan', 'julingdan', 'xuanwudan'],
    elixirs: [], elixirCap: 4,
    deck: [], relics: [], fruits: [],
    poolCap: 6, drawPerTurn: 4, battleStartBlock: 0, flyUsed: 0,
    map: { act: 1, layers: [] }, battle: null, screen: { kind: 'map' },
    rng: initRngState(seed),
    stats: {
      elitesKilled: 0, bossesKilled: 0, elixirsUsed: 0, cardsUpgraded: 0,
      damageTaken: 0, battles: 0, lifespanBurned: 0, brews: 0,
    },
    usedEvents: [], uidCounter: 0, flags: {}, gongdeBattles: 0, over: false,
  };
  // 二重天·天不假年：开局寿元 −8（§11.2）
  if (asc >= 2) run.lifespan -= 8;

  // 业力（§11.1）：宿慧业力 + 四重天·业火随身 +1
  run.karma = Math.max(0, profile.legacy.karma + (asc >= 4 ? 1 : 0));
  run.demon = Math.max(0, Math.min(9, run.karma));
  if (run.demon > 0) run.flags['demonPeak'] = run.demon;

  // 角色卡组
  const chrId = CHARACTERS[character] ? character : 'jianxiu';
  const chr = CHARACTERS[chrId];
  run.flags[`char_${chrId}`] = 1;
  for (const id of chr.deck) run.deck.push(makeCard(run, id));

  // 业力：每 2 点永久塞 1 张【因果债】入起始牌库
  for (let i = 0; i < Math.floor(run.karma / 2); i++) run.deck.push(makeCard(run, 'yinguozhai'));

  // 宿慧（§11.1）
  if (profile.legacy.kind === 'card' && profile.legacy.cardId) {
    run.deck.push(makeCard(run, profile.legacy.cardId, profile.legacy.upgraded));
  } else if (profile.legacy.kind === 'relic' && profile.legacy.relicId) {
    gainRelic(run, profile.legacy.relicId);
  }
  // 'daoxing' 无实体：道行 +15 在 profileLogic 结算侧

  // 每日天机（§11.3）：run 只设 flag，战斗内修改由 combat 读 flag 实现
  if (dailyFlag) {
    run.flags[dailyFlag] = 1;
    if (dailyFlag === 'dailyXinmo') {
      run.demon = Math.max(run.demon, Math.min(9, run.karma + 4)); // 心魔滋长：开局心魔 4
      run.flags['demonPeak'] = Math.max(run.flags['demonPeak'] ?? 0, run.demon);
    }
    if (dailyFlag === 'dailyZhaolu') run.lifespan = 30; // 朝露之命：开局寿元 30（突破延寿翻倍）
    if (dailyFlag === 'dailyDadao') {
      // 大道五十：起始牌库扩为 25 张（重复抽自身卡组）
      while (run.deck.length < 25) {
        const r = rngPick(run.rng, 'misc', chr.deck);
        run.rng = r.state;
        run.deck.push(makeCard(run, r.value));
      }
    }
  }

  // 墨玉貔貅：每幕开始心魔 +1（宿慧携带时对第一幕生效）
  if (run.relics.includes('moyupixiu')) addDemon(run, 1);

  run.map = generateActMap(run, 1);
  return run;
}

// ---------- 深拷贝 ----------

export function cloneRun(run: RunState): RunState {
  if (typeof structuredClone === 'function') return structuredClone(run);
  return JSON.parse(JSON.stringify(run)) as RunState;
}

// ---------- 心魔 / 丹毒 / 寿元（三本账） ----------

/** 心魔 ±（0–9 夹取；劫宝「心魔种」本局心魔下限 3） */
export function addDemon(run: RunState, delta: number) {
  const floor = run.relics.includes('xinmozhong') ? 3 : 0;
  run.demon = Math.max(floor, Math.min(9, run.demon + delta));
  // 守心如玉成就以峰值判定"全程心魔 0"
  if (delta > 0) run.flags['demonPeak'] = Math.max(run.flags['demonPeak'] ?? 0, run.demon);
}

/** 丹毒 ≥8 上限 −10 的阈值（道果「药王鼎」各阈值 +4） */
function toxinHighThreshold(run: RunState): number {
  return run.fruits.includes('yaowangding') ? 12 : 8;
}

/** 丹毒发作阈值（=12；药王鼎 +4 后不可达 = 免疫发作） */
function toxinBurstActive(run: RunState): boolean {
  return run.toxin >= (run.fruits.includes('yaowangding') ? 16 : 12);
}

/** 维护 ≥8 的上限 −10（毒退则恢复） */
function syncToxinMaxHp(run: RunState) {
  const t = toxinHighThreshold(run);
  if (run.toxin >= t && !run.toxinMaxHpApplied) {
    run.toxinMaxHpApplied = true;
    run.maxHp -= 10;
    run.hp = Math.max(1, Math.min(run.hp, run.maxHp));
  } else if (run.toxin < t && run.toxinMaxHpApplied) {
    run.toxinMaxHpApplied = false;
    run.maxHp += 10;
  }
}

/** 丹毒 ±（0–12 夹取）+ 阈值维护 */
export function addToxin(run: RunState, delta: number) {
  if (!delta) return;
  run.toxin = Math.max(0, Math.min(12, run.toxin + delta));
  syncToxinMaxHp(run);
}

/**
 * 失去寿元（地图边/洞府/御空/事件/燃寿统一入口）。
 * 平安符：每幕第一次失寿减 2 年。归零 → 坐化。burn=true 计入 stats.lifespanBurned。
 */
function loseLifespan(run: RunState, years: number, burn = false) {
  if (years <= 0) return;
  let y = years;
  if (run.relics.includes('pinganfu') && !run.flags['pinganfuUsed']) {
    run.flags['pinganfuUsed'] = 1;
    y = Math.max(0, y - 2);
  }
  run.lifespan -= y;
  if (burn) run.stats.lifespanBurned += y;
  if (run.lifespan <= 0) finishRun(run, false, '油尽灯枯，坐化于途');
}

// ---------- 法宝 / 丹 / 丹方获取 ----------

export function gainRelic(run: RunState, id: string) {
  if (run.relics.includes(id)) return;
  run.relics.push(id);
  const grade = relicsByGrade('jie').some((r) => r.id === id) ? 'jie' : null;
  if (id === 'yuhulu') run.elixirCap += 1;
  if (id === 'pantao') {
    run.maxHp += 15;
    run.hp = Math.min(run.maxHp, run.hp + 15);
    run.lifespan += 15;
  }
  if (id === 'xinmozhong') run.poolCap += 2;
  // 纳劫宝：心魔 +2（心魔种 +3），§4.8/§6
  if (grade === 'jie') addDemon(run, id === 'xinmozhong' ? 3 : 2);
}

export function gainElixir(run: RunState, recipeId: string): boolean {
  if (run.elixirs.length >= run.elixirCap) return false;
  run.elixirs.push(recipeId);
  return true;
}

function gainRecipe(run: RunState, id: string) {
  if (!run.recipes.includes(id)) run.recipes.push(id);
}

/** 从池中随机一张未持有的丹方（池尽则 null） */
function randomNewRecipe(run: RunState, pool: string[]): string | null {
  const cands = pool.filter((id) => !run.recipes.includes(id));
  if (cands.length === 0) return null;
  const r = rngPick(run.rng, 'event', cands);
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

// ---------- 卡牌奖励池（§4.7 + §11.1 卡池渐进） ----------

/** 当前局外解锁（reduce 入口设置，供奖励/坊市/事件生成读取） */
let currentUnlocks: string[] = [];

function poolAllows(rarity: Rarity, unlocked: string[]): boolean {
  if (rarity === 'rare') return unlocked.includes('pool_rare');
  if (rarity === 'epic') return unlocked.includes('pool_epic');
  if (rarity === 'legendary') return unlocked.includes('pool_legendary');
  return true;
}

function cardPool(run: RunState, rarity: Rarity, unlocked: string[]): string[] {
  if (!poolAllows(rarity, unlocked)) return [];
  let pool = cardsByRarity(rarity).map((c) => c.id);
  // 每日天机·五行归一：只出某一行（+无属性）
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

function rewardRarity(run: RunState, kind: 'normal' | 'elite' | 'boss'): Rarity {
  let weights: [number, number, number, number];
  if (kind === 'normal') weights = [75, 22, 3, 0];
  else if (kind === 'elite') weights = [45, 42, 13, 0];
  else weights = [0, 50, 42, 8]; // Boss：稀 50 / 史 42 / 传 8
  const r = rngWeighted(run.rng, 'cardReward', weights);
  run.rng = r.state;
  return (['common', 'rare', 'epic', 'legendary'] as Rarity[])[r.value];
}

const RARITY_FALLBACK: Record<string, Rarity> = { legendary: 'epic', epic: 'rare', rare: 'common' };

function rollCardChoices(run: RunState, kind: 'normal' | 'elite' | 'boss', unlocked: string[]): { cardId: string; upgraded: boolean }[] {
  const out: { cardId: string; upgraded: boolean }[] = [];
  for (let i = 0; i < 3; i++) {
    for (let attempt = 0; attempt < 10; attempt++) {
      let rar = rewardRarity(run, kind);
      let pool = cardPool(run, rar, unlocked);
      while (pool.length === 0 && RARITY_FALLBACK[rar]) {
        rar = RARITY_FALLBACK[rar];
        pool = cardPool(run, rar, unlocked);
      }
      if (pool.length === 0) break;
      const r = rngPick(run.rng, 'cardReward', pool);
      run.rng = r.state;
      if (out.some((c) => c.cardId === r.value)) continue; // 同批不重复
      out.push({ cardId: r.value, upgraded: false });
      break;
    }
  }
  return out;
}

// ---------- 战斗结束 → 奖励（§4.7） ----------

/** 敌五行 → 灵材（§7.2 简化映射：木/水→灵草、金/土→玉髓、火及无属性→妖丹） */
function materialForElement(el: CardElement): MaterialId {
  if (el === 'wood' || el === 'water') return 'lingcao';
  if (el === 'metal' || el === 'earth') return 'yusui';
  return 'yaodan';
}

function battleRewards(run: RunState, kind: 'normal' | 'elite' | 'boss', enemyElement: CardElement, unlocked: string[]) {
  // 灵石：普通 18–30 / 精英 40–60 / Boss 90–120
  let goldMin = 18, goldMax = 30;
  if (kind === 'elite') { goldMin = 40; goldMax = 60; }
  if (kind === 'boss') { goldMin = 90; goldMax = 120; }
  const g = rngInt(run.rng, 'misc', goldMin, goldMax);
  run.rng = g.state;
  let gold = g.value;
  if (run.flags['shiyue']) gold = Math.floor(gold * 1.5); // 蚀月之夜：战斗灵石 +50%
  if (run.relics.includes('moyupixiu')) gold = Math.floor(gold * 1.3);

  // 灵材：普通按敌五行 1 份；精英 2 份 + 雷砂 1；Boss 雷砂 2；三重天·灵材凋敝 −1（下限 0）
  const mats: Partial<Record<MaterialId, number>> = {};
  const el = materialForElement(enemyElement);
  if (kind === 'normal') mats[el] = 1;
  else if (kind === 'elite') { mats[el] = 2; mats.leisha = (mats.leisha ?? 0) + 1; }
  else mats.leisha = 2;
  if (run.ascension >= 3) {
    const key = (mats[el] ?? 0) > 0 ? el : 'leisha';
    if ((mats[key] ?? 0) > 0) {
      mats[key]! -= 1;
      if (mats[key] === 0) delete mats[key];
    }
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
  const screen: RewardScreen = {
    kind: 'reward', gold, cards,
    relic,
    materials: Object.keys(mats).length > 0 ? mats : null,
    goldTaken: false,
  };
  run.screen = screen;
}

/** 战后特殊事件奖励（走火入魔/义庄/剑冢/客栈/童子求救） */
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
    case 5: { // 童子求救：仙品 40% / 灵品 60%
      const r = rngInt(run.rng, 'misc', 1, 100);
      run.rng = r.state;
      const relic = randomRelic(run, [r.value <= 40 ? 'xian' : 'ling']);
      if (relic) gainRelic(run, relic);
      break;
    }
  }
}

/** 因果链：战斗结算处检查（灵狐 8 场 / 放生 2 场） */
function checkBattleChains(run: RunState) {
  if (run.flags['chain_fangsheng'] && run.stats.battles - (run.flags['chain_fangshengStart'] ?? 0) >= 2) {
    delete run.flags['chain_fangsheng'];
    delete run.flags['chain_fangshengStart'];
    const r = rngInt(run.rng, 'misc', 1, 100);
    run.rng = r.state;
    const relic = randomRelic(run, [r.value <= 30 ? 'xian' : 'ling']); // 鲤跃：30% 仙 / 70% 灵
    if (relic) gainRelic(run, relic);
  }
}

// ---------- 坊市（§9.4） ----------

function makeShop(run: RunState, unlocked: string[], discountOverride?: number): ShopScreen {
  const items: ShopItem[] = [];
  const priceOf = (lo: number, hi: number) => {
    const r = rngInt(run.rng, 'shop', lo, hi);
    run.rng = r.state;
    let p = r.value;
    if (run.flags['dailyPinji']) p = Math.floor(p * 1.5); // 贫瘠之年：涨价 50%
    return p;
  };
  // 功法 4 张：2 普 1 稀 1 史；5% 概率史诗位升格传说
  const rarities: Rarity[] = ['common', 'common', 'rare', 'epic'];
  const up = rngInt(run.rng, 'shop', 1, 100);
  run.rng = up.state;
  if (up.value <= 5 && poolAllows('legendary', unlocked)) rarities[3] = 'legendary';
  const usedIds = new Set<string>();
  for (let rar of rarities) {
    let pool = cardPool(run, rar, unlocked).filter((id) => !usedIds.has(id));
    while (pool.length === 0 && RARITY_FALLBACK[rar]) {
      rar = RARITY_FALLBACK[rar];
      pool = cardPool(run, rar, unlocked).filter((id) => !usedIds.has(id));
    }
    if (pool.length === 0) continue;
    const r = rngPick(run.rng, 'shop', pool);
    run.rng = r.state;
    usedIds.add(r.value);
    const price =
      rar === 'common' ? priceOf(32, 44) : rar === 'rare' ? priceOf(60, 78)
      : rar === 'epic' ? priceOf(105, 130) : 170;
    items.push({ kind: 'card', id: r.value, price, sold: false });
  }
  // 法宝 2 件（凡 80–100 / 灵 130–160 / 仙 210）
  for (let i = 0; i < 2; i++) {
    const g = rngWeighted(run.rng, 'shop', [55, 35, 10]);
    run.rng = g.state;
    const grade = (['fan', 'ling', 'xian'] as const)[g.value];
    const id = randomRelic(run, [grade]);
    if (!id) continue;
    const price = grade === 'fan' ? priceOf(80, 100) : grade === 'ling' ? priceOf(130, 160) : 210;
    items.push({ kind: 'relic', id, price, sold: false });
  }
  // 丹方 2 份（常规 40–60；10% 稀方 80–100；救炼丹师：丹方 6 折）
  const offered = new Set<string>(run.recipes);
  for (let i = 0; i < 2; i++) {
    const rareRoll = rngInt(run.rng, 'shop', 1, 100);
    run.rng = rareRoll.state;
    let pool = COMMON_RECIPES.filter((id) => !offered.has(id));
    let rare = false;
    if (rareRoll.value <= 10) {
      const rarePool = RECIPE_IDS.filter((id) => RECIPES[id].rare && !offered.has(id));
      if (rarePool.length > 0) { pool = rarePool; rare = true; }
    }
    if (pool.length === 0) continue;
    const r = rngPick(run.rng, 'shop', pool);
    run.rng = r.state;
    offered.add(r.value);
    let price = rare ? priceOf(80, 100) : priceOf(40, 60);
    if (run.flags['danshi']) price = Math.floor(price * 0.6);
    items.push({ kind: 'recipe', id: r.value, price, sold: false });
  }
  // 灵材包 2 份（随机材 ×3，28–34 灵石；雷砂为精英/Boss 限定不上架）
  for (let i = 0; i < 2; i++) {
    const m = rngPick(run.rng, 'shop', ['lingcao', 'yusui', 'yaodan'] as MaterialId[]);
    run.rng = m.state;
    items.push({ kind: 'materials', id: m.value, count: 3, price: priceOf(28, 34), sold: false });
  }
  // 铜钱剑：本店首件半价（BUY_ITEM 读 tqjUsed）
  delete run.flags['tqjUsed'];
  return {
    kind: 'shop', items,
    removePrice: run.flags['dailyPinji'] ? 0 : 88, // 贫瘠之年：斩尘缘免费且不限次
    removeUsed: false,
    xinzhaiPrice: 66, xinzhaiUsed: false,
    discount: discountOverride ?? 1,
  };
}

// ---------- 事件（§10） ----------

function enterEvent(run: RunState, eventId?: string) {
  let id = eventId;
  if (!id) {
    const pool = eventPool(run.act, run.usedEvents);
    if (pool.length === 0) { run.screen = { kind: 'map' }; return; }
    const r = rngPick(run.rng, 'event', pool);
    run.rng = r.state;
    id = r.value.id;
  }
  if (!run.usedEvents.includes(id)) run.usedEvents.push(id);
  run.screen = { kind: 'event', eventId: id, stage: 0, resultText: null, disabled: [] } as EventScreen;
}

/** 赌石连切一刀（§10.4）：50 灵石；40% 空 / 40% +80 灵石 / 20% 随机法宝；第二刀起每刀心魔 +1 */
function dushiCut(run: RunState, screen: EventScreen) {
  run.gold = Math.max(0, run.gold - 50);
  if (screen.stage >= 1) addDemon(run, 1); // 赌性滋魔
  const r = rngInt(run.rng, 'event', 1, 100);
  run.rng = r.state;
  let text: string;
  if (r.value <= 40) {
    text = '刀落石开——里头空空如也，商人摊了摊手。';
  } else if (r.value <= 80) {
    run.gold += 80;
    text = '石心中滚出一汪灵液，凝成八十枚灵石！围观人群一阵惊呼。';
  } else {
    const relic = randomRelic(run, ['fan', 'ling']);
    if (relic) {
      gainRelic(run, relic);
      text = '石破天惊——一件法宝静卧石心，宝光冲霄！';
    } else {
      run.gold += 80;
      text = '石心中竟藏着一枚旧宝，可惜与你囊中重复，商人折价八十灵石收回。';
    }
  }
  screen.stage += 1;
  screen.resultText = text + (run.gold >= 50 ? '\n商人眯眼再问："再来一刀？"（每多一刀心魔 +1）' : '');
}

function applyOutcome(run: RunState, o: EventOutcome, screen: EventScreen) {
  if (o.gold) run.gold = Math.max(0, run.gold + o.gold);
  if (o.hp) {
    if (o.hp > 0) run.hp = Math.min(run.maxHp, run.hp + o.hp);
    else run.hp = Math.max(1, run.hp + o.hp); // 事件失血不致死（保底 1）
  }
  if (o.maxHp) {
    run.maxHp = Math.max(10, run.maxHp + o.maxHp);
    if (o.maxHp > 0) run.hp += o.maxHp;
    run.hp = Math.min(run.hp, run.maxHp);
  }
  if (o.heal === 'full') run.hp = run.maxHp;
  if (o.heal === 'half') run.hp = Math.max(1, Math.floor(run.hp / 2));
  if (typeof o.heal === 'number') run.hp = Math.min(run.maxHp, run.hp + o.heal);
  if (o.lifespan) {
    if (o.lifespan > 0) run.lifespan += o.lifespan;
    else {
      loseLifespan(run, -o.lifespan);
      if (run.over) return;
    }
  }
  if (o.demon) addDemon(run, o.demon);
  if (o.toxin) addToxin(run, o.toxin);
  if (o.materials) {
    for (const [k, v] of Object.entries(o.materials) as [MaterialId, number][]) {
      run.materials[k] = (run.materials[k] ?? 0) + v;
    }
  }
  if (o.gainRecipe) {
    const id = o.gainRecipe === 'random' ? randomNewRecipe(run, COMMON_RECIPES) ?? randomNewRecipe(run, RECIPE_IDS) : o.gainRecipe;
    if (id) gainRecipe(run, id);
  }
  if (o.gainCardRarity) {
    const pool = cardsByRarity(o.gainCardRarity).map((c) => c.id).filter((id) => !CARDS[id].bonded);
    if (pool.length > 0) {
      const r = rngPick(run.rng, 'event', pool);
      run.rng = r.state;
      run.deck.push(makeCard(run, r.value));
      screen.resultText = (screen.resultText ?? o.text) + `\n获得【${getCard(r.value).name}】`;
      if (o.gainCardRarity === 'legendary') addDemon(run, 1); // 拿取传说卡 +1 心魔（§4.8）
    }
  }
  if (o.gainCardId) run.deck.push(makeCard(run, o.gainCardId, o.gainCardUpgraded));
  if (o.gainRelicGrade) {
    // 劫宝需里程碑「劫宝秘闻」解锁，否则降为仙品（§11.1）
    const grade = o.gainRelicGrade === 'jie' && !currentUnlocks.includes('jiebaomiwen') ? 'xian' : o.gainRelicGrade;
    const id = randomRelic(run, [grade]);
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
  if (o.flag) {
    run.flags[o.flag] = o.flagValue ?? 1;
    // 因果链"善份"记账（成就"一诺千金"数 chainDone_* ≥6，§11.5）
    if (o.flag.startsWith('chain_')) run.flags[`chainDone_${o.flag.slice(6)}`] = 1;
    if (o.flag === 'daolei_minus30') run.flags['chainDone_xinmo'] = 1;
    // 因果链起点：记录当前战斗数（战斗结算处检查触发）
    if (o.flag === 'chain_linghu') run.flags['chain_linghuStart'] = run.stats.battles;
    if (o.flag === 'chain_fangsheng') run.flags['chain_fangshengStart'] = run.stats.battles;
  }

  // 特殊脚本（data/events.ts 尾注清单）
  switch (o.special) {
    case 'gongde': // 枯庙施舍：清空灵石；下 3 场战斗开局吐纳 +1
      run.gold = 0;
      run.gongdeBattles = 3;
      break;
    case 'dushi': // 赌石连切
      dushiCut(run, screen);
      return;
    case 'baidu':
    case 'baidu_relic':
      if (o.special === 'baidu_relic' && run.relics.length > 0) run.relics.pop(); // 渡资：交出一件法宝
      jumpToLayer(run, 2);
      break;
    case 'jinEpic': { // 断碑续字：随机金系史诗
      const pool = cardsByRarity('epic').map((c) => c.id).filter((id) => CARDS[id].element === 'metal');
      if (pool.length > 0) {
        const r = rngPick(run.rng, 'event', pool);
        run.rng = r.state;
        run.deck.push(makeCard(run, r.value));
        screen.resultText = (screen.resultText ?? o.text) + `\n获得【${getCard(r.value).name}】`;
      }
      break;
    }
    case 'zuidao': { // 醉道人：随机 2 项——上限 +6 / 斩 1 牌 / 得丹方 / 下场战斗气滞 2
      const effects = ['maxhp', 'remove', 'recipe', 'qizhi'];
      const r = rngShuffle(run.rng, 'event', effects);
      run.rng = r.state;
      const picked = r.value.slice(0, 2);
      const texts: string[] = [];
      for (const fx of picked) {
        if (fx === 'maxhp') { run.maxHp += 6; run.hp += 6; texts.push('气血上限 +6'); }
        if (fx === 'remove') texts.push('肚中翻江倒海，杂念随酒气散去（斩 1 张牌）');
        if (fx === 'recipe') {
          const id = randomNewRecipe(run, COMMON_RECIPES) ?? randomNewRecipe(run, RECIPE_IDS);
          if (id) { gainRecipe(run, id); texts.push(`得丹方【${getRecipe(id).name}】`); }
          else texts.push('道人翻遍怀袖没找到新方子，嘟囔着赔了句好话');
        }
        if (fx === 'qizhi') { run.flags['zuidaoWeak'] = 2; texts.push('下场战斗气滞 2'); }
      }
      screen.resultText = '三碗下肚：' + texts.join('；');
      if (picked.includes('remove')) {
        run.screen = { kind: 'cardPick', mode: 'remove', count: 1, reason: '酒后吐真：斩去 1 张牌', next: null };
        return;
      }
      break;
    }
    case 'shenlou': // 蜃楼幻市：8 折坊市
      run.screen = makeShop(run, currentUnlocks, 0.8);
      return;
    case 'muxin': // 雷击古木：2 张「落石+」
      run.deck.push(makeCard(run, 'luoshi', true), makeCard(run, 'luoshi', true));
      break;
    case 'huangliang': // 黄粱一梦：回 25%；下场战斗首回合多抽 2（combat 读 flag）
      run.hp = Math.min(run.maxHp, run.hp + Math.floor(run.maxHp * 0.25));
      run.flags['huangliang'] = 1;
      break;
    case 'freeCave': // 空置洞府：免费执行 1 项（不耗寿元）
      run.screen = { kind: 'cave', free: true, remaining: 1, used: [] };
      return;
    case 'huolang':
    case 'huolang_cheap':
    case 'huolang_expensive': { // 游方货郎：3 件凡品法宝（50–70）+ 1 份丹方
      const items: ShopItem[] = [];
      for (let i = 0; i < 3; i++) {
        const id = randomRelic(run, ['fan']);
        if (!id) break;
        const pr = rngInt(run.rng, 'shop', 50, 70);
        run.rng = pr.state;
        items.push({ kind: 'relic', id, price: pr.value, sold: false });
      }
      const rid = randomNewRecipe(run, COMMON_RECIPES);
      if (rid) {
        const pp = rngInt(run.rng, 'shop', 40, 60);
        run.rng = pp.state;
        items.push({ kind: 'recipe', id: rid, price: pp.value, sold: false });
      }
      const discount = o.special === 'huolang_cheap' ? 0.8 : o.special === 'huolang_expensive' ? 1.1 : 1;
      run.screen = {
        kind: 'shop', items, removePrice: 0, removeUsed: true,
        xinzhaiPrice: 66, xinzhaiUsed: true, discount,
      };
      return;
    }
    case 'jingdiRecipe': { // 童子重逢：随机稀方
      const id = randomNewRecipe(run, RECIPE_IDS.filter((x) => RECIPES[x].rare))
        ?? randomNewRecipe(run, RECIPE_IDS);
      if (id) gainRecipe(run, id);
      break;
    }
    case 'zouhuoReward': run.flags['eventBattleReward'] = 1; break;
    case 'yizhuangReward': run.flags['eventBattleReward'] = 2; break;
    case 'jianzhongReward': run.flags['eventBattleReward'] = 3; break;
    case 'kezhanReward': run.flags['eventBattleReward'] = 4; break;
    case 'tongziReward': run.flags['eventBattleReward'] = 5; break;
  }

  // 斩牌/参悟界面
  if (o.removeCards) {
    run.screen = { kind: 'cardPick', mode: 'remove', count: o.removeCards, reason: o.text, next: null };
    return;
  }
  if (o.upgradeCards) {
    run.screen = { kind: 'cardPick', mode: 'upgrade', count: o.upgradeCards, reason: o.text, next: null };
    return;
  }
  // 事件战
  if (o.battle || o.battleElite) {
    if (o.battleElite) {
      startBattle(run, 'elite');
    } else if (o.battle!.endsWith('_x2')) {
      const base = o.battle!.slice(0, -3);
      startBattle(run, 'normal', [base, base]);
    } else if (o.battle === 'shiqun') {
      startBattle(run, 'normal', ['shiqun', 'shiqun', 'shiqun', 'shiqun']);
    } else {
      startBattle(run, 'normal', [o.battle!]);
    }
    applyPreBattleFlags(run);
    return;
  }
}

// ---------- 洞府（§9.4） ----------

const CAVE_YEARS: Record<'rest' | 'smith' | 'brew' | 'fast', number> = {
  rest: 3, smith: 2, brew: 2, fast: 2,
};
const CAVE_MASK: Record<string, number> = { rest: 1, smith: 2, brew: 4, fast: 8 };

function caveActionYears(run: RunState, screen: CaveScreen, kind: 'rest' | 'smith' | 'brew' | 'fast'): number {
  if (screen.free) return 0; // 空置洞府：免费
  // 玉葫芦：每幕 1 次炼丹不耗寿元
  if (kind === 'brew' && run.relics.includes('yuhulu') && !run.flags['yuhuluUsed']) return 0;
  let y = CAVE_YEARS[kind];
  if (run.ascension >= 5) y += 1; // 五重天·光阴如刀：洞府行动 +1 年
  if (run.relics.includes('putuan')) y = Math.max(1, y - 1); // 蒲团：−1 年下限 1
  return y;
}

/** 洞府状态暂存（参悟进 CardPickScreen 后返回用；flags 只能存数值，按位编码 used） */
function stashCave(run: RunState, screen: CaveScreen) {
  run.flags['caveFree'] = screen.free ? 1 : 0;
  run.flags['caveRemaining'] = screen.remaining;
  run.flags['caveMask'] = screen.used.reduce((m, k) => m | (CAVE_MASK[k] ?? 0), 0);
}

function restoreCave(run: RunState) {
  const mask = run.flags['caveMask'] ?? 0;
  const used = Object.keys(CAVE_MASK).filter((k) => mask & CAVE_MASK[k]);
  run.screen = {
    kind: 'cave',
    free: !!run.flags['caveFree'],
    remaining: run.flags['caveRemaining'] ?? 0,
    used,
  };
  delete run.flags['caveFree'];
  delete run.flags['caveRemaining'];
  delete run.flags['caveMask'];
}

// ---------- 突破与道果（§9.5） ----------

function rollDaoguo(run: RunState): string[] {
  const pool = DAOGUO_IDS.filter((id) => !run.fruits.includes(id));
  const r = rngShuffle(run.rng, 'misc', pool);
  run.rng = r.state;
  const count = run.ascension >= 7 ? 2 : 3; // 七重天·道果残缺：三选一 → 二选一
  return r.value.slice(0, count);
}

/** Boss 胜利即刻突破：境界提升 + 延寿（§3.2；朝露之命延寿翻倍） */
function applyBreakthrough(run: RunState) {
  const gain = (run.act === 1 ? 60 : 120) * (run.flags['dailyZhaolu'] ? 2 : 1);
  run.lifespan += gain;
  run.realm = run.act === 1 ? 'zhuji' : 'jindan';
}

/** 进入下一幕：幕标记重置 + 新地图 */
function nextAct(run: RunState) {
  run.act = (run.act + 1) as 2 | 3;
  run.floor = -1;
  run.nodeId = null;
  run.flyUsed = 0;
  delete run.flags['pinganfuUsed'];
  delete run.flags['yuhuluUsed'];
  delete run.flags['jieyunSeen'];
  delete run.flags['shiyue'];
  delete run.flags['tqjUsed'];
  delete run.flags['chain_xianghuo']; // 香火只护本幕 Boss
  run.map = generateActMap(run, run.act);
  if (run.relics.includes('moyupixiu')) addDemon(run, 1); // 貔貅吞财，每幕记账
  toMap(run);
}

// ---------- 回到地图（因果链下集在此插入，§10 ⚯） ----------

function toMap(run: RunState) {
  run.screen = { kind: 'map' };
  // 灵狐报恩：8 场战斗后「狐妖再会」
  if (run.flags['chain_linghu'] && run.stats.battles - (run.flags['chain_linghuStart'] ?? 0) >= 8) {
    delete run.flags['chain_linghu'];
    delete run.flags['chain_linghuStart'];
    enterEvent(run, 'linghu_return');
    return;
  }
  if (run.act === 3) {
    if (run.flags['chain_jingdi']) {
      delete run.flags['chain_jingdi'];
      enterEvent(run, 'jingdi_return');
      return;
    }
    if (run.flags['chain_zuidao']) {
      delete run.flags['chain_zuidao'];
      enterEvent(run, 'zuidao_return');
      return;
    }
  }
}

// ---------- 结算（§12.4 / §11.1） ----------

export function computeScore(run: RunState, victory: boolean): number {
  const actsPassed = victory ? 3 : run.act - 1;
  const turnsTotal = run.flags['turnsTotal'] ?? 0;
  const score =
    300 * actsPassed +
    30 * run.stats.elitesKilled +
    80 * run.stats.bossesKilled +
    Math.max(0, run.hp) * 2 +
    Math.max(0, run.lifespan) * 3 +
    (run.flags['zhoutianTotal'] ?? 0) * 40 +
    (run.flags['daoxin'] ? 100 : 0); // 道心：心魔 0 过幕二 +100
  return Math.max(0, Math.floor(score * (1 + 0.15 * run.ascension)) - turnsTotal);
}

export function computeDaowei(run: RunState, victory: boolean): number {
  const actsPassed = victory ? 3 : run.act - 1;
  const score = computeScore(run, victory);
  return Math.max(5, 15 * actsPassed + 5 * run.stats.elitesKilled + 15 * run.stats.bossesKilled + Math.floor(score / 100));
}

/** 依据构筑生成道号（§3.3）：主行道号；心魔 0 通关加授「守心」二字 */
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
  return (run.demon === 0 ? '守心·' : '') + names[top];
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

  // 丹毒发作（=12）：每进入节点失 3 血（不致死）
  if (toxinBurstActive(run)) run.hp = Math.max(1, run.hp - 3);

  let type = node.type;
  if (type === 'unknown') type = node.revealedType ?? 'battle';

  switch (type) {
    case 'battle':
      // 砸神像：本幕「石精/山神残像」必然拦路（zashen flag）
      if (run.flags['zashen']) {
        delete run.flags['zashen'];
        startBattle(run, 'normal', [run.act >= 3 ? 'shanshencanxiang' : 'shijing']);
      } else {
        startBattle(run, 'normal');
      }
      applyPreBattleFlags(run);
      break;
    case 'elite':
      startBattle(run, 'elite');
      applyPreBattleFlags(run);
      break;
    case 'boss':
      // 劫云压顶（§9.2）：每幕进入 Boss 节点前弹一次
      if (!run.flags['jieyunSeen']) {
        run.flags['jieyunSeen'] = 1;
        run.flags['pendingBoss'] = 1;
        enterEvent(run, 'jieyun');
      } else {
        startBattle(run, 'boss');
        applyPreBattleFlags(run);
      }
      break;
    case 'event': enterEvent(run); break;
    case 'shop': run.screen = makeShop(run, unlocked); break;
    case 'cave': run.screen = { kind: 'cave', free: false, remaining: 2, used: [] }; break;
    case 'field': { // 灵田：采灵材 2–4 份（按幕递增；灵草/玉髓）
      const count = run.act + 1;
      const mats: Partial<Record<MaterialId, number>> = {};
      for (let i = 0; i < count; i++) {
        const r = rngPick(run.rng, 'misc', ['lingcao', 'yusui'] as MaterialId[]);
        run.rng = r.state;
        mats[r.value] = (mats[r.value] ?? 0) + 1;
      }
      run.screen = { kind: 'reward', gold: 0, cards: null, relic: null, materials: mats, goldTaken: true };
      break;
    }
    default:
      startBattle(run, 'normal');
      applyPreBattleFlags(run);
  }
}

function applyPreBattleFlags(run: RunState) {
  const b = run.battle;
  if (!b) return;
  // 醉道人：下场战斗气滞 2
  if (run.flags['zuidaoWeak']) {
    b.player.statuses.qizhi = (b.player.statuses.qizhi ?? 0) + run.flags['zuidaoWeak'];
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

// ---------- 地图服丹（§7.1 ⊙） ----------

function useElixirOnMap(run: RunState, elixirId: string): boolean {
  const i = run.elixirs.indexOf(elixirId);
  if (i < 0) return false;
  const recipe = RECIPES[elixirId];
  if (!recipe?.mapUsable) return false;
  run.elixirs.splice(i, 1);
  run.stats.elixirsUsed += 1;
  switch (elixirId) {
    case 'huiyuandan': run.hp = Math.min(run.maxHp, run.hp + 18); break;
    case 'dahuandan':
      run.hp = Math.min(run.maxHp, run.hp + Math.floor(run.maxHp / 2));
      loseLifespan(run, 4, true); // 燃寿 4 年
      if (run.over) return true;
      break;
    case 'qingxindan': addDemon(run, -1); break;
    case 'wudaodan':
      addToxin(run, recipe.toxin);
      run.screen = { kind: 'cardPick', mode: 'upgrade', count: 1, reason: '悟道丹：参悟 1 张牌', next: null };
      return true;
  }
  addToxin(run, recipe.toxin);
  return true;
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
      case 'PLAY_CARD': playCard(run, b, action.uid, action.target, action.dualPick); break;
      case 'END_TURN': endTurn(run, b, action.sleeveUids); break;
      case 'RESOLVE_CHOICE': resolveChoice(run, b, action.picks); break;
      case 'USE_ELIXIR': {
        const before = run.elixirs.indexOf(action.elixir);
        if (before < 0) return prev;
        useElixirInBattle(run, b, action.elixir, action.target);
        // 消耗与丹毒账归 run.ts（若 combat 已自行移除则不重复）
        const j = run.elixirs.indexOf(action.elixir);
        if (j >= 0) {
          run.elixirs.splice(j, 1);
          run.stats.elixirsUsed += 1;
          addToxin(run, RECIPES[action.elixir]?.toxin ?? 0);
        }
        break;
      }
      case 'DISCARD_ELIXIR': {
        const i = run.elixirs.indexOf(action.elixir);
        if (i >= 0) run.elixirs.splice(i, 1);
        return run;
      }
      default: return prev;
    }
    // 战斗内丹毒变动（服丹/尸毒）后同步 ≥8 上限 −10 的维护
    syncToxinMaxHp(run);
    // 战斗内燃寿（枯荣轮转/不灭灯等）也可油尽灯枯
    if (!run.over && run.battle && run.battle.outcome === 'ongoing' && run.lifespan <= 0) {
      finishRun(run, false, '油尽灯枯，坐化于途');
      return run;
    }
    // 战斗结束判定
    if (run.battle && run.battle.outcome === 'victory') {
      run.flags['turnsTotal'] = (run.flags['turnsTotal'] ?? 0) + run.battle.turnsTotal;
      run.flags['zhoutianTotal'] = (run.flags['zhoutianTotal'] ?? 0) + run.battle.zhoutianTotal;
      const battleType = run.battle.battleType;
      const enemyElement = run.battle.enemies[0]?.element ?? 'none';
      const eventReward = run.flags['eventBattleReward'];
      run.battle = null;
      run.stats.battles += 1;
      if (battleType === 'elite') run.stats.elitesKilled += 1;
      if (battleType === 'boss') run.stats.bossesKilled += 1;
      if (run.gongdeBattles > 0) run.gongdeBattles -= 1;
      checkBattleChains(run);
      if (battleType === 'boss') {
        delete run.flags['chain_xianghuo']; // 香火护佑用毕
        if (run.act === 2 && run.demon === 0) run.flags['daoxin'] = 1; // 道心：明镜止水（combat 读）+ 分数 +100
        if (run.act >= 3) {
          finishRun(run, true, '渡过九重天劫，白日飞升');
        } else {
          applyBreakthrough(run);
          run.flags['pendingDaoguo'] = 1; // 离开奖励后进入道果三选一
          battleRewards(run, 'boss', enemyElement, unlocked);
        }
      } else if (eventReward) {
        eventBattleReward(run);
        toMap(run);
      } else {
        battleRewards(run, battleType, enemyElement, unlocked);
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
      // 寿元时钟：扣所走边年数（起点三选一不耗）
      if (run.floor >= 0 && run.nodeId) {
        const cur = findNode(run, run.nodeId);
        const edge = cur?.edges.find((e) => e.to === action.node);
        loseLifespan(run, edge?.years ?? 1);
        if (run.over) return run;
      }
      enterNode(run, action.node, unlocked);
      return run;
    }
    case 'FLY_NODE': {
      // 御空（筑基 2 次 3 年/次）/ 缩地（金丹 3 次 2 年/次）
      if (screen.kind !== 'map' || run.realm === 'lianqi') return prev;
      const cap = run.realm === 'jindan' ? 3 : 2;
      if (run.flyUsed >= cap) return prev;
      if (!flyTargets(run).includes(action.node)) return prev;
      run.flyUsed += 1;
      loseLifespan(run, run.realm === 'jindan' ? 2 : 3);
      if (run.over) return run;
      enterNode(run, action.node, unlocked);
      return run;
    }
    case 'USE_ELIXIR': {
      if (!useElixirOnMap(run, action.elixir)) return prev;
      return run;
    }
    case 'DISCARD_ELIXIR': {
      const i = run.elixirs.indexOf(action.elixir);
      if (i >= 0) run.elixirs.splice(i, 1);
      return run;
    }
    case 'PICK_REWARD_CARD': {
      if (screen.kind !== 'reward' || !screen.cards) return prev;
      if (action.index >= 0 && action.index < screen.cards.length) {
        const pick = screen.cards[action.index];
        run.deck.push(makeCard(run, pick.cardId, pick.upgraded));
        if (getCard(pick.cardId).rarity === 'legendary') addDemon(run, 1); // 拿取传说卡 +1 心魔
        (run.screen as RewardScreen).cards = null;
      } else {
        // 跳过；竹简：转录拓片得任意灵材 ×2
        if (run.relics.includes('zhujian')) {
          const r = rngPick(run.rng, 'misc', MATERIAL_IDS);
          run.rng = r.state;
          run.materials[r.value] = (run.materials[r.value] ?? 0) + 2;
        }
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
    case 'TAKE_REWARD_MATERIALS': {
      if (screen.kind !== 'reward' || !screen.materials) return prev;
      for (const [k, v] of Object.entries(screen.materials) as [MaterialId, number][]) {
        run.materials[k] = (run.materials[k] ?? 0) + v;
      }
      (run.screen as RewardScreen).materials = null;
      return run;
    }
    case 'LEAVE_REWARD': {
      if (screen.kind !== 'reward') return prev;
      if (!screen.goldTaken) run.gold += screen.gold; // 离开自动拾取
      if (screen.materials) {
        for (const [k, v] of Object.entries(screen.materials) as [MaterialId, number][]) {
          run.materials[k] = (run.materials[k] ?? 0) + v;
        }
      }
      if (run.flags['pendingDaoguo']) {
        delete run.flags['pendingDaoguo'];
        run.screen = { kind: 'daoguo', options: rollDaoguo(run) };
      } else {
        toMap(run);
      }
      return run;
    }
    case 'PICK_DAOGUO': {
      if (screen.kind !== 'daoguo' || !screen.options.includes(action.id) || !DAOGUO[action.id]) return prev;
      run.fruits.push(action.id);
      switch (action.id) {
        case 'jindanwuse': run.poolCap += 2; break;
        case 'randengxuming': run.lifespan += 25; break;
        case 'tiegu':
          run.maxHp += 18;
          run.hp = Math.min(run.maxHp, run.hp + 18);
          run.battleStartBlock += 6;
          break;
        case 'yaowangding': syncToxinMaxHp(run); break; // 阈值 +4：可能立即解除上限 −10
        case 'zhansanshi':
          addDemon(run, -2);
          run.screen = { kind: 'cardPick', mode: 'remove', count: 2, reason: '斩三尸：斩去至多 2 张牌', next: 'nextAct' };
          return run;
        // jiantai / niyunzhenqi / yingerbaodan / yiqihuasanqing：combat 读取 run.fruits
      }
      nextAct(run);
      return run;
    }
    case 'BUY_ITEM': {
      if (screen.kind !== 'shop') return prev;
      const item = screen.items[action.index];
      if (!item || item.sold) return prev;
      let price = Math.floor(item.price * screen.discount);
      // 铜钱剑：本店首件半价
      const tqj = run.relics.includes('tongqianjian') && !run.flags['tqjUsed'];
      if (tqj) price = Math.floor(price / 2);
      if (run.gold < price) return prev;
      if (item.kind === 'recipe' && run.recipes.includes(item.id)) return prev;
      run.gold -= price;
      if (tqj) run.flags['tqjUsed'] = 1;
      (run.screen as ShopScreen).items[action.index].sold = true;
      if (item.kind === 'card') {
        run.deck.push(makeCard(run, item.id, item.upgraded));
        if (getCard(item.id).rarity === 'legendary') addDemon(run, 1);
      }
      if (item.kind === 'relic') gainRelic(run, item.id);
      if (item.kind === 'recipe') gainRecipe(run, item.id);
      if (item.kind === 'materials') {
        const m = item.id as MaterialId;
        run.materials[m] = (run.materials[m] ?? 0) + (item.count ?? 3);
      }
      return run;
    }
    case 'SHOP_REMOVE_CARD': {
      if (screen.kind !== 'shop') return prev;
      const freeUnlimited = !!run.flags['dailyPinji']; // 贫瘠之年：免费且不限次
      if (screen.removeUsed && !freeUnlimited) return prev;
      if (run.gold < screen.removePrice) return prev;
      const i = run.deck.findIndex((c) => c.uid === action.uid);
      if (i < 0) return prev;
      if (getCard(run.deck[i].cardId).bonded) return prev; // 本命牌不可斩
      run.gold -= screen.removePrice;
      run.deck.splice(i, 1);
      if (!freeUnlimited) (run.screen as ShopScreen).removeUsed = true;
      return run;
    }
    case 'SHOP_XINZHAI': {
      if (screen.kind !== 'shop' || screen.xinzhaiUsed) return prev;
      if (run.gold < screen.xinzhaiPrice) return prev;
      run.gold -= screen.xinzhaiPrice;
      addDemon(run, -1);
      (run.screen as ShopScreen).xinzhaiUsed = true;
      return run;
    }
    case 'LEAVE_SHOP': {
      if (screen.kind !== 'shop') return prev;
      toMap(run);
      return run;
    }
    case 'EVENT_OPTION': {
      if (screen.kind !== 'event') return prev;
      if (screen.resultText) {
        // 赌石连切：切过一刀后仍可「再切」（选项 0）或另行收手
        if (!(screen.eventId === 'fangshidushi' && screen.stage > 0)) return prev;
        (run.screen as EventScreen).resultText = null;
      }
      const ev = getEvent(screen.eventId);
      const opt = ev.options[action.option];
      if (!opt) return prev;
      if (opt.requireGold && run.gold < opt.requireGold) return prev;
      if (opt.requireLifespan && run.lifespan < opt.requireLifespan) return prev;
      if (opt.requireRelic && run.relics.length === 0) return prev;
      // 掷后果
      let outcome: EventOutcome;
      if (opt.outcomes.length === 1) outcome = opt.outcomes[0];
      else {
        const r = rngWeighted(run.rng, 'event', opt.outcomes.map((x) => x.weight ?? 1));
        run.rng = r.state;
        outcome = opt.outcomes[r.value];
        // 九尾狐毫：负面结果重掷（每局一次）
        const isNegative = (outcome.hp ?? 0) < 0 || (outcome.demon ?? 0) > 0
          || (outcome.toxin ?? 0) > 0 || (outcome.maxHp ?? 0) < 0 || (outcome.lifespan ?? 0) < 0;
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
      // 劫云压顶选毕：入 Boss 战
      if (run.flags['pendingBoss']) {
        delete run.flags['pendingBoss'];
        startBattle(run, 'boss');
        applyPreBattleFlags(run);
        return run;
      }
      toMap(run);
      return run;
    }
    case 'CAVE_ACTION': {
      if (screen.kind !== 'cave') return prev;
      if (screen.remaining <= 0) return prev;
      const kind = action.kind;
      // 青铜丹炉：炼丹不占行动项，可重复；其余行动每座限不同项
      const danluBrew = kind === 'brew' && run.relics.includes('qingtongdanlu');
      if (screen.used.includes(kind) && !danluBrew) return prev;
      // 炼丹前置校验：丹方持有 + 灵材足够 + 丹盒有空位
      let recipeId = '';
      if (kind === 'brew') {
        recipeId = action.recipeId ?? '';
        const recipe = RECIPES[recipeId];
        if (!recipe || !run.recipes.includes(recipeId)) return prev;
        if (run.elixirs.length >= run.elixirCap) return prev;
        for (const [m, n] of Object.entries(recipe.cost) as [MaterialId, number][]) {
          if ((run.materials[m] ?? 0) < n) return prev;
        }
      }
      const years = caveActionYears(run, screen, kind);
      // 玉葫芦免寿元额度在真正生效时消耗
      if (kind === 'brew' && !screen.free && years === 0 && run.relics.includes('yuhulu') && !run.flags['yuhuluUsed']) {
        run.flags['yuhuluUsed'] = 1;
      }
      loseLifespan(run, years);
      if (run.over) return run;
      const sc = run.screen as CaveScreen;
      if (!danluBrew) {
        sc.remaining -= 1;
        sc.used.push(kind);
      }
      switch (kind) {
        case 'rest': // 闭关：回 36
          run.hp = Math.min(run.maxHp, run.hp + 36);
          break;
        case 'smith': // 参悟：升级 1 张牌
          stashCave(run, sc);
          run.screen = { kind: 'cardPick', mode: 'upgrade', count: 1, reason: '洞府参悟：升级 1 张牌', next: 'cave' };
          break;
        case 'brew': { // 炼丹：扣灵材得丹
          const recipe = RECIPES[recipeId];
          for (const [m, n] of Object.entries(recipe.cost) as [MaterialId, number][]) {
            run.materials[m] = (run.materials[m] ?? 0) - n;
          }
          gainElixir(run, recipeId);
          run.stats.brews += 1;
          break;
        }
        case 'fast': // 辟谷：清 4 丹毒
          addToxin(run, -4);
          break;
      }
      return run;
    }
    case 'CAVE_LEAVE': {
      if (screen.kind !== 'cave') return prev;
      toMap(run);
      return run;
    }
    case 'CAVE_PICK_CARD': // 兼容别名：与 PICK_CARD_SCREEN 同逻辑
    case 'PICK_CARD_SCREEN': {
      if (screen.kind !== 'cardPick') return prev;
      const done = (next: string | null) => {
        if (next === 'nextAct') nextAct(run);
        else if (next === 'cave') restoreCave(run);
        else toMap(run);
      };
      if (action.uid === -1) { // 跳过剩余
        done(screen.next);
        return run;
      }
      const i = run.deck.findIndex((c) => c.uid === action.uid);
      if (i < 0) return prev;
      if (screen.mode === 'remove') {
        if (getCard(run.deck[i].cardId).bonded) return prev; // 本命牌不可斩去
        run.deck.splice(i, 1);
      } else if (screen.mode === 'upgrade') {
        if (run.deck[i].upgraded || getCard(run.deck[i].cardId).type === 'curse') return prev;
        run.deck[i].upgraded = true;
        run.stats.cardsUpgraded += 1;
      }
      const sc = run.screen as CardPickScreen;
      sc.count -= 1;
      if (sc.count <= 0) done(sc.next);
      return run;
    }
    default:
      return prev;
  }
}
