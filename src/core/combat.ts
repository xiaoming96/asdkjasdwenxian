/**
 * 战斗引擎 v3（策划案 §4 详规 + src/core/types.ts 契约注释）
 * - 回合时序 §4.2：吐纳（炼气不储存 / 筑基气海储存）→ 袖藏牌入手 → 抽牌 → 出牌 → 袖藏 → 敌方回合。
 * - 伤害结算 §4.3：无全局乘区；攻方气滞 ×0.7、守方破绽 ×1.4，每步向下取整。
 * - 五行 §4.4：行位/得气/滞气/周天/天人合一 + 克伐五动词（KEFA_VERB）+ 护体属性双向生克。
 * - 状态 §4.5 v3 表；心魔投影 §4.8；敌方 special/ai 约定见 types.ts EnemyMove 注释。
 * 实现方式：reduce 入口深拷贝后在草稿上变更，对调用方保持"纯函数 + 不可变"。
 */
import type {
  BattleState, CardEffects, CardInstance, EnemyDef, EnemyMove, EnemyState,
  RunState, StatusId,
} from './types';
import { getCard } from '../data/cards';
import { getEnemy, JIUCHONG_WAVES, ACT_BOSS, normalPool, elitePool } from '../data/enemies';
import { getRecipe } from '../data/alchemy';
import {
  ELEMENTS, ELEMENT_NAME, SHENG, KEFA_VERB, KEFA_NAME, generates, overcomes,
  blockRatio, absorbWithBlock, type CardElement, type Element,
} from './wuxing';
import { rngInt, rngPick, rngShuffle } from './rng';

/** 手牌上限（§4.1） */
const HAND_CAP = 8;

// ---------- 工具 ----------

export function newUid(run: RunState): number {
  run.uidCounter += 1;
  return run.uidCounter;
}

export function makeCard(run: RunState, cardId: string, upgraded = false): CardInstance {
  return { uid: newUid(run), cardId, upgraded };
}

/** 两段效果（按 upgraded 取 upBase/upSheng；双行牌以 a 为基础段、b 为得气补段的展示口径） */
export function effectsOf(inst: CardInstance): { base: CardEffects; sheng?: CardEffects } {
  const def = getCard(inst.cardId);
  if (def.dual) {
    return inst.upgraded
      ? { base: def.dual.aUp, sheng: def.dual.bUp }
      : { base: def.dual.a, sheng: def.dual.b };
  }
  return inst.upgraded
    ? { base: def.upBase, sheng: def.upSheng ?? def.sheng }
    : { base: def.base, sheng: def.sheng };
}

function log(b: BattleState, msg: string) {
  b.log.push(msg);
  if (b.log.length > 200) b.log.splice(0, b.log.length - 100);
}

function hasRelic(run: RunState, id: string): boolean {
  return run.relics.includes(id);
}

function hasFruit(run: RunState, id: string): boolean {
  return run.fruits.includes(id);
}

function findPower(b: BattleState, cardId: string) {
  return b.powers.find((p) => p.cardId === cardId);
}

/** 心法数值（按参悟态取 upBase.n / base.n） */
function powerN(b: BattleState, cardId: string): number {
  const p = findPower(b, cardId);
  if (!p) return 0;
  const def = getCard(cardId);
  return (p.upgraded ? def.upBase : def.base).n ?? 0;
}

function curseInHand(b: BattleState, cardId: string): boolean {
  return b.hand.some((c) => c.cardId === cardId);
}

export function aliveEnemies(b: BattleState): EnemyState[] {
  return b.enemies.filter((e) => e.hp > 0);
}

function heal(run: RunState, n: number) {
  if (n > 0) run.hp = Math.min(run.maxHp, run.hp + n);
}

/** 吐纳/灵气获取：炼气期不设上限（回合开始重置）；筑基起受气海上限 run.poolCap 约束 */
function gainEnergy(run: RunState, b: BattleState, n: number) {
  if (n <= 0) return;
  if (run.realm === 'lianqi') b.player.energy += n;
  else b.player.energy = Math.max(b.player.energy, Math.min(run.poolCap, b.player.energy + n));
}

/** 燃寿（枯荣轮转 / 大还丹）：寿元归零即坐化 */
function burnLife(run: RunState, b: BattleState, years: number) {
  if (years <= 0) return;
  run.lifespan -= years;
  run.stats.lifespanBurned += years;
  if (run.lifespan <= 0) {
    run.lifespan = 0;
    b.outcome = 'defeat';
    log(b, '寿元燃尽，坐化道途');
  }
}

/** 罚雷场效果：每回合第 3 次起的得气不触发得气段（§8.10） */
function deqiCapActive(b: BattleState): boolean {
  return b.waveIndex >= 0 && aliveEnemies(b).some((e) => e.enemyId === 'falei');
}

// ---------- 状态施加 ----------

function addPlayerStatus(b: BattleState, id: StatusId, n: number) {
  if (n === 0) return;
  b.player.statuses[id] = (b.player.statuses[id] ?? 0) + n;
  if (b.player.statuses[id]! <= 0) delete b.player.statuses[id];
}

function addEnemyStatus(run: RunState, b: BattleState, e: EnemyState, id: StatusId, n: number) {
  if (n === 0) return;
  if (id === 'zhuoshao' && n > 0) {
    n += powerN(b, 'lihuoxinjing'); // 离火心经：你施加的灼烧 +N
    run.flags['burnThisBattle'] = (run.flags['burnThisBattle'] ?? 0) + n;
    if ((run.flags['burnThisBattle'] ?? 0) >= 25) run.flags['ach_wulei'] = 1; // 成就"五雷轰顶"
  }
  if (id === 'ruanhua') {
    e.statuses.ruanhua = 1; // 不叠加，可刷新（§4.5）
    return;
  }
  e.statuses[id] = (e.statuses[id] ?? 0) + n;
  if (e.statuses[id]! <= 0) delete e.statuses[id];
}

/** 滞涩：意图延迟 1 回合（同一敌人每 2 回合限 1 次） */
function applyZhise(b: BattleState, e: EnemyState) {
  if (e.zhiseCd > 0) return;
  e.flags['zhise'] = 1;
  e.zhiseCd = 2;
  log(b, `${e.name} 气机凝滞，意图延迟`);
}

/** 移除敌方至多 max 层增益（罡气优先，其次固本），返回移除层数 */
function removeEnemyBuffs(e: EnemyState, max: number): number {
  let removed = 0;
  const order: StatusId[] = ['gangqi', 'guben'];
  for (const id of order) {
    while (removed < max && (e.statuses[id] ?? 0) > 0) {
      e.statuses[id]! -= 1;
      if (e.statuses[id]! <= 0) delete e.statuses[id];
      removed += 1;
    }
  }
  return removed;
}

/** 移除玩家 1 层增益（玄雷：罡气 → 固本 → 回春） */
function removePlayerBuff(b: BattleState) {
  const order: StatusId[] = ['gangqi', 'guben', 'huichun'];
  for (const id of order) {
    if ((b.player.statuses[id] ?? 0) > 0) {
      addPlayerStatus(b, id, -1);
      return;
    }
  }
}

// ---------- 护体 ----------

/** 玩家获得护体：带来源属性（§4.4 ⑤），属性取最后一次来源 */
function gainPlayerBlock(_run: RunState, b: BattleState, amount: number, element: CardElement) {
  let n = amount;
  if (n <= 0) return;
  if ((b.player.statuses.blockHalf ?? 0) > 0) n = Math.floor(n * 0.5); // 剑域
  const budong = powerN(b, 'budongrushan');
  if (budong > 0) n = Math.floor(n * (1 + budong / 100));
  if (n <= 0) return;
  b.player.block += n;
  b.player.blockElement = element;
}

/** 敌人获得护体：软化减半；破土后本回合无法获得 */
function enemyGainBlock(e: EnemyState, amount: number) {
  let n = amount;
  if (n <= 0) return;
  if (e.flags['noBlock']) return; // 破土
  if ((e.statuses.ruanhua ?? 0) > 0) n = Math.floor(n / 2); // 软化
  e.block += n;
}

// ---------- 玩家受伤 ----------

/** 直接失血（无视护体） */
function playerLoseHp(run: RunState, b: BattleState, n: number) {
  if (n <= 0) return;
  run.hp -= n;
  run.stats.damageTaken += n;
  checkPlayerDeath(run, b);
}

/** 卡牌自伤（走护体，1:1，不吃属性生克） */
function playerSelfDamage(run: RunState, b: BattleState, n: number) {
  if (n <= 0) return;
  const blocked = Math.min(b.player.block, n);
  b.player.block -= blocked;
  playerLoseHp(run, b, n - blocked);
}

/**
 * 敌人对玩家的一段攻击（§4.3 + §4.4 ⑤）：
 * dmg = (基础 + 罡气) → 六重天 ×1.15 → 攻方气滞 ×0.7 → 守方破绽 ×1.4 → 龟息丹减半
 * → 藤偶承伤 → 按护体属性效率结算（八卦镜每场第一次"被克"改判 1:1）→ 溢出扣血。
 */
function playerTakeAttack(run: RunState, b: BattleState, e: EnemyState, base: number): number {
  let dmg = base + (e.statuses.gangqi ?? 0);
  if (run.ascension >= 6) dmg = Math.floor(dmg * 1.15); // 六重天：妖力滔天
  if ((e.statuses.qizhi ?? 0) > 0) dmg = Math.floor(dmg * 0.7);
  if ((b.player.statuses.pozhan ?? 0) > 0) dmg = Math.floor(dmg * 1.4);
  if ((b.player.statuses.guixiDan ?? 0) > 0) dmg = Math.floor(dmg * 0.5); // 龟息丹

  // 青藤傀儡：藤偶承伤（上限 _tengouCap/回合）
  if ((b.player.statuses.tengou ?? 0) > 0 && dmg > 0) {
    const cap = b.player.statuses['_tengouCap'] ?? 7;
    const used = b.playedByElement['_tengouUsed'] ?? 0;
    const absorb = Math.min(dmg, Math.max(0, cap - used));
    if (absorb > 0) {
      dmg -= absorb;
      b.playedByElement['_tengouUsed'] = used + absorb;
      if ((b.player.statuses['_tengouThorn'] ?? 0) > 0) addEnemyStatus(run, b, e, 'zhangdu', 1);
      log(b, `藤偶承受 ${absorb} 伤`);
    }
  }

  // 护体属性效率
  let ratio = blockRatio(e.element, b.player.block > 0 ? b.player.blockElement : 'none');
  if (ratio === 2 && hasRelic(run, 'baguajing') && !b.playedByElement['_baguaUsed']) {
    ratio = 1;
    b.playedByElement['_baguaUsed'] = 1;
    log(b, '八卦镜微光一闪，克制之势被折返为平');
  }
  const { hpLoss, blockLoss } = absorbWithBlock(dmg, b.player.block, ratio);
  b.player.block -= blockLoss;
  if (hpLoss > 0) {
    run.hp -= hpLoss;
    run.stats.damageTaken += hpLoss;
  }

  // 反制钩子
  const fanci = b.player.statuses.fanci ?? 0;
  if (fanci > 0 && e.hp > 0) enemyLoseHp(run, b, e, fanci);
  const fanshao = b.player.statuses.fanshao ?? 0;
  if (fanshao > 0 && e.hp > 0) addEnemyStatus(run, b, e, 'zhuoshao', fanshao);
  const yinguo = b.player.statuses.yinguo ?? 0;
  if (yinguo > 0 && e.hp > 0) {
    enemyLoseHp(run, b, e, Math.floor((base * yinguo) / 100));
    delete b.player.statuses.yinguo;
  }
  checkPlayerDeath(run, b);
  return hpLoss;
}

