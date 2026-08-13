/**
 * 战斗引擎 v3 测试（策划案 §4 + types.ts 契约）
 * 覆盖：得气两段 / 滞气封锁 / 周天天人合一 / 克伐五动词 / 护体属性效率
 *       护体衰减 / 袖藏（含 sleeveBan）/ 灼烧减半 / 瘴毒行动触发 / 心魔投影
 *       气海储存 vs 炼气重置 / 雷灵劫雷 / 道雷问道 / 战斗内服丹丹毒
 */
import { describe, it, expect } from 'vitest';
import type { BattleState, EnemyMove, EnemyState, RunState } from './types';
import {
  startBattle, playCard, endTurn, resolveChoice, useElixirInBattle,
  makeCard, aliveEnemies, cardCost, canPlay, intentDamage, effectsOf, newUid,
} from './combat';
import { getEnemy } from '../data/enemies';
import { initRngState } from './rng';

// ---------- 最小 stub ----------

function makeRun(partial: Partial<RunState> = {}): RunState {
  return {
    seed: 'TEST', ascension: 0, act: 1, floor: 0, nodeId: null,
    realm: 'zhuji', hp: 80, maxHp: 80, gold: 0, lifespan: 60,
    demon: 0, toxin: 0, toxinMaxHpApplied: false, karma: 0,
    materials: { lingcao: 0, yusui: 0, yaodan: 0, leisha: 0 },
    recipes: [], elixirs: [], elixirCap: 4,
    deck: [], relics: [], fruits: [],
    poolCap: 6, drawPerTurn: 4, battleStartBlock: 0, flyUsed: 0,
    map: { act: 1, layers: [] },
    battle: null, screen: { kind: 'map' },
    rng: initRngState('TEST'),
    stats: {
      elitesKilled: 0, bossesKilled: 0, elixirsUsed: 0, cardsUpgraded: 0,
      damageTaken: 0, battles: 0, lifespanBurned: 0, brews: 0,
    },
    usedEvents: [], uidCounter: 0, flags: {}, gongdeBattles: 0, over: false,
    ...partial,
  };
}

function makeEnemyState(run: RunState, enemyId: string, over: Partial<EnemyState> = {}): EnemyState {
  const d = getEnemy(enemyId);
  return {
    uid: newUid(run), enemyId: d.id, name: d.name, element: d.element,
    hp: d.hp, maxHp: d.hp, block: 0, statuses: {}, moveIndex: 0,
    intent: null, zhiseCd: 0, flags: {}, ...over,
  };
}

function makeBattle(run: RunState, enemies: EnemyState[]): BattleState {
  const b: BattleState = {
    battleType: 'normal', outcome: 'ongoing',
    enemies, hand: [], drawPile: [], discardPile: [], exhaustPile: [],
    player: { block: 0, blockElement: 'none', energy: 10, statuses: {}, attackBuffs: [] },
    turn: 1, stance: null, shengBlocked: false, chain: [], tianren: false,
    zhoutianTriggered: false, zhoutianTotal: 0,
    sleeved: [], sleeveCapBonus: 0, lastPlayed: null, deqiCountTurn: 0,
    cardsPlayed: 0, attacksPlayed: 0, playedByElement: {},
    powers: [], huichunshuUses: 0, pendingChoice: null,
    wuxingDanNext: false, longhuBonus: 0, tianjiActive: false,
    waveIndex: -1, turnsTotal: 0, log: [],
  };
  run.battle = b;
  return b;
}

/** 把一张牌放进手牌，返回 uid */
function give(run: RunState, b: BattleState, cardId: string, upgraded = false): number {
  const c = makeCard(run, cardId, upgraded);
  b.hand.push(c);
  return c.uid;
}

/** 无害意图：enemyAct 走到底不产生任何效果 */
const NOOP: EnemyMove = { id: 'noop', name: '静默', kind: 'unknown' };

// ---------- 得气两段 ----------

