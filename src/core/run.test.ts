import { describe, it, expect } from 'vitest';
import { newRun, reduce, computeScore, computeDaowei } from './run';
import { defaultProfile } from '../save/storage';
import { selectableNodes, findNode } from './map';
import { settleRun } from '../save/profileLogic';

describe('地图生成（§9.1）', () => {
  it('幕一 14 层，首层必普通战，倒数第二层必洞府，末层 Boss', () => {
    const run = newRun(defaultProfile(), 'MAP-1', 0);
    expect(run.map.layers).toHaveLength(14);
    for (const n of run.map.layers[0]) expect(n.type).toBe('battle');
    for (const n of run.map.layers[12]) expect(n.type).toBe('cave');
    expect(run.map.layers[13]).toHaveLength(1);
    expect(run.map.layers[13][0].type).toBe('boss');
  });

  it('同一种子生成同一地图（种子驱动）', () => {
    const a = newRun(defaultProfile(), 'SAME-SEED', 0);
    const b = newRun(defaultProfile(), 'SAME-SEED', 0);
    expect(JSON.stringify(a.map)).toBe(JSON.stringify(b.map));
  });

  it('所有路径可达 Boss（每个节点均有出边）', () => {
    for (const seed of ['P1', 'P2', 'P3', 'P4', 'P5']) {
      const run = newRun(defaultProfile(), seed, 0);
      for (let l = 0; l < run.map.layers.length - 1; l++) {
        for (const n of run.map.layers[l]) {
          expect(n.edges.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('精英不出现于 1–4 层', () => {
    for (const seed of ['E1', 'E2', 'E3']) {
      const run = newRun(defaultProfile(), seed, 0);
      for (let l = 0; l < 4; l++) {
        for (const n of run.map.layers[l]) expect(n.type).not.toBe('elite');
      }
    }
  });
});

describe('冒险层 reducer', () => {
  it('起始卡组为剑修 10 张（御剑×5 铁布衫×4 引灵诀×1）', () => {
    const run = newRun(defaultProfile(), 'DECK', 0);
    expect(run.deck).toHaveLength(10);
    expect(run.deck.filter((c) => c.cardId === 'yujianshu')).toHaveLength(5);
    expect(run.deck.filter((c) => c.cardId === 'tiebushan')).toHaveLength(4);
    expect(run.deck.filter((c) => c.cardId === 'yinlingjue')).toHaveLength(1);
  });

  it('选择节点进入战斗；不可达节点被拒绝', () => {
    const run = newRun(defaultProfile(), 'NODE', 0);
    const nodes = selectableNodes(run);
    expect(nodes.length).toBeGreaterThan(0);
    const next = reduce(run, { t: 'CHOOSE_NODE', node: nodes[0] });
    expect(next.battle).not.toBeNull();
    const rejected = reduce(run, { t: 'CHOOSE_NODE', node: '1-9-9' });
    expect(rejected).toBe(run);
  });

  it('reduce 不修改原状态（不可变）', () => {
    const run = newRun(defaultProfile(), 'IMMUT', 0);
    const snapshot = JSON.stringify(run);
    const nodes = selectableNodes(run);
    reduce(run, { t: 'CHOOSE_NODE', node: nodes[0] });
    expect(JSON.stringify(run)).toBe(snapshot);
  });

  it('战斗胜利进入奖励界面并可拾取灵石', () => {
    let run = newRun(defaultProfile(), 'WIN-BATTLE', 0);
    const nodes = selectableNodes(run);
    run = reduce(run, { t: 'CHOOSE_NODE', node: nodes[0] });
    // 作弊直杀
    const cheat = structuredClone(run);
    for (const e of cheat.battle!.enemies) e.hp = 1;
    cheat.battle!.hand = [];
    const card = { uid: 9999, cardId: 'wanjianjue', upgraded: true };
    cheat.battle!.hand.push(card);
    cheat.battle!.player.energy = 99;
    let after = reduce(cheat, { t: 'PLAY_CARD', uid: 9999 });
    expect(after.battle).toBeNull();
    expect(after.screen.kind).toBe('reward');
    if (after.screen.kind === 'reward') {
      const goldBefore = after.gold;
      const g = after.screen.gold;
      after = reduce(after, { t: 'TAKE_REWARD_GOLD' });
      expect(after.gold).toBe(goldBefore + g);
      after = reduce(after, { t: 'LEAVE_REWARD' });
      expect(after.screen.kind).toBe('map');
    }
  });
});

describe('分数与道行（§12.4 / §11.1）', () => {
  it('分数公式基础项', () => {
    const run = newRun(defaultProfile(), 'SCORE', 0);
    run.stats.elitesKilled = 2;
    run.stats.bossesKilled = 1;
    run.hp = 50;
    // 通关：3 幕 ×300 + 2×30 + 1×80 + 50×2 = 1140（无丹药/周天/回合）
    expect(computeScore(run, true)).toBe(1140);
  });

  it('失败保底道行 5', () => {
    const run = newRun(defaultProfile(), 'DAOWEI', 0);
    run.hp = 0;
    run.flags['turnsTotal'] = 999;
    expect(computeDaowei(run, false)).toBeGreaterThanOrEqual(5);
  });

  it('结算入账道行并解锁成就', () => {
    const profile = defaultProfile();
    const run = newRun(profile, 'SETTLE', 0);
    run.over = true;
    run.screen = { kind: 'end', victory: true, cause: '白日飞升', score: 1000, daowei: 50, daohao: '万剑真君' };
    const p2 = settleRun(profile, run, true);
    expect(p2.daowei).toBeGreaterThan(0);
    expect(p2.wins).toBe(1);
    expect(p2.achievements).toContain('jindandadao');
    expect(p2.achievements).toContain('bairifeisheng');
    expect(p2.unlocked).toContain('yichongtian');
  });
});

describe('事件系统（§10）', () => {
  it('进入事件并选择选项得到确定性后果（种子驱动）', () => {
    // 找到一个事件节点走进去
    for (const seed of ['EV1', 'EV2', 'EV3', 'EV4', 'EV5', 'EV6']) {
      let run = newRun(defaultProfile(), seed, 0);
      const eventNodeId = run.map.layers.flat().find((n) => n.type === 'event' && n.layer === 1)?.id;
      if (!eventNodeId) continue;
      // 先走到第 0 层与之相连的节点
      const start = run.map.layers[0].find((n) => n.edges.includes(eventNodeId));
      if (!start) continue;
      run = reduce(run, { t: 'CHOOSE_NODE', node: start.id });
      if (run.battle) {
        // 作弊结束战斗
        const cheat = structuredClone(run);
        for (const e of cheat.battle!.enemies) e.hp = 1;
        cheat.battle!.hand = [{ uid: 8888, cardId: 'wanjianjue', upgraded: true }];
        cheat.battle!.player.energy = 99;
        run = reduce(cheat, { t: 'PLAY_CARD', uid: 8888 });
        if (run.screen.kind === 'reward') run = reduce(run, { t: 'LEAVE_REWARD' });
      }
      const a = reduce(run, { t: 'CHOOSE_NODE', node: eventNodeId });
      const b = reduce(run, { t: 'CHOOSE_NODE', node: eventNodeId });
      if (a.screen.kind !== 'event') continue;
      expect(JSON.stringify(a.screen)).toBe(JSON.stringify(b.screen)); // 同种子同事件
      const afterA = reduce(a, { t: 'EVENT_OPTION', option: 0 });
      const afterB = reduce(b, { t: 'EVENT_OPTION', option: 0 });
      expect(JSON.stringify(afterA.screen)).toBe(JSON.stringify(afterB.screen)); // 同后果
      return;
    }
    throw new Error('测试种子中未找到第 1 层事件节点');
  });
});

describe('洞府与突破', () => {
  it('洞府休整回复 30% 上限气血', () => {
    let run = newRun(defaultProfile(), 'CAVE', 0);
    run.hp = 30;
    run.screen = { kind: 'cave', free: false };
    run = reduce(run, { t: 'CAVE_OPTION', option: 'rest' });
    expect(run.hp).toBe(30 + 24); // 80×30%
    expect(run.screen.kind).toBe('map');
  });

  it('突破"金丹凝成"灵气上限 +1 并进入下一幕', () => {
    let run = newRun(defaultProfile(), 'BREAK', 0);
    run.screen = { kind: 'breakthrough', options: ['jindanningcheng', 'wuxingtiaohe', 'roushenchengsheng'] };
    run = reduce(run, { t: 'PICK_BREAKTHROUGH', id: 'jindanningcheng' });
    expect(run.energyMax).toBe(4);
    expect(run.act).toBe(2);
    expect(run.map.layers).toHaveLength(15); // 幕二 15 层
    expect(run.screen.kind).toBe('map');
  });
});