function checkPlayerDeath(run: RunState, b: BattleState) {
  if (run.hp > 0 || b.outcome !== 'ongoing') return;
  // 浴火涅槃：弃全部手牌，每张以 niepan% 上限复活（§5.4）；得气段：复活时清除全部负面
  const niepan = b.player.statuses.niepan ?? 0;
  if (niepan > 0) {
    const count = b.hand.length;
    for (const c of [...b.hand]) {
      if (c.vanish) b.exhaustPile.push(c);
      else b.discardPile.push(c);
    }
    b.hand = [];
    const pct = Math.min(100, niepan * count);
    run.hp = Math.max(1, Math.floor((run.maxHp * pct) / 100));
    delete b.player.statuses.niepan;
    if (b.playedByElement['_niepanCleanse']) {
      const negatives: StatusId[] = ['zhuoshao', 'zhangdu', 'qizhi', 'pozhan', 'drawDown', 'tunaDown', 'sleeveBan', 'blockHalf'];
      for (const s of negatives) delete b.player.statuses[s];
    }
    log(b, `浴火涅槃！焚尽 ${count} 张手牌，以 ${run.hp} 气血重生`);
    return;
  }
  // 不灭灯（每局一次；寿元 <10 无效）
  if (hasRelic(run, 'bumiedeng') && !run.flags['bumiedengUsed'] && run.lifespan >= 10) {
    run.lifespan -= 10;
    run.stats.lifespanBurned += 10;
    run.flags['bumiedengUsed'] = 1;
    run.hp = 1;
    log(b, '不灭灯燃去十年寿数，为你保住一口气');
    return;
  }
  // 婴变胎光（每局一次；寿元 ≥20：燃至 10 年复活 30% 上限）
  if (hasRelic(run, 'yingbiantaiguang') && !run.flags['yingbianUsed'] && run.lifespan >= 20) {
    run.stats.lifespanBurned += run.lifespan - 10;
    run.lifespan = 10;
    run.flags['yingbianUsed'] = 1;
    run.hp = Math.max(1, Math.floor(run.maxHp * 0.3));
    log(b, '婴变胎光！燃尽寿数，原地重修');
    return;
  }
  run.hp = 0;
  b.outcome = 'defeat';
}

// ---------- 敌人受伤 ----------

/** 直接掉血（无视护体、不触发攻击钩子） */
function enemyLoseHp(run: RunState, b: BattleState, e: EnemyState, n: number) {
  if (e.hp <= 0 || n <= 0) return;
  e.hp -= n;
  xinmoCheckPhase(run, b, e);
  if (e.hp <= 0) onEnemyDeath(run, b, e);
}

/**
 * 敌人受到玩家攻击（玩家攻击 vs 敌护体恒为 1:1，§4.3）。
 * pierceHalf = 熔锻：此击 50% 伤害无视护体（向下取整部分直击气血）。
 */
function enemyTakeAttack(
  run: RunState, b: BattleState, e: EnemyState, dmg: number,
  opts: { ignoreBlock?: boolean; pierceHalf?: boolean } = {},
): number {
  if (e.hp <= 0 || b.outcome !== 'ongoing') return 0;
  e.flags['hitThisTurn'] = (e.flags['hitThisTurn'] ?? 0) + 1;
  // 蛟：单回合被攻击 ≥3 次 → 逆鳞
  if (e.enemyId === 'jiao' && e.flags['hitThisTurn'] === 3) {
    e.statuses.gangqi = (e.statuses.gangqi ?? 0) + 3;
    log(b, '蛟逆鳞怒张，罡气 +3！');
  }
  // 荆棘姿态：攻击它受刺
  if ((e.flags['jingji'] ?? 0) > 0) {
    playerLoseHp(run, b, e.flags['jingjiN'] ?? 5);
    if (b.outcome !== 'ongoing') return 0;
  }
  let hpLoss: number;
  if (opts.ignoreBlock) {
    hpLoss = dmg;
  } else if (opts.pierceHalf) {
    const direct = Math.floor(dmg / 2);
    const rest = dmg - direct;
    const blocked = Math.min(e.block, rest);
    e.block -= blocked;
    hpLoss = direct + rest - blocked;
  } else {
    const blocked = Math.min(e.block, dmg);
    e.block -= blocked;
    hpLoss = dmg - blocked;
  }
  e.hp -= hpLoss;
  xinmoCheckPhase(run, b, e);
  if (e.hp <= 0) onEnemyDeath(run, b, e);
  return hpLoss;
}

function onEnemyDeath(run: RunState, b: BattleState, e: EnemyState) {
  e.hp = 0;
  run.flags['kills'] = (run.flags['kills'] ?? 0) + 1;
  log(b, `${e.name} 化墨消散`);
  // 同伴死亡强化
  if (e.enemyId === 'huoya') {
    for (const o of aliveEnemies(b)) if (o.enemyId === 'huoya') o.statuses.gangqi = (o.statuses.gangqi ?? 0) + 2;
  }
  if (e.enemyId === 'shiqun') {
    for (const o of aliveEnemies(b)) if (o.enemyId === 'shiqun') o.statuses.gangqi = (o.statuses.gangqi ?? 0) + 1;
  }
  // 黑白无常：任一死亡另一狂暴
  if (e.enemyId === 'heiwuchang' || e.enemyId === 'baiwuchang') {
    for (const o of aliveEnemies(b)) {
      if (o.enemyId === 'heiwuchang' || o.enemyId === 'baiwuchang') o.flags['rage'] = 1;
    }
  }
  // 阴煞雷：死亡时施你气滞 1
  if (e.enemyId === 'yinshalei') addPlayerStatus(b, 'qizhi', 1);
  // 心魔：道心通明（心魔 0 进场取胜）→ 明镜止水
  if (e.enemyId === 'xinmo') {
    if ((e.flags['demon'] ?? 0) === 0) run.flags['daoxin'] = 1;
    // 成就"身外化身"：相变后未掉血击杀
    if (run.flags['xinmoPhaseHp'] !== undefined && run.hp >= run.flags['xinmoPhaseHp']) {
      run.flags['ach_shenwai'] = 1;
    }
  }

  // 九重天劫：击杀当前雷灵立即进入下一道
  if (b.waveIndex >= 0 && e.flags['wave'] !== undefined) {
    const wave = e.flags['wave'];
    const w = JIUCHONG_WAVES[wave];
    if (w.breatherAfter && run.ascension < 8) {
      heal(run, 10);
      drawCards(run, b, 2);
      gainEnergy(run, b, 1);
      log(b, '【喘息】雷云暂歇：回 10 血、抽 2、吐纳 +1');
    }
    if (wave + 1 < JIUCHONG_WAVES.length) {
      b.waveIndex = wave + 1;
      const next = spawnWave(run, b, b.waveIndex);
      b.enemies.push(next);
      run.flags[`seen_${next.enemyId}`] = 1;
      setIntent(run, b, next);
      log(b, `${next.name} 携雷而至！`);
    }
  }

  if (aliveEnemies(b).length === 0) b.outcome = 'victory';
}

// ---------- 抽牌 ----------

export function drawCards(run: RunState, b: BattleState, n: number) {
  for (let i = 0; i < n; i++) {
    if (b.drawPile.length === 0) {
      if (b.discardPile.length === 0) return;
      const r = rngShuffle(run.rng, 'shuffle', b.discardPile);
      run.rng = r.state;
      b.drawPile = r.value;
      b.discardPile = [];
    }
    const card = b.drawPile.shift()!;
    if (b.hand.length >= HAND_CAP) b.discardPile.push(card); // 溢出进弃牌堆（§4.1）
    else b.hand.push(card);
  }
}

/** 确保牌库顶可见 n 张（不足时洗入弃牌堆），返回顶部切片 */
function revealTop(run: RunState, b: BattleState, n: number): CardInstance[] {
  if (b.drawPile.length < n && b.discardPile.length > 0) {
    const r = rngShuffle(run.rng, 'shuffle', b.discardPile);
    run.rng = r.state;
    b.drawPile = [...b.drawPile, ...r.value];
    b.discardPile = [];
  }
  return b.drawPile.slice(0, n);
}

// ---------- 战斗构建 ----------

function makeEnemy(run: RunState, def: EnemyDef, hpOverride?: number): EnemyState {
  let hp = hpOverride ?? def.hp;
  if (run.ascension >= 1) hp = Math.floor(hp * 1.1); // 一重天：妖氛渐浓
  if (run.ascension >= 9) hp = Math.floor(hp * 1.1); // 九重天：天道无情
  return {
    uid: newUid(run), enemyId: def.id, name: def.name, element: def.element,
    hp, maxHp: hp, block: 0, statuses: {}, moveIndex: 0, intent: null, zhiseCd: 0, flags: {},
  };
}

function enemyGroup(run: RunState, tier: 'normal' | 'elite'): EnemyDef[] {
  const pool = tier === 'normal' ? normalPool(run.act) : elitePool(run.act);
  const r = rngPick(run.rng, 'enemyAI', pool);
  run.rng = r.state;
  const def = r.value;
  if (def.id === 'heiwuchang') return [getEnemy('heiwuchang'), getEnemy('baiwuchang')];
  const out: EnemyDef[] = [];
  for (let i = 0; i < (def.count ?? 1); i++) out.push(def);
  return out;
}

/** 开始一场战斗；enemyIds 提供时为定制战（事件战/Boss） */
export function startBattle(
  run: RunState,
  battleType: 'normal' | 'elite' | 'boss',
  enemyIds?: string[],
): void {
  let defs: EnemyDef[];
  if (enemyIds) defs = enemyIds.map((id) => getEnemy(id));
  else if (battleType === 'boss') defs = [getEnemy(ACT_BOSS[run.act])];
  else defs = enemyGroup(run, battleType);

  const isJiuchong = defs[0]?.id === 'jiuchongtianjie';
  const b: BattleState = {
    battleType, outcome: 'ongoing',
    enemies: [], hand: [], drawPile: [], discardPile: [], exhaustPile: [],
    player: { block: 0, blockElement: 'none', energy: 0, statuses: {}, attackBuffs: [] },
    turn: 0, stance: null, shengBlocked: false, chain: [], tianren: false,
    zhoutianTriggered: false, zhoutianTotal: 0,
    sleeved: [], sleeveCapBonus: 0, lastPlayed: null, deqiCountTurn: 0,
    cardsPlayed: 0, attacksPlayed: 0, playedByElement: {},
    powers: [], huichunshuUses: 0, pendingChoice: null,
    wuxingDanNext: false, longhuBonus: 0, tianjiActive: false,
    waveIndex: isJiuchong ? 0 : -1, turnsTotal: 0, log: [],
  };
  run.battle = b;

  if (isJiuchong) {
    b.enemies = [spawnWave(run, b, 0)];
  } else {
    b.enemies = defs.map((d) => {
      if (d.id === 'xinmo') {
        // 金丹心魔劫：气血 = 380 + 40×心魔（§8.7）
        const e = makeEnemy(run, d, d.hp + 40 * run.demon);
        e.flags['demon'] = run.demon;
        return e;
      }
      return makeEnemy(run, d);
    });
  }
  run.flags['burnThisBattle'] = 0; // 成就"五雷轰顶"计数

  // 心魔投影（§4.8）：按心魔值生成诅咒牌入抽牌堆（叠加式各 1 张）
  const pile: CardInstance[] = run.deck.map((c) => ({ ...c }));
  if (run.demon >= 3) pile.push(makeCard(run, 'chenyuan'));
  if (run.demon >= 5) pile.push(makeCard(run, 'yezhang'));
  if (run.demon >= 7) pile.push(makeCard(run, 'tanchen'));
  if (run.demon >= 9) pile.push(makeCard(run, 'xinmo_curse'));
  const shuffled = rngShuffle(run.rng, 'shuffle', pile);
  run.rng = shuffled.state;
  b.drawPile = shuffled.value;

  // 法宝/道果/因果链"战斗开始"效果
  if (run.battleStartBlock > 0) gainPlayerBlock(run, b, run.battleStartBlock, 'earth'); // 铁骨（土护体）
  if (run.flags['chain_xianghuo'] && battleType === 'boss') {
    gainPlayerBlock(run, b, 12, 'earth'); // 香火愿力：Boss 战开局 +12 土护体
    delete run.flags['chain_xianghuo'];
    log(b, '香火愿力护身，+12 土护体');
  }
  if (hasRelic(run, 'tianleicuiti')) {
    for (const e of aliveEnemies(b)) enemyTakeAttack(run, b, e, 8);
    playerSelfDamage(run, b, 3);
    log(b, '天雷淬体！雷落全场');
  }
  // 丹毒 ≥4（药王鼎阈值 +4）：开战受 2 真伤
  const toxinGate = hasFruit(run, 'yaowangding') ? 8 : 4;
  if (run.toxin >= toxinGate && b.outcome === 'ongoing') {
    playerLoseHp(run, b, 2);
    log(b, '丹毒攻心，开战即受 2 点真伤');
  }

  // 妖怪图鉴收录
  for (const e of b.enemies) run.flags[`seen_${e.enemyId}`] = 1;
  if (isJiuchong) run.flags['seen_jiuchongtianjie'] = 1;

  // 敌人亮出首回合意图
  for (const e of aliveEnemies(b)) setIntent(run, b, e);

  if (b.outcome !== 'ongoing') return;
  startPlayerTurn(run, b);

  // 河图：每场战斗开始行位初始为选定之行（在首回合开始后弹出，选择直接写入本回合行位）
  if (hasRelic(run, 'hetu')) {
    b.pendingChoice = {
      kind: 'dilemma',
      prompt: '河图微光流转：选定开局行位',
      options: ELEMENTS.map((el) => ELEMENT_NAME[el]),
      data: { hetu: 1 },
    };
  }
}

