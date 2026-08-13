/**
 * 无头模拟器 Bot 策略 v3（策划案 §16.6）
 *
 * - random：合法动作随机（下限校验，§12.3 通关率 <1%）
 * - greedy：费效比贪心 + 顺生排序启发（懂五行）：
 *     出牌前按"能得气优先"排序、避免滞气、克伐加成、目标选血最少、
 *     袖藏留高费牌、洞府启发（血 <60% rest / 丹毒 ≥6 fast / 材料够且丹盒未满 brew / 否则 smith）、
 *     心魔 ≥5 且灵石 ≥66 心斋、事件选第一个无代价项否则随机、道果按简单偏好、
 *     绕路启发（优先 years 小的边）、御空不用（不发 FLY_NODE）。
 * - blind ：与 greedy 完全相同，但不做顺生排序与克伐考虑（无视五行）——
 *     用于校验"知识变现 ≤1.8× 综合效能"（§12.2）。
 *
 * 全部动作经 reduce 下发；Bot 自带独立种子随机（mulberry32），禁 Math.random（§16.4）。
 */
import type {
  Action, BattleState, CardEffects, CardInstance, CaveScreen, EnemyState,
  EventDef, RecipeDef, RunState, StatusId,
} from '../core/types';
import type { CardElement, Element } from '../core/wuxing';
import { generates, overcomes, SHENG } from '../core/wuxing';
import { aliveEnemies, canPlay, cardCost, intentDamage } from '../core/combat';
import { getCard } from '../data/cards';
import { findNode, selectableNodes } from '../core/map';
import { getEvent } from '../data/events';
import { getRecipe } from '../data/alchemy';
import { hashSeed } from '../core/rng';

export type BotKind = 'random' | 'greedy' | 'blind';

