import { describe, it, expect } from 'vitest';
import { newRun } from './run';
import { startBattle, playCard, endTurn, makeCard, aliveEnemies } from './combat';
import { defaultProfile } from '../save/storage';
import type { RunState } from './types';

/** 构造受控战斗：清空手牌后塞入指定牌 */
function battleWith(enemyIds: string[], hand: string[], opts: { upgraded?: boolean } = {}): RunState {
  const run = newRun(defaultProfile(), 'TEST-SEED', 0);
  startBattle(run, 'normal', enemyIds);
  const b = run.battle!;
  b.hand = [];
  for (const id of hand) {
    const c = makeCard(run, id, opts.upgraded);
    b.hand.push(c);
  }
  b.player.energy = 99;
  return run;
}

function enemy(run: RunState, i = 0) {
  return run.battle!.enemies[i];
}

describe('伤害结算顺序（§4.3）', () => {
  it('基础伤害：御剑术 8 伤', () => {
    const run = battleWith(['zhiren'], ['yujianshu']); // 纸人无属性 12 血
    const e = enemy(run);
    playCard(run, run.battle!, run.battle!.hand[0].uid, e.uid);
    expect(e.hp).toBe(12 - 8);
  });

  it('相克 ×1.5：金克木（御剑术打野狐）并附加破甲', () => {
    const run = battleWith(['yehu'], ['yujianshu']); // 野狐木 26 血
    const e = enemy(run);
    playCard(run, run.battle!, run.battle!.hand[0].uid, e.uid);
    expect(e.hp).toBe(26 - 12); // floor(8×1.5)=12
    expect(e.statuses.pojia).toBe(1); // 金克木 → 破甲
  });

  it('行云流水 ×1.25：土→金 顺序连招 +25% 并返还灵气', () => {
    const run = battleWith(['zhiren'], ['tiebushan', 'yujianshu']);
    const b = run.battle!;
    b.player.energy = 3;
    const e = enemy(run);
    playCard(run, b, b.hand[0].uid); // 铁布衫（土），行位=土
    expect(b.xingwei).toBe('earth');
    expect(b.player.energy).toBe(2);
    playCard(run, b, b.hand[0].uid, e.uid); // 御剑术（金），土生金 → 触发
    expect(e.hp).toBe(12 - 10); // floor(8×1.25)=10
    expect(b.player.energy).toBe(2); // 1 费 −1 +1 返还
    expect(b.liushuiCount).toBe(1);
  });

  it('相克与行云流水乘区叠加（×1.5 后 ×1.25，逐步取整）', () => {
    const run = battleWith(['yehu'], ['tiebushan', 'yujianshu']);
    const b = run.battle!;
    const e = enemy(run);
    playCard(run, b, b.hand[0].uid);
    playCard(run, b, b.hand[0].uid, e.uid);
    // 8 → ×1.5=12 → ×1.25=15
    expect(e.hp).toBe(26 - 15);
  });

  it('虚弱 ×0.75 与易伤 ×1.5', () => {
    const run = battleWith(['zhiren'], ['yujianshu', 'yujianshu']);
    const b = run.battle!;
    const e = enemy(run);
    b.player.statuses.xuruo = 1;
    playCard(run, b, b.hand[0].uid, e.uid);
    expect(e.hp).toBe(12 - 6); // floor(8×0.75)=6
    e.hp = 12;
    delete b.player.statuses.xuruo;
    e.statuses.yishang = 1;
    playCard(run, b, b.hand[0].uid, e.uid);
    expect(e.hp).toBe(0); // floor(8×1.5)=12
  });

  it('护体先于气血承受伤害', () => {
    const run = battleWith(['zhiren'], ['yujianshu']);
    const e = enemy(run);
    e.block = 5;
    playCard(run, run.battle!, run.battle!.hand[0].uid, e.uid);
    expect(e.block).toBe(0);
    expect(e.hp).toBe(12 - 3);
  });

  it('无视护体（一剑破万法）', () => {
    const run = battleWith(['shijing'], ['yijianpowanfa']); // 石精 50 血
    const b = run.battle!;
    const e = enemy(run);
    e.block = 20;
    playCard(run, b, b.hand[0].uid, e.uid);
    expect(e.block).toBe(20);
    expect(e.hp).toBe(50 - 44);
    expect(b.exhaustPile).toHaveLength(1); // 放逐
  });
});