// ---------- 九重天劫波次 ----------

function spawnWave(run: RunState, b: BattleState, index: number): EnemyState {
  const w = JIUCHONG_WAVES[index];
  let hp = w.hp;
  let dmgBonus = 0;
  if (w.id === 'daolei') {
    hp += (run.demon + run.karma) * 10; // 道雷：+（心魔+业力）×10
    if (run.flags['daolei_minus30']) hp = Math.max(1, hp - 30); // 拒绝心魔来访
    // 第二形态：业力 ≥4 或九重天难度（两者叠加只加一次形态，数值再叠）
    const forms = (run.karma >= 4 ? 1 : 0) + (run.ascension >= 9 ? 1 : 0);
    if (forms > 0) {
      hp += 90;
      dmgBonus = 4 * forms;
    }
  }
  if (run.ascension >= 1) hp = Math.floor(hp * 1.1);
  if (run.ascension >= 9) hp = Math.floor(hp * 1.1);
  const e: EnemyState = {
    uid: newUid(run), enemyId: w.id,
    name: `第${'一二三四五六七八九'[index]}道·${w.name}`,
    element: w.element, hp, maxHp: hp, block: 0, statuses: {}, moveIndex: 0,
    intent: null, zhiseCd: 0, flags: { wave: index, dmgBonus },
  };
  // 道雷开场"诛心"：心魔 ≥6 时你手牌中费用最高的牌本场 +1 费
  if (w.opener === 'zhuxin' && run.demon >= 6) {
    let best: CardInstance | null = null;
    let bestCost = -1;
    for (const c of b.hand) {
      const cost = getCard(c.cardId).cost;
      if (typeof cost === 'number' && cost > bestCost) {
        bestCost = cost;
        best = c;
      }
    }
    if (best) {
      b.playedByElement[`_zhuxin_${best.uid}`] = 1;
      log(b, `诛心！【${getCard(best.cardId).name}】本场费用 +1`);
    }
  }
  return e;
}

function waveIntent(run: RunState, b: BattleState, e: EnemyState): EnemyMove {
  const w = JIUCHONG_WAVES[e.flags['wave']];
  const turns = e.flags['turns'] ?? 0;
  if (w.special === 'tianfa' && turns > 0 && turns % 2 === 0) {
    return { id: 'tianfa', name: '天罚', kind: 'attack', damage: 22, special: 'tianfa' };
  }
  if (w.special === 'wendao' && turns > 0 && turns % 3 === 0) {
    return { id: 'wendao', name: '问道', kind: 'unknown', special: 'wendao' };
  }
  void b;
  void run;
  return {
    id: 'leiji', name: '雷击', kind: 'attack',
    damage: w.baseDamage + (e.flags['dmgBonus'] ?? 0), times: w.times,
    special: w.special === 'ximie' || w.special === 'burnPlayer' ? w.special : undefined,
  };
}

// ---------- 意图（敌方回合末声明；性情 ai 在声明时读玩家状态） ----------

/** 心魔行为池（按开战时心魔值解锁；心魔每 +3 多复制 1 张 diyu） */
function xinmoPool(demon: number): EnemyMove[] {
  const def = getEnemy('xinmo');
  const diyu = def.moves.find((m) => m.special === 'diyu')!;
  const kaowen = def.moves.find((m) => m.special === 'kaowen')!;
  const tunshi = def.moves.find((m) => m.special === 'tunshi')!;
  const pool: EnemyMove[] = [diyu, tunshi];
  if (demon >= 3) pool.push(kaowen);
  if (demon >= 7) pool.push({ id: 'tanying', name: '贪影', kind: 'debuff', special: 'tanying' });
  for (let i = 0; i < Math.floor(demon / 3); i++) pool.push(diyu);
  return pool;
}

/** 蓄力被浇熄取消后的"普通行动" */
function basicMove(e: EnemyState): EnemyMove {
  const def = getEnemy(e.enemyId);
  return def.moves.find((m) => m.kind === 'attack') ?? def.moves[0];
}

function setIntent(run: RunState, b: BattleState, e: EnemyState) {
  // 九重天劫：波次驱动
  if (b.waveIndex >= 0 && e.flags['wave'] !== undefined) {
    e.intent = waveIntent(run, b, e);
    return;
  }

  // 雷灵傀儡：第 4/8/12 回合劫雷 22/30/38（金属性攻击，提前一回合明示）
  if (e.enemyId === 'leiling_kuilei') {
    const nextTurn = b.turn + 1;
    if (nextTurn === 4 || nextTurn === 8 || nextTurn === 12) {
      const nth = nextTurn === 4 ? 1 : nextTurn === 8 ? 2 : 3;
      const dmg = nth === 1 ? 22 : nth === 2 ? 30 : 38;
      e.intent = {
        id: 'jielei', name: `第${'一二三'[nth - 1]}道劫雷`, kind: 'attack',
        damage: dmg, special: 'jielei', n: nth,
      };
      return;
    }
  }

  // 心魔：蓄力 → 劫雷 → 动态行为池
  if (e.enemyId === 'xinmo') {
    if (e.flags['release']) {
      const minions = aliveEnemies(b).filter((x) => x.enemyId === 'zhinian').length;
      e.intent = {
        id: 'xinmojielei', name: '心魔劫雷', kind: 'attack',
        damage: 26 + 8 * minions, special: 'xinmojielei',
      };
      return;
    }
    if ((e.flags['charging'] ?? 0) > 0) {
      e.intent = { id: 'xinmo_charge', name: '蓄力·劫数', kind: 'charge' };
      return;
    }
    const pool = xinmoPool(e.flags['demon'] ?? 0);
    e.intent = pool[e.moveIndex % pool.length];
    return;
  }

  const def = getEnemy(e.enemyId);
  const moves = def.moves;

  // 性情脚本：声明时读玩家状态
  if (def.ai === 'yehu' && b.hand.length >= 6) {
    e.intent = moves.find((m) => m.id === 'meihuo') ?? moves[e.moveIndex % moves.length];
    return;
  }
  if (def.ai === 'zheng' && b.player.block > 0 && b.player.blockElement === 'fire') {
    e.intent = moves.find((m) => m.id === 'paoxiao') ?? moves[e.moveIndex % moves.length];
    return;
  }
  const next = moves[e.moveIndex % moves.length];
  if (def.ai === 'shanxiao' && next.id === 'duohunhao' && b.stance === 'metal') {
    // 与你争锋：你行位为金时，夺魂嚎改为对你 11 伤
    e.intent = { id: 'duohunhao_atk', name: '夺魂嚎', kind: 'attack', damage: 11 };
    return;
  }
  e.intent = next;
}

/** 意图显示数值（含罡气与气滞修正，§4.6） */
export function intentDamage(_b: BattleState, e: EnemyState): number | null {
  if (!e.intent || e.intent.kind !== 'attack' || e.intent.damage === undefined) return null;
  let dmg = e.intent.damage + (e.statuses.gangqi ?? 0);
  if ((e.statuses.qizhi ?? 0) > 0) dmg = Math.floor(dmg * 0.7);
  return dmg;
}

// ---------- 心魔相变 ----------

/** 执念相变：每损失 1/3 血召分身 + 蓄力心魔劫雷（心魔 0 无相变） */
function xinmoCheckPhase(run: RunState, b: BattleState, e: EnemyState) {
  if (e.enemyId !== 'xinmo' || e.hp <= 0) return;
  const demon = e.flags['demon'] ?? 0;
  if (demon <= 0) return;
  const third = e.maxHp / 3;
  const phase = e.hp <= third ? 2 : e.hp <= third * 2 ? 1 : 0;
  while ((e.flags['phase'] ?? 0) < phase) {
    e.flags['phase'] = (e.flags['phase'] ?? 0) + 1;
    run.flags['xinmoPhaseHp'] = run.hp; // 成就"身外化身"起点
    const count = demon >= 6 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const z = makeEnemy(run, getEnemy('zhinian'));
      b.enemies.push(z);
      setIntent(run, b, z);
    }
    e.flags['charging'] = 2;
    delete e.flags['release'];
    e.intent = { id: 'xinmo_charge', name: '蓄力·劫数', kind: 'charge' };
    log(b, `心魔相变："看看你心里都住着什么。"${count} 道执念具现！`);
  }
}

// ---------- 回合流程 ----------

