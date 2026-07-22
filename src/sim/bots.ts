/**
 * 无头模拟器 Bot 策略（策划案 §16.6）
 * random：下限校验；greedy：费效比贪心 + 简单目标选择。
 */
import type { Action, RunState } from '../core/types';
import { canPlay, cardCost, aliveEnemies, intentDamage } from '../core/combat';
import { getCard } from '../data/cards';
import { selectableNodes, findNode } from '../core/map';
import { getEvent } from '../data/events';
import { hashSeed } from '../core/rng';

export type BotKind = 'random' | 'greedy';

/** Bot 自身的独立随机（与游戏 RNG 无关） */
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
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

/** 决定下一个动作；返回 null 表示无法行动（不应发生） */
export function botAction(run: RunState, kind: BotKind, rng: BotRng): Action | null {
  const b = run.battle;

  // ---- 战斗内 ----
  if (b) {
    if (b.pendingChoice) {
      const c = b.pendingChoice;
      if (c.kind === 'dilemma') {
        // 贪心：血量低选弃牌，否则受伤
        const opt = kind === 'greedy' && run.hp > (c.data?.['damage'] ?? 14) + 15 ? 1 : 0;
        return { t: 'RESOLVE_CHOICE', picks: [opt] };
      }
      if (c.kind === 'pickHand' || c.kind === 'pickDiscard' || c.kind === 'pickTop') {
        const cards = c.cards ?? [];
        if (cards.length === 0) return { t: 'RESOLVE_CHOICE', picks: [] };
        return { t: 'RESOLVE_CHOICE', picks: [rng.pick(cards).uid] };
      }
      // scry / exhaustHand：不弃/不放逐（保守）
      return { t: 'RESOLVE_CHOICE', picks: [] };
    }
    // greedy：丹药使用
    if (kind === 'greedy') {
      const aliveNow = aliveEnemies(b);
      const incomingNow = aliveNow.reduce((s, e) => s + (intentDamage(b, e) ?? 0), 0);
      if (run.hp <= run.maxHp * 0.3 && run.potions.includes('huixuedan')) {
        return { t: 'USE_POTION', potion: 'huixuedan' };
      }
      if (run.hp <= run.maxHp * 0.35 && run.potions.includes('niepansan')) {
        return { t: 'USE_POTION', potion: 'niepansan' };
      }
      if (incomingNow - b.player.block >= 10 && run.hp < run.maxHp * 0.5 && run.potions.includes('jingangwan')) {
        return { t: 'USE_POTION', potion: 'jingangwan' };
      }
      if (b.battleType === 'boss' && b.turn === 1 && run.potions.includes('longhudan')) {
        return { t: 'USE_POTION', potion: 'longhudan' };
      }
      if (b.battleType === 'boss' && b.turn === 1 && run.potions.includes('lingqisan')) {
        return { t: 'USE_POTION', potion: 'lingqisan' };
      }
      if (aliveNow.length >= 3 && run.potions.includes('huashadan')) {
        return { t: 'USE_POTION', potion: 'huashadan' };
      }
    }

    const playable = b.hand.filter((c) => canPlay(run, b, c));
    if (playable.length === 0) return { t: 'END_TURN' };

    if (kind === 'random') {
      // 20% 直接结束回合
      if (rng.next() < 0.2) return { t: 'END_TURN' };
      const card = rng.pick(playable);
      const alive = aliveEnemies(b);
      return { t: 'PLAY_CARD', uid: card.uid, target: alive.length ? rng.pick(alive).uid : undefined };
    }

    // ---- greedy ----
    const alive = aliveEnemies(b);
    const incoming = alive.reduce((s, e) => s + (intentDamage(b, e) ?? 0), 0);
    const needBlock = incoming > b.player.block;

    let best: { uid: number; score: number; target?: number } | null = null;
    for (const c of playable) {
      const def = getCard(c.cardId);
      const eff = c.upgraded ? def.up : def.base;
      const cost = Math.max(1, cardCost(run, b, c));
      let score = 0;
      if (def.type === 'attack') {
        const dmg = (eff.damage ?? 6) * (eff.times ?? 1) * (eff.aoe ? Math.min(alive.length, 2) : 1);
        score = dmg / cost;
      } else if (def.type === 'defense') {
        score = ((eff.block ?? 6) / cost) * (needBlock ? 2.2 : 0.7);
      } else if (def.type === 'power') {
        score = b.turn <= 2 ? 9 : 5;
      } else if (def.type === 'curse' && def.playableCurse) {
        score = 1;
      } else {
        score = ((eff.draw ?? 0) * 3 + (eff.energy ?? 0) * 3 + (eff.heal ?? 0) * 0.8 + (eff.block ?? 0) * (needBlock ? 1.5 : 0.4)) / cost + 2;
      }
      // 行云流水偏好：能接上行位的牌加分
      if (b.xingwei && def.element !== 'none') {
        const sheng: Record<string, string> = { wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood' };
        if (sheng[b.xingwei] === def.element) score *= 1.35;
      }
      // 目标：优先克制目标，其次最低血
      let target: number | undefined;
      if (alive.length > 0) {
        const ke: Record<string, string> = { wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood' };
        const keTarget = def.element !== 'none' ? alive.find((e) => ke[def.element] === e.element) : undefined;
        const lowest = [...alive].sort((a, x) => a.hp - x.hp)[0];
        target = (keTarget ?? lowest).uid;
        if (def.type === 'attack' && keTarget) score *= 1.3; // 克制加成
      }
      if (!best || score > best.score) best = { uid: c.uid, score, target };
    }
    if (best) return { t: 'PLAY_CARD', uid: best.uid, target: best.target };
    return { t: 'END_TURN' };
  }

  // ---- 冒险层 ----
  const screen = run.screen;
  switch (screen.kind) {
    case 'map': {
      const nodes = selectableNodes(run);
      if (nodes.length === 0) return null;
      if (kind === 'random') return { t: 'CHOOSE_NODE', node: rng.pick(nodes) };
      // greedy：血低找洞府，否则偏好战斗/事件
      const scored = nodes.map((id) => {
        const n = findNode(run, id)!;
        let s = 1;
        if (n.type === 'cave') s = run.hp < run.maxHp * 0.5 ? 10 : 2;
        if (n.type === 'battle') s = 4;
        if (n.type === 'event') s = 3;
        if (n.type === 'elite') s = run.hp > run.maxHp * 0.7 ? 5 : 0.5;
        if (n.type === 'shop') s = run.gold > 80 ? 4 : 1;
        return { id, s };
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
      if (!screen.goldTaken) return { t: 'TAKE_REWARD_GOLD' };
      if (screen.relic) return { t: 'TAKE_REWARD_RELIC' };
      if (screen.potion && run.potions.length < run.potionCap) return { t: 'TAKE_REWARD_POTION' };
      if (screen.cards) {
        if (kind === 'random') {
          return { t: 'PICK_REWARD_CARD', index: Math.floor(rng.next() * 4) - 1 };
        }
        // greedy：偏好攻击与稀有度；卡组过大后只收稀有以上（防稀释）
        const deckCap = run.deck.length >= 18;
        let bestIdx = -1, bestScore = deckCap ? 2.4 : 1.2; // 门槛：太差就跳过
        screen.cards.forEach((c, i) => {
          const def = getCard(c.cardId);
          const rarityScore = { starter: 0, common: 1, rare: 2, epic: 3, legendary: 4, curse: -5 }[def.rarity];
          const typeScore = def.type === 'attack' ? 1.5 : def.type === 'power' ? 1.2 : 1;
          const s = rarityScore * typeScore;
          if (s > bestScore) { bestScore = s; bestIdx = i; }
        });
        return { t: 'PICK_REWARD_CARD', index: bestIdx };
      }
      return { t: 'LEAVE_REWARD' };
    }
    case 'shop': {
      if (kind === 'greedy') {
        for (let i = 0; i < screen.items.length; i++) {
          const item = screen.items[i];
          if (item.sold) continue;
          const price = Math.floor(item.price * screen.discount);
          if (item.kind === 'relic' && run.gold >= price) return { t: 'BUY_ITEM', index: i };
          if (item.kind === 'potion' && run.gold >= price + 60 && run.potions.length < run.potionCap) return { t: 'BUY_ITEM', index: i };
        }
        // 删牌服务：优先删诅咒，其次删起始牌
        if (!screen.removeUsed && run.gold >= screen.removePrice) {
          const curse = run.deck.find((c) => getCard(c.cardId).type === 'curse');
          const starter = run.deck.find((c) => getCard(c.cardId).rarity === 'starter');
          const target = curse ?? (run.gold >= screen.removePrice + 50 ? starter : undefined);
          if (target) return { t: 'SHOP_REMOVE_CARD', uid: target.uid };
        }
      }
      return { t: 'LEAVE_SHOP' };
    }
    case 'event': {
      if (screen.resultText) return { t: 'LEAVE_EVENT' };
      const ev = getEvent(screen.eventId);
      const affordable = ev.options
        .map((o, i) => ({ o, i }))
        .filter(({ o }) => (!o.requireGold || run.gold >= o.requireGold) && (!o.requireRelic || run.relics.length > 0));
      if (affordable.length === 0) return { t: 'LEAVE_EVENT' };
      if (kind === 'random') return { t: 'EVENT_OPTION', option: rng.pick(affordable).i };
      // greedy：优先无风险选项
      const safe = affordable.find(({ o }) => !o.risky);
      return { t: 'EVENT_OPTION', option: (safe ?? affordable[0]).i };
    }
    case 'cave':
      if (kind === 'greedy' && run.hp > run.maxHp * 0.65 && run.deck.some((c) => !c.upgraded)) {
        return { t: 'CAVE_OPTION', option: 'upgrade' };
      }
      return { t: 'CAVE_OPTION', option: 'rest' };
    case 'cardPick': {
      if (screen.mode === 'remove') {
        // 删最差的牌：诅咒 > 起始防御 > 起始攻击
        const curse = run.deck.find((c) => getCard(c.cardId).type === 'curse');
        if (curse) return { t: 'PICK_CARD_SCREEN', uid: curse.uid };
        const starter = run.deck.find((c) => getCard(c.cardId).rarity === 'starter');
        if (starter) return { t: 'PICK_CARD_SCREEN', uid: starter.uid };
        return { t: 'PICK_CARD_SCREEN', uid: -1 };
      }
      // upgrade：升级费用最高的未参悟牌
      const cands = run.deck.filter((c) => !c.upgraded && getCard(c.cardId).type !== 'curse');
      if (cands.length === 0) return { t: 'PICK_CARD_SCREEN', uid: -1 };
      const best = cands.sort((a, x) => {
        const ca = getCard(a.cardId).cost, cx = getCard(x.cardId).cost;
        return (typeof cx === 'number' ? cx : 3) - (typeof ca === 'number' ? ca : 3);
      })[0];
      return { t: 'PICK_CARD_SCREEN', uid: best.uid };
    }
    case 'breakthrough': {
      if (kind === 'random') return { t: 'PICK_BREAKTHROUGH', id: rng.pick([...screen.options]) };
      // greedy：突破优先级
      const pref = ['jindanningcheng', 'wuxingtiaohe', 'roushenchengsheng', 'tianshengdaoti', 'jianxin_genji', 'houde_genji', 'yaowangchuancheng', 'dadaozhijian', 'shenshidazhang'];
      const sorted = [...screen.options].sort((a, b) => pref.indexOf(a) - pref.indexOf(b));
      return { t: 'PICK_BREAKTHROUGH', id: sorted[0] };
    }
    case 'end':
      return null;
    default:
      return null;
  }
}