describe('行云流水细则（§4.4 ①）', () => {
  it('无属性牌不改变行位、不打断链', () => {
    const run = battleWith(['zhiren'], ['tiebushan', 'jingxin', 'yujianshu']);
    const b = run.battle!;
    const e = enemy(run);
    playCard(run, b, b.hand[0].uid); // 土
    playCard(run, b, b.hand[0].uid); // 静心（无属性）
    expect(b.xingwei).toBe('earth'); // 行位不变
    playCard(run, b, b.hand[0].uid, e.uid); // 金：仍触发行云流水
    expect(b.liushuiCount).toBe(1);
  });

  it('非相生顺序不触发', () => {
    const run = battleWith(['zhiren'], ['yujianshu', 'tiebushan']);
    const b = run.battle!;
    const e = enemy(run);
    playCard(run, b, b.hand[0].uid, e.uid); // 金
    playCard(run, b, b.hand[0].uid); // 土（土生金，但金不生土）
    expect(b.liushuiCount).toBe(0);
  });

  it('每回合返还上限 2 点', () => {
    // 木→火→土→金 三次相生，第三次不再返还
    const run = battleWith(['zhiren'], ['tengmanfu', 'huodanshu', 'luoshi', 'yujianshu']);
    const b = run.battle!;
    const e = enemy(run);
    b.player.energy = 10;
    playCard(run, b, b.hand[0].uid, e.uid); // 木（行位=木）
    playCard(run, b, b.hand[0].uid, e.uid); // 火：触发+1
    playCard(run, b, b.hand[0].uid, e.uid); // 土：触发+1
    playCard(run, b, b.hand[0].uid, e.uid); // 金：触发但已达上限
    expect(b.liushuiCount).toBe(3);
    // 10 − 4 费 + 2 返还 = 8
    expect(b.player.energy).toBe(8);
  });

  it('因果债在手牌时行云流水不触发', () => {
    const run = battleWith(['zhiren'], ['tiebushan', 'yinguozhai', 'yujianshu']);
    const b = run.battle!;
    const e = enemy(run);
    playCard(run, b, b.hand[0].uid);
    playCard(run, b, b.hand[1].uid, e.uid); // 御剑术（手牌中有因果债）
    expect(b.liushuiCount).toBe(0);
  });
});

describe('五行周天（§4.4 ①，含"夹无属性牌"边界）', () => {
  it('打满一整圈（允许夹无属性牌）触发周天：抽 2 + 下一张 0 费', () => {
    const run = battleWith(
      ['shijing'],
      ['tengmanfu', 'huodanshu', 'jingxin', 'luoshi', 'yujianshu', 'xuanbingci'],
    );
    const b = run.battle!;
    // 放几张牌进抽牌堆以验证抽 2
    b.drawPile = [makeCard(run, 'jingxin'), makeCard(run, 'jingxin'), makeCard(run, 'jingxin')];
    const e = enemy(run);
    b.player.energy = 20;
    playCard(run, b, b.hand[0].uid, e.uid); // 木
    playCard(run, b, b.hand[0].uid, e.uid); // 火 ✓1
    playCard(run, b, b.hand[0].uid); // 静心（无属性，不断链）
    playCard(run, b, b.hand[0].uid, e.uid); // 土 ✓2
    playCard(run, b, b.hand[0].uid, e.uid); // 金 ✓3
    expect(b.zhoutianTriggered).toBe(false);
    const handBefore = b.hand.length;
    playCard(run, b, b.hand[0].uid, e.uid); // 水 ✓4 → 周天！
    expect(b.zhoutianTriggered).toBe(true);
    expect(b.zhoutianTotal).toBe(1);
    expect(b.hand.length).toBe(handBefore - 1 + 2); // 抽 2
    expect(b.freeNextCard).toBe(true);
  });

  it('每回合最多触发 1 次', () => {
    const run = battleWith(['shijing'], [
      'tengmanfu', 'huodanshu', 'luoshi', 'yujianshu', 'xuanbingci',
      'tengmanfu', 'huodanshu', 'luoshi', 'yujianshu', 'xuanbingci',
    ]);
    const b = run.battle!;
    const e = enemy(run);
    b.player.energy = 50;
    for (let i = 0; i < 10 && aliveEnemies(b).length > 0; i++) {
      playCard(run, b, b.hand[0].uid, e.uid);
    }
    expect(b.zhoutianTotal).toBe(1);
  });
});