function startPlayerTurn(run: RunState, b: BattleState) {
  if (b.outcome !== 'ongoing') return;
  b.turn += 1;
  b.turnsTotal += 1;

  // 行位/链：回合开始清空；金丹"周天自运"跨回合保留（周天允许跨 2 回合累计）
  if (run.realm === 'jindan') {
    if (b.chain.length > 0) {
      if (b.playedByElement['_chainCarry']) {
        b.chain = [];
        delete b.playedByElement['_chainCarry'];
      } else {
        b.playedByElement['_chainCarry'] = 1;
      }
    }
  } else {
    b.stance = null;
    b.chain = [];
    delete b.playedByElement['_chainCarry'];
  }
  b.shengBlocked = false;
  b.tianren = false;
  b.zhoutianTriggered = false;
  b.deqiCountTurn = 0;
  b.sleeveCapBonus = 0;
  b.player.attackBuffs = [];
  for (const k of Object.keys(b.playedByElement)) {
    if (k.endsWith('_turn') || k === '_tengouUsed') delete b.playedByElement[k];
  }
  for (const e of b.enemies) e.flags['hitThisTurn'] = 0;

  // 道果"婴儿抱丹"：回合开始若气海存灵 ≥4：+1 层固本并抽 1
  if (hasFruit(run, 'yingerbaodan') && run.realm !== 'lianqi' && b.player.energy >= 4) {
    addPlayerStatus(b, 'guben', 1);
    drawCards(run, b, 1);
  }

  // 1. 吐纳（§4.2）：+4 与修正
  let mod = 0;
  if ((b.player.statuses.tunaDown ?? 0) > 0) {
    mod -= b.player.statuses.tunaDown!;
    delete b.player.statuses.tunaDown;
  }
  if (b.turn === 1 && run.gongdeBattles > 0) mod += 1; // 功德：开局吐纳 +1
  if (b.turn === 1 && run.flags['xiaqian']) {
    mod -= 1; // 山神下签
    delete run.flags['xiaqian'];
  }
  if (run.flags['dailyLingchao']) mod += 1; // 每日天机·灵潮汹涌
  // 心法"天一生水"：回合开始若行位为水（参悟：水或金）：吐纳 +2
  const tys = findPower(b, 'tianyishengshui');
  if (tys && (b.stance === 'water' || (tys.upgraded && b.stance === 'metal'))) mod += 2;
  if (run.realm === 'lianqi') {
    b.player.energy = Math.max(0, 4 + mod); // 炼气：不储存，回合开始重置
  } else {
    b.player.energy = Math.max(0, Math.min(run.poolCap, b.player.energy + 4 + mod)); // 气海储存
  }

  // 回合开始效果：固本（土护体）与"下回合护体"
  const guben = b.player.statuses.guben ?? 0;
  if (guben > 0) gainPlayerBlock(run, b, guben * 2, 'earth');
  if ((b.player.statuses.nextTurnBlock ?? 0) > 0) {
    gainPlayerBlock(run, b, b.player.statuses.nextTurnBlock!, 'none');
    delete b.player.statuses.nextTurnBlock;
  }

  // 2. 袖藏牌先入手（北冥吞天：袖藏牌本回合费用 −1）
  const beiming = findPower(b, 'beimingtuntian');
  for (const c of b.sleeved) {
    if (beiming) {
      const cost = getCard(c.cardId).cost;
      if (typeof cost === 'number') c.tempCost = Math.max(0, cost - 1);
    }
    b.hand.push(c);
  }
  b.sleeved = [];

  // 再抽 run.drawPerTurn
  let draw = run.drawPerTurn;
  if (b.tianjiActive) draw += 1; // 天机丹
  if (run.flags['dailyLingchao']) draw += 1;
  if (run.flags['dailyWenluan']) draw += 1;
  if ((b.player.statuses.drawDown ?? 0) > 0) {
    draw -= b.player.statuses.drawDown!;
    delete b.player.statuses.drawDown;
  }
  if ((b.player.statuses.nextTurnDraw ?? 0) > 0) {
    draw += b.player.statuses.nextTurnDraw!;
    delete b.player.statuses.nextTurnDraw;
  }
  if (b.turn === 1 && run.flags['huangliang']) {
    draw += 2; // 黄粱一梦：首回合抽 +2
    delete run.flags['huangliang'];
  }
  drawCards(run, b, Math.max(0, draw));
}

/**
 * 结束回合（§4.2 步骤 4–5）。
 * sleeveUids：袖藏选择（张数 ≤ 袖藏上限；sleeveBan 时无效；诅咒与 vanish 牌不可袖藏）。
 */
export function endTurn(run: RunState, b: BattleState, sleeveUids?: number[]) {
  if (b.pendingChoice || b.outcome !== 'ongoing') return;

  // 4. 袖藏
  const wants = sleeveUids ?? [];
  if ((b.player.statuses.sleeveBan ?? 0) <= 0 && wants.length > 0) {
    const beiming = !!findPower(b, 'beimingtuntian');
    let cap = beiming ? Infinity : 1 + (hasRelic(run, 'luoshu') ? 1 : 0) + b.sleeveCapBonus;
    // 昆仑镜：每场 1 次，袖藏数量不设上限
    if (!beiming && hasRelic(run, 'kunlunjing') && !b.playedByElement['_kunlunUsed'] && wants.length > cap) {
      cap = Infinity;
      b.playedByElement['_kunlunUsed'] = 1;
      log(b, '昆仑镜倒转光阴，满手牌藏入袖中');
    }
    for (const uid of wants) {
      if (b.sleeved.length >= cap) break;
      const i = b.hand.findIndex((c) => c.uid === uid);
      if (i < 0) continue;
      const inst = b.hand[i];
      if (inst.vanish || getCard(inst.cardId).type === 'curse') continue;
      b.hand.splice(i, 1);
      delete inst.tempCost;
      b.sleeved.push(inst);
    }
  }

  // 5. 回合结束效果
  const huichun = b.player.statuses.huichun ?? 0;
  if (huichun > 0) {
    heal(run, huichun);
    addPlayerStatus(b, 'huichun', -1);
  }
  const gumu = powerN(b, 'gumuchangqing');
  if (gumu > 0) heal(run, gumu);
  // 你身上的灼烧：受层数真伤后减半（向下取整）；天火燎原：不衰减
  const pZhuo = b.player.statuses.zhuoshao ?? 0;
  if (pZhuo > 0) {
    playerLoseHp(run, b, pZhuo);
    if (b.outcome !== 'ongoing') return;
    if (!run.flags['dailyTianhuo']) {
      b.player.statuses.zhuoshao = Math.floor(pZhuo / 2);
      if (b.player.statuses.zhuoshao <= 0) delete b.player.statuses.zhuoshao;
    }
  }
  // 心魔诅咒：回合结束仍在手牌受 3 真伤（§5.5）
  for (const c of b.hand) {
    if (c.cardId === 'xinmo_curse') {
      playerLoseHp(run, b, 3);
      if (b.outcome !== 'ongoing') return;
    }
  }

  // 弃置全部手牌
  for (const c of b.hand) {
    delete c.tempCost;
    if (c.vanish) b.exhaustPile.push(c);
    else b.discardPile.push(c);
  }
  b.hand = [];
  b.tianren = false;
  b.shengBlocked = false;

  // 玩家按回合衰减的状态
  addPlayerStatus(b, 'qizhi', -Math.min(1, b.player.statuses.qizhi ?? 0));
  addPlayerStatus(b, 'pozhan', -Math.min(1, b.player.statuses.pozhan ?? 0));
  addPlayerStatus(b, 'sleeveBan', -Math.min(1, b.player.statuses.sleeveBan ?? 0));
  addPlayerStatus(b, 'blockHalf', -Math.min(1, b.player.statuses.blockHalf ?? 0));
  if ((b.player.statuses.tengou ?? 0) > 0) addPlayerStatus(b, 'tengou', -1);

  enemyPhase(run, b);
}

function enemyPhase(run: RunState, b: BattleState) {
  // 敌人护体同步减半（承接了上个玩家回合的旧护体在此衰减；本回合新获得的护体保持完整）
  for (const e of aliveEnemies(b)) e.block = Math.floor(e.block / 2);

  // 按站位从左到右执行意图
  for (const e of [...b.enemies]) {
    if (e.hp <= 0 || b.outcome !== 'ongoing') continue;
    if (e.flags['zhise']) {
      delete e.flags['zhise'];
      log(b, `${e.name} 意图延迟`);
      continue;
    }
    enemyAct(run, b, e);
    if (b.outcome !== 'ongoing') return;
    // 瘴毒：每次行动结算后受层数伤害
    const du = e.statuses.zhangdu ?? 0;
    if (e.hp > 0 && du > 0) enemyLoseHp(run, b, e, du);
  }
  if (b.outcome !== 'ongoing') return;

  // 敌方状态结算（各自回合结束）
  const wandu = findPower(b, 'wandushixin');
  for (const e of aliveEnemies(b)) {
    const zhuo = e.statuses.zhuoshao ?? 0;
    if (zhuo > 0) {
      enemyLoseHp(run, b, e, zhuo); // 真实伤害
      if (e.hp > 0 && !run.flags['dailyTianhuo']) {
        if (hasRelic(run, 'dengxincao')) addEnemyStatus(run, b, e, 'zhuoshao', -1); // 灯芯草：−1 衰减
        else {
          e.statuses.zhuoshao = Math.floor(zhuo / 2);
          if (e.statuses.zhuoshao <= 0) delete e.statuses.zhuoshao;
        }
      }
    }
    if (e.hp <= 0) continue;
    // 瘴毒衰减：其回合结束 −1；万毒噬心：不衰减（参悟：每回合全体 +1）
    if ((e.statuses.zhangdu ?? 0) > 0) {
      if (!wandu) addEnemyStatus(run, b, e, 'zhangdu', -1);
      else if (wandu.upgraded) addEnemyStatus(run, b, e, 'zhangdu', 1);
    }
    if ((e.statuses.qizhi ?? 0) > 0) addEnemyStatus(run, b, e, 'qizhi', -1);
    if ((e.statuses.pozhan ?? 0) > 0) addEnemyStatus(run, b, e, 'pozhan', -1);
    delete e.statuses.ruanhua; // 软化持续 1 回合
    delete e.flags['noBlock']; // 破土的"本回合无法获得护体"
    if (e.zhiseCd > 0) e.zhiseCd -= 1;
    if ((e.flags['jingji'] ?? 0) > 0) e.flags['jingji'] -= 1;
    // 狂暴（无常 / 雷灵傀儡三道劫雷后）：每回合 +2 罡气
    if (e.flags['rage']) e.statuses.gangqi = (e.statuses.gangqi ?? 0) + 2;
    // 奔雷：每回合 +1 罡气
    if (b.waveIndex >= 0 && e.flags['wave'] !== undefined
      && JIUCHONG_WAVES[e.flags['wave']].special === 'gangqiPerTurn') {
      e.statuses.gangqi = (e.statuses.gangqi ?? 0) + 1;
    }
    // 道雷回光：低于 30% 血 +3 罡气（一次）
    if (e.enemyId === 'daolei' && e.hp < e.maxHp * 0.3 && !e.flags['huiguang']) {
      e.flags['huiguang'] = 1;
      e.statuses.gangqi = (e.statuses.gangqi ?? 0) + 3;
      log(b, '道雷回光返照，罡气 +3！');
    }
    e.flags['turns'] = (e.flags['turns'] ?? 0) + 1;
  }
  if (b.outcome !== 'ongoing') return;

  // 亮出下回合意图（性情 ai 在此读玩家状态）
  for (const e of aliveEnemies(b)) {
    e.moveIndex += 1;
    setIntent(run, b, e);
  }

  // 玩家护体衰减链
  if ((b.player.statuses.retainBlock ?? 0) > 0) {
    addPlayerStatus(b, 'retainBlock', -1); // 消耗一次
  } else if (hasRelic(run, 'xuanguijia') && b.player.blockElement === 'earth') {
    // 玄龟甲：土属性护体不衰减
  } else if (findPower(b, 'houdezaiwu')) {
    b.player.block = Math.max(0, b.player.block - powerN(b, 'houdezaiwu')); // 减半改固定 −n
  } else {
    b.player.block = Math.floor(b.player.block / 2);
  }

  // 覆盖敌方回合的单次性状态
  delete b.player.statuses.guixiDan;
  delete b.player.statuses.fanci;
  delete b.player.statuses.fanshao;

  startPlayerTurn(run, b);
}

