/**
 * 战斗引擎（策划案 §4 详规）
 * 回合时序 §4.2、伤害结算顺序 §4.3、五行 §4.4、状态 §4.5、意图 §4.6。
 * 实现方式：reduce 入口深拷贝后在草稿上变更，对调用方保持"纯函数 + 不可变"。
 */
import type {
  BattleState, CardEffects, CardInstance, EnemyMove, EnemyState,
  RunState, StatusId,
} from './types';
import { getCard } from '../data/cards';
import { getEnemy, JIUCHONG_WAVES, ACT_BOSS, normalPool, elitePool } from '../data/enemies';
import type { EnemyDef } from './types';
import { generates, overcomes, KE_EFFECT, type Element, type CardElement, SHENG } from './wuxing';
import { rngInt, rngPick, rngShuffle } from './rng';

// ---------- 工具 ----------

export function newUid(run: RunState): number {
  run.uidCounter += 1;
  return run.uidCounter;
}

export function makeCard(run: RunState, cardId: string, upgraded = false): CardInstance {
  return { uid: newUid(run), cardId, upgraded };
}

export function effectsOf(inst: CardInstance): CardEffects {
  const def = getCard(inst.cardId);
  return inst.upgraded ? def.up : def.base;
}

export function elementOf(inst: CardInstance): CardElement {
  return getCard(inst.cardId).element;
}

function log(b: BattleState, msg: string) {
  b.log.push(msg);
  if (b.log.length > 200) b.log.splice(0, b.log.length - 100);
}

function hasPower(b: BattleState, cardId: string) {
  return b.powers.find((p) => p.cardId === cardId);
}

function powerN(b: BattleState, cardId: string): number {
  const p = hasPower(b, cardId);
  if (!p) return 0;
  const def = getCard(cardId);
  return (p.upgraded ? def.up.n : def.base.n) ?? 0;
}

function hasRelic(run: RunState, id: string) {
  return run.relics.includes(id);
}

function curseInHand(b: BattleState, cardId: string): boolean {
  return b.hand.some((c) => c.cardId === cardId);
}

/** 灵气返还上限（基础 2 + 道法自然；罚雷场效果 −1） */
function refundCap(run: RunState, b: BattleState): number {
  let cap = run.liushuiRefundCap + powerN(b, 'daofaziran');
  if (b.waveIndex >= 0 && aliveEnemies(b).some((e) => e.enemyId === 'falei')) cap -= 1;
  return Math.max(0, cap);
}

export function aliveEnemies(b: BattleState): EnemyState[] {
  return b.enemies.filter((e) => e.hp > 0);
}

// ---------- 战斗构建 ----------

function makeEnemy(run: RunState, def: EnemyDef, hpOverride?: number): EnemyState {
  let hp = hpOverride ?? def.hp;
  // 难度：一重天敌人气血 +10%，九重天再 +10%（§11.2）
  if (run.ascension >= 1) hp = Math.floor(hp * 1.1);
  if (run.ascension >= 9) hp = Math.floor(hp * 1.1);
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
  if (def.id === 'heiwuchang') {
    return [getEnemy('heiwuchang'), getEnemy('baiwuchang')];
  }
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
  if (enemyIds) {
    defs = enemyIds.map((id) => getEnemy(id));
  } else if (battleType === 'boss') {
    defs = [getEnemy(ACT_BOSS[run.act])];
  } else {
    defs = enemyGroup(run, battleType);
  }

  const isJiuchong = defs[0]?.id === 'jiuchongtianjie';
  const b: BattleState = {
    battleType, outcome: 'ongoing',
    enemies: [], hand: [], drawPile: [], discardPile: [], exhaustPile: [],
    player: { block: 0, energy: 0, statuses: {}, attackBuffs: [] },
    turn: 0, xingwei: null, liushuiRefunded: 0, liushuiCount: 0,
    chainLinks: 0, zhoutianTriggered: false, zhoutianTotal: 0,
    cardsPlayed: 0, attacksPlayed: 0, playedByElement: {},
    powers: [], huichunshuUses: 0, freeNextCard: false, pendingChoice: null,
    wuxingDanNext: false, longhuBonus: 0, tianjiActive: false,
    waveIndex: isJiuchong ? 0 : -1, turnsTotal: 0, log: [],
  };

  if (isJiuchong) {
    b.enemies = [spawnWave(run, 0)];
  } else {
    b.enemies = defs.map((d) => makeEnemy(run, d));
    if (defs[0]?.id === 'xinmo' && run.ascension < 3) {
      // 三重天以下不额外强化（占位：三重天 Boss 强化 = 额外 +10% 血）
    }
  }
  // 三重天：Boss 强化模式=额外行为（§11.2），在各 Boss 行为处生效
  run.flags['burnThisBattle'] = 0; // 五雷轰顶成就计数

  // 洗入牌库
  const shuffled = rngShuffle(run.rng, 'shuffle', run.deck.map((c) => ({ ...c })));
  run.rng = shuffled.state;
  b.drawPile = shuffled.value;

  run.battle = b;

  // 战斗开始：法宝效果（§4.2）
  if (hasRelic(run, 'xuanguijia')) gainBlock(run, b, 8, true);
  if (run.battleStartBlock > 0) gainBlock(run, b, run.battleStartBlock, true);
  if (run.flags['xianghuo'] && battleType === 'boss') {
    gainBlock(run, b, run.flags['xianghuo'], true);
    delete run.flags['xianghuo'];
  }
  if (hasRelic(run, 'tianleicuiti')) {
    for (const e of aliveEnemies(b)) enemyLoseHp(run, b, e, 4);
  }
  if (hasRelic(run, 'xinmozhong')) {
    run.hp = Math.max(1, run.hp - 4);
  }
  if (run.flags['zhangqi']) {
    // 药园遗址：瘴气入体 → 以灼烧形式带入（对玩家的持续伤害规则一致）
    addPlayerStatus(b, 'zhuoshao', run.flags['zhangqi']);
    delete run.flags['zhangqi'];
  }

  // 妖怪图鉴收录（§11.4：局结算时并入 profile.seenEnemies）
  for (const e of b.enemies) run.flags[`seen_${e.enemyId}`] = 1;
  if (isJiuchong) run.flags['seen_jiuchongtianjie'] = 1;

  // 敌人亮出首回合意图
  for (const e of aliveEnemies(b)) setIntent(run, b, e);

  startPlayerTurn(run, b);
}

// ---------- 九重天劫波次 ----------

function spawnWave(run: RunState, index: number): EnemyState {
  const w = JIUCHONG_WAVES[index];
  let hp = w.hp;
  if (run.ascension >= 1) hp = Math.floor(hp * 1.1);
  if (run.ascension >= 9) hp = Math.floor(hp * 1.1);
  if (w.id === 'daolei' && run.flags['jujuexinmo']) hp = Math.max(1, hp - run.flags['jujuexinmo']);
  if (w.id === 'daolei' && run.ascension >= 9) hp += 80;
  // 三重天强化：每道雷灵携 1 层罡气登场
  const statuses: EnemyState['statuses'] = run.ascension >= 3 ? { gangqi: 1 } : {};
  return {
    uid: newUid(run), enemyId: w.id, name: `第${'一二三四五六七八九'[index]}道·${w.name}`,
    element: w.element, hp, maxHp: hp, block: 0, statuses, moveIndex: 0,
    intent: null, zhiseCd: 0, flags: { wave: index },
  };
}

function waveMove(run: RunState, index: number): EnemyMove {
  const w = JIUCHONG_WAVES[index];
  let dmg = w.baseDamage;
  if (w.id === 'daolei' && run.ascension >= 9) dmg += 4;
  return { id: 'leiji', name: '雷击', kind: 'attack', damage: dmg, times: w.times };
}

// ---------- 意图 ----------