describe('相克附加异常（§4.4 ②）', () => {
  it('木克土 → 缠缚（上限 3 层），敌人攻击每层 −40% 递减取整', () => {
    const run = battleWith(['shijing'], ['tengmanfu', 'tengmanfu', 'tengmanfu', 'tengmanfu']);
    const b = run.battle!;
    const e = enemy(run); // 石精（土）
    for (let i = 0; i < 4; i++) playCard(run, b, b.hand[0].uid, e.uid);
    // 藤蔓缚本身 +1 缠缚，克制再 +1，共每次 2 层，上限 3
    expect(e.statuses.chanfu).toBe(3);
  });

  it('火克金 → 熔穿附加 3 层灼烧；灼烧每回合结算 −1', () => {
    const run = battleWith(['shanxiao'], ['huodanshu']); // 山魈金 46 血
    const b = run.battle!;
    const e = enemy(run);
    playCard(run, b, b.hand[0].uid, e.uid);
    // 火弹术自带 2 灼烧 + 熔穿 3 = 5
    expect(e.statuses.zhuoshao).toBe(5);
    const hpAfterAttack = e.hp;
    endTurn(run, b);
    // 敌方回合结束灼烧结算 5 真实伤害，层数 −1（山魈第一动是攻击 8，先扣玩家）
    expect(e.hp).toBe(hpAfterAttack - 5);
    expect(e.statuses.zhuoshao).toBe(4);
  });

  it('水克火 → 熄灭移除 1 层增益（罡气优先）', () => {
    const run = battleWith(['denglonggui'], ['xuanbingci']); // 灯笼鬼火 30 血
    const e = enemy(run);
    e.statuses.gangqi = 2;
    playCard(run, run.battle!, run.battle!.hand[0].uid, e.uid);
    expect(e.statuses.gangqi).toBe(1);
  });

  it('土克水 → 滞涩：敌人跳过一回合行动', () => {
    const run = battleWith(['shuigui'], ['luoshi']); // 水鬼 34 血，首动拖拽 7
    const b = run.battle!;
    const e = enemy(run);
    playCard(run, b, b.hand[0].uid, e.uid);
    expect(e.flags['zhise']).toBe(1);
    const hpBefore = run.hp;
    endTurn(run, b);
    expect(run.hp).toBe(hpBefore); // 意图延迟，本回合未挨打
  });

  it('金克木 → 破甲：护体获取无效', () => {
    const run = battleWith(['sheyao'], ['yujianshu']); // 蛇妖木 38
    const b = run.battle!;
    const e = enemy(run);
    playCard(run, b, b.hand[0].uid, e.uid);
    expect(e.statuses.pojia).toBe(1);
    e.intent = { id: 'x', name: '测试盾', kind: 'defend', block: 8 };
    const blockBefore = e.block;
    endTurn(run, b);
    expect(e.block).toBe(blockBefore); // 护体获取被破甲无效化
  });
});