function enemyAct(run: RunState, b: BattleState, e: EnemyState) {
  const move = e.intent;
  if (!move) return;

  // 固本（双方通用）：行动开始每层 +2 护体（敌人产生其自身属性护体）
  const guben = e.statuses.guben ?? 0;
  if (guben > 0) enemyGainBlock(e, guben * 2);
  // 铜甲尸被动：每回合 +8 金护体
  if (e.enemyId === 'tongjiashi') enemyGainBlock(e, 8);
  // 阴兵列阵：存活 ≥2 时各 +5 护体/回合
  if (e.enemyId === 'yinbing' && aliveEnemies(b).filter((x) => x.enemyId === 'yinbing').length >= 2) {
    enemyGainBlock(e, 5);
  }

  switch (move.special) {
    case 'zhaohun': { // 白无常招魂幡：为黑无常 +3 罡气或 +10 护体
      const hei = aliveEnemies(b).find((x) => x.enemyId === 'heiwuchang');
      if (hei) {
        const r = rngInt(run.rng, 'enemyAI', 0, 1);
        run.rng = r.state;
        if (r.value === 0) hei.statuses.gangqi = (hei.statuses.gangqi ?? 0) + 3;
        else enemyGainBlock(hei, 10);
        log(b, '白无常摇动招魂幡');
      }
      return finishEnemyMove(run, b, e);
    }
    case 'huanmian': { // 傩面鬼换面：+10 护体 / +2 罡气 / 施你气滞 1
      const r = rngInt(run.rng, 'enemyAI', 0, 2);
      run.rng = r.state;
      if (r.value === 0) enemyGainBlock(e, 10);
      else if (r.value === 1) e.statuses.gangqi = (e.statuses.gangqi ?? 0) + 2;
      else addPlayerStatus(b, 'qizhi', 1);
      return finishEnemyMove(run, b, e);
    }
    case 'beiqi': { // 骨女悲泣：你牌库顶 2 张进弃牌堆
      for (let i = 0; i < 2 && b.drawPile.length > 0; i++) b.discardPile.push(b.drawPile.shift()!);
      return finishEnemyMove(run, b, e);
    }
    case 'zhihun': // 勾魂：你心魔 +1
      run.demon = Math.max(0, Math.min(9, run.demon + 1));
      run.flags['demonPeak'] = Math.max(run.flags['demonPeak'] ?? 0, run.demon); // 守心如玉成就用峰值
      log(b, `${e.name} 勾魂摄魄，心魔 +1`);
      return finishEnemyMove(run, b, e);
    case 'shidu': // 尸毒：你丹毒 +1
      run.toxin = Math.max(0, Math.min(12, run.toxin + 1));
      log(b, `${e.name} 喷出尸毒，丹毒 +1`);
      return finishEnemyMove(run, b, e);
    case 'zhiwang': // 织网：你本回合结束无法袖藏
      addPlayerStatus(b, 'sleeveBan', 1);
      return finishEnemyMove(run, b, e);
    case 'baidu': // 摆渡：你 2 回合无法袖藏
      addPlayerStatus(b, 'sleeveBan', 2);
      return finishEnemyMove(run, b, e);
    case 'touling': // 偷灵：你下回合吐纳 −1
      addPlayerStatus(b, 'tunaDown', 1);
      return finishEnemyMove(run, b, e);
    case 'tanying': { // 贪影：洗 1 张【贪嗔】入你抽牌堆
      const curse = makeCard(run, 'tanchen');
      const r = rngInt(run.rng, 'shuffle', 0, b.drawPile.length);
      run.rng = r.state;
      b.drawPile.splice(r.value, 0, curse);
      log(b, '一缕贪影没入你的牌库');
      return finishEnemyMove(run, b, e);
    }
    case 'diyu': { // 心魔低语：复制你卡组基础伤害最高的攻击牌打向你
      let best = 0;
      for (const c of run.deck) {
        const def = getCard(c.cardId);
        if (def.type !== 'attack') continue;
        const eff = c.upgraded ? def.upBase : def.base;
        const total = (eff.damage ?? 0) * (eff.times ?? 1);
        if (total > best) best = total;
      }
      const dmg = Math.max(6, best);
      log(b, `心魔低语："这是你自己的刀。"（${dmg} 伤）`);
      playerTakeAttack(run, b, e, dmg);
      return finishEnemyMove(run, b, e);
    }
    case 'kaowen': { // 道心拷问：弃 2 或受 16（心魔 ≥5：弃 3 或受 22）
      const hard = (e.flags['demon'] ?? run.demon) >= 5;
      b.pendingChoice = {
        kind: 'dilemma', prompt: '心魔逼问："你的道，经得起舍弃吗？"',
        options: [`弃 ${hard ? 3 : 2} 张手牌`, `受 ${hard ? 22 : 16} 伤`],
        data: { discard: hard ? 3 : 2, damage: hard ? 22 : 16 },
      };
      return finishEnemyMove(run, b, e);
    }
    case 'tunshi': { // 吞噬：攻击并自回 14
      playerTakeAttack(run, b, e, move.damage ?? 14);
      e.hp = Math.min(e.maxHp, e.hp + 14);
      return finishEnemyMove(run, b, e);
    }
    case 'xinmojielei': { // 心魔劫雷 26（存活分身每只 +8）
      const minions = aliveEnemies(b).filter((x) => x.enemyId === 'zhinian').length;
      playerTakeAttack(run, b, e, 26 + 8 * minions);
      delete e.flags['release'];
      return finishEnemyMove(run, b, e);
    }
    case 'xisui': { // 吸髓：对你 9 伤并自回等量
      const loss = playerTakeAttack(run, b, e, move.damage ?? 9);
      e.hp = Math.min(e.maxHp, e.hp + loss);
      return finishEnemyMove(run, b, e);
    }
    case 'jingji': // 荆棘姿态：2 回合内你每次攻击它受 n 伤
      e.flags['jingji'] = 2;
      e.flags['jingjiN'] = move.n ?? 5;
      return finishEnemyMove(run, b, e);
    case 'suijia': { // 横扫：击碎你 n 点护体后攻击
      b.player.block = Math.max(0, b.player.block - (move.n ?? 6));
      if (move.damage !== undefined) playerTakeAttack(run, b, e, move.damage);
      return finishEnemyMove(run, b, e);
    }
    case 'jielei': { // 筑基劫雷（金属性攻击）
      const loss = playerTakeAttack(run, b, e, move.damage ?? 22);
      if (loss > 0) run.flags['jieleiDirty'] = 1; // 成就"三劫齐渡"
      else run.flags['jieleiClean'] = (run.flags['jieleiClean'] ?? 0) + 1;
      if ((move.n ?? 0) >= 3) e.flags['rage'] = 1; // 三道后狂暴：每回合 +2 罡气
      return finishEnemyMove(run, b, e);
    }
    case 'tianfa': { // 灭雷天罚 22：护体承接 ≥12 则减半
      let dmg = move.damage ?? 22;
      if (b.player.block >= 12) dmg = Math.floor(dmg / 2);
      playerTakeAttack(run, b, e, dmg);
      return finishEnemyMove(run, b, e);
    }
    case 'wendao': // 道雷问道：弃 3 张或受 20 伤
      b.pendingChoice = {
        kind: 'dilemma', prompt: '雷声如问："何为道？"',
        options: ['弃 3 张手牌', '受 20 伤'],
        data: { discard: 3, damage: 20 },
      };
      return finishEnemyMove(run, b, e);
  }

  // 常规行为
  if (move.kind === 'attack' && move.damage !== undefined) {
    const times = move.times ?? 1;
    for (let i = 0; i < times; i++) {
      if (b.outcome !== 'ongoing') return;
      playerTakeAttack(run, b, e, move.damage);
    }
    if (b.outcome !== 'ongoing') return;
    // 九重天劫附带效果
    if (move.special === 'ximie') removePlayerBuff(b); // 玄雷：移除你 1 层增益
    if (move.special === 'burnPlayer') addPlayerStatus(b, 'zhuoshao', 2); // 燹雷
  }
  if (move.block) enemyGainBlock(e, move.block);
  if (move.gainSelf) {
    for (const [k, v] of Object.entries(move.gainSelf)) {
      e.statuses[k as StatusId] = (e.statuses[k as StatusId] ?? 0) + (v as number);
    }
  }
  if (move.applyPlayer && b.outcome === 'ongoing') {
    for (const [k, v] of Object.entries(move.applyPlayer)) addPlayerStatus(b, k as StatusId, v as number);
  }
  if (move.loseSelfHp) enemyLoseHp(run, b, e, move.loseSelfHp);
  if (move.healSelf) e.hp = Math.min(e.maxHp, e.hp + move.healSelf);
  finishEnemyMove(run, b, e);
}

function finishEnemyMove(run: RunState, b: BattleState, e: EnemyState) {
  if (e.enemyId !== 'xinmo' || e.hp <= 0) return;
  // 属性轮转：每 2 回合按相生顺序切换（初始无属性 → 木起），攻击属性同步变
  if (b.turn % 2 === 0) {
    const order: Element[] = ['wood', 'fire', 'earth', 'metal', 'water'];
    const cur = e.element === 'none' ? -1 : order.indexOf(e.element as Element);
    e.element = order[(cur + 1) % 5];
    log(b, `心魔道则流转，化为${ELEMENT_NAME[e.element as Element]}行`);
  }
  // 蓄力倒计时（劫数）
  if ((e.flags['charging'] ?? 0) > 0) {
    e.flags['charging'] -= 1;
    if (e.flags['charging'] === 0) e.flags['release'] = 1;
  }
  void run;
}

// ---------- 出牌 ----------

export function cardCost(run: RunState, b: BattleState, inst: CardInstance): number {
  const def = getCard(inst.cardId);
  if (inst.tempCost !== undefined) return inst.tempCost;
  let cost: number;
  if (def.cost === 'X') cost = b.player.energy;
  else cost = def.cost;
  if (def.id === 'beimingtuntian' && inst.upgraded) cost = 3; // 参悟：费用 3
  if (def.id === 'wuxinglunzhuan' && inst.upgraded) cost = 0; // 参悟：本牌费用 0
  // 诛心：手牌中费用最高的牌本场 +1 费
  if (b.playedByElement[`_zhuxin_${inst.uid}`]) cost += 1;
  // 上善若水：每回合前 N 张水牌 −1
  const ruoshui = findPower(b, 'shangshanruoshui');
  if (ruoshui && def.element === 'water'
    && (b.playedByElement['water_turn'] ?? 0) < (ruoshui.upgraded ? 2 : 1)) cost -= 1;
  // 道法自然（参悟）：每回合第一张无属性牌 −1
  const dfzr = findPower(b, 'daofaziran');
  if (dfzr?.upgraded && def.element === 'none' && !def.dual
    && (b.playedByElement['none_turn'] ?? 0) === 0) cost -= 1;
  // 每日天机·木行昌盛：木牌 −1 费
  if (run.flags['dailyMuxing'] && def.element === 'wood') cost -= 1;
  return Math.max(0, cost);
}

export function canPlay(run: RunState, b: BattleState, inst: CardInstance): boolean {
  if (b.pendingChoice || b.outcome !== 'ongoing') return false;
  const def = getCard(inst.cardId);
  if (def.type === 'curse' && !def.playableCurse) return false;
  return cardCost(run, b, inst) <= b.player.energy;
}