/** Bot 自身的独立随机（与游戏 RNG 完全隔离，固定种子可复现） */
export class BotRng {
  private state: number;
  constructor(seed: string) {
    this.state = hashSeed(seed) || 1;
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** 随机取 n 个（不放回） */
  sample<T>(arr: readonly T[], n: number): T[] {
    const pool = [...arr];
    const out: T[] = [];
    while (out.length < n && pool.length > 0) {
      out.push(pool.splice(Math.floor(this.next() * pool.length), 1)[0]);
    }
    return out;
  }
}

// ---------- 工具 ----------

function numCost(c: CardInstance): number {
  if (c.tempCost !== undefined) return c.tempCost;
  const cost = getCard(c.cardId).cost;
  return typeof cost === 'number' ? cost : 3; // X 费按 3 估
}

function isJunk(c: CardInstance): boolean {
  return getCard(c.cardId).type === 'curse';
}

/** 卡牌粗略价值（pickTop / 奖励选卡用）：稀有度 × 类型权重 */
function cardPickValue(c: { cardId: string; upgraded?: boolean }): number {
  const def = getCard(c.cardId);
  const rarity = { starter: 0, common: 1, rare: 2.2, epic: 3.2, legendary: 4.2, curse: -5 }[def.rarity];
  const type = def.type === 'attack' ? 1.4 : def.type === 'power' ? 1.2 : def.type === 'curse' ? 1 : 1.1;
  return rarity * type + (c.upgraded ? 0.5 : 0);
}

/** 已持有丹方中灵材足够炼的（丹盒容量由调用方检查） */
function affordableRecipes(run: RunState): string[] {
  return run.recipes.filter((id) => {
    let r: RecipeDef;
    try {
      r = getRecipe(id);
    } catch {
      return false;
    }
    return Object.entries(r.cost).every(([m, n]) => (run.materials[m as keyof typeof run.materials] ?? 0) >= (n ?? 0));
  });
}

function pickBrewRecipe(run: RunState, brewable: string[]): string {
  if (run.toxin >= 3 || run.demon >= 4) {
    if (brewable.includes('qingxindan')) return 'qingxindan';
  }
  if (brewable.includes('huiyuandan')) return 'huiyuandan';
  return brewable[0];
}

/** 候选节点这条边的寿元年数（v3 MapEdge；两个指向方向都查，查不到按 1） */
function edgeYears(run: RunState, toId: string): number {
  const cur = run.nodeId ? findNode(run, run.nodeId) : undefined;
  const direct = cur?.edges?.find((e) => e.to === toId);
  if (direct) return direct.years;
  const cand = findNode(run, toId);
  const back = cand?.edges?.find((e) => e.to === run.nodeId);
  return back?.years ?? 1;
}

// ---------- 战斗：出牌评分 ----------

interface PlayPlan {
  uid: number;
  score: number;
  target?: number;
  dualPick?: 'a' | 'b';
}

const ENEMY_STATUS_WEIGHT: Partial<Record<StatusId, number>> = {
  zhangdu: 2.2, zhuoshao: 1.6, pozhan: 2.5, qizhi: 2, ruanhua: 1.5,
};
const SELF_STATUS_WEIGHT: Partial<Record<StatusId, number>> = {
  gangqi: 2.5, guben: 2.2, huichun: 1.5, fanci: 1, fanshao: 1, retainBlock: 2,
  nextTurnDraw: 2, nextTurnBlock: 1, niepan: 3, yinguo: 1.5,
};

/** 单组效果的粗略价值估算（用于费效比贪心） */
function effValue(
  eff: CardEffects,
  ctx: { alive: number; needBlock: boolean; hpDeficit: number; energy: number },
): number {
  let v = 0;
  if (eff.damage) v += eff.damage * (eff.times ?? 1) * (eff.aoe ? Math.min(ctx.alive, 2) : 1);
  if (eff.bonusDamage) v += eff.bonusDamage * (eff.times ?? 1);
  if (eff.extraHit) v += eff.damage ?? 4;
  if (eff.makeAoe) v += (eff.damage ?? 6) * Math.max(0, Math.min(ctx.alive, 2) - 1);
  if (eff.block) v += eff.block * (ctx.needBlock ? 1.4 : 0.5);
  if (eff.draw) v += eff.draw * 2.5;
  if (eff.energy) v += eff.energy * 3;
  if (eff.heal) v += Math.min(eff.heal, ctx.hpDeficit) * 0.8;
  if (eff.maxHp) v += eff.maxHp * 1.2;
  for (const [k, n] of Object.entries(eff.applyEnemy ?? {})) {
    v += (ENEMY_STATUS_WEIGHT[k as StatusId] ?? 1.5) * (n ?? 0);
  }
  for (const [k, n] of Object.entries(eff.applyEnemyAll ?? {})) {
    v += (ENEMY_STATUS_WEIGHT[k as StatusId] ?? 1.5) * (n ?? 0) * Math.min(ctx.alive, 2);
  }
  for (const [k, n] of Object.entries(eff.applySelf ?? {})) {
    v += (SELF_STATUS_WEIGHT[k as StatusId] ?? 1) * Math.max(0, n ?? 0);
  }
  if (eff.zhise) v += 3;
  if (eff.special) v += 3 + (eff.n ?? 0) * 0.5; // 脚本卡兜底估值
  if (eff.selfDamage) v -= eff.selfDamage * 0.8;
  if (eff.loseHp) v -= eff.loseHp;
  if (eff.burnLife) v -= eff.burnLife * 1.5;
  if (eff.selfBurn) v -= eff.selfBurn;
  return v;
}

/** 契约 §16.3 的得气判定（Bot 侧近似估计） */
function wouldDeqi(b: BattleState, elem: CardElement, hasSheng: boolean): boolean {
  if (elem === 'none' || !hasSheng || b.shengBlocked) return false;
  if (b.wuxingDanNext || b.tianren) return true;
  return !!b.stance && generates(b.stance, elem as Element);
}

function planCard(
  run: RunState, b: BattleState, c: CardInstance, kind: BotKind, alive: EnemyState[], needBlock: boolean,
): PlayPlan {
  const def = getCard(c.cardId);
  const aware = kind === 'greedy'; // blind：完全无视五行
  const ctx = {
    alive: alive.length,
    needBlock,
    hpDeficit: run.maxHp - run.hp,
    energy: b.player.energy,
  };

  // 双行牌选行：greedy 选能得气的一行，否则选估值高的一行；blind 固定 a
  let dualPick: 'a' | 'b' | undefined;
  let elem: CardElement = def.element;
  let main: CardEffects;
  let shengEff: CardEffects | null;
  if (def.dual) {
    const effA = c.upgraded ? def.dual.aUp : def.dual.a;
    const effB = c.upgraded ? def.dual.bUp : def.dual.b;
    const deqiA = aware && wouldDeqi(b, def.dual.elements[0], true);
    const deqiB = aware && wouldDeqi(b, def.dual.elements[1], true);
    if (deqiA !== deqiB) dualPick = deqiA ? 'a' : 'b';
    else if (aware) dualPick = effValue(effA, ctx) >= effValue(effB, ctx) ? 'a' : 'b';
    else dualPick = 'a';
    elem = def.dual.elements[dualPick === 'a' ? 0 : 1];
    main = dualPick === 'a' ? effA : effB;
    shengEff = dualPick === 'a' ? effB : effA; // 得气时 a、b 两组皆得
  } else {
    main = c.upgraded ? def.upBase : def.base;
    shengEff = (c.upgraded ? (def.upSheng ?? def.sheng) : def.sheng) ?? null;
  }

  const hasSheng = !!def.sheng || !!def.dual;
  const rawCost = cardCost(run, b, c);
  const cost = Math.max(1, typeof rawCost === 'number' ? rawCost : 1);
  const deqi = aware && wouldDeqi(b, elem, hasSheng);

  let value = effValue(main, ctx);
  if (deqi && shengEff) value += effValue(shengEff, ctx);
  if (def.type === 'power') value += b.turn <= 2 ? 8 : 3;
  if (def.type === 'curse' && def.playableCurse) value = 1; // 业障：能放逐就放逐（低优先）
  let score = value / cost;

  // ---- 五行启发（仅 greedy）----
  if (aware && elem !== 'none') {
    if (deqi) score *= 1.6; // 顺生排序：能得气优先
    // 滞气规避：打出克制当前行位之行的牌会封锁下一次得气
    if (b.stance && overcomes(elem as Element, b.stance) && !run.fruits.includes('niyunzhenqi')) {
      score *= 0.5;
    }
    // 铺链：打出后行位=elem，若手上还有可顺生衔接的得气牌，小幅加分
    const nextElem = SHENG[elem as Element];
    const setsUp = b.hand.some((h) => {
      if (h.uid === c.uid) return false;
      const hd = getCard(h.cardId);
      const he: CardElement = hd.dual ? hd.dual.elements[0] : hd.element;
      return (!!hd.sheng || !!hd.dual) && (he === nextElem || (hd.dual && hd.dual.elements[1] === nextElem));
    });
    if (setsUp) score *= 1.1;
  }

  // ---- 目标：血最少；greedy 另做克伐考虑 ----
  let target: number | undefined;
  const needsTarget = def.type === 'attack' || def.targetEnemy;
  if (needsTarget && alive.length > 0) {
    let chosen = [...alive].sort((a, x) => a.hp - x.hp)[0];
    if (def.base.special === 'yinhuo' || def.upBase.special === 'yinhuo') {
      // 引火符【引爆】：选灼烧层数最高者
      chosen = [...alive].sort((a, x) => (x.statuses.zhuoshao ?? 0) - (a.statuses.zhuoshao ?? 0))[0];
    } else if (aware && elem !== 'none' && def.type === 'attack') {
      // 克伐考虑：血量接近最低者中优先被本牌之行克制的敌人
      const kefa = alive.find((e) => e.element !== 'none' && overcomes(elem as Element, e.element as Element) && e.hp <= chosen.hp * 1.5);
      if (kefa) {
        chosen = kefa;
        score *= 1.2;
      }
    }
    target = chosen.uid;
  }

  return { uid: c.uid, score, target, dualPick: def.dual ? dualPick : undefined };
}

// ---------- 战斗：回合结束（袖藏留高费牌） ----------

function endTurnAction(b: BattleState, kind: BotKind, rng: BotRng): Action {
  if (b.player.statuses.sleeveBan) return { t: 'END_TURN' };
  const cap = Math.max(1, 1 + (b.sleeveCapBonus ?? 0));
  if (kind === 'random') {
    if (b.hand.length > 0 && rng.chance(0.3)) {
      return { t: 'END_TURN', sleeveUids: [rng.pick(b.hand).uid] };
    }
    return { t: 'END_TURN' };
  }
  // greedy/blind：袖藏费用最高的非诅咒牌（费 ≥2 才值得留）
  const keep = b.hand
    .filter((c) => !isJunk(c) && !c.vanish && numCost(c) >= 2)
    .sort((a, x) => numCost(x) - numCost(a))
    .slice(0, cap);
  return keep.length > 0 ? { t: 'END_TURN', sleeveUids: keep.map((c) => c.uid) } : { t: 'END_TURN' };
}

// ---------- 战斗：pendingChoice 各 kind ----------

function choiceAction(b: BattleState, kind: BotKind, rng: BotRng): Action {
  const c = b.pendingChoice!;
  const cards = c.cards ?? [];
  const uids = cards.map((x) => x.uid);
  switch (c.kind) {
    case 'dilemma': {
      // 二/多选一（道心拷问、问道、河图选行位、劫云压顶等）：greedy 取首项，random 合法随机
      const n = Math.max(1, c.options?.length ?? 2);
      return { t: 'RESOLVE_CHOICE', picks: [kind === 'random' ? rng.int(0, n - 1) : 0] };
    }
    case 'pickTop': {
      const max = Math.min(c.maxPick ?? 1, uids.length);
      if (kind === 'random') return { t: 'RESOLVE_CHOICE', picks: rng.sample(uids, rng.int(0, max)) };
      const sorted = [...cards].sort((a, x) => cardPickValue(x) - cardPickValue(a));
      return { t: 'RESOLVE_CHOICE', picks: sorted.slice(0, max).map((x) => x.uid) };
    }
    case 'scry': {
      if (kind === 'random') return { t: 'RESOLVE_CHOICE', picks: rng.sample(uids, rng.int(0, uids.length)) };
      return { t: 'RESOLVE_CHOICE', picks: cards.filter(isJunk).map((x) => x.uid) }; // 只弃诅咒
    }
    case 'exhaustHand': {
      if (kind === 'random') return { t: 'RESOLVE_CHOICE', picks: rng.sample(uids, rng.int(0, Math.min(2, uids.length))) };
      return { t: 'RESOLVE_CHOICE', picks: cards.filter(isJunk).map((x) => x.uid) }; // 坐忘：放逐诅咒
    }
    case 'discardHand': {
      // 沧海纳川：弃掉诅咒与本回合打不出去的高费牌换护体
      if (kind === 'random') return { t: 'RESOLVE_CHOICE', picks: rng.sample(uids, rng.int(0, uids.length)) };
      return {
        t: 'RESOLVE_CHOICE',
        picks: cards.filter((x) => isJunk(x) || numCost(x) > b.player.energy).map((x) => x.uid),
      };
    }
    case 'returnHand': {
      // 五行轮转：高费打不出去的牌洗回换吐纳
      if (kind === 'random') return { t: 'RESOLVE_CHOICE', picks: rng.sample(uids, rng.int(0, uids.length)) };
      return {
        t: 'RESOLVE_CHOICE',
        picks: cards.filter((x) => !isJunk(x) && numCost(x) > b.player.energy).map((x) => x.uid),
      };
    }
    default:
      return { t: 'RESOLVE_CHOICE', picks: [] };
  }
}

// ---------- 战斗主决策 ----------

function battleAction(run: RunState, b: BattleState, kind: BotKind, rng: BotRng): Action {
  if (b.pendingChoice) return choiceAction(b, kind, rng);

  // 服丹：血低吃回元丹（greedy/blind）；random 小概率随机服丹
  if (kind !== 'random') {
    if (run.hp <= run.maxHp * 0.45 && run.elixirs.includes('huiyuandan')) {
      return { t: 'USE_ELIXIR', elixir: 'huiyuandan' };
    }
    if (run.hp <= run.maxHp * 0.3 && run.elixirs.includes('dahuandan')) {
      return { t: 'USE_ELIXIR', elixir: 'dahuandan' };
    }
    if (b.battleType === 'boss' && b.turn === 1 && run.elixirs.includes('longhudan')) {
      return { t: 'USE_ELIXIR', elixir: 'longhudan' };
    }
  } else if (run.elixirs.length > 0 && rng.chance(0.05)) {
    return { t: 'USE_ELIXIR', elixir: rng.pick(run.elixirs) };
  }

  const playable = b.hand.filter((c) => canPlay(run, b, c));
  if (playable.length === 0) return endTurnAction(b, kind, rng);

  const alive = aliveEnemies(b);

  if (kind === 'random') {
    if (rng.chance(0.15)) return endTurnAction(b, kind, rng);
    const card = playable[rng.int(0, playable.length - 1)];
    const def = getCard(card.cardId);
    return {
      t: 'PLAY_CARD',
      uid: card.uid,
      target: alive.length > 0 && (def.type === 'attack' || def.targetEnemy) ? rng.pick(alive).uid : undefined,
      dualPick: def.dual ? (rng.chance(0.5) ? 'a' : 'b') : undefined,
    };
  }

  // greedy / blind：费效比贪心
  const incoming = alive.reduce((s, e) => s + (intentDamage(b, e) ?? 0), 0);
  const needBlock = incoming > b.player.block;
  let best: PlayPlan | null = null;
  for (const c of playable) {
    const plan = planCard(run, b, c, kind, alive, needBlock);
    if (!best || plan.score > best.score) best = plan;
  }
  if (best && best.score > 0) {
    return { t: 'PLAY_CARD', uid: best.uid, target: best.target, dualPick: best.dualPick };
  }
  return endTurnAction(b, kind, rng);
}

// ---------- 冒险层：洞府启发 ----------

function caveAction(run: RunState, screen: CaveScreen, kind: BotKind, rng: BotRng): Action {
  if (screen.remaining <= 0) return { t: 'CAVE_LEAVE' };
  const avail = (['rest', 'smith', 'brew', 'fast'] as const).filter((k) => !screen.used.includes(k));
  const brewable = run.elixirs.length < run.elixirCap ? affordableRecipes(run) : [];

  if (kind === 'random') {
    const opts: Action[] = [{ t: 'CAVE_LEAVE' }];
    for (const k of avail) {
      if (k === 'brew') {
        if (brewable.length > 0) opts.push({ t: 'CAVE_ACTION', kind: 'brew', recipeId: rng.pick(brewable) });
      } else {
        opts.push({ t: 'CAVE_ACTION', kind: k });
      }
    }
    return rng.pick(opts);
  }

  // greedy/blind：寿元太少就不再花寿元（坐化规避）；空置洞府免费不受限
  if (!screen.free && run.lifespan <= 8) return { t: 'CAVE_LEAVE' };
  if (avail.includes('rest') && run.hp < run.maxHp * 0.6) return { t: 'CAVE_ACTION', kind: 'rest' };
  if (avail.includes('fast') && run.toxin >= 6) return { t: 'CAVE_ACTION', kind: 'fast' };
  if (avail.includes('brew') && brewable.length > 0) {
    return { t: 'CAVE_ACTION', kind: 'brew', recipeId: pickBrewRecipe(run, brewable) };
  }
  if (avail.includes('smith') && run.deck.some((c) => !c.upgraded && !isJunk(c))) {
    return { t: 'CAVE_ACTION', kind: 'smith' };
  }
  return { t: 'CAVE_LEAVE' };
}

// ---------- 冒险层：事件 ----------

/** 该选项的全部结果都不带代价（不失血/不耗寿/不加心魔丹毒/不掉灵石/不入战斗） */
function optionCostFree(o: EventDef['options'][number]): boolean {
  return o.outcomes.every((out) =>
    (out.hp ?? 0) >= 0 && (out.maxHp ?? 0) >= 0 && (out.gold ?? 0) >= 0 &&
    (out.lifespan ?? 0) >= 0 && (out.demon ?? 0) <= 0 && (out.toxin ?? 0) <= 0 &&
    !out.battle && !out.battleElite && (out.removeCards ?? 0) === 0);
}

function eventAction(run: RunState, kind: BotKind, rng: BotRng): Action {
  const screen = run.screen;
  if (screen.kind !== 'event') return { t: 'LEAVE_EVENT' };
  if (screen.resultText) return { t: 'LEAVE_EVENT' };
  // data/events.ts 正在按契约重写；此断言在重写完成后为恒等
  const ev = getEvent(screen.eventId) as unknown as EventDef;
  const avail = ev.options
    .map((o, i) => ({ o, i }))
    .filter(({ o, i }) =>
      !screen.disabled.includes(i) &&
      (!o.requireGold || run.gold >= o.requireGold) &&
      (!o.requireLifespan || run.lifespan >= o.requireLifespan) &&
      (!o.requireRelic || run.relics.length > 0));
  if (avail.length === 0) return { t: 'LEAVE_EVENT' };

  // 劫云压顶（jieyun，Boss 前内置事件）：血 <50% 才选"闭关"，否则选另一项
  if (ev.id === 'jieyun' && kind !== 'random') {
    const rest = avail.find(({ o }) => o.label.includes('闭关'));
    const go = avail.find(({ o }) => !o.label.includes('闭关'));
    if (run.hp < run.maxHp * 0.5 && rest && run.lifespan > 4) return { t: 'EVENT_OPTION', option: rest.i };
    return { t: 'EVENT_OPTION', option: (go ?? avail[0]).i };
  }

  if (kind === 'random') return { t: 'EVENT_OPTION', option: rng.pick(avail).i };
  // greedy/blind：第一个无代价项，否则随机
  const free = avail.find(({ o }) => optionCostFree(o));
  return { t: 'EVENT_OPTION', option: (free ?? rng.pick(avail)).i };
}

// ---------- 主入口 ----------

/** 决定下一个动作；返回 null 表示本局无法再行动（如已到 end 界面） */
export function botAction(run: RunState, kind: BotKind, rng: BotRng): Action | null {
  if (run.battle) return battleAction(run, run.battle, kind, rng);

  const screen = run.screen;
  switch (screen.kind) {
    case 'map': {
      // 地图上先服可服丹保命（回元丹 mapUsable）
      if (kind !== 'random' && run.hp <= run.maxHp * 0.4 && run.elixirs.includes('huiyuandan')) {
        return { t: 'USE_ELIXIR', elixir: 'huiyuandan' };
      }
      const nodes = selectableNodes(run);
      if (nodes.length === 0) return null;
      if (kind === 'random') return { t: 'CHOOSE_NODE', node: rng.pick(nodes) };
      // greedy/blind：节点类型评分 ÷ 边寿元年数（绕路启发：优先 years 小的边）；御空不用
      const scored = nodes.map((id) => {
        const n = findNode(run, id);
        const type = n?.revealedType ?? n?.type ?? 'battle';
        let s = 1;
        if (type === 'cave') s = run.hp < run.maxHp * 0.6 || run.toxin >= 6 ? 10 : 2.5;
        if (type === 'battle') s = 4;
        if (type === 'event') s = 3;
        if (type === 'field') s = 3;
        if (type === 'elite') s = run.hp > run.maxHp * 0.7 ? 5 : 0.5;
        if (type === 'shop') s = run.gold >= 88 || (run.demon >= 5 && run.gold >= 66) ? 4 : 1;
        if (type === 'unknown') s = 3;
        const years = edgeYears(run, id);
        return { id, s: s / (0.5 + years) };
      });
      const total = scored.reduce((a, x) => a + x.s, 0);
      let roll = rng.next() * total;
      for (const x of scored) {
        roll -= x.s;
        if (roll <= 0) return { t: 'CHOOSE_NODE', node: x.id };
      }
      return { t: 'CHOOSE_NODE', node: scored[0].id };
    }

    case 'reward': {
      if (!screen.goldTaken && screen.gold > 0) return { t: 'TAKE_REWARD_GOLD' };
      if (screen.relic) return { t: 'TAKE_REWARD_RELIC' };
      if (screen.materials) return { t: 'TAKE_REWARD_MATERIALS' };
      if (screen.cards) {
        if (kind === 'random') return { t: 'PICK_REWARD_CARD', index: rng.int(-1, screen.cards.length - 1) };
        // greedy/blind：稀有度偏好；卡组过大后只收稀有以上（防稀释）
        const threshold = run.deck.length >= 20 ? 2.4 : 1.2;
        let bestIdx = -1;
        let bestScore = threshold;
        screen.cards.forEach((c, i) => {
          const s = cardPickValue(c);
          if (s > bestScore) { bestScore = s; bestIdx = i; }
        });
        return { t: 'PICK_REWARD_CARD', index: bestIdx };
      }
      return { t: 'LEAVE_REWARD' };
    }

    case 'shop': {
      if (kind === 'random') {
        const buyable = screen.items
          .map((it, i) => ({ it, i }))
          .filter(({ it }) => !it.sold && run.gold >= Math.floor(it.price * screen.discount));
        if (buyable.length > 0 && rng.chance(0.3)) return { t: 'BUY_ITEM', index: rng.pick(buyable).i };
        return { t: 'LEAVE_SHOP' };
      }
      // 心斋：心魔 ≥5 且灵石够 → 心魔 −1
      if (!screen.xinzhaiUsed && run.demon >= 5 && run.gold >= screen.xinzhaiPrice) {
        return { t: 'SHOP_XINZHAI' };
      }
      for (let i = 0; i < screen.items.length; i++) {
        const item = screen.items[i];
        if (item.sold) continue;
        const price = Math.floor(item.price * screen.discount);
        if (run.gold < price) continue;
        if (item.kind === 'relic') return { t: 'BUY_ITEM', index: i };
        if (item.kind === 'recipe' && !run.recipes.includes(item.id) && run.gold >= price + 40) {
          return { t: 'BUY_ITEM', index: i };
        }
        if (item.kind === 'materials' && run.gold >= price + 80) return { t: 'BUY_ITEM', index: i };
      }
      // 斩尘缘：优先斩诅咒（bonded 本命牌不可斩）
      if (!screen.removeUsed && run.gold >= screen.removePrice) {
        const curse = run.deck.find((c) => isJunk(c) && !getCard(c.cardId).bonded);
        if (curse) return { t: 'SHOP_REMOVE_CARD', uid: curse.uid };
        if (run.gold >= screen.removePrice + 80) {
          const starter = run.deck.find((c) => getCard(c.cardId).rarity === 'starter' && !getCard(c.cardId).bonded);
          if (starter) return { t: 'SHOP_REMOVE_CARD', uid: starter.uid };
        }
      }
      return { t: 'LEAVE_SHOP' };
    }

    case 'event':
      return eventAction(run, kind, rng);

    case 'cave':
      return caveAction(run, screen, kind, rng);

    case 'daoguo': {
      if (screen.options.length === 0) return null;
      if (kind === 'random') return { t: 'PICK_DAOGUO', id: rng.pick(screen.options) };
      // 道果简单偏好：生存 > 寿元 > 资源引擎
      const pref = [
        'tiegu', 'randengxuming', 'jindanwuse', 'yaowangding', 'yingerbaodan',
        'jiantai', 'yiqihuasanqing', 'zhansanshi', 'niyunzhenqi',
      ];
      const sorted = [...screen.options].sort((a, x) => {
        const ia = pref.indexOf(a); const ix = pref.indexOf(x);
        return (ia < 0 ? 99 : ia) - (ix < 0 ? 99 : ix);
      });
      return { t: 'PICK_DAOGUO', id: sorted[0] };
    }

    case 'cardPick': {
      if (kind === 'random') {
        const cands = run.deck.filter((c) => !getCard(c.cardId).bonded);
        if (cands.length === 0) return { t: 'PICK_CARD_SCREEN', uid: -1 };
        return { t: 'PICK_CARD_SCREEN', uid: rng.pick(cands).uid };
      }
      if (screen.mode === 'remove' || screen.mode === 'transform') {
        const curse = run.deck.find((c) => isJunk(c) && !getCard(c.cardId).bonded);
        if (curse) return { t: 'PICK_CARD_SCREEN', uid: curse.uid };
        const starter = run.deck.find((c) => getCard(c.cardId).rarity === 'starter' && !getCard(c.cardId).bonded);
        if (starter) return { t: 'PICK_CARD_SCREEN', uid: starter.uid };
        return { t: 'PICK_CARD_SCREEN', uid: -1 };
      }
      // upgrade：参悟费用最高的未参悟牌
      const cands = run.deck.filter((c) => !c.upgraded && !isJunk(c));
      if (cands.length === 0) return { t: 'PICK_CARD_SCREEN', uid: -1 };
      const best = [...cands].sort((a, x) => numCost(x) - numCost(a))[0];
      return { t: 'PICK_CARD_SCREEN', uid: best.uid };
    }

    case 'end':
      return null;
    default:
      return null;
  }
}