describe('得气两段执行', () => {
  it('无行位时只结算基础段（御剑术 9 伤）', () => {
    const run = makeRun();
    const b = makeBattle(run, [makeEnemyState(run, 'zhiren')]); // 纸人 16 血，无属性
    playCard(run, b, give(run, b, 'yujianshu'));
    expect(b.enemies[0].hp).toBe(16 - 9);
    expect(b.deqiCountTurn).toBe(0);
    expect(b.stance).toBe('metal'); // 行位更新
  });

  it('行位相生时得气：sheng 段 bonusDamage 并入攻击（9+4）', () => {
    const run = makeRun();
    const b = makeBattle(run, [makeEnemyState(run, 'zhiren')]);
    b.stance = 'earth'; // 土生金
    playCard(run, b, give(run, b, 'yujianshu'));
    expect(b.enemies[0].hp).toBe(16 - 13);
    expect(b.deqiCountTurn).toBe(1);
    expect(b.chain).toEqual(['metal']);
  });

  it('得气段非攻击字段追加执行（火弹术灼烧 2+2）', () => {
    const run = makeRun();
    const b = makeBattle(run, [makeEnemyState(run, 'zhiren')]);
    b.stance = 'wood'; // 木生火
    playCard(run, b, give(run, b, 'huodanshu'));
    expect(b.enemies[0].statuses.zhuoshao).toBe(4);
  });

  it('双行牌按 dualPick 定行；得气时 a+b 皆得（润锋）', () => {
    const run = makeRun();
    const b = makeBattle(run, [makeEnemyState(run, 'zhiren')]);
    b.drawPile = [makeCard(run, 'shouzhong'), makeCard(run, 'shouzhong')];

    // 未得气：选 b（金）只得淬锋段，不抽牌
    playCard(run, b, give(run, b, 'runfeng'), undefined, 'b');
    expect(b.stance).toBe('metal');
    expect(b.player.attackBuffs).toEqual([{ bonus: 3, left: 1 }]);
    expect(b.hand.length).toBe(0);

    // 得气（金生水，选 a）：抽 1（a 段）+ 淬锋（b 段）皆得
    playCard(run, b, give(run, b, 'runfeng'), undefined, 'a');
    expect(b.deqiCountTurn).toBe(1);
    expect(b.hand.length).toBe(1);
  });

  it('贪嗔在手牌时攻击牌 −2 伤；因果债在手牌时封锁得气', () => {
    const run = makeRun();
    const b = makeBattle(run, [makeEnemyState(run, 'zhiren')]);
    give(run, b, 'tanchen');
    give(run, b, 'yinguozhai');
    b.stance = 'earth'; // 本应得气
    playCard(run, b, give(run, b, 'yujianshu'));
    expect(b.deqiCountTurn).toBe(0); // 因果债封锁
    expect(b.enemies[0].hp).toBe(16 - 7); // 9 − 2（贪嗔）
  });
});

// ---------- 滞气 ----------

describe('滞气封锁', () => {
  it('强逆行位后 shengBlocked；下一张有属性牌不得气并消耗封锁', () => {
    const run = makeRun();
    const b = makeBattle(run, [makeEnemyState(run, 'zhiren')]);
    b.stance = 'fire';
    // 水克火 → 强逆：结算完本牌后滞气
    playCard(run, b, give(run, b, 'yinlingjue'));
    expect(b.shengBlocked).toBe(true);
    expect(b.stance).toBe('water');
    expect(b.chain).toEqual(['water']); // 断链重开

    // 水生木本应得气（木遁 sheng 抽 1），被滞气吞掉
    b.drawPile = [makeCard(run, 'shouzhong')];
    playCard(run, b, give(run, b, 'mudun'));
    expect(b.hand.length).toBe(0); // 未抽牌
    expect(b.player.block).toBe(9);
    expect(b.shengBlocked).toBe(false); // 已消耗

    // 恢复正常：木生火再得气
    playCard(run, b, give(run, b, 'huodanshu'));
    expect(b.deqiCountTurn).toBe(1);
    expect(b.enemies[0].statuses.zhuoshao).toBe(4);
  });
});

// ---------- 周天 / 天人合一 ----------