function setIntent(run: RunState, b: BattleState, e: EnemyState) {
  // 九重天劫：波次驱动
  if (b.waveIndex >= 0 && e.flags['wave'] !== undefined) {
    const w = JIUCHONG_WAVES[e.flags['wave']];
    // 灭雷：每第 2 回合天罚 20；道雷：每第 3 回合问道
    if (w.special === 'tianfa' && e.flags['turns'] > 0 && e.flags['turns'] % 2 === 0) {
      e.intent = { id: 'tianfa', name: '天罚', kind: 'attack', damage: 20, special: 'tianfa' };
      return;
    }
    if (w.special === 'wendao' && e.flags['turns'] > 0 && e.flags['turns'] % 3 === 0) {
      e.intent = { id: 'wendao', name: '问道', kind: 'unknown', special: 'wendao' };
      return;
    }
    e.intent = waveMove(run, e.flags['wave']);
    return;
  }

  const ai = getEnemy(e.enemyId);

  // 雷灵傀儡：第 4/8/12 回合劫雷（提前 1 回合明示 → 意图即为下回合行动）
  if (e.enemyId === 'leiling_kuilei') {
    const nextTurn = b.turn + 1;
    if (nextTurn === 4 || nextTurn === 8 || nextTurn === 12) {
      const dmg = nextTurn === 4 ? 18 : nextTurn === 8 ? 24 : 30;
      e.intent = { id: 'jielei', name: `第${nextTurn === 4 ? '一' : nextTurn === 8 ? '二' : '三'}道劫雷`, kind: 'attack', damage: dmg, special: 'jielei' };
      return;
    }
    if (b.turn >= 12) e.flags['rage'] = 1;
  }

  // 心魔：行为池轮转（相变阶段蓄力）
  if (e.enemyId === 'xinmo') {
    if (e.flags['charging'] === 2) { e.intent = { id: 'xinmojielei_charge', name: '蓄力·心魔劫雷', kind: 'charge' }; return; }
    if (e.flags['charging'] === 1) {
      const minions = aliveEnemies(b).filter((x) => x.enemyId === 'zhinian').length;
      e.intent = { id: 'xinmojielei', name: '心魔劫雷', kind: 'attack', damage: 24 + 6 * minions, special: 'xinmojielei' };
      return;
    }
  }

  const moves = ai.moves;
  e.intent = moves[e.moveIndex % moves.length];
  // 山魈：第二轮起石斧递增
  if (e.enemyId === 'shanxiao' && e.intent.id === 'shifu2') {
    const loop = Math.floor(e.moveIndex / moves.length);
    e.intent = { ...e.intent, damage: 10 + loop * 2 };
  }
}

/** 意图显示数值（含罡气/虚弱修正，§4.6） */
export function intentDamage(_b: BattleState, e: EnemyState): number | null {
  if (!e.intent || e.intent.kind !== 'attack' || e.intent.damage === undefined) return null;
  let dmg = e.intent.damage + (e.statuses.gangqi ?? 0);
  const chanfu = e.statuses.chanfu ?? 0;
  for (let i = 0; i < chanfu; i++) dmg = Math.floor(dmg * 0.6);
  if ((e.statuses.xuruo ?? 0) > 0) dmg = Math.floor(dmg * 0.75);
  return dmg;
}

// ---------- 状态施加 ----------

function addPlayerStatus(b: BattleState, id: StatusId, n: number) {
  if (n === 0) return;
  b.player.statuses[id] = (b.player.statuses[id] ?? 0) + n;
  if (b.player.statuses[id]! <= 0) delete b.player.statuses[id];
}

function addEnemyStatus(run: RunState, b: BattleState, e: EnemyState, id: StatusId, n: number) {
  if (id === 'zhuoshao') {
    n += powerN(b, 'lihuoxinjing'); // 离火心经：施加灼烧 +N
    if (n > 0) run.flags['burnThisBattle'] = (run.flags['burnThisBattle'] ?? 0) + n; // 五雷轰顶
    if ((run.flags['burnThisBattle'] ?? 0) >= 25) run.flags['ach_wulei'] = 1;
  }
  if (id === 'chanfu') {
    const cur = e.statuses.chanfu ?? 0;
    e.statuses.chanfu = Math.min(3, cur + n); // 最多 3 层
    return;
  }
  if (id === 'pojia') {
    e.statuses.pojia = 1; // 不叠加，可刷新
    return;
  }
  e.statuses[id] = (e.statuses[id] ?? 0) + n;
  if (e.statuses[id]! <= 0) delete e.statuses[id];
}

/** 滞涩：意图延迟 1 回合（同目标 2 回合内限 1 次） */
function applyZhise(b: BattleState, e: EnemyState) {
  if (e.zhiseCd > 0) return;
  e.flags['zhise'] = 1;
  e.zhiseCd = 2;
  log(b, `${e.name} 意图凝滞`);
}

/** 熄灭：移除 1 层增益（罡气/固本优先） */
function applyXimie(e: EnemyState) {
  if ((e.statuses.gangqi ?? 0) > 0) { e.statuses.gangqi! -= 1; if (!e.statuses.gangqi) delete e.statuses.gangqi; return; }
  if ((e.statuses.guben ?? 0) > 0) { e.statuses.guben! -= 1; if (!e.statuses.guben) delete e.statuses.guben; return; }
}

// ---------- 护体 ----------

function gainBlock(_run: RunState, b: BattleState, amount: number, raw = false) {
  let n = amount;
  if (!raw) {
    const budong = powerN(b, 'budongrushan');
    if (budong) n = Math.floor(n * (1 + budong / 100));
    if ((b.player.statuses.blockHalf ?? 0) > 0) n = Math.floor(n * 0.5); // 剑域
  }
  b.player.block += n;
}

function enemyGainBlock(e: EnemyState, amount: number) {
  if ((e.statuses.pojia ?? 0) > 0) return; // 破甲：护体获取无效
  e.block += amount;
}

// ---------- 玩家受伤 ----------

/** 玩家受到攻击/伤害。isAttack 时走护体与反制钩子。返回实际掉血。 */
export function playerDamage(
  run: RunState, b: BattleState, amount: number,
  opts: { isAttack?: boolean; source?: EnemyState; pierce?: boolean } = {},
): number {
  let dmg = amount;
  if (opts.isAttack) {
    if ((b.player.statuses.yishang ?? 0) > 0) dmg = Math.floor(dmg * 1.5);
    if ((b.player.statuses.guishaDan ?? 0) > 0) dmg = Math.floor(dmg * 0.5);
    if (hasRelic(run, 'baguajing') && !b.player.statuses['_baguaUsed']) {
      dmg = Math.floor(dmg / 2);
      b.player.statuses['_baguaUsed' as StatusId] = 1;
    }
  }
  // 青藤傀儡吸收
  const tengou = b.player.statuses.tengou ?? 0;
  if (tengou > 0 && opts.isAttack) {
    const cap = b.player.statuses['_tengouCap' as StatusId] ?? 6;
    const absorbed = Math.min(dmg, cap);
    dmg -= absorbed;
    if (absorbed > 0) log(b, `藤偶承受 ${absorbed} 伤`);
  }
  let hpLoss = dmg;
  if (!opts.pierce) {
    const blocked = Math.min(b.player.block, dmg);
    b.player.block -= blocked;
    hpLoss = dmg - blocked;
  }
  if (hpLoss > 0) {
    run.hp -= hpLoss;
    run.stats.damageTaken += hpLoss;
  }
  // 反制钩子（每次被攻击）
  if (opts.isAttack && opts.source) {
    const fanci = b.player.statuses.fanci ?? 0;
    if (fanci > 0) enemyLoseHp(run, b, opts.source, fanci);
    const fanshao = b.player.statuses.fanshao ?? 0;
    if (fanshao > 0) addEnemyStatus(run, b, opts.source, 'zhuoshao', fanshao);
    const yinguo = b.player.statuses.yinguo ?? 0;
    if (yinguo > 0) {
      enemyLoseHp(run, b, opts.source, Math.floor((amount * yinguo) / 100));
      delete b.player.statuses.yinguo;
    }
  }
  checkPlayerDeath(run, b);
  return hpLoss;
}

function checkPlayerDeath(run: RunState, b: BattleState) {
  if (run.hp > 0) return;
  // 浴火涅槃
  const niepan = b.player.statuses.niepan ?? 0;
  if (niepan > 0) {
    run.hp = Math.max(1, Math.floor((run.maxHp * niepan) / 100));
    delete b.player.statuses.niepan;
    log(b, `浴火涅槃！以 ${run.hp} 气血复活`);
    return;
  }
  // 不灭灯（每局一次）
  if (hasRelic(run, 'bumiedeng') && !run.flags['bumiedengUsed']) {
    run.hp = 1;
    run.flags['bumiedengUsed'] = 1;
    log(b, '不灭灯亮起，你保住一口气！');
    return;
  }
  run.hp = 0;
  b.outcome = 'defeat';
}

// ---------- 敌人受伤 ----------

/** 直接掉血（无视护体、不触发攻击钩子） */
function enemyLoseHp(run: RunState, b: BattleState, e: EnemyState, n: number) {
  if (e.hp <= 0) return;
  e.hp -= n;
  if (e.hp <= 0) onEnemyDeath(run, b, e);
}