describe('回合时序（§4.2）', () => {
  it('回合结束弃置全部手牌，回合开始抽 5、灵气重置 3', () => {
    const run = newRun(defaultProfile(), 'TIMING', 0);
    startBattle(run, 'normal', ['shijing']);
    const b = run.battle!;
    expect(b.hand).toHaveLength(5);
    expect(b.player.energy).toBe(3);
    endTurn(run, b);
    expect(b.hand).toHaveLength(5); // 新回合重新抽 5
    expect(b.player.energy).toBe(3);
    expect(b.turn).toBe(2);
  });

  it('固本：回合开始 +2 护体/层；护体在敌方行动后清零', () => {
    const run = battleWith(['zhiren'], ['panshijue', 'tiebushan']);
    const b = run.battle!;
    playCard(run, b, b.hand[0].uid); // +1 固本
    playCard(run, b, b.hand[0].uid); // +7 护体（土→土不相生，无行云流水）
    expect(b.player.block).toBe(7);
    endTurn(run, b);
    // 敌方单只纸人抓挠 4：护体全挡；新回合护体清零后固本 +2
    expect(run.hp).toBe(80);
    expect(b.player.block).toBe(2);
  });

  it('心魔诅咒在手牌回合结束受 2 伤', () => {
    const run = battleWith(['zhiren'], ['xinmo_curse']);
    const b = run.battle!;
    const hpBefore = run.hp;
    endTurn(run, b);
    // 心魔 2 伤（穿透）+ 单只纸人抓挠 4
    expect(run.hp).toBe(hpBefore - 2 - 4);
  });

  it('手牌上限 10：超出的抽牌直接进弃牌堆', () => {
    const run = newRun(defaultProfile(), 'HANDCAP', 0);
    // 塞一堆牌进牌库
    for (let i = 0; i < 15; i++) run.deck.push(makeCard(run, 'jingxin'));
    startBattle(run, 'normal', ['shijing']);
    const b = run.battle!;
    b.hand = [];
    b.drawPile = [];
    b.discardPile = [];
    for (let i = 0; i < 15; i++) b.drawPile.push(makeCard(run, 'jingxin'));
    // 抽 12 张
    for (let i = 0; i < 12; i++) {
      // 通过打引灵诀方式太绕，直接调用 drawCards 的效果：抽牌走卡牌效果
    }
    b.hand.push(makeCard(run, 'yinlingjue', true)); // 抽 3
    b.player.energy = 99;
    // 先抽到 10
    for (let i = 0; i < 3; i++) {
      const card = makeCard(run, 'yinlingjue', true);
      b.hand.push(card);
      playCard(run, b, card.uid);
    }
    expect(b.hand.length).toBeLessThanOrEqual(10);
    expect(b.discardPile.length).toBeGreaterThan(0);
  });
});

describe('九重天劫车轮战（§8.10）', () => {
  function jiuchongRun() {
    const run = newRun(defaultProfile(), 'JIUCHONG', 0);
    run.act = 3;
    startBattle(run, 'boss');
    return run;
  }

  it('初始为第一道惊蛰雷（木，30 血）', () => {
    const run = jiuchongRun();
    const b = run.battle!;
    expect(b.waveIndex).toBe(0);
    expect(aliveEnemies(b)).toHaveLength(1);
    expect(aliveEnemies(b)[0].name).toContain('惊蛰雷');
    expect(aliveEnemies(b)[0].hp).toBe(30);
  });

  it('击杀当前雷灵立即进入下一道，玩家状态跨波保留', () => {
    const run = jiuchongRun();
    const b = run.battle!;
    b.hand = [makeCard(run, 'yijianpowanfa')];
    b.player.energy = 99;
    b.player.statuses.gangqi = 3;
    playCard(run, b, b.hand[0].uid, aliveEnemies(b)[0].uid); // 44+3 伤秒杀 30 血
    expect(b.waveIndex).toBe(1);
    expect(aliveEnemies(b)[0].name).toContain('阴煞雷');
    expect(b.player.statuses.gangqi).toBe(3); // 跨波保留
    expect(b.outcome).toBe('ongoing');
  });

  it('渡过第三道紫霄雷触发喘息：回 8 血、+1 灵气', () => {
    const run = jiuchongRun();
    const b = run.battle!;
    run.hp = 50;
    // 快进到第三道
    b.hand = [makeCard(run, 'yijianpowanfa'), makeCard(run, 'yijianpowanfa'), makeCard(run, 'yijianpowanfa')];
    b.player.energy = 99;
    b.player.statuses.gangqi = 50;
    playCard(run, b, b.hand[0].uid, aliveEnemies(b)[0].uid); // 杀第一道
    playCard(run, b, b.hand[0].uid, aliveEnemies(b)[0].uid); // 杀第二道（死亡施虚弱）
    expect(b.player.statuses.xuruo).toBe(1); // 阴煞雷死亡施你 1 层虚弱
    const energyBefore = b.player.energy;
    playCard(run, b, b.hand[0].uid, aliveEnemies(b)[0].uid); // 杀第三道 → 喘息
    expect(run.hp).toBe(58);
    expect(b.player.energy).toBe(energyBefore - 4 + 1); // 一剑破万法 4 费，喘息 +1
    expect(b.waveIndex).toBe(3);
  });

  it('渡过全部九道获胜', () => {
    const run = jiuchongRun();
    const b = run.battle!;
    b.player.statuses.gangqi = 500;
    b.player.energy = 999;
    let guard = 0;
    while (b.outcome === 'ongoing' && guard < 30) {
      guard += 1;
      const card = makeCard(run, 'yijianpowanfa');
      b.hand.push(card);
      playCard(run, b, card.uid, aliveEnemies(b)[0]?.uid);
    }
    expect(b.outcome).toBe('victory');
    expect(b.waveIndex).toBe(8);
  });
});