describe('五行周天与天人合一', () => {
  it('顺生链覆盖 5 行触发周天：吐纳 +3 + tianren；下一张无视行位双段齐发', () => {
    const run = makeRun({ poolCap: 20 });
    const b = makeBattle(run, [makeEnemyState(run, 'zhiren', { hp: 99, maxHp: 99 })]);
    const seq = ['mudun', 'huodanshu', 'shouzhong', 'yujianshu', 'yinlingjue'];
    for (const id of seq) playCard(run, b, give(run, b, id));
    expect(b.zhoutianTriggered).toBe(true);
    expect(b.zhoutianTotal).toBe(1);
    expect(b.tianren).toBe(true);
    expect(new Set(b.chain).size).toBe(5);
    // 能量：10 − 5 费 + 周天 3 + 引灵诀 2 = 10
    expect(b.player.energy).toBe(10);

    // 天人合一：水行位打火牌（非顺生）仍双段齐发
    const zhuoBefore = b.enemies[0].statuses.zhuoshao ?? 0;
    playCard(run, b, give(run, b, 'huodanshu'));
    expect((b.enemies[0].statuses.zhuoshao ?? 0) - zhuoBefore).toBe(4);
    expect(b.tianren).toBe(false); // 消耗后清除

    // 每回合限 1 次：再凑一圈不再触发
    expect(b.zhoutianTriggered).toBe(true);
  });
});

// ---------- 克伐五动词 ----------

describe('克伐五动词', () => {
  it('剪伐（金克木）：移除至多 2 层增益，每层此击 +4', () => {
    const run = makeRun();
    const yehu = makeEnemyState(run, 'yehu'); // 木，36 血
    yehu.statuses.gangqi = 2;
    const b = makeBattle(run, [yehu]);
    playCard(run, b, give(run, b, 'yujianshu'));
    expect(yehu.statuses.gangqi).toBeUndefined();
    expect(yehu.hp).toBe(36 - (9 + 8));
  });

  it('破土（木克土）：敌护体减半且本回合无法获得护体', () => {
    const run = makeRun();
    const tiaoshi = makeEnemyState(run, 'tiaoshi', { block: 9 }); // 土，60 血
    const b = makeBattle(run, [tiaoshi]);
    playCard(run, b, give(run, b, 'tengmanfu')); // 木攻 6
    expect(tiaoshi.flags['noBlock']).toBe(1);
    // 护体 9 → 减半 4 → 挡 4 → 掉血 2
    expect(tiaoshi.block).toBe(0);
    expect(tiaoshi.hp).toBe(60 - 2);
  });

  it('滞涩（土克水）：意图延迟 1 回合，每 2 回合限 1 次', () => {
    const run = makeRun();
    const yinfeng = makeEnemyState(run, 'yinfeng'); // 水，38 血
    yinfeng.intent = { id: 'yinxi', name: '阴袭', kind: 'attack', damage: 6 };
    const b = makeBattle(run, [yinfeng]);
    playCard(run, b, give(run, b, 'luoshi')); // 土攻 7
    expect(yinfeng.flags['zhise']).toBe(1);
    expect(yinfeng.zhiseCd).toBe(2);
    expect(yinfeng.hp).toBe(38 - 7);
    // 冷却期内再克不再滞涩
    playCard(run, b, give(run, b, 'luoshi'));
    expect(yinfeng.zhiseCd).toBe(2);
    // 敌方回合：意图被跳过，玩家未受伤
    endTurn(run, b);
    expect(run.hp).toBe(80);
  });

  it('浇熄（水克火）：蓄力中取消蓄力改普通行动；否则移 1 层增益', () => {
    const run = makeRun();
    // 蓄力分支
    const a = makeEnemyState(run, 'denglonggui'); // 火，42 血
    a.intent = { id: 'xuli', name: '蓄力', kind: 'charge' };
    const b1 = makeBattle(run, [a]);
    playCard(run, b1, give(run, b1, 'xuanbingci')); // 水攻 8
    expect(a.intent?.kind).toBe('attack'); // 改普通行动
    expect(a.hp).toBe(42 - 8);
    // 非蓄力分支：移 1 层增益
    const c = makeEnemyState(run, 'denglonggui');
    c.statuses.gangqi = 2;
    c.intent = { id: 'ranyan', name: '燃焰', kind: 'attack', damage: 6 };
    const b2 = makeBattle(run, [c]);
    playCard(run, b2, give(run, b2, 'xuanbingci'));
    expect(c.statuses.gangqi).toBe(1);
  });

  it('熔锻（火克金）：此击 50% 无视护体并施加软化', () => {
    const run = makeRun();
    const shanxiao = makeEnemyState(run, 'shanxiao', { block: 10 }); // 金，64 血
    const b = makeBattle(run, [shanxiao]);
    playCard(run, b, give(run, b, 'huodanshu')); // 火攻 6：3 直击 + 3 被挡
    expect(shanxiao.hp).toBe(64 - 3);
    expect(shanxiao.block).toBe(7);
    expect(shanxiao.statuses.ruanhua).toBe(1);
  });
});