export function playCard(
  run: RunState, b: BattleState, uid: number, target?: number, dualPick?: 'a' | 'b',
) {
  if (b.outcome !== 'ongoing') return;
  const idx = b.hand.findIndex((c) => c.uid === uid);
  if (idx < 0) return;
  const inst = b.hand[idx];
  if (!canPlay(run, b, inst)) return;
  const def = getCard(inst.cardId);
  const cost = cardCost(run, b, inst);
  const xCost = def.cost === 'X' ? cost : 0;

  b.hand.splice(idx, 1);
  b.player.energy -= cost;

  // ---- 行位判定（types.ts 契约）：elem = dual ? 所选行 : def.element ----
  const pickB = def.dual ? dualPick === 'b' : false;
  let elem: CardElement = def.dual ? def.dual.elements[pickB ? 1 : 0] : def.element;
  const oldStance = b.stance;

  // 随行：太极图（双行与无属性牌）/ 道法自然（无属性牌）——打出时视作当前行位所生
  const suixing =
    (hasRelic(run, 'taijitu') && (!!def.dual || def.element === 'none'))
    || (!!findPower(b, 'daofaziran') && def.element === 'none' && !def.dual);
  if (suixing && oldStance) elem = SHENG[oldStance];

  // 五行丹：下一张牌视为任意行（必得气）
  let forced = false;
  if (b.wuxingDanNext) {
    b.wuxingDanNext = false;
    forced = true;
    if (oldStance) elem = SHENG[oldStance];
  }

  // ---- 得气判定 ----
  const hasSheng = !!def.sheng || !!def.dual;
  let deqi = false;
  if (elem !== 'none' && hasSheng && !curseInHand(b, 'yinguozhai')) {
    if (forced) deqi = true; // 必得气（无视滞气）
    else if (!b.shengBlocked) {
      if (b.tianren) deqi = true; // 天人合一：双段齐发（无视行位）
      else if (hasFruit(run, 'jiantai') && def.element === 'metal') deqi = true; // 剑胎
      else if (oldStance && generates(oldStance, elem)) deqi = true;
      else if (hasFruit(run, 'niyunzhenqi') && oldStance && overcomes(elem, oldStance)) deqi = true; // 逆运真气
    }
  }
  if (b.tianren && deqi) b.tianren = false; // 消耗后清除
  if (b.shengBlocked && elem !== 'none') b.shengBlocked = false; // 滞气消耗

  // 罚雷场效果：每回合第 3 次起的得气不触发得气段
  let shengActive = deqi;
  if (deqi) {
    b.deqiCountTurn += 1;
    if (deqiCapActive(b) && b.deqiCountTurn >= 3) {
      shengActive = false;
      log(b, '罚雷压顶，得气之势被天威压下');
    } else if (b.deqiCountTurn === 1) {
      if (hasRelic(run, 'wuxingzhu')) gainEnergy(run, b, 1); // 五行珠：首次得气吐纳 +1
      if (run.flags['daoxin']) drawCards(run, b, 1); // 明镜止水：首次得气抽 1
    }
  }

  // ---- 链 / 周天 / 行位更新 / 滞气标记 ----
  let strongReverse = false;
  if (elem !== 'none') {
    if (oldStance && generates(oldStance, elem)) {
      b.chain.push(elem as Element);
    } else {
      b.chain = [elem as Element];
      delete b.playedByElement['_chainCarry'];
    }
    if (oldStance && overcomes(elem as Element, oldStance) && !hasFruit(run, 'niyunzhenqi')) {
      strongReverse = true; // 结算完本牌后 shengBlocked = true
    }
    b.stance = elem as Element;
    // 五行周天：chain 覆盖 5 行（一气化三清为 4 行），每回合限 1 次
    const need = hasFruit(run, 'yiqihuasanqing') ? 4 : 5;
    if (!b.zhoutianTriggered && new Set(b.chain).size >= need) {
      b.zhoutianTriggered = true;
      b.zhoutianTotal += 1;
      gainEnergy(run, b, 3);
      b.tianren = true;
      log(b, '【五行周天】圆满！吐纳 +3，天人合一待发');
      if (hasRelic(run, 'leijimu')) {
        for (const e of [...aliveEnemies(b)]) enemyTakeAttack(run, b, e, 8); // 雷击木
        log(b, '雷击木引落小雷，全体 8 伤');
      }
    }
  }

  // ---- 两段效果选取 ----
  let baseEff: CardEffects;
  let shengEff: CardEffects | undefined;
  let dualExtra: CardEffects | undefined; // 双行得气：另一行的完整段
  if (def.dual) {
    const d = def.dual;
    baseEff = inst.upgraded ? (pickB ? d.bUp : d.aUp) : (pickB ? d.b : d.a);
    if (shengActive) dualExtra = inst.upgraded ? (pickB ? d.aUp : d.bUp) : (pickB ? d.a : d.b);
  } else {
    baseEff = inst.upgraded ? def.upBase : def.base;
    shengEff = shengActive ? (inst.upgraded ? (def.upSheng ?? def.sheng) : def.sheng) : undefined;
  }

  // 冥想：本回合袖藏上限 +1（契约点：按卡 id 挂接）
  if (def.id === 'mingxiang') b.sleeveCapBonus += 1;

  // ---- 执行 ----
  executeCard(run, b, inst, def.id, elem, baseEff, shengEff, shengActive, target, xCost);
  if (dualExtra) executeCard(run, b, inst, def.id, elem, dualExtra, undefined, false, target, xCost);

  // 自身灼烧合计钳 ≥0（炎爆：基础 +2，得气段 −2）
  const selfBurn = (baseEff.selfBurn ?? 0)
    + (shengActive ? (shengEff?.selfBurn ?? 0) + (dualExtra?.selfBurn ?? 0) : 0);
  if (selfBurn > 0) addPlayerStatus(b, 'zhuoshao', selfBurn);

  // ---- 心法登记（打出时若得气立即执行 sheng 一次，已在 executeCard 完成） ----
  if (def.type === 'power') {
    b.powers.push({ cardId: def.id, upgraded: inst.upgraded, counter: 0 });
    // 火德真身得气段：自身灼烧全清（数据难表达的挂点）
    if (def.id === 'huodezhenshen' && shengActive) delete b.player.statuses.zhuoshao;
    if (def.id === 'yuhuoniepan' && shengActive) b.playedByElement['_niepanCleanse'] = 1; // 得气：复活时清负面
  }

  // ---- 计数与触发 ----
  b.cardsPlayed += 1;
  if (def.type === 'attack') {
    b.attacksPlayed += 1;
    b.playedByElement['_atkTurn'] = (b.playedByElement['_atkTurn'] ?? 0) + 1;
  }
  const countElem: CardElement = def.dual ? elem : def.element;
  if (countElem !== 'none') {
    b.playedByElement[countElem] = (b.playedByElement[countElem] ?? 0) + 1;
    b.playedByElement[`${countElem}_turn`] = (b.playedByElement[`${countElem}_turn`] ?? 0) + 1;
    if (countElem === 'metal') {
      // 剑心通明：每打出第 N 张金牌抽 1 并吐纳 +1
      const jx = findPower(b, 'jianxintongming');
      if (jx) {
        const every = jx.upgraded ? 2 : 3;
        if ((b.playedByElement['metal'] ?? 0) % every === 0) {
          drawCards(run, b, 1);
          gainEnergy(run, b, 1);
        }
      }
    }
  } else {
    b.playedByElement['none_turn'] = (b.playedByElement['none_turn'] ?? 0) + 1;
  }

  // ---- 滞气生效（结算完本牌后） ----
  if (strongReverse) {
    b.shengBlocked = true;
    log(b, '强逆行位，气机逆乱（下一张牌无法得气）');
  }

  // ---- 牌去向 ----
  if (def.type === 'power') {
    // 心法常驻，不进弃牌堆
  } else if (baseEff.exhaust || inst.vanish) {
    b.exhaustPile.push(inst);
  } else {
    b.discardPile.push(inst);
  }

  b.lastPlayed = def.id;
}

/** 选定单体目标（缺省取最左存活敌人） */
function pickTargetEnemy(b: BattleState, target?: number): EnemyState | null {
  const alive = aliveEnemies(b);
  if (alive.length === 0) return null;
  return alive.find((e) => e.uid === target) ?? alive[0];
}