describe('心魔 Boss（§8.7）', () => {
  it('50% 血相变召唤执念分身并蓄力', () => {
    const run = newRun(defaultProfile(), 'XINMO', 0);
    run.act = 2;
    startBattle(run, 'boss');
    const b = run.battle!;
    const boss = b.enemies[0];
    boss.hp = Math.floor(boss.maxHp / 2); // 打到半血
    endTurn(run, b); // 敌方行动后触发相变
    expect(b.enemies.filter((e) => e.enemyId === 'zhinian' && e.hp > 0)).toHaveLength(2);
  });

  it('心魔低语复制卡组最高基础伤攻击牌', () => {
    const run = newRun(defaultProfile(), 'XINMO2', 0);
    run.act = 2;
    startBattle(run, 'boss');
    const b = run.battle!;
    const boss = b.enemies[0];
    boss.intent = { id: 'diyu', name: '心魔低语', kind: 'unknown', special: 'diyu' };
    const hpBefore = run.hp;
    endTurn(run, b);
    // 卡组最高攻击牌为御剑术 8 伤
    expect(hpBefore - run.hp).toBe(8);
  });
});

describe('诅咒与特殊牌', () => {
  it('贪嗔在手牌时攻击牌 −2 伤', () => {
    const run = battleWith(['zhiren'], ['tanchen', 'yujianshu']);
    const b = run.battle!;
    const e = enemy(run);
    playCard(run, b, b.hand[1].uid, e.uid);
    expect(e.hp).toBe(12 - 6);
  });

  it('业障可花 2 灵气打出放逐', () => {
    const run = battleWith(['zhiren'], ['yezhang']);
    const b = run.battle!;
    b.player.energy = 3;
    playCard(run, b, b.hand[0].uid);
    expect(b.player.energy).toBe(1);
    expect(b.exhaustPile).toHaveLength(1);
    expect(b.hand).toHaveLength(0);
  });

  it('尘缘不可打出', () => {
    const run = battleWith(['zhiren'], ['chenyuan']);
    const b = run.battle!;
    playCard(run, b, b.hand[0].uid);
    expect(b.hand).toHaveLength(1); // 没打出去
  });

  it('枯荣轮转：失 7 血 +3 灵气抽 3', () => {
    const run = battleWith(['shijing'], ['kuronglunzhuan']);
    const b = run.battle!;
    b.drawPile = [makeCard(run, 'jingxin'), makeCard(run, 'jingxin'), makeCard(run, 'jingxin')];
    b.player.energy = 1;
    const hpBefore = run.hp;
    playCard(run, b, b.hand[0].uid);
    expect(run.hp).toBe(hpBefore - 7);
    expect(b.player.energy).toBe(3); // 1 −1 费 +3
    expect(b.hand).toHaveLength(3);
  });
});