// ---------- 护体属性效率 ----------

describe('护体属性双向生克（§4.4 ⑤）', () => {
  function attackMe(blockElem: 'fire' | 'earth' | 'none', block: number) {
    const run = makeRun();
    const shuigui = makeEnemyState(run, 'shuigui'); // 水攻
    shuigui.intent = { id: 'tuozhuai1', name: '拖拽', kind: 'attack', damage: 9 };
    const b = makeBattle(run, [shuigui]);
    b.player.block = block;
    b.player.blockElement = blockElem;
    endTurn(run, b);
    return run;
  }

  it('敌攻克护体 2:1：水攻 9 vs 火护体 10 → 只吸 5，掉 4 血', () => {
    const run = attackMe('fire', 10);
    expect(run.hp).toBe(80 - 4);
  });

  it('护体克敌攻 1:2：水攻 9 vs 土护体 6 → 全部吸收不掉血', () => {
    const run = attackMe('earth', 6);
    expect(run.hp).toBe(80);
    expect(run.stats.damageTaken).toBe(0);
  });

  it('无属性 1:1：水攻 9 vs 无属性护体 5 → 掉 4 血', () => {
    const run = attackMe('none', 5);
    expect(run.hp).toBe(80 - 4);
  });
});

// ---------- 护体衰减 ----------

describe('护体衰减', () => {
  it('敌方全部行动后玩家护体减半（向下取整）；敌人护体同步减半', () => {
    const run = makeRun();
    const shuigui = makeEnemyState(run, 'shuigui', { block: 10 });
    shuigui.intent = { id: 'qianshui', name: '潜水', kind: 'defend', block: 10 };
    const b = makeBattle(run, [shuigui]);
    b.player.block = 10;
    endTurn(run, b);
    expect(b.player.block).toBe(5);
    expect(shuigui.block).toBe(15); // 旧 10 减半 5 + 本回合新增 10
  });

  it('retainBlock（龟息丹等）消耗一次跳过衰减', () => {
    const run = makeRun();
    const yehu = makeEnemyState(run, 'yehu');
    yehu.intent = NOOP;
    const b = makeBattle(run, [yehu]);
    b.player.block = 10;
    b.player.statuses.retainBlock = 1;
    endTurn(run, b);
    expect(b.player.block).toBe(10);
    expect(b.player.statuses.retainBlock).toBeUndefined();
  });
});

// ---------- 袖藏 ----------

describe('袖藏（END_TURN sleeveUids）', () => {
  it('上限 1；诅咒不可袖藏；下回合先入手', () => {
    const run = makeRun();
    const yehu = makeEnemyState(run, 'yehu');
    yehu.intent = NOOP;
    const b = makeBattle(run, [yehu]);
    const curse = give(run, b, 'chenyuan');
    const c1 = give(run, b, 'yujianshu');
    const c2 = give(run, b, 'shouzhong');
    // 填满下回合抽牌，避免弃牌堆被洗回
    for (let i = 0; i < 4; i++) b.drawPile.push(makeCard(run, 'mudun'));
    endTurn(run, b, [curse, c1, c2]);
    // 只有 c1 袖藏成功（诅咒跳过，上限 1 截断 c2），并已在新回合入手
    expect(b.sleeved.length).toBe(0);
    expect(b.hand.map((c) => c.uid)).toContain(c1);
    expect(b.hand.map((c) => c.uid)).not.toContain(c2);
    expect(b.discardPile.map((c) => c.uid)).toEqual(expect.arrayContaining([curse, c2]));
  });

  it('sleeveBan 时禁袖藏，且按回合衰减', () => {
    const run = makeRun();
    const yehu = makeEnemyState(run, 'yehu');
    yehu.intent = NOOP;
    const b = makeBattle(run, [yehu]);
    const c1 = give(run, b, 'yujianshu');
    b.player.statuses.sleeveBan = 1;
    for (let i = 0; i < 4; i++) b.drawPile.push(makeCard(run, 'mudun'));
    endTurn(run, b, [c1]);
    expect(b.hand.map((c) => c.uid)).not.toContain(c1);
    expect(b.discardPile.map((c) => c.uid)).toContain(c1);
    expect(b.player.statuses.sleeveBan).toBeUndefined(); // 衰减归零
  });
});