/** 敌人受到攻击伤害（走护体） */
function enemyTakeAttack(
  run: RunState, b: BattleState, e: EnemyState, dmg: number,
  opts: { ignoreBlock?: boolean } = {},
): number {
  if (e.hp <= 0) return 0;
  e.flags['hitThisTurn'] = (e.flags['hitThisTurn'] ?? 0) + 1;
  // 蛟：单回合被攻击 ≥3 次 → 逆鳞
  if (e.enemyId === 'jiao' && e.flags['hitThisTurn'] === 3) {
    e.statuses.gangqi = (e.statuses.gangqi ?? 0) + 3;
    log(b, '蛟逆鳞怒张，罡气 +3！');
  }
  // 千年藤妖荆棘姿态：攻击它受 4 伤
  if ((e.flags['jingji'] ?? 0) > 0) {
    playerDamage(run, b, e.flags['jingjiN'] ?? 4, { pierce: true });
  }
  let hpLoss = dmg;
  if (!opts.ignoreBlock) {
    const blocked = Math.min(e.block, dmg);
    e.block -= blocked;
    hpLoss = dmg - blocked;
  }
  e.hp -= hpLoss;
  if (e.hp <= 0) onEnemyDeath(run, b, e);
  return hpLoss;
}

function onEnemyDeath(run: RunState, b: BattleState, e: EnemyState) {
  e.hp = 0;
  run.flags['kills'] = (run.flags['kills'] ?? 0) + 1; // 击杀计数（心魔对白/统计用）
  log(b, `${e.name} 化墨消散`);
  // 火鸦/尸群：同伴死亡强化
  if (e.enemyId === 'huoya') {
    for (const o of aliveEnemies(b)) if (o.enemyId === 'huoya') o.statuses.gangqi = (o.statuses.gangqi ?? 0) + 2;
  }
  if (e.enemyId === 'shiqun') {
    for (const o of aliveEnemies(b)) if (o.enemyId === 'shiqun') o.statuses.gangqi = (o.statuses.gangqi ?? 0) + 1;
  }
  // 黑白无常：任一死亡另一狂暴
  if (e.enemyId === 'heiwuchang' || e.enemyId === 'baiwuchang') {
    for (const o of aliveEnemies(b)) if (o.enemyId === 'heiwuchang' || o.enemyId === 'baiwuchang') o.flags['rage'] = 1;
  }
  // 阴煞雷：死亡时施你 1 层虚弱
  if (e.enemyId === 'yinshalei') addPlayerStatus(b, 'xuruo', 1);
  // 成就"身外化身"：相变后未掉血击杀心魔
  if (e.enemyId === 'xinmo' && run.flags['xinmoPhaseHp'] !== undefined && run.hp >= run.flags['xinmoPhaseHp']) {
    run.flags['ach_shenwai'] = 1;
  }

  // 九重天劫：击杀当前雷灵立即进入下一道
  if (b.waveIndex >= 0 && e.flags['wave'] !== undefined) {
    const wave = e.flags['wave'];
    const w = JIUCHONG_WAVES[wave];
    if (w.breatherAfter && run.ascension < 8) {
      // 喘息：回 8 血、抽 2、+1 灵气（§8.10）
      run.hp = Math.min(run.maxHp, run.hp + 8);
      drawCards(run, b, 2);
      b.player.energy += 1;
      log(b, '【喘息】雷云暂歇：回 8 血、抽 2、+1 灵气');
    }
    if (wave + 1 < JIUCHONG_WAVES.length) {
      b.waveIndex = wave + 1;
      const next = spawnWave(run, b.waveIndex);
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
  let handCap = 10;
  if ((b.player.statuses.handCapDown ?? 0) > 0) handCap -= 1; // 忘川渡鬼摆渡
  if (run.flags['dailyQingshen']) handCap = Math.min(handCap, 6); // 每日天机·轻身如燕
  for (let i = 0; i < n; i++) {
    if (b.drawPile.length === 0) {
      if (b.discardPile.length === 0) return;
      const r = rngShuffle(run.rng, 'shuffle', b.discardPile);
      run.rng = r.state;
      b.drawPile = r.value;
      b.discardPile = [];
    }
    const card = b.drawPile.shift()!;
    if (b.hand.length >= handCap) {
      b.discardPile.push(card); // 超出手牌上限直接进弃牌堆（§4.1）
    } else {
      b.hand.push(card);
    }
  }
}

// ---------- 回合流程 ----------

function startPlayerTurn(run: RunState, b: BattleState) {
  b.turn += 1;
  b.turnsTotal += 1;
  b.xingwei = null; // 行位回合开始清空
  b.liushuiRefunded = 0;
  b.liushuiCount = 0;
  b.chainLinks = 0;
  b.zhoutianTriggered = false;
  b.cardsPlayed = 0;
  b.attacksPlayed = 0;
  b.player.attackBuffs = [];
  b.freeNextCard = false;
  for (const e of b.enemies) e.flags['hitThisTurn'] = 0;

  // 1. 回合开始效果结算（固本、心法、法宝）
  const guben = b.player.statuses.guben ?? 0;
  if (guben > 0) gainBlock(run, b, guben * 2);

  // 2. 灵气重置为上限；抽 5
  let energy = run.energyMax;
  if ((b.player.statuses.energyDown ?? 0) > 0) {
    energy -= b.player.statuses.energyDown!;
    delete b.player.statuses.energyDown;
  }
  if (b.turn === 1 && run.gongdeBattles > 0) energy += 1; // 功德
  if (b.turn === 1 && run.flags['xiaqian']) { energy -= 1; delete run.flags['xiaqian']; }
  if (b.turn === 3 && hasRelic(run, 'leijimu')) energy += 1;
  if ((b.player.statuses.nextTurnEnergy ?? 0) > 0) {
    energy += b.player.statuses.nextTurnEnergy!;
    delete b.player.statuses.nextTurnEnergy;
  }
  if (run.flags['yingbianReady']) { energy += 2; delete run.flags['yingbianReady']; } // 婴变胎光
  b.player.energy = Math.max(0, energy);

  if ((b.player.statuses.nextTurnBlock ?? 0) > 0) {
    gainBlock(run, b, b.player.statuses.nextTurnBlock!);
    delete b.player.statuses.nextTurnBlock;
  }

  let draw = run.drawPerTurn;
  if (run.flags['dailyQingshen']) draw += 1;
  if (b.tianjiActive) draw += 1;
  if ((b.player.statuses.drawDown ?? 0) > 0) {
    draw -= b.player.statuses.drawDown!;
    delete b.player.statuses.drawDown;
  }
  draw += powerN(b, 'beimingtuntian'); // 北冥吞天
  if ((b.player.statuses.nextTurnDraw ?? 0) > 0) {
    draw += b.player.statuses.nextTurnDraw!;
    delete b.player.statuses.nextTurnDraw;
  }
  if (b.turn === 1 && run.flags['huangliang']) { draw += 2; delete run.flags['huangliang']; }
  drawCards(run, b, Math.max(0, draw));
}

export function endTurn(run: RunState, b: BattleState) {
  if (b.pendingChoice) return; // 有待决选择时不可结束回合
  // 5. 回合结束效果结算
  // 回春
  const huichun = b.player.statuses.huichun ?? 0;
  if (huichun > 0) {
    run.hp = Math.min(run.maxHp, run.hp + huichun);
    addPlayerStatus(b, 'huichun', -1);
  }
  // 古木长青
  const gumu = powerN(b, 'gumuchangqing');
  if (gumu > 0) run.hp = Math.min(run.maxHp, run.hp + gumu);
  // 玩家灼烧（燹雷等对玩家的灼烧同规则；天火燎原结算 ×2）
  const pZhuoshao = b.player.statuses.zhuoshao ?? 0;
  if (pZhuoshao > 0) {
    playerDamage(run, b, run.flags['dailyTianhuo'] ? pZhuoshao * 2 : pZhuoshao, { pierce: true });
    addPlayerStatus(b, 'zhuoshao', -1);
    if (b.outcome !== 'ongoing') return;
  }
  // 心魔诅咒：回合结束仍在手牌受 2 伤
  for (const c of b.hand) {
    if (c.cardId === 'xinmo_curse') {
      playerDamage(run, b, 2, { pierce: true });
      if (b.outcome !== 'ongoing') return;
    }
  }
  // 婴变胎光：未打出攻击牌 → 下回合 +2 灵气
  if (hasRelic(run, 'yingbiantaiguang') && b.attacksPlayed === 0) run.flags['yingbianReady'] = 1;

  // 玩家负面按回合衰减
  addPlayerStatus(b, 'xuruo', -Math.min(1, b.player.statuses.xuruo ?? 0));
  addPlayerStatus(b, 'yishang', -Math.min(1, b.player.statuses.yishang ?? 0));
  addPlayerStatus(b, 'handCapDown', -Math.min(1, b.player.statuses.handCapDown ?? 0));
  addPlayerStatus(b, 'blockHalf', -Math.min(1, b.player.statuses.blockHalf ?? 0));
  delete b.player.statuses.guishaDan;
  // 藤偶剩余回合
  if ((b.player.statuses.tengou ?? 0) > 0) addPlayerStatus(b, 'tengou', -1);

  // 6. 弃置全部手牌（洛书可保留 1 张；保留牌回合末放逐的复制品仍放逐）
  const keep: CardInstance[] = [];
  if (hasRelic(run, 'luoshu') && b.hand.length > 0) {
    const kept = b.hand.find((c) => !c.vanish && getCard(c.cardId).type !== 'curse');
    if (kept) keep.push(kept);
  }
  for (const c of b.hand) {
    if (keep.includes(c)) continue;
    if (c.vanish) b.exhaustPile.push(c);
    else b.discardPile.push(c);
  }
  b.hand = keep;
  for (const c of b.hand) delete c.tempCost;

  // 单次性回合状态清理
  delete b.player.statuses.fanci;
  delete b.player.statuses.fanshao;

  enemyTurn(run, b);
}

function enemyTurn(run: RunState, b: BattleState) {
  // 按站位从左到右依次执行已亮出的意图
  for (const e of [...b.enemies]) {
    if (e.hp <= 0 || b.outcome !== 'ongoing') continue;
    // 滞涩：本回合不行动，意图保留
    if (e.flags['zhise']) {
      delete e.flags['zhise'];
      log(b, `${e.name} 意图延迟`);
      continue;
    }
    enemyAct(run, b, e);
    if (b.outcome !== 'ongoing') return;
  }
  // 敌方状态结算（灼烧/瘴毒 → 敌方回合结束）
  for (const e of aliveEnemies(b)) {
    const zhuo = e.statuses.zhuoshao ?? 0;
    if (zhuo > 0) {
      // 每日天机·天火燎原：灼烧结算 ×2
      enemyLoseHp(run, b, e, run.flags['dailyTianhuo'] ? zhuo * 2 : zhuo); // 真实伤害，无视护体
      if (e.hp > 0) addEnemyStatus(run, b, e, 'zhuoshao', -1);
    }
    if (e.hp <= 0) continue;
    const du = e.statuses.zhangdu ?? 0;
    if (du > 0) {
      enemyLoseHp(run, b, e, du);
      if (e.hp > 0) {
        const wandu = hasPower(b, 'wandushixin');
        if (wandu) addEnemyStatus(run, b, e, 'zhangdu', powerN(b, 'wandushixin')); // 不衰减且每回合 +N
        else addEnemyStatus(run, b, e, 'zhangdu', -1);
      }
    }
    if (e.hp <= 0) continue;
    // 衰减
    if ((e.statuses.xuruo ?? 0) > 0) addEnemyStatus(run, b, e, 'xuruo', -1);
    if ((e.statuses.yishang ?? 0) > 0) addEnemyStatus(run, b, e, 'yishang', -1);
    delete e.statuses.pojia; // 破甲持续 1 回合
    if (e.zhiseCd > 0) e.zhiseCd -= 1;
    if ((e.flags['jingji'] ?? 0) > 0) e.flags['jingji'] -= 1;
    // 狂暴（无常/雷灵傀儡第三道劫雷后）
    if (e.flags['rage']) e.statuses.gangqi = (e.statuses.gangqi ?? 0) + 2;
    // 奔雷：每回合 +1 罡气
    if (e.enemyId === 'benlei') e.statuses.gangqi = (e.statuses.gangqi ?? 0) + 1;
    // 道雷回光：低于 30% 血 +3 罡气（一次）
    if (e.enemyId === 'daolei' && e.hp < e.maxHp * 0.3 && !e.flags['huiguang']) {
      e.flags['huiguang'] = 1;
      e.statuses.gangqi = (e.statuses.gangqi ?? 0) + 3;
      log(b, '道雷回光返照，罡气 +3！');
    }
    e.flags['turns'] = (e.flags['turns'] ?? 0) + 1;
  }
  if (b.outcome !== 'ongoing') return;

  // 亮出下回合意图
  for (const e of aliveEnemies(b)) {
    e.moveIndex += 1;
    setIntent(run, b, e);
  }

  // 玩家护体清零（除保留类效果）
  if ((b.player.statuses.retainBlock ?? 0) > 0) {
    delete b.player.statuses.retainBlock; // 玄武镇海：保留一次
  } else {
    const retain = Math.max(
      powerN(b, 'houdezaiwu'),
      run.breakthroughs.includes('houde_genji') ? 10 : 0,
    );
    b.player.block = Math.min(b.player.block, retain);
  }
  delete b.player.statuses['_baguaUsed' as StatusId];

  if (run.gongdeBattles > 0 && b.turn === 1) {
    // 功德计数在战斗结束时递减（见 run.ts）
  }

  startPlayerTurn(run, b);
}

function enemyAct(run: RunState, b: BattleState, e: EnemyState) {
  const move = e.intent;
  if (!move) return;

  // 固本（§4.5 双方通用）：敌方回合开始每层 +2 护体
  const guben = e.statuses.guben ?? 0;
  if (guben > 0) enemyGainBlock(e, guben * 2);

  // 三重天强化：雷灵傀儡雷引附带 1 层固本（§11.2 Boss 额外行为）
  if (run.ascension >= 3 && e.enemyId === 'leiling_kuilei' && move.id === 'leiyin') {
    e.statuses.guben = (e.statuses.guben ?? 0) + 1;
  }
  // 铜甲尸被动：每回合 +6 护体；每第 4 回合尸毒
  if (e.enemyId === 'tongjiashi') {
    enemyGainBlock(e, 6);
    if (b.turn % 4 === 0) {
      b.discardPile.push(makeCard(run, 'chenyuan'));
      log(b, '铜甲尸尸毒侵体，一张【尘缘】混入弃牌堆');
    }
  }
  // 阴兵列阵：存活 ≥2 各 +4 护体/回合
  if (e.enemyId === 'yinbing' && aliveEnemies(b).filter((x) => x.enemyId === 'yinbing').length >= 2) {
    enemyGainBlock(e, 4);
  }
  // 鼎炉傀儡炉温：永久罡气在 move 本身处理

  // 特殊行为
  switch (move.special) {
    case 'zhaohun': { // 白无常招魂幡：为黑 +3 罡气或 +8 护体
      const hei = aliveEnemies(b).find((x) => x.enemyId === 'heiwuchang');
      if (hei) {
        const r = rngInt(run.rng, 'enemyAI', 0, 1);
        run.rng = r.state;
        if (r.value === 0) hei.statuses.gangqi = (hei.statuses.gangqi ?? 0) + 3;
        else enemyGainBlock(hei, 8);
        log(b, '白无常摇动招魂幡');
      }
      e.moveIndex += 0;
      return finishMove(run, b, e, move);
    }
    case 'huanmian': { // 傩面鬼换面
      const r = rngInt(run.rng, 'enemyAI', 0, 2);
      run.rng = r.state;
      if (r.value === 0) enemyGainBlock(e, 8);
      else if (r.value === 1) e.statuses.gangqi = (e.statuses.gangqi ?? 0) + 2;
      else addPlayerStatus(b, 'xuruo', 1);
      return finishMove(run, b, e, move);
    }
    case 'beiqi': { // 骨女悲泣：牌库顶 2 张进弃牌堆
      for (let i = 0; i < 2 && b.drawPile.length > 0; i++) b.discardPile.push(b.drawPile.shift()!);
      return finishMove(run, b, e, move);
    }
    case 'diyu': { // 心魔低语：复制你基础伤害最高的攻击牌打向你
      let best = 0;
      for (const c of run.deck) {
        const def = getCard(c.cardId);
        if (def.type !== 'attack') continue;
        const eff = c.upgraded ? def.up : def.base;
        const total = (eff.damage ?? 0) * (eff.times ?? 1);
        if (total > best) best = total;
      }
      const dmg = Math.max(6, best);
      log(b, `心魔低语："这是你自己的刀。"（${dmg} 伤）`);
      dealEnemyAttack(run, b, e, dmg, 1);
      return finishMove(run, b, e, move);
    }
    case 'kaowen': { // 道心拷问：弃 2 张手牌 或 受 14 伤（三重天强化：弃 3 / 受 18）
      const hard = run.ascension >= 3;
      b.pendingChoice = {
        kind: 'dilemma', prompt: '心魔逼问："你的道，经得起舍弃吗？"',
        options: [`弃 ${hard ? 3 : 2} 张手牌`, `受 ${hard ? 18 : 14} 伤`],
        data: { discard: hard ? 3 : 2, damage: hard ? 18 : 14 },
      };
      return finishMove(run, b, e, move);
    }
    case 'tunshi': { // 吞噬：12 伤并自回 12
      const loss = dealEnemyAttack(run, b, e, move.damage ?? 12, 1);
      e.hp = Math.min(e.maxHp, e.hp + 12);
      void loss;
      return finishMove(run, b, e, move);
    }
    case 'xinmojielei': { // 心魔劫雷
      const minions = aliveEnemies(b).filter((x) => x.enemyId === 'zhinian').length;
      dealEnemyAttack(run, b, e, 24 + 6 * minions, 1);
      e.flags['charging'] = 0;
      return finishMove(run, b, e, move);
    }
    case 'xisui': { // 吸髓：对你 8 伤并自回等量
      const loss = dealEnemyAttack(run, b, e, move.damage ?? 8, 1);
      e.hp = Math.min(e.maxHp, e.hp + loss);
      return finishMove(run, b, e, move);
    }
    case 'jingji': { // 荆棘姿态
      e.flags['jingji'] = 2;
      e.flags['jingjiN'] = move.n ?? 4;
      return finishMove(run, b, e, move);
    }
    case 'suijia': { // 横扫：击碎你 4 点护体后 12 伤
      b.player.block = Math.max(0, b.player.block - (move.n ?? 4));
      dealEnemyAttack(run, b, e, move.damage ?? 12, 1);
      return finishMove(run, b, e, move);
    }
    case 'jielei': { // 雷灵傀儡劫雷（三重天强化：+4 伤；成就"三劫齐渡"记录承伤）
      const dmg = (move.damage ?? 18) + (run.ascension >= 3 ? 4 : 0);
      const loss = dealEnemyAttack(run, b, e, dmg, 1);
      if (loss > 0) run.flags['jieleiDirty'] = 1;
      else run.flags['jieleiClean'] = (run.flags['jieleiClean'] ?? 0) + 1;
      return finishMove(run, b, e, move);
    }
    case 'tianfa': { // 灭雷天罚：护体承接 ≥10 则减半
      let dmg = move.damage ?? 20;
      if (b.player.block >= 10) dmg = Math.floor(dmg / 2);
      dealEnemyAttack(run, b, e, dmg, 1);
      return finishMove(run, b, e, move);
    }
    case 'wendao': { // 道雷问道：弃 3 张或受 18 伤
      b.pendingChoice = {
        kind: 'dilemma', prompt: '雷声如问："何为道？"',
        options: ['弃 3 张手牌', '受 18 伤'], data: { discard: 3, damage: 18 },
      };
      return finishMove(run, b, e, move);
    }
  }

  // 常规行为
  if (move.kind === 'attack' && move.damage !== undefined) {
    dealEnemyAttack(run, b, e, move.damage, move.times ?? 1);
    // 玄雷：攻击附带熄灭你 1 层增益
    if (e.enemyId === 'xuanlei') {
      if ((b.player.statuses.gangqi ?? 0) > 0) addPlayerStatus(b, 'gangqi', -1);
      else if ((b.player.statuses.guben ?? 0) > 0) addPlayerStatus(b, 'guben', -1);
    }
    // 燹雷：攻击附带你 2 灼烧
    if (e.enemyId === 'xianlei') addPlayerStatus(b, 'zhuoshao', 2);
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
  if (move.addCurse) {
    b.discardPile.push(makeCard(run, move.addCurse));
    log(b, `${e.name} 将一张诅咒塞入你的弃牌堆`);
  }
  finishMove(run, b, e, move);
}

function finishMove(run: RunState, b: BattleState, e: EnemyState, _move: EnemyMove) {
  // 心魔：属性轮转与相变
  if (e.enemyId === 'xinmo') {
    // 每 2 回合按相生顺序切换五行（初始无属性 → 木起）
    if (b.turn % 2 === 0) {
      const order: Element[] = ['wood', 'fire', 'earth', 'metal', 'water'];
      const cur = e.element === 'none' ? -1 : order.indexOf(e.element as Element);
      e.element = order[(cur + 1) % 5];
      log(b, `心魔道则流转，化为${{ wood: '木', fire: '火', earth: '土', metal: '金', water: '水' }[e.element as Element]}行`);
    }
    // 相变（50% 血）：执念具现
    if (!e.flags['phase2'] && e.hp <= e.maxHp / 2) {
      e.flags['phase2'] = 1;
      e.flags['charging'] = 2;
      run.flags['xinmoPhaseHp'] = run.hp; // 成就"身外化身"：相变起点气血
      const z1 = makeEnemy(run, getEnemy('zhinian'));
      const z2 = makeEnemy(run, getEnemy('zhinian'));
      b.enemies.push(z1, z2);
      setIntent(run, b, z1);
      setIntent(run, b, z2);
      log(b, '心魔相变："看看你心里都住着什么。"两道执念具现！');
    } else if (e.flags['charging'] === 2) {
      e.flags['charging'] = 1;
    }
  }
}

/** 敌人对玩家的攻击（含加值与乘区），返回总掉血 */
function dealEnemyAttack(run: RunState, b: BattleState, e: EnemyState, base: number, times: number): number {
  let total = 0;
  for (let i = 0; i < times; i++) {
    if (b.outcome !== 'ongoing') break;
    let dmg = base + (e.statuses.gangqi ?? 0);
    if (run.ascension >= 6) dmg = Math.floor(dmg * 1.15); // 六重天：敌人伤害 +15%
    // 缠缚：下次攻击 −40%/层（消耗）
    const chanfu = e.statuses.chanfu ?? 0;
    if (chanfu > 0) {
      for (let j = 0; j < chanfu; j++) dmg = Math.floor(dmg * 0.6);
      delete e.statuses.chanfu;
    }
    if ((e.statuses.xuruo ?? 0) > 0) dmg = Math.floor(dmg * 0.75);
    total += playerDamage(run, b, dmg, { isAttack: true, source: e });
  }
  return total;
}

// ---------- 出牌 ----------

export function cardCost(run: RunState, b: BattleState, inst: CardInstance): number {
  const def = getCard(inst.cardId);
  if (inst.tempCost !== undefined) return inst.tempCost;
  if (b.freeNextCard) return 0;
  let cost: number;
  if (def.cost === 'X') cost = b.player.energy;
  else cost = def.cost;
  if (def.id === 'beimingtuntian' && inst.upgraded) cost = 3;
  // 昆仑镜：每回合第一张牌 −1
  if (hasRelic(run, 'kunlunjing') && b.cardsPlayed === 0) cost -= 1;
  // 上善若水：每回合前 N 张水牌 −1
  const ruoshui = powerN(b, 'shangshanruoshui');
  if (ruoshui > 0 && def.element === 'water' && (b.playedByElement['water_turn'] ?? 0) < ruoshui) cost -= 1;
  // 每日天机·木行昌盛：木牌 −1 费
  if (run.flags['dailyMuxing'] && def.element === 'wood') cost -= 1;
  return Math.max(0, cost);
}

export function canPlay(run: RunState, b: BattleState, inst: CardInstance): boolean {
  if (b.pendingChoice) return false;
  const def = getCard(inst.cardId);
  if (def.type === 'curse' && !def.playableCurse) return false;
  return cardCost(run, b, inst) <= b.player.energy;
}

export function playCard(run: RunState, b: BattleState, uid: number, target?: number) {
  const idx = b.hand.findIndex((c) => c.uid === uid);
  if (idx < 0) return;
  const inst = b.hand[idx];
  if (!canPlay(run, b, inst)) return;
  const def = getCard(inst.cardId);
  const eff = effectsOf(inst);
  const cost = cardCost(run, b, inst);
  const xCost = def.cost === 'X' ? cost : 0;

  b.hand.splice(idx, 1);
  b.player.energy -= cost;
  if (b.freeNextCard) b.freeNextCard = false;

  // ---- 行云流水判定（§4.4 ①）----
  let element: CardElement = def.element;
  let liushui = false;
  if (b.wuxingDanNext) {
    // 五行丹：视为任意五行，必触发行云流水
    liushui = !curseInHand(b, 'yinguozhai');
    if (b.xingwei) element = SHENG[b.xingwei];
    b.wuxingDanNext = false;
  } else if (element !== 'none' && b.xingwei && generates(b.xingwei, element)) {
    liushui = !curseInHand(b, 'yinguozhai'); // 因果债：行云流水不触发
  }

  let mult = 1;
  if (liushui) {
    mult = 1 + run.liushuiBonus;
    b.liushuiCount += 1;
    // 返还灵气
    let refund = 0;
    if (b.liushuiRefunded < refundCap(run, b)) refund = 1;
    if (b.liushuiCount === 1) {
      if (hasRelic(run, 'wuxingzhu')) refund += 1; // 五行珠
      if (run.breakthroughs.includes('tianshengdaoti')) refund += 1;
    }
    b.player.energy += refund;
    b.liushuiRefunded += Math.min(1, refund);
    b.chainLinks += 1;
    log(b, `行云流水！（${b.chainLinks} 连）`);
  } else if (element !== 'none') {
    b.chainLinks = 0; // 有属性但未接上 → 断链，从头计数触发次数
  }

  // ---- 五行周天（连续触发 4 次行云流水）----
  if (liushui && !b.zhoutianTriggered && b.chainLinks >= 4) {
    b.zhoutianTriggered = true;
    b.zhoutianTotal += 1;
    drawCards(run, b, 2);
    b.freeNextCard = true;
    if (hasRelic(run, 'hetu')) b.player.energy += 1;
    log(b, '【五行周天】圆满！抽 2 张，下一张牌费用为 0');
  }

  // ---- 效果执行 ----
  executeEffects(run, b, inst, def.id, eff, mult, target, xCost, liushui);

  // ---- 行位更新 ----
  if (element !== 'none') b.xingwei = element as Element;

  // ---- 计数与心法触发 ----
  b.cardsPlayed += 1;
  if (def.type === 'attack') b.attacksPlayed += 1;
  if (def.element !== 'none') {
    b.playedByElement[def.element] = (b.playedByElement[def.element] ?? 0) + 1;
    if (def.element === 'water') b.playedByElement['water_turn'] = (b.playedByElement['water_turn'] ?? 0) + 1;
    if (def.element === 'metal') {
      const total = b.playedByElement['metal'] ?? 0;
      const jianxinN = powerN(b, 'jianxintongming');
      if (jianxinN > 0 && total % jianxinN === 0) {
        drawCards(run, b, 1);
        b.player.energy += 1;
      }
      if (hasRelic(run, 'jiansui') && total % 3 === 0) drawCards(run, b, 1);
    }
  }

  // ---- 牌去向 ----
  if (def.type === 'power') {
    b.powers.push({ cardId: def.id, upgraded: inst.upgraded, counter: 0 });
    // 天一生水：灵气上限 +1，气血上限 −N
    if (def.id === 'tianyishengshui') {
      run.energyMax += 1;
      const loss = eff.n ?? 8;
      run.maxHp -= loss;
      run.hp = Math.min(run.hp, run.maxHp);
      checkPlayerDeath(run, b);
    }
  } else if (eff.exhaust || inst.vanish) {
    b.exhaustPile.push(inst);
  } else {
    b.discardPile.push(inst);
  }
}

/** 效果执行（含攻击伤害管线 §4.3） */
function executeEffects(
  run: RunState, b: BattleState, inst: CardInstance, cardId: string,
  eff: CardEffects, liushuiMult: number, target: number | undefined, xCost: number,
  liushuiTriggered: boolean,
) {
  const def = getCard(cardId);
  const pickTarget = (): EnemyState | null => {
    const alive = aliveEnemies(b);
    if (alive.length === 0) return null;
    const t = alive.find((e) => e.uid === target);
    return t ?? alive[0];
  };

  // ---- 特殊脚本 ----
  switch (eff.special) {
    case 'cuifeng':
      b.player.attackBuffs.push({ bonus: eff.n ?? 4, left: eff.n2 ?? 2 });
      break;
    case 'huichunshu': {
      if (b.huichunshuUses >= 2) { log(b, '回春术本场已用尽'); break; }
      b.huichunshuUses += 1;
      run.hp = Math.min(run.maxHp, run.hp + Math.floor((eff.n ?? 4) * liushuiMult));
      break;
    }
    case 'chunhui': {
      const negatives: StatusId[] = ['xuruo', 'yishang', 'zhuoshao', 'drawDown', 'energyDown', 'handCapDown', 'blockHalf'];
      let removed = 0;
      for (const s of negatives) {
        if ((b.player.statuses[s] ?? 0) > 0) { delete b.player.statuses[s]; removed += 1; }
      }
      drawCards(run, b, removed);
      if (eff.n) run.hp = Math.min(run.maxHp, run.hp + removed * eff.n);
      break;
    }
    case 'kurong':
      run.hp -= eff.loseHp ?? 7;
      checkPlayerDeath(run, b);
      if (b.outcome !== 'ongoing') return;
      b.player.energy += eff.energy ?? 3;
      drawCards(run, b, eff.draw ?? 3);
      break;
    case 'jiling':
      b.player.energy += Math.floor((eff.energy ?? 1) * 1); // 灵气不吃加成
      b.xingwei = 'water';
      break;
    case 'guanlan': {
      const n = Math.min(eff.n ?? 3, b.drawPile.length + b.discardPile.length);
      if (b.drawPile.length < n) {
        const r = rngShuffle(run.rng, 'shuffle', b.discardPile);
        run.rng = r.state;
        b.drawPile = [...b.drawPile, ...r.value];
        b.discardPile = [];
      }
      const top = b.drawPile.slice(0, n);
      if (top.length > 0) {
        b.pendingChoice = {
          kind: 'scry', cards: top, maxPick: top.length,
          prompt: '观澜：选择要弃置的牌（可不选）', sourceCard: cardId,
        };
      } else {
        drawCards(run, b, 1);
      }
      break;
    }
    case 'jinghua': {
      if (b.hand.length > 0) {
        b.pendingChoice = {
          kind: 'pickHand', cards: [...b.hand], maxPick: 1,
          prompt: '镜花水月：选择 1 张手牌复制', sourceCard: cardId, upgraded: inst.upgraded,
        };
      }
      break;
    }
    case 'canghai': {
      const count = b.hand.length;
      const per = eff.n ?? 6;
      for (const c of [...b.hand]) {
        if (c.vanish) b.exhaustPile.push(c);
        else b.discardPile.push(c);
      }
      b.hand = [];
      gainBlock(run, b, Math.floor(count * per * liushuiMult));
      run.hp = Math.min(run.maxHp, run.hp + count);
      break;
    }
    case 'dayan': {
      const t0 = pickTarget();
      if (t0) attackPipeline(run, b, inst, eff, t0, liushuiMult, liushuiTriggered);
      if (b.discardPile.length > 0 && b.outcome === 'ongoing') {
        b.pendingChoice = {
          kind: 'pickDiscard', cards: [...b.discardPile], maxPick: 1,
          prompt: '大衍回澜：选 1 张弃牌置于牌库顶', sourceCard: cardId,
        };
      }
      return;
    }
    case 'yinhuo': {
      const t = pickTarget();
      if (t) {
        const cur = t.statuses.zhuoshao ?? 0;
        t.statuses.zhuoshao = cur * 2 + (eff.n ?? 0);
      }
      break;
    }
    case 'zhulong':
      if (b.xingwei === 'wood') b.player.energy += 1;
      break;
    case 'sanmei': {
      const extra = b.player.energy;
      b.player.energy = 0;
      const t = pickTarget();
      if (t && extra > 0) {
        attackPipeline(run, b, inst, { damage: extra * (eff.n ?? 10) }, t, liushuiMult, liushuiTriggered);
      }
      break;
    }
    case 'yinghuo': {
      const t = pickTarget();
      if (t && xCost > 0) {
        attackPipeline(run, b, inst, { damage: xCost * (eff.n ?? 9) }, t, liushuiMult, liushuiTriggered);
        if (t.hp > 0) addEnemyStatus(run, b, t, 'zhuoshao', xCost);
      }
      break;
    }
    case 'dadimaidong': {
      const guben = b.player.statuses.guben ?? 0;
      gainBlock(run, b, Math.floor(((eff.block ?? 13) + guben * (eff.n ?? 3)) * liushuiMult));
      return afterAttackEffects(run, b, eff, pickTarget());
    }
    case 'chengshan': {
      const t = pickTarget();
      if (t) {
        const dmg = Math.floor((b.player.block * (eff.n ?? 100)) / 100);
        attackPipeline(run, b, inst, { damage: dmg }, t, liushuiMult, liushuiTriggered);
      }
      break;
    }
    case 'guanxiang': {
      const n = Math.min(5, b.drawPile.length + b.discardPile.length);
      if (b.drawPile.length < n) {
        const r = rngShuffle(run.rng, 'shuffle', b.discardPile);
        run.rng = r.state;
        b.drawPile = [...b.drawPile, ...r.value];
        b.discardPile = [];
      }
      const top = b.drawPile.slice(0, n);
      if (top.length > 0) {
        b.pendingChoice = {
          kind: 'pickTop', cards: top, maxPick: eff.n ?? 1,
          prompt: `观想五行：选 ${eff.n ?? 1} 张入手`, sourceCard: cardId,
        };
      }
      break;
    }
    case 'wuxinglunzhuan': {
      const count = b.hand.length;
      for (const c of [...b.hand]) {
        if (c.vanish) b.exhaustPile.push(c);
        else b.discardPile.push(c);
      }
      b.hand = [];
      drawCards(run, b, count);
      const els = b.hand.map((c) => getCard(c.cardId).element).filter((e) => e !== 'none');
      const distinct = new Set(els).size === els.length;
      if (distinct && b.hand.length > 0) {
        for (const c of b.hand) {
          const base = getCard(c.cardId).cost;
          if (typeof base === 'number') c.tempCost = Math.max(0, base - 1);
        }
        log(b, '五行轮转：新手牌五行互异，费用 −1！');
      }
      break;
    }
    case 'zuowang': {
      if (b.hand.length > 0) {
        b.pendingChoice = {
          kind: 'exhaustHand', cards: [...b.hand], maxPick: b.hand.length,
          prompt: '坐忘：选择要放逐的牌（每张 +1 灵气）', sourceCard: cardId, upgraded: inst.upgraded,
        };
      }
      break;
    }
    case 'zhoutianX': {
      // 周天大衍诀：免费依次打出牌库顶 X 张牌（随机目标）
      for (let i = 0; i < xCost; i++) {
        if (b.outcome !== 'ongoing') break;
        if (b.drawPile.length === 0) {
          if (b.discardPile.length === 0) break;
          const r = rngShuffle(run.rng, 'shuffle', b.discardPile);
          run.rng = r.state;
          b.drawPile = r.value;
          b.discardPile = [];
        }
        const next = b.drawPile.shift();
        if (!next) break;
        const ndef = getCard(next.cardId);
        if (ndef.type === 'curse' && !ndef.playableCurse) { b.discardPile.push(next); continue; }
        next.tempCost = 0;
        b.hand.push(next);
        const alive = aliveEnemies(b);
        let tgt: number | undefined;
        if (alive.length > 0) {
          const r = rngPick(run.rng, 'enemyAI', alive);
          run.rng = r.state;
          tgt = r.value.uid;
        }
        playCard(run, b, next.uid, tgt);
        if (b.pendingChoice) break; // 连打中出现选择则中断
      }
      break;
    }
    case 'yezhang':
      break; // 业障：无其他效果，走放逐
    case 'jinleifu': {
      const t = pickTarget();
      if (liushuiTriggered) {
        for (const e of aliveEnemies(b)) attackPipeline(run, b, inst, eff, e, liushuiMult, liushuiTriggered);
      } else if (t) {
        attackPipeline(run, b, inst, eff, t, liushuiMult, liushuiTriggered);
      }
      return afterCommon(run, b, eff, liushuiMult);
    }
    case 'jianqizongheng': {
      const t = pickTarget();
      if (t) attackPipeline(run, b, inst, { damage: b.cardsPlayed * (eff.n ?? 4) }, t, liushuiMult, liushuiTriggered);
      break;
    }
    case 'baihong': {
      const t = pickTarget();
      if (t) {
        let dmg = eff.damage ?? 18;
        if ((t.statuses.pojia ?? 0) > 0) dmg *= 2;
        attackPipeline(run, b, inst, { damage: dmg }, t, liushuiMult, liushuiTriggered);
      }
      break;
    }
    case 'mudun':
      gainBlock(run, b, Math.floor((eff.block ?? 8) * liushuiMult));
      if (liushuiTriggered) drawCards(run, b, 1);
      return afterCommon(run, b, { ...eff, block: undefined }, liushuiMult);
    case 'hanlu': {
      const t = pickTarget();
      if (t) {
        attackPipeline(run, b, inst, eff, t, liushuiMult, liushuiTriggered);
        if (t.hp <= 0) {
          run.hp = Math.min(run.maxHp, run.hp + 4);
          b.player.energy += 1;
        }
      }
      break;
    }
    default: {
      // ---- 通用 DSL ----
      if (eff.damage !== undefined || def.type === 'attack') {
        if (eff.aoe) {
          for (const e of [...aliveEnemies(b)]) attackPipeline(run, b, inst, eff, e, liushuiMult, liushuiTriggered);
        } else {
          const t = pickTarget();
          if (t) attackPipeline(run, b, inst, eff, t, liushuiMult, liushuiTriggered);
        }
      }
      afterCommon(run, b, eff, liushuiMult);
      // 非攻击牌的对敌状态（技能类）
      if (def.type !== 'attack') {
        const t2 = pickTarget();
        afterAttackEffects(run, b, eff, t2);
      }
      return;
    }
  }
  afterCommon(run, b, eff, liushuiMult);
}

/** 通用数值效果（护体/抽牌/灵气/回血/自伤/自身状态） */
function afterCommon(run: RunState, b: BattleState, eff: CardEffects, mult: number) {
  if (eff.block) gainBlock(run, b, Math.floor(eff.block * mult));
  if (eff.heal) run.hp = Math.min(run.maxHp, run.hp + Math.floor(eff.heal * mult));
  if (eff.maxHp) { run.maxHp += eff.maxHp; run.hp = Math.min(run.hp, run.maxHp); }
  if (eff.draw) drawCards(run, b, eff.draw);
  if (eff.energy && eff.special !== 'kurong' && eff.special !== 'jiling') b.player.energy += eff.energy;
  if (eff.selfDamage) playerDamage(run, b, eff.selfDamage, { isAttack: false });
  if (eff.loseHp && !eff.special) { run.hp -= eff.loseHp; checkPlayerDeath(run, b); }
  if (eff.applySelf) {
    for (const [k, v] of Object.entries(eff.applySelf)) {
      addPlayerStatus(b, k as StatusId, v as number);
      if (k === 'tengou') b.player.statuses['_tengouCap' as StatusId] = eff.n ?? 6;
    }
  }
  if (eff.applyEnemyAll) {
    for (const e of aliveEnemies(b)) {
      for (const [k, v] of Object.entries(eff.applyEnemyAll)) addEnemyStatus(run, b, e, k as StatusId, v as number);
    }
  }
}

/** 攻击牌附带的对敌状态与滞涩 */
function afterAttackEffects(run: RunState, b: BattleState, eff: CardEffects, t: EnemyState | null) {
  if (!t || t.hp <= 0) return;
  if (eff.applyEnemy) {
    for (const [k, v] of Object.entries(eff.applyEnemy)) addEnemyStatus(run, b, t, k as StatusId, v as number);
  }
  if (eff.zhise) applyZhise(b, t);
}

/**
 * 伤害结算管线（§4.3）：
 * (基础值 + 加值) × 相克 × 行云流水 × 虚弱 × 易伤，每步向下取整。
 */
function attackPipeline(
  run: RunState, b: BattleState, inst: CardInstance, eff: CardEffects,
  target: EnemyState, liushuiMult: number, liushuiTriggered: boolean,
) {
  const def = getCard(inst.cardId);
  const times = eff.times ?? 1;
  const isFirstAttackBattle = !b.playedByElement['_attacked'];
  b.playedByElement['_attacked'] = 1;

  for (let i = 0; i < times; i++) {
    if (target.hp <= 0 || b.outcome !== 'ongoing') break;
    // ---- 加值 ----
    let dmg = eff.damage ?? 0;
    dmg += b.player.statuses.gangqi ?? 0;
    dmg += b.longhuBonus;
    // 淬锋类（第一段即消耗一次）
    if (i === 0) {
      for (const buff of b.player.attackBuffs) {
        if (buff.left > 0) { dmg += buff.bonus; buff.left -= 1; }
      }
      b.player.attackBuffs = b.player.attackBuffs.filter((x) => x.left > 0);
    }
    // 桃木剑：每场第一张攻击牌 +4
    if (isFirstAttackBattle && i === 0 && hasRelic(run, 'taomujian')) dmg += 4;
    // 灯芯草：每回合第一张火牌 +3
    if (def.element === 'fire' && (b.playedByElement['fire'] ?? 0) === 0 && hasRelic(run, 'dengxincao')) dmg += 3;
    // 庚金剑域：每回合第一张金牌 +N
    if (def.element === 'metal' && (b.playedByElement['metal'] ?? 0) === 0) dmg += powerN(b, 'gengjinjianyu');
    // 剑心通明（根基突破）：金牌 +2 / 剑冢祭拜：金牌 +1
    if (def.element === 'metal') {
      if (run.breakthroughs.includes('jianxin_genji')) dmg += 2;
      if (run.flags['jianji']) dmg += 1;
    }
    // 贪嗔：在手牌时攻击牌 −2
    if (curseInHand(b, 'tanchen')) dmg -= 2;
    dmg = Math.max(0, dmg);

    // ---- 乘区（每步向下取整）----
    let ke = false;
    if (def.element !== 'none' && target.element !== 'none' && overcomes(def.element as Element, target.element as Element)) {
      ke = true;
      const keMult = hasRelic(run, 'taijitu') ? 1.75 : 1.5;
      dmg = Math.floor(dmg * keMult);
      if (i === 0) log(b, `克制！伤害 ×${keMult}`);
    }
    if (liushuiTriggered) dmg = Math.floor(dmg * liushuiMult);
    if ((b.player.statuses.xuruo ?? 0) > 0) dmg = Math.floor(dmg * 0.75);
    if ((target.statuses.yishang ?? 0) > 0) dmg = Math.floor(dmg * 1.5);

    // 火德真身：每回合第一张攻击牌附加灼烧
    if (b.attacksPlayed === 0 && i === 0) {
      const huode = powerN(b, 'huodezhenshen');
      if (huode > 0) addEnemyStatus(run, b, target, 'zhuoshao', huode);
    }

    enemyTakeAttack(run, b, target, dmg, { ignoreBlock: eff.ignoreBlock });
    if (dmg > (run.flags['maxHit'] ?? 0)) run.flags['maxHit'] = dmg;

    // ---- 相克附加异常（§4.4 ②）----
    if (ke && target.hp > 0) {
      const keEff = KE_EFFECT[def.element as Element];
      switch (keEff) {
        case 'pojia': addEnemyStatus(run, b, target, 'pojia', 1); break;
        case 'chanfu': addEnemyStatus(run, b, target, 'chanfu', 1); break;
        case 'zhise': applyZhise(b, target); break;
        case 'ximie': applyXimie(target); break;
        case 'rongchuan': addEnemyStatus(run, b, target, 'zhuoshao', 3); break;
      }
    }
  }
  // 攻击牌附带状态
  afterAttackEffects(run, b, eff, target);
}

// ---------- 选择结算 ----------

export function resolveChoice(run: RunState, b: BattleState, picks: number[]) {
  const choice = b.pendingChoice;
  if (!choice) return;
  b.pendingChoice = null;

  switch (choice.kind) {
    case 'scry': { // 观澜：picks = 要弃置的 uid
      for (const uid of picks) {
        const i = b.drawPile.findIndex((c) => c.uid === uid);
        if (i >= 0) b.discardPile.push(...b.drawPile.splice(i, 1));
      }
      drawCards(run, b, 1);
      break;
    }
    case 'pickHand': { // 镜花水月
      const src = b.hand.find((c) => c.uid === picks[0]);
      if (src) {
        const copy = makeCard(run, src.cardId, src.upgraded);
        copy.tempCost = 0;
        if (!choice.upgraded) copy.vanish = true; // 未参悟：回合末放逐
        b.hand.push(copy);
      }
      break;
    }
    case 'pickDiscard': { // 大衍回澜
      const i = b.discardPile.findIndex((c) => c.uid === picks[0]);
      if (i >= 0) b.drawPile.unshift(...b.discardPile.splice(i, 1));
      break;
    }
    case 'pickTop': { // 观想五行
      let taken = 0;
      for (const uid of picks) {
        if (taken >= (choice.maxPick ?? 1)) break;
        const i = b.drawPile.findIndex((c) => c.uid === uid);
        if (i >= 0) { b.hand.push(...b.drawPile.splice(i, 1)); taken += 1; }
      }
      break;
    }
    case 'exhaustHand': { // 坐忘
      let count = 0;
      for (const uid of picks) {
        const i = b.hand.findIndex((c) => c.uid === uid);
        if (i >= 0) { b.exhaustPile.push(...b.hand.splice(i, 1)); count += 1; }
      }
      b.player.energy += count;
      if (choice.upgraded) drawCards(run, b, count);
      break;
    }
    case 'dilemma': { // 道心拷问/问道：0 = 弃牌，1 = 受伤
      const discardN = choice.data?.['discard'] ?? 2;
      const dmg = choice.data?.['damage'] ?? 14;
      if (picks[0] === 0 && b.hand.length > 0) {
        for (let i = 0; i < discardN && b.hand.length > 0; i++) {
          const r = rngInt(run.rng, 'enemyAI', 0, b.hand.length - 1);
          run.rng = r.state;
          b.discardPile.push(...b.hand.splice(r.value, 1));
        }
      } else {
        playerDamage(run, b, dmg, { isAttack: false });
      }
      break;
    }
  }
}

// ---------- 丹药（战斗内） ----------

export function usePotionInBattle(run: RunState, b: BattleState, potionId: string, target?: number) {
  const idx = run.potions.indexOf(potionId);
  if (idx < 0) return;
  // 炸炉丹渣：20% 失效
  if (run.flags['danzha']) {
    const r = rngInt(run.rng, 'misc', 1, 100);
    run.rng = r.state;
    if (r.value <= 20) {
      run.potions.splice(idx, 1);
      run.stats.potionsUsed += 1;
      log(b, '丹药失效了！（炸炉丹渣）');
      return;
    }
  }
  run.potions.splice(idx, 1);
  run.stats.potionsUsed += 1;
  const alive = aliveEnemies(b);
  const t = alive.find((e) => e.uid === target) ?? alive[0];

  switch (potionId) {
    case 'huixuedan': run.hp = Math.min(run.maxHp, run.hp + 12); break;
    case 'lingqisan': b.player.energy += 2; break;
    case 'jingangwan': gainBlock(run, b, 12); break;
    case 'yunlingdan': drawCards(run, b, 3); break;
    case 'qingxindan': {
      const negatives: StatusId[] = ['xuruo', 'yishang', 'zhuoshao', 'drawDown', 'energyDown', 'handCapDown', 'blockHalf'];
      for (const s of negatives) delete b.player.statuses[s];
      break;
    }
    case 'wuxingdan': b.wuxingDanNext = true; break;
    case 'longhudan': b.longhuBonus += 3; break;
    case 'guixidan': b.player.statuses.guishaDan = 1; break;
    case 'huashadan':
      for (const e of alive) {
        addEnemyStatus(run, b, e, 'chanfu', 2);
        addEnemyStatus(run, b, e, 'zhuoshao', 2);
      }
      break;
    case 'niepansan': run.hp = Math.min(run.maxHp, run.hp + Math.floor(run.maxHp * 0.3)); break;
    case 'tianjiwan': b.tianjiActive = true; break;
    case 'wudaodan': {
      // 战斗内使用：随机参悟一张未参悟手牌（地图使用走选择界面）
      const cands = b.hand.filter((c) => !c.upgraded && getCard(c.cardId).type !== 'curse');
      if (cands.length > 0) {
        const r = rngPick(run.rng, 'misc', cands);
        run.rng = r.state;
        r.value.upgraded = true;
        // 同步牌组中的对应卡
        const deckCard = run.deck.find((c) => c.uid === r.value.uid);
        if (deckCard) deckCard.upgraded = true;
      }
      break;
    }
  }
  void t;
}