/** 执行一张牌的一段（含 special 脚本与攻击管线），sheng 段的攻击字段并入攻击结算 */
function executeCard(
  run: RunState, b: BattleState, inst: CardInstance, cardId: string, elem: CardElement,
  eff: CardEffects, sheng: CardEffects | undefined, deqi: boolean,
  target: number | undefined, xCost: number,
) {
  const def = getCard(cardId);

  switch (eff.special) {
    case 'cuifeng': { // 淬锋：本回合接下来 n2 张攻击牌 +n 伤（得气段：改为 +sheng.n）
      const bonus = deqi && sheng?.n !== undefined ? sheng.n : eff.n ?? 4;
      b.player.attackBuffs.push({ bonus, left: eff.n2 ?? 2 });
      break;
    }
    case 'jianqizongheng': { // 剑气纵横：damage 基础；得气段每次得气（含本次）+n
      const extra = deqi ? (sheng?.n ?? 4) * b.deqiCountTurn : 0;
      attackWithCard(run, b, inst, def.id, elem,
        { ...eff, damage: (eff.damage ?? 8) + extra }, deqi ? sheng : undefined, deqi, target);
      break;
    }
    case 'baihong': { // 白虹贯日：目标无护体时 +n；得气段另有 ruanhua（走通用 sheng）
      const t = pickTargetEnemy(b, target);
      const bonus = t && t.block === 0 ? eff.n ?? 8 : 0;
      attackWithCard(run, b, inst, def.id, elem,
        { ...eff, damage: (eff.damage ?? 17) + bonus }, deqi ? sheng : undefined, deqi, target);
      break;
    }
    case 'huichunshu': { // 回春术：每场限 2 次
      if (b.huichunshuUses >= 2) {
        log(b, '回春术本场已用尽');
      } else {
        b.huichunshuUses += 1;
        heal(run, eff.heal ?? eff.n ?? 5);
      }
      if (deqi && sheng) applyCommon(run, b, elem, sheng, target);
      break;
    }
    case 'chunhui': { // 春回大地：移除自身全部负面，每个抽 1；得气每个回 sheng.n 血
      const negatives: StatusId[] = ['zhuoshao', 'qizhi', 'pozhan', 'drawDown', 'tunaDown', 'sleeveBan', 'blockHalf'];
      let removed = 0;
      for (const s of negatives) {
        if ((b.player.statuses[s] ?? 0) > 0) {
          delete b.player.statuses[s];
          removed += 1;
        }
      }
      drawCards(run, b, removed);
      const per = (eff.n ?? 0) + (deqi ? sheng?.n ?? 3 : 0);
      if (per > 0) heal(run, per * removed);
      applyCommon(run, b, elem, { ...eff, special: undefined, n: undefined }, target);
      break;
    }
    case 'kurong': { // 枯荣轮转：燃寿 1 年（得气免燃寿）
      if (!deqi) burnLife(run, b, eff.burnLife ?? 1);
      if (b.outcome !== 'ongoing') return;
      applyCommon(run, b, elem, { ...eff, special: undefined, burnLife: undefined }, target);
      if (deqi && sheng) applyCommon(run, b, elem, { ...sheng, burnLife: undefined }, target);
      break;
    }
    case 'hanlu': { // 寒露：击杀时回 4 血并吐纳 +1
      const t = pickTargetEnemy(b, target);
      if (t) {
        attackWithCard(run, b, inst, def.id, elem, eff, deqi ? sheng : undefined, deqi, t.uid);
        if (t.hp <= 0) {
          heal(run, 4);
          gainEnergy(run, b, 1);
        }
      }
      break;
    }
    case 'jiling': // 汲灵术：+energy（行位已由正常流程更新为水）
      applyCommon(run, b, elem, { ...eff, special: undefined }, target);
      if (deqi && sheng) applyCommon(run, b, elem, sheng, target);
      break;
    case 'guanlan': { // 观澜：预视牌库顶 n 张可弃任意，然后抽 draw
      const n = deqi && sheng?.n !== undefined ? sheng.n : eff.n ?? 3;
      const top = revealTop(run, b, n);
      if (top.length > 0) {
        b.pendingChoice = {
          kind: 'scry', cards: [...top], maxPick: top.length,
          prompt: '观澜：选择要弃置的牌（可不选）', sourceCard: cardId,
          data: { draw: eff.draw ?? 1 },
        };
      } else {
        drawCards(run, b, eff.draw ?? 1);
      }
      break;
    }
    case 'jinghua': { // 镜花水月：复制本场上一张打出的牌入手（0 费；未得气回合末消散）
      if (b.lastPlayed) {
        const srcDef = getCard(b.lastPlayed);
        if (!srcDef.bonded && srcDef.type !== 'curse') {
          const copy = makeCard(run, b.lastPlayed, inst.upgraded); // 参悟：复制参悟态
          copy.tempCost = 0;
          if (!deqi) copy.vanish = true; // 得气段：可袖藏（不消散）
          if (b.hand.length < HAND_CAP) b.hand.push(copy);
          else b.discardPile.push(copy);
        }
      }
      break;
    }
    case 'canghai': { // 沧海纳川：选择弃任意张，每张 +n 水护体；得气每张回 2 血
      if (b.hand.length > 0) {
        b.pendingChoice = {
          kind: 'discardHand', cards: [...b.hand], maxPick: b.hand.length,
          prompt: '沧海纳川：选择要弃置的牌', sourceCard: cardId,
          data: { per: eff.block ?? eff.n ?? 7, healPer: deqi ? sheng?.heal ?? 2 : 0 },
        };
      }
      break;
    }
    case 'yinhuo': { // 引火符【引爆】：目标立即受其灼烧层数伤害（层数保留）；得气引爆 2 次
      const t = pickTargetEnemy(b, target);
      if (t) {
        const times = deqi ? 2 : 1;
        const pct = eff.n ?? 100;
        for (let i = 0; i < times; i++) {
          if (t.hp <= 0) break;
          const layers = t.statuses.zhuoshao ?? 0;
          if (layers > 0) enemyLoseHp(run, b, t, Math.floor((layers * pct) / 100));
        }
      }
      break;
    }
    case 'sanmei': { // 三昧真火：燃尽剩余全部灵气（先扣本牌费用），每点 n 伤
      const extra = b.player.energy;
      b.player.energy = 0;
      const per = deqi && sheng?.n !== undefined ? sheng.n : eff.n ?? 12;
      if (extra > 0) {
        attackWithCard(run, b, inst, def.id, elem,
          { damage: extra * per }, undefined, deqi, target);
      }
      break;
    }
    case 'yinghuo': { // 荧惑守心：X×n 伤 + X 灼烧；得气每点 +2
      const per = (eff.n ?? 10) + (deqi ? sheng?.n ?? 2 : 0);
      if (xCost > 0) {
        const t = pickTargetEnemy(b, target);
        if (t) {
          attackWithCard(run, b, inst, def.id, elem, { damage: xCost * per }, undefined, deqi, t.uid);
          if (t.hp > 0) addEnemyStatus(run, b, t, 'zhuoshao', xCost);
        }
      }
      break;
    }
    case 'dadimaidong': { // 大地脉动：block + 每层固本额外 +n 护体
      const guben = b.player.statuses.guben ?? 0;
      gainPlayerBlock(run, b, (eff.block ?? 12) + guben * (eff.n ?? 3), elem);
      applyCommon(run, b, elem, { ...eff, special: undefined, block: undefined, n: undefined }, target);
      if (deqi && sheng) applyCommon(run, b, elem, sheng, target);
      break;
    }
    case 'chengshan': { // 承山印【掷山】：失去至多 n 点护体，造成失去量 ×n2% 伤害（得气上限 +6）
      const cap = (eff.n ?? 12) + (deqi ? sheng?.n ?? 6 : 0);
      const lost = Math.min(b.player.block, cap);
      b.player.block -= lost;
      if (lost > 0) {
        attackWithCard(run, b, inst, def.id, elem,
          { damage: Math.floor((lost * (eff.n2 ?? 150)) / 100) }, undefined, deqi, target);
      }
      break;
    }
    case 'guanxiang': { // 观想五行：顶 5 选 n 入手
      const top = revealTop(run, b, 5);
      if (top.length > 0) {
        b.pendingChoice = {
          kind: 'pickTop', cards: [...top], maxPick: eff.n ?? 1,
          prompt: `观想五行：选 ${eff.n ?? 1} 张入手`, sourceCard: cardId,
        };
      }
      break;
    }
    case 'canjuan': { // 问长生·残卷：顶 n 选 1 入手（参悟：另可选 1 张置底）
      const top = revealTop(run, b, eff.n ?? 3);
      if (top.length > 0) {
        b.pendingChoice = {
          kind: 'pickTop', cards: [...top], maxPick: 1,
          prompt: '问长生·残卷：选 1 张入手', sourceCard: cardId,
          upgraded: inst.upgraded,
          data: inst.upgraded ? { bottom: 1 } : undefined,
        };
      }
      break;
    }
    case 'wuxinglunzhuan': { // 五行轮转：洗回任意张手牌，每张吐纳 +1
      if (b.hand.length > 0) {
        b.pendingChoice = {
          kind: 'returnHand', cards: [...b.hand], maxPick: b.hand.length,
          prompt: '五行轮转：选择洗回牌库的牌（每张吐纳 +1）', sourceCard: cardId,
        };
      }
      break;
    }
    case 'zuowang': { // 坐忘：放逐任意张，每张吐纳 +1 并抽 1（参悟每张再回 2 血）
      if (b.hand.length > 0) {
        b.pendingChoice = {
          kind: 'exhaustHand', cards: [...b.hand], maxPick: b.hand.length,
          prompt: '坐忘：选择要放逐的牌', sourceCard: cardId, upgraded: inst.upgraded,
        };
      }
      break;
    }
    case 'zhoutianX': { // 周天大衍诀：亮出顶 X 张，沿行位顺生衔接者依次免费打出，其余弃去（参悟入手）
      const revealed = revealTop(run, b, xCost);
      b.drawPile.splice(0, revealed.length);
      const rest = [...revealed];
      let progress = true;
      while (progress && b.outcome === 'ongoing' && !b.pendingChoice) {
        progress = false;
        const stance = b.stance;
        if (!stance) break;
        const i = rest.findIndex((c) => {
          const cd = getCard(c.cardId);
          if (cd.type === 'curse') return false;
          const els: CardElement[] = cd.dual ? cd.dual.elements : [cd.element];
          return els.some((el) => el !== 'none' && generates(stance, el as Element));
        });
        if (i < 0) break;
        const next = rest.splice(i, 1)[0];
        const cd = getCard(next.cardId);
        let pick: 'a' | 'b' = 'a';
        if (cd.dual && !generates(stance, cd.dual.elements[0])) pick = 'b';
        next.tempCost = 0;
        b.hand.push(next);
        const alive = aliveEnemies(b);
        let tgt: number | undefined;
        if (alive.length > 0) {
          const r = rngPick(run.rng, 'enemyAI', alive);
          run.rng = r.state;
          tgt = r.value.uid;
        }
        playCard(run, b, next.uid, tgt, pick);
        progress = true;
      }
      for (const c of rest) {
        if (inst.upgraded && b.hand.length < HAND_CAP) b.hand.push(c);
        else b.discardPile.push(c);
      }
      break;
    }
    case 'yezhang': // 业障：花 2 灵气打出以放逐，无其他效果
      break;
    default: {
      // ---- 通用 DSL ----
      const isAttack = def.type === 'attack' || eff.damage !== undefined;
      if (isAttack) {
        attackWithCard(run, b, inst, def.id, elem, eff, deqi ? sheng : undefined, deqi, target);
      }
      applyCommon(run, b, elem, { ...eff, special: undefined }, target, { skipAttack: isAttack });
      if (deqi && sheng) {
        // 得气段追加：bonusDamage/extraHit/makeAoe 已并入攻击结算，其余字段追加执行
        applyCommon(run, b, elem, sheng, target, { skipAttack: isAttack });
        if (!isAttack && sheng.damage !== undefined) {
          attackWithCard(run, b, inst, def.id, elem, sheng, undefined, deqi, target);
        }
      }
      return;
    }
  }
  // special 分支的得气追加段（攻击类 special 已并入；此处补非攻击字段）
  if (deqi && sheng && eff.special
    && !['huichunshu', 'chunhui', 'kurong', 'jiling', 'dadimaidong'].includes(eff.special)) {
    applyCommon(run, b, elem, { ...sheng, n: undefined, heal: eff.special === 'canghai' ? undefined : sheng.heal }, target, { skipAttack: true });
  }
}

/** 通用数值效果（护体/抽牌/灵气/回血/自伤/状态；不含攻击 damage 主段） */
function applyCommon(
  run: RunState, b: BattleState, elem: CardElement, eff: CardEffects,
  target: number | undefined, opts: { skipAttack?: boolean } = {},
) {
  if (b.outcome !== 'ongoing') return;
  if (eff.block) gainPlayerBlock(run, b, eff.block, elem);
  if (eff.heal) heal(run, eff.heal);
  if (eff.maxHp) {
    run.maxHp += eff.maxHp;
    if (eff.maxHp > 0) run.hp = Math.min(run.maxHp, run.hp + eff.maxHp);
    else run.hp = Math.min(run.hp, run.maxHp);
  }
  if (eff.draw) drawCards(run, b, eff.draw);
  if (eff.energy) gainEnergy(run, b, eff.energy);
  if (eff.selfDamage) playerSelfDamage(run, b, eff.selfDamage);
  if (eff.loseHp) playerLoseHp(run, b, eff.loseHp);
  if (eff.burnLife) burnLife(run, b, eff.burnLife);
  if (b.outcome !== 'ongoing') return;
  if (eff.applySelf) {
    for (const [k, v] of Object.entries(eff.applySelf)) {
      addPlayerStatus(b, k as StatusId, v as number);
      if (k === 'tengou' && eff.n && !eff.applySelf['_tengouCap']) {
        b.player.statuses['_tengouCap'] = eff.n; // 青藤傀儡吸收上限
      }
    }
  }
  if (eff.applyEnemyAll) {
    for (const e of aliveEnemies(b)) {
      for (const [k, v] of Object.entries(eff.applyEnemyAll)) {
        addEnemyStatus(run, b, e, k as StatusId, v as number);
      }
    }
  }
  // 攻击段的 applyEnemy/zhise 由攻击管线处理；技能牌在此对目标施加
  if (!opts.skipAttack) {
    const t = pickTargetEnemy(b, target);
    if (t && t.hp > 0) {
      if (eff.applyEnemy) {
        for (const [k, v] of Object.entries(eff.applyEnemy)) {
          addEnemyStatus(run, b, t, k as StatusId, v as number);
        }
      }
      if (eff.zhise) applyZhise(b, t);
    }
  }
}

/**
 * 玩家攻击管线（§4.3 + §4.4 ④）：
 * dmg = 基础 + 罡气 + 淬锋 + 龙虎丹 + 得气 bonusDamage（+ 剪伐/桃木剑/剑穗等加值）
 * → 攻方气滞 ×0.7 → 守方破绽 ×1.4（每步向下取整）→ 敌护体 1:1 →溢出扣血。
 * 克伐：攻击牌克敌属性时，每次出牌对每个受击目标结算一次。
 */