// ---------- 状态结算 ----------

describe('状态 v3', () => {
  it('灼烧（玩家）：回合结束受层数真伤后减半向下', () => {
    const run = makeRun();
    const yehu = makeEnemyState(run, 'yehu');
    yehu.intent = NOOP;
    const b = makeBattle(run, [yehu]);
    b.player.statuses.zhuoshao = 5;
    endTurn(run, b);
    expect(run.hp).toBe(80 - 5);
    expect(b.player.statuses.zhuoshao).toBe(2);
  });

  it('灼烧（敌）：其回合结束受层数真伤后减半向下', () => {
    const run = makeRun();
    const deng = makeEnemyState(run, 'denglonggui'); // 42 血
    deng.statuses.zhuoshao = 5;
    deng.intent = NOOP;
    const b = makeBattle(run, [deng]);
    endTurn(run, b);
    expect(deng.hp).toBe(42 - 5);
    expect(deng.statuses.zhuoshao).toBe(2);
  });

  it('瘴毒：敌每次行动后受层数伤，其回合结束 −1', () => {
    const run = makeRun();
    const deng = makeEnemyState(run, 'denglonggui');
    deng.statuses.zhangdu = 3;
    deng.intent = NOOP;
    const b = makeBattle(run, [deng]);
    endTurn(run, b);
    expect(deng.hp).toBe(42 - 3);
    expect(deng.statuses.zhangdu).toBe(2);
  });
});

// ---------- 心魔投影 ----------

describe('心魔投影（startBattle）', () => {
  function curseCount(run: RunState): Record<string, number> {
    const b = run.battle!;
    const all = [...b.hand, ...b.drawPile, ...b.discardPile];
    const out: Record<string, number> = {};
    for (const c of all) out[c.cardId] = (out[c.cardId] ?? 0) + 1;
    return out;
  }

  it('心魔 5：尘缘 + 业障 各 1 张', () => {
    const run = makeRun({ demon: 5, deck: [] });
    for (let i = 0; i < 5; i++) run.deck.push(makeCard(run, 'yujianshu'));
    startBattle(run, 'normal', ['zhiren']);
    const c = curseCount(run);
    expect(c['chenyuan']).toBe(1);
    expect(c['yezhang']).toBe(1);
    expect(c['tanchen']).toBeUndefined();
  });

  it('心魔 9：四种诅咒各 1 张；心魔 2：无诅咒', () => {
    const run9 = makeRun({ demon: 9 });
    for (let i = 0; i < 5; i++) run9.deck.push(makeCard(run9, 'yujianshu'));
    startBattle(run9, 'normal', ['zhiren']);
    const c9 = curseCount(run9);
    expect(c9['chenyuan']).toBe(1);
    expect(c9['yezhang']).toBe(1);
    expect(c9['tanchen']).toBe(1);
    expect(c9['xinmo_curse']).toBe(1);

    const run2 = makeRun({ demon: 2 });
    for (let i = 0; i < 5; i++) run2.deck.push(makeCard(run2, 'yujianshu'));
    startBattle(run2, 'normal', ['zhiren']);
    const c2 = curseCount(run2);
    expect(c2['chenyuan']).toBeUndefined();
  });

  it('丹毒 ≥4：开战受 2 真伤', () => {
    const run = makeRun({ toxin: 4 });
    run.deck.push(makeCard(run, 'yujianshu'));
    startBattle(run, 'normal', ['zhiren']);
    expect(run.hp).toBe(78);
  });
});

// ---------- 吐纳：气海储存 vs 炼气重置 ----------

describe('吐纳（§4.2）', () => {
  function nextTurnEnergy(realm: 'lianqi' | 'zhuji', startEnergy: number, poolCap = 6): number {
    const run = makeRun({ realm, poolCap });
    const yehu = makeEnemyState(run, 'yehu');
    yehu.intent = NOOP;
    const b = makeBattle(run, [yehu]);
    b.player.energy = startEnergy;
    endTurn(run, b);
    return b.player.energy;
  }

  it('炼气：每回合重置为 4，不储存', () => {
    expect(nextTurnEnergy('lianqi', 3)).toBe(4);
    expect(nextTurnEnergy('lianqi', 9)).toBe(4);
  });

  it('筑基起：energy = min(poolCap, energy + 4)，跨回合储存', () => {
    expect(nextTurnEnergy('zhuji', 0)).toBe(4);
    expect(nextTurnEnergy('zhuji', 3)).toBe(6); // 3+4 → 夹到气海上限 6
    expect(nextTurnEnergy('zhuji', 1, 8)).toBe(5);
  });
});

// ---------- 雷灵傀儡劫雷 ----------

describe('雷灵傀儡（幕一 Boss）', () => {
  it('第 4 回合劫雷 22，提前一回合明示', () => {
    const run = makeRun();
    const boss = makeEnemyState(run, 'leiling_kuilei');
    boss.intent = NOOP;
    const b = makeBattle(run, [boss]);
    b.turn = 3;
    endTurn(run, b); // 敌方回合末声明下回合（第 4 回合）意图
    expect(b.turn).toBe(4);
    expect(boss.intent?.special).toBe('jielei');
    expect(boss.intent?.damage).toBe(22);
    expect(intentDamage(b, boss)).toBe(22);
    // 劫雷落下
    endTurn(run, b);
    expect(run.hp).toBe(80 - 22);
  });

  it('第 8 回合劫雷 30', () => {
    const run = makeRun();
    const boss = makeEnemyState(run, 'leiling_kuilei');
    boss.intent = NOOP;
    const b = makeBattle(run, [boss]);
    b.turn = 7;
    endTurn(run, b);
    expect(boss.intent?.special).toBe('jielei');
    expect(boss.intent?.damage).toBe(30);
  });
});

// ---------- 道雷问道 ----------

describe('道雷（九重天劫第九道）', () => {
  function makeDaolei(run: RunState, turns: number): EnemyState {
    return makeEnemyState(run, 'jiuchongtianjie', {
      enemyId: 'daolei', name: '第九道·道雷', element: 'none',
      hp: 170, maxHp: 170, flags: { wave: 8, turns, dmgBonus: 0 },
    });
  }

  it('每第 3 回合声明问道；执行时弹 dilemma（弃 3 或受 20）', () => {
    const run = makeRun();
    const daolei = makeDaolei(run, 2);
    daolei.intent = NOOP;
    const b = makeBattle(run, [daolei]);
    b.waveIndex = 8;
    endTurn(run, b); // turns 2→3 → 声明问道
    expect(daolei.intent?.special).toBe('wendao');

    endTurn(run, b); // 问道执行
    expect(b.pendingChoice?.kind).toBe('dilemma');
    expect(b.pendingChoice?.data?.['discard']).toBe(3);
    expect(b.pendingChoice?.data?.['damage']).toBe(20);

    // 选受伤
    resolveChoice(run, b, [1]);
    expect(run.hp).toBe(80 - 20);
    expect(b.pendingChoice).toBeNull();
  });

  it('问道选弃牌：随机弃 3 张', () => {
    const run = makeRun();
    const daolei = makeDaolei(run, 3);
    const b = makeBattle(run, [daolei]);
    b.waveIndex = 8;
    daolei.intent = { id: 'wendao', name: '问道', kind: 'unknown', special: 'wendao' };
    // 下回合抽 4 张用来弃
    b.drawPile = ['yujianshu', 'shouzhong', 'mudun', 'luoshi'].map((id) => makeCard(run, id));
    endTurn(run, b);
    expect(b.pendingChoice?.kind).toBe('dilemma');
    expect(b.hand.length).toBe(4);
    resolveChoice(run, b, [0]);
    expect(b.hand.length).toBe(1);
    expect(run.hp).toBe(80);
  });
});