function attackWithCard(
  run: RunState, b: BattleState, inst: CardInstance, cardId: string, elem: CardElement,
  eff: CardEffects, sheng: CardEffects | undefined, deqi: boolean, target: number | undefined,
) {
  const def = getCard(cardId);
  const aoe = !!eff.aoe || !!sheng?.makeAoe;
  const primary = pickTargetEnemy(b, target);
  const targets = aoe ? [...aliveEnemies(b)] : primary ? [primary] : [];
  if (targets.length === 0) return;
  const times = (eff.times ?? 1) + (sheng?.extraHit ? 1 : 0);

  // 每次出牌的通用加值
  let bonus = (b.player.statuses.gangqi ?? 0) + b.longhuBonus + (sheng?.bonusDamage ?? 0);
  for (const buff of b.player.attackBuffs) {
    if (buff.left > 0) {
      bonus += buff.bonus;
      buff.left -= 1;
    }
  }
  b.player.attackBuffs = b.player.attackBuffs.filter((x) => x.left > 0);
  const isMetalCard = (def.dual ? elem : def.element) === 'metal';
  if (isMetalCard && (b.playedByElement['metal_turn'] ?? 0) === 0) {
    bonus += powerN(b, 'gengjinjianyu'); // 庚金剑域：每回合第一张金牌
  }
  if (isMetalCard && deqi && hasRelic(run, 'jiansui')) bonus += 2; // 剑穗
  if (curseInHand(b, 'tanchen')) bonus -= 2; // 贪嗔

  // 火德真身：每回合第一张攻击牌附加灼烧
  const huode = powerN(b, 'huodezhenshen');
  const firstAttackTurn = (b.playedByElement['_atkTurn'] ?? 0) === 0;

  for (const t of targets) {
    if (t.hp <= 0 || b.outcome !== 'ongoing') continue;
    // ---- 克伐（KEFA_VERB） ----
    let kefaBonus = 0;
    let pierceHalf = false;
    if (def.type === 'attack' && elem !== 'none' && t.element !== 'none'
      && overcomes(elem as Element, t.element as Element)) {
      const verb = KEFA_VERB[elem as Element];
      if (hasRelic(run, 'taomujian') && !b.playedByElement['_kefaFirst']) kefaBonus += 6; // 桃木剑
      b.playedByElement['_kefaFirst'] = 1;
      switch (verb) {
        case 'jianfa': { // 剪伐：移除至多 2 层增益，每层此击 +4
          const removed = removeEnemyBuffs(t, 2);
          kefaBonus += removed * 4;
          break;
        }
        case 'potu': // 破土：护体减半且本回合无法获得护体
          t.block = Math.floor(t.block / 2);
          t.flags['noBlock'] = 1;
          break;
        case 'zhise': // 滞涩
          applyZhise(b, t);
          break;
        case 'jiaoxi': // 浇熄：蓄力中取消蓄力改普通行动；否则移 1 层增益（心魔蓄力为"劫数"，不可浇熄，§8.7）
          if (t.enemyId !== 'xinmo' && (t.intent?.kind === 'charge' || (t.flags['charging'] ?? 0) > 0)) {
            t.flags['charging'] = 0;
            delete t.flags['release'];
            t.intent = basicMove(t);
            log(b, `${t.name} 的蓄力被浇熄！`);
          } else {
            removeEnemyBuffs(t, 1);
          }
          break;
        case 'rongduan': // 熔锻：此击 50% 无视护体 + 软化
          pierceHalf = true;
          addEnemyStatus(run, b, t, 'ruanhua', 1);
          break;
      }
      log(b, `【${KEFA_NAME[verb]}】`);
    }

    for (let i = 0; i < times; i++) {
      if (t.hp <= 0 || b.outcome !== 'ongoing') break;
      let dmg = Math.max(0, (eff.damage ?? 0) + bonus + kefaBonus);
      if ((b.player.statuses.qizhi ?? 0) > 0) dmg = Math.floor(dmg * 0.7);
      if ((t.statuses.pozhan ?? 0) > 0) dmg = Math.floor(dmg * 1.4);
      if (huode > 0 && firstAttackTurn && i === 0) addEnemyStatus(run, b, t, 'zhuoshao', huode);
      enemyTakeAttack(run, b, t, dmg, { ignoreBlock: eff.ignoreBlock, pierceHalf });
      if (dmg > (run.flags['maxHit'] ?? 0)) run.flags['maxHit'] = dmg; // 成就"一剑破万法"
    }

    // 附带状态（基础段 + 得气段）
    if (t.hp > 0) {
      if (eff.applyEnemy) {
        for (const [k, v] of Object.entries(eff.applyEnemy)) {
          addEnemyStatus(run, b, t, k as StatusId, v as number);
        }
      }
      if (sheng?.applyEnemy) {
        for (const [k, v] of Object.entries(sheng.applyEnemy)) {
          addEnemyStatus(run, b, t, k as StatusId, v as number);
        }
      }
      if (eff.zhise || sheng?.zhise) applyZhise(b, t);
    }
  }
  void inst;
}

// ---------- 选择结算 ----------

export function resolveChoice(run: RunState, b: BattleState, picks: number[]) {
  const choice = b.pendingChoice;
  if (!choice) return;
  b.pendingChoice = null;

  switch (choice.kind) {
    case 'scry': { // 观澜：picks = 要弃置的 uid；然后抽 data.draw
      for (const uid of picks) {
        const i = b.drawPile.findIndex((c) => c.uid === uid);
        if (i >= 0) b.discardPile.push(...b.drawPile.splice(i, 1));
      }
      drawCards(run, b, choice.data?.['draw'] ?? 1);
      break;
    }
    case 'pickTop': { // 观想五行/残卷/开窍丹：顶 N 选 M 入手（残卷参悟：第二个 pick 置底）
      let taken = 0;
      for (const uid of picks) {
        const i = b.drawPile.findIndex((c) => c.uid === uid);
        if (i < 0) continue;
        if (taken < (choice.maxPick ?? 1)) {
          const [c] = b.drawPile.splice(i, 1);
          if (b.hand.length < HAND_CAP) b.hand.push(c);
          else b.discardPile.push(c);
          taken += 1;
        } else if (choice.data?.['bottom']) {
          const [c] = b.drawPile.splice(i, 1);
          b.drawPile.push(c); // 置于库底
          break;
        }
      }
      break;
    }
    case 'exhaustHand': { // 坐忘：每张吐纳 +1 并抽 1（参悟每张再回 2 血）
      let count = 0;
      for (const uid of picks) {
        const i = b.hand.findIndex((c) => c.uid === uid);
        if (i >= 0) {
          b.exhaustPile.push(...b.hand.splice(i, 1));
          count += 1;
        }
      }
      gainEnergy(run, b, count);
      drawCards(run, b, count);
      if (choice.upgraded) heal(run, count * 2);
      break;
    }
    case 'discardHand': { // 沧海纳川：每张 +per 水护体（得气每张回 healPer 血）
      let count = 0;
      for (const uid of picks) {
        const i = b.hand.findIndex((c) => c.uid === uid);
        if (i >= 0) {
          const [c] = b.hand.splice(i, 1);
          if (c.vanish) b.exhaustPile.push(c);
          else b.discardPile.push(c);
          count += 1;
        }
      }
      if (count > 0) {
        gainPlayerBlock(run, b, count * (choice.data?.['per'] ?? 7), 'water');
        const healPer = choice.data?.['healPer'] ?? 0;
        if (healPer > 0) heal(run, count * healPer);
      }
      break;
    }
    case 'returnHand': { // 五行轮转：洗回任意张，每张吐纳 +1
      let count = 0;
      for (const uid of picks) {
        const i = b.hand.findIndex((c) => c.uid === uid);
        if (i >= 0) {
          const [c] = b.hand.splice(i, 1);
          delete c.tempCost;
          b.drawPile.push(c);
          count += 1;
        }
      }
      if (count > 0) {
        const r = rngShuffle(run.rng, 'shuffle', b.drawPile);
        run.rng = r.state;
        b.drawPile = r.value;
        gainEnergy(run, b, count);
      }
      break;
    }
    case 'dilemma': {
      // 河图：选定开局行位
      if (choice.data?.['hetu']) {
        const i = Math.max(0, Math.min(ELEMENTS.length - 1, picks[0] ?? 0));
        b.stance = ELEMENTS[i];
        log(b, `河图定行位于【${ELEMENT_NAME[ELEMENTS[i]]}】`);
        break;
      }
      // 道心拷问 / 问道：0 = 弃牌，1 = 受伤
      const discardN = choice.data?.['discard'] ?? 2;
      const dmg = choice.data?.['damage'] ?? 16;
      if (picks[0] === 0 && b.hand.length > 0) {
        for (let i = 0; i < discardN && b.hand.length > 0; i++) {
          const r = rngInt(run.rng, 'enemyAI', 0, b.hand.length - 1);
          run.rng = r.state;
          b.discardPile.push(...b.hand.splice(r.value, 1));
        }
      } else {
        playerSelfDamage(run, b, dmg);
      }
      break;
    }
  }
}

// ---------- 战斗内服丹（§7.3；不耗灵气） ----------

export function useElixirInBattle(run: RunState, b: BattleState, elixirId: string, target?: number) {
  const idx = run.elixirs.indexOf(elixirId);
  if (idx < 0 || b.pendingChoice || b.outcome !== 'ongoing') return;
  const recipe = getRecipe(elixirId);
  run.elixirs.splice(idx, 1);
  run.stats.elixirsUsed += 1;
  // 丹毒累积（0–12 夹取；阈值的上限扣减由 run 层维护）
  run.toxin = Math.max(0, Math.min(12, run.toxin + recipe.toxin));

  switch (elixirId) {
    case 'huiyuandan': // 回 18 血
      heal(run, 18);
      break;
    case 'julingdan': // 吐纳 +3
      gainEnergy(run, b, 3);
      break;
    case 'xuanwudan': // +14 土护体
      gainPlayerBlock(run, b, 14, 'earth');
      break;
    case 'kaiqiaodan': { // 检视牌库顶 5 张，选 2 入手
      const top = revealTop(run, b, 5);
      if (top.length > 0) {
        b.pendingChoice = {
          kind: 'pickTop', cards: [...top], maxPick: 2,
          prompt: '开窍丹：选 2 张入手', sourceCard: 'kaiqiaodan',
        };
      }
      break;
    }
    case 'qingxindan': { // 心魔 −1，移除全部负面（丹毒净清已由 toxin 累积处理；心魔种：下限 3）
      run.demon = Math.max(run.relics.includes('xinmozhong') ? 3 : 0, run.demon - 1);
      const negatives: StatusId[] = ['zhuoshao', 'qizhi', 'pozhan', 'drawDown', 'tunaDown', 'sleeveBan', 'blockHalf'];
      for (const s of negatives) delete b.player.statuses[s];
      break;
    }
    case 'wuxingdan': // 下一张牌视为任意行（必得气）
      b.wuxingDanNext = true;
      break;
    case 'longhudan': // 本场攻击 +4
      b.longhuBonus += 4;
      break;
    case 'guixidan': // 本回合受伤减半 + 护体不衰减
      b.player.statuses.guixiDan = 1;
      addPlayerStatus(b, 'retainBlock', 1);
      break;
    case 'huashadan': // 全体敌人 +4 瘴毒 +2 灼烧
      for (const e of aliveEnemies(b)) {
        addEnemyStatus(run, b, e, 'zhangdu', 4);
        addEnemyStatus(run, b, e, 'zhuoshao', 2);
      }
      break;
    case 'dahuandan': // 回 50% 上限；燃寿 4 年
      heal(run, Math.floor(run.maxHp / 2));
      burnLife(run, b, 4);
      break;
    case 'wudaodan': { // 立即参悟 1 张牌（战斗内：随机手牌，并同步牌组）
      const cands = b.hand.filter((c) => !c.upgraded && getCard(c.cardId).type !== 'curse');
      if (cands.length > 0) {
        const r = rngPick(run.rng, 'misc', cands);
        run.rng = r.state;
        r.value.upgraded = true;
        const deckCard = run.deck.find((c) => c.uid === r.value.uid);
        if (deckCard) deckCard.upgraded = true;
        run.stats.cardsUpgraded += 1;
      }
      break;
    }
    case 'tianjidan': // 意图数值全显示 + 每回合抽牌 +1
      b.tianjiActive = true;
      break;
  }
  // 道果"药王鼎"：服丹后抽 1
  if (hasFruit(run, 'yaowangding')) drawCards(run, b, 1);
  void target;
}