// ---------- 战斗内服丹 ----------

describe('战斗内服丹（§7.3）', () => {
  it('服丹累计丹毒并计入 stats；丹从丹盒移除', () => {
    const run = makeRun({ hp: 50, elixirs: ['huiyuandan'] });
    const b = makeBattle(run, [makeEnemyState(run, 'zhiren')]);
    useElixirInBattle(run, b, 'huiyuandan');
    expect(run.hp).toBe(68); // 回 18
    expect(run.toxin).toBe(1);
    expect(run.stats.elixirsUsed).toBe(1);
    expect(run.elixirs).toEqual([]);
  });

  it('清心丹：净清 2 丹毒 + 心魔 −1 + 移除负面', () => {
    const run = makeRun({ demon: 3, toxin: 5, elixirs: ['qingxindan'] });
    const b = makeBattle(run, [makeEnemyState(run, 'zhiren')]);
    b.player.statuses.qizhi = 2;
    useElixirInBattle(run, b, 'qingxindan');
    expect(run.toxin).toBe(3);
    expect(run.demon).toBe(2);
    expect(b.player.statuses.qizhi).toBeUndefined();
  });

  it('五行丹：下一张牌必得气（无视行位）', () => {
    const run = makeRun({ elixirs: ['wuxingdan'] });
    const b = makeBattle(run, [makeEnemyState(run, 'zhiren')]);
    useElixirInBattle(run, b, 'wuxingdan');
    expect(b.wuxingDanNext).toBe(true);
    playCard(run, b, give(run, b, 'yujianshu')); // 无行位仍得气
    expect(b.enemies[0].hp).toBe(16 - 13);
    expect(b.wuxingDanNext).toBe(false);
  });

  it('道果药王鼎：服丹后抽 1', () => {
    const run = makeRun({ fruits: ['yaowangding'], elixirs: ['julingdan'] });
    const b = makeBattle(run, [makeEnemyState(run, 'zhiren')]);
    b.player.energy = 0;
    b.drawPile = [makeCard(run, 'yujianshu')];
    useElixirInBattle(run, b, 'julingdan');
    expect(b.player.energy).toBe(3);
    expect(b.hand.length).toBe(1);
  });
});

// ---------- 保留导出的行为 ----------

describe('导出 API', () => {
  it('cardCost：X 费 = 当前灵气；canPlay 拒绝不可打诅咒', () => {
    const run = makeRun();
    const b = makeBattle(run, [makeEnemyState(run, 'zhiren')]);
    b.player.energy = 3;
    const x = makeCard(run, 'yinghuoshouxin');
    expect(cardCost(run, b, x)).toBe(3);
    const curse = makeCard(run, 'chenyuan');
    b.hand.push(curse);
    expect(canPlay(run, b, curse)).toBe(false);
    const yezhang = makeCard(run, 'yezhang');
    b.hand.push(yezhang);
    expect(canPlay(run, b, yezhang)).toBe(true); // 可打出诅咒
  });

  it('effectsOf：按 upgraded 取 upBase/upSheng', () => {
    const run = makeRun();
    const plain = makeCard(run, 'yujianshu');
    const up = makeCard(run, 'yujianshu', true);
    expect(effectsOf(plain).base.damage).toBe(9);
    expect(effectsOf(plain).sheng?.bonusDamage).toBe(4);
    expect(effectsOf(up).base.damage).toBe(12);
    expect(effectsOf(up).sheng?.bonusDamage).toBe(5);
  });

  it('aliveEnemies 过滤死亡敌人；击杀全部则胜利', () => {
    const run = makeRun();
    const zhiren = makeEnemyState(run, 'zhiren', { hp: 5, maxHp: 5 });
    const b = makeBattle(run, [zhiren]);
    playCard(run, b, give(run, b, 'yujianshu'));
    expect(aliveEnemies(b).length).toBe(0);
    expect(b.outcome).toBe('victory');
  });
});
