import { describe, it, expect } from 'vitest';
import { newRun, reduce, computeScore, computeDaowei, makeDaohao } from './run';
import { selectableNodes, flyTargets } from './map';
import type { Profile, RunState } from './types';

/** v3 Profile 测试桩（不依赖 save/storage，避免耦合他人文件） */
function testProfile(patch: Partial<Profile> = {}): Profile {
  return {
    schemaVersion: 3,
    daowei: 0,
    achievements: [],
    runsTotal: 0,
    wins: 0,
    maxAscensionCleared: 0,
    seenCards: [], seenRelics: [], seenEnemies: [],
    daohaoList: [],
    totalDaoweiEarned: 0,
    winsByChar: {},
    legacy: { kind: null, karma: 0 },
    settings: { music: 1, sfx: 1 },
    ...patch,
  };
}

/** 把 run 摆到指定楼层节点上（跳过战斗流程，直接站上地图） */
function placeAt(run: RunState, layer: number, index = 0) {
  const node = run.map.layers[layer][index];
  run.floor = layer;
  run.nodeId = node.id;
  run.screen = { kind: 'map' };
  run.battle = null;
  return node;
}

describe('地图生成 v3（§9.2/9.3）', () => {
  it('幕一 11 层，幕二/三 12 层，顶层 Boss', () => {
    const run = newRun(testProfile(), 'MAP-1', 0);
    expect(run.map.layers).toHaveLength(11);
    const top = run.map.layers[10];
    expect(top).toHaveLength(1);
    expect(top[0].type).toBe('boss');
  });

  it('起点三选一：底层固定 battle/event/field 各一', () => {
    for (const seed of ['S1', 'S2', 'S3', 'S4']) {
      const run = newRun(testProfile(), seed, 0);
      const types = run.map.layers[0].map((n) => n.type).sort();
      expect(types).toEqual(['battle', 'event', 'field']);
      expect(selectableNodes(run)).toHaveLength(3);
    }
  });

  it('同一种子生成同一地图（种子驱动）', () => {
    const a = newRun(testProfile(), 'SAME-SEED', 0);
    const b = newRun(testProfile(), 'SAME-SEED', 0);
    expect(JSON.stringify(a.map)).toBe(JSON.stringify(b.map));
  });

  it('所有非 Boss 节点均有出边（可达 Boss），边年数 1–3', () => {
    for (const seed of ['P1', 'P2', 'P3', 'P4', 'P5']) {
      const run = newRun(testProfile(), seed, 0);
      for (let l = 0; l < run.map.layers.length - 1; l++) {
        for (const n of run.map.layers[l]) {
          expect(n.edges.length).toBeGreaterThan(0);
          for (const e of n.edges) {
            expect(e.years).toBeGreaterThanOrEqual(1);
            expect(e.years).toBeLessThanOrEqual(3);
          }
        }
      }
    }
  });

  it('精英不出现于 1–3 层；保底坊市 ≥1、洞府 ≥2；节点均有地名', () => {
    for (const seed of ['E1', 'E2', 'E3', 'E4', 'E5', 'E6']) {
      const run = newRun(testProfile(), seed, 0);
      const all = run.map.layers.flat();
      for (let l = 0; l < 3; l++) {
        for (const n of run.map.layers[l]) expect(n.type).not.toBe('elite');
      }
      expect(all.filter((n) => n.type === 'shop').length).toBeGreaterThanOrEqual(1);
      expect(all.filter((n) => n.type === 'cave').length).toBeGreaterThanOrEqual(2);
      for (const n of all) expect(n.placeName.length).toBeGreaterThan(0);
    }
  });
});

describe('newRun v3 形状（§4.1/§9.1/§7.1）', () => {
  it('108 气血 / 60 年寿元 / 0 灵石 / 炼气 / 气海 6 / 抽 4 / 丹盒 4 / 初始 3 方', () => {
    const run = newRun(testProfile(), 'SHAPE', 0);
    expect(run.hp).toBe(108);
    expect(run.maxHp).toBe(108);
    expect(run.lifespan).toBe(60);
    expect(run.gold).toBe(0);
    expect(run.realm).toBe('lianqi');
    expect(run.poolCap).toBe(6);
    expect(run.drawPerTurn).toBe(4);
    expect(run.elixirCap).toBe(4);
    expect(run.recipes).toEqual(['huiyuandan', 'julingdan', 'xuanwudan']);
    expect(run.materials).toEqual({ lingcao: 0, yusui: 0, yaodan: 0, leisha: 0 });
    expect(run.demon).toBe(0);
    expect(run.toxin).toBe(0);
    expect(run.karma).toBe(0);
  });

  it('剑修起始 8 张（御剑×3 守中×2 润锋 引灵诀 残卷）', () => {
    const run = newRun(testProfile(), 'DECK', 0);
    expect(run.deck).toHaveLength(8);
    expect(run.deck.filter((c) => c.cardId === 'yujianshu')).toHaveLength(3);
    expect(run.deck.filter((c) => c.cardId === 'shouzhong')).toHaveLength(2);
    expect(run.deck.filter((c) => c.cardId === 'canjuan')).toHaveLength(1);
  });

  it('业力：开局心魔 = 业力，每 2 点塞 1 张因果债', () => {
    const run = newRun(testProfile({ legacy: { kind: 'daoxing', karma: 5 } }), 'KARMA', 0);
    expect(run.karma).toBe(5);
    expect(run.demon).toBe(5);
    expect(run.deck.filter((c) => c.cardId === 'yinguozhai')).toHaveLength(2);
    expect(run.deck).toHaveLength(10);
  });

  it('二重天寿元 −8；四重天业力 +1', () => {
    const asc2 = newRun(testProfile(), 'ASC2', 2);
    expect(asc2.lifespan).toBe(52);
    const asc4 = newRun(testProfile({ legacy: { kind: null, karma: 1 } }), 'ASC4', 4);
    expect(asc4.karma).toBe(2);
    expect(asc4.demon).toBe(2);
    expect(asc4.deck.filter((c) => c.cardId === 'yinguozhai')).toHaveLength(1);
  });

  it('宿慧：本命牌入组 / 残魂器随身', () => {
    const withCard = newRun(
      testProfile({ legacy: { kind: 'card', cardId: 'wanjianjue', upgraded: true, karma: 3 } }),
      'LEGACY-C', 0,
    );
    const carried = withCard.deck.find((c) => c.cardId === 'wanjianjue');
    expect(carried).toBeDefined();
    expect(carried!.upgraded).toBe(true);
    const withRelic = newRun(
      testProfile({ legacy: { kind: 'relic', relicId: 'yuhulu', karma: 1 } }),
      'LEGACY-R', 0,
    );
    expect(withRelic.relics).toContain('yuhulu');
    expect(withRelic.elixirCap).toBe(5); // 玉葫芦：丹盒 +1
  });
});

describe('寿元时钟（§9.1）', () => {
  it('起点三选一不耗寿元；之后 CHOOSE_NODE 扣所走边年数', () => {
    let run = newRun(testProfile(), 'CLOCK', 0);
    const start = selectableNodes(run)[0];
    run = reduce(run, { t: 'CHOOSE_NODE', node: start });
    expect(run.lifespan).toBe(60);
    // 直接站上第 0 层节点，再走一条边
    run = newRun(testProfile(), 'CLOCK', 0);
    const cur = placeAt(run, 0);
    const edge = cur.edges[0];
    const next = reduce(run, { t: 'CHOOSE_NODE', node: edge.to });
    expect(next.lifespan).toBe(60 - edge.years);
  });

  it('寿元归零 → 坐化（与气血无关）', () => {
    const run = newRun(testProfile(), 'SIT', 0);
    const cur = placeAt(run, 0);
    run.lifespan = 1;
    const next = reduce(run, { t: 'CHOOSE_NODE', node: cur.edges[0].to });
    expect(next.over).toBe(true);
    expect(next.screen.kind).toBe('end');
    if (next.screen.kind === 'end') {
      expect(next.screen.victory).toBe(false);
      expect(next.screen.cause).toBe('油尽灯枯，坐化于途');
    }
  });

  it('不可达节点被拒绝；reduce 不修改原状态', () => {
    const run = newRun(testProfile(), 'IMMUT', 0);
    expect(reduce(run, { t: 'CHOOSE_NODE', node: '1-9-9' })).toBe(run);
    const snapshot = JSON.stringify(run);
    reduce(run, { t: 'CHOOSE_NODE', node: selectableNodes(run)[0] });
    expect(JSON.stringify(run)).toBe(snapshot);
  });
});

describe('御空/缩地（§9.2）', () => {
  it('炼气不可御空；筑基 3 年/次限 2 次，跳至隔层', () => {
    const run = newRun(testProfile(), 'FLY', 0);
    placeAt(run, 0);
    const target = flyTargets(run)[0];
    expect(target).toBeDefined();
    // 炼气：拒绝
    expect(reduce(run, { t: 'FLY_NODE', node: target })).toBe(run);
    // 筑基：扣 3 年
    run.realm = 'zhuji';
    const next = reduce(run, { t: 'FLY_NODE', node: target });
    expect(next.lifespan).toBe(57);
    expect(next.flyUsed).toBe(1);
    expect(next.floor).toBe(2);
    // 用满 2 次后拒绝
    const again = structuredClone(next);
    placeAt(again, 2, 0);
    again.flyUsed = 2;
    const t2 = flyTargets(again)[0];
    expect(reduce(again, { t: 'FLY_NODE', node: t2 })).toBe(again);
  });

  it('金丹缩地：2 年/次限 3 次', () => {
    const run = newRun(testProfile(), 'FLY-J', 0);
    placeAt(run, 0);
    run.realm = 'jindan';
    run.flyUsed = 2;
    const target = flyTargets(run)[0];
    const next = reduce(run, { t: 'FLY_NODE', node: target });
    expect(next.lifespan).toBe(58);
    expect(next.flyUsed).toBe(3);
  });
});

describe('洞府（§9.4）', () => {
  it('闭关 3 年回 36；每座至多 2 项不同行动', () => {
    let run = newRun(testProfile(), 'CAVE', 0);
    run.hp = 30;
    run.screen = { kind: 'cave', free: false, remaining: 2, used: [] };
    run = reduce(run, { t: 'CAVE_ACTION', kind: 'rest' });
    expect(run.hp).toBe(66);
    expect(run.lifespan).toBe(57);
    expect(run.screen.kind).toBe('cave');
    if (run.screen.kind === 'cave') {
      expect(run.screen.remaining).toBe(1);
      expect(run.screen.used).toEqual(['rest']);
    }
    // 同一行动不可重复
    expect(reduce(run, { t: 'CAVE_ACTION', kind: 'rest' })).toBe(run);
    // 第二项：辟谷
    run.toxin = 6;
    run = reduce(run, { t: 'CAVE_ACTION', kind: 'fast' });
    expect(run.toxin).toBe(2);
    expect(run.lifespan).toBe(55);
    // 两项用尽后拒绝
    expect(reduce(run, { t: 'CAVE_ACTION', kind: 'smith' })).toBe(run);
    run = reduce(run, { t: 'CAVE_LEAVE' });
    expect(run.screen.kind).toBe('map');
  });

  it('炼丹：校验丹方与灵材，扣材得丹；灵材不足被拒', () => {
    let run = newRun(testProfile(), 'BREW', 0);
    run.screen = { kind: 'cave', free: false, remaining: 2, used: [] };
    // 回元丹需灵草 ×2：不足被拒
    expect(reduce(run, { t: 'CAVE_ACTION', kind: 'brew', recipeId: 'huiyuandan' })).toBe(run);
    // 未持有的丹方被拒
    run.materials.leisha = 2;
    expect(reduce(run, { t: 'CAVE_ACTION', kind: 'brew', recipeId: 'wudaodan' })).toBe(run);
    // 足量：炼成
    run.materials.lingcao = 2;
    run = reduce(run, { t: 'CAVE_ACTION', kind: 'brew', recipeId: 'huiyuandan' });
    expect(run.elixirs).toEqual(['huiyuandan']);
    expect(run.materials.lingcao).toBe(0);
    expect(run.lifespan).toBe(58);
    expect(run.stats.brews).toBe(1);
  });

  it('参悟：2 年，进选牌参悟并返回洞府', () => {
    let run = newRun(testProfile(), 'SMITH', 0);
    run.screen = { kind: 'cave', free: false, remaining: 2, used: [] };
    run = reduce(run, { t: 'CAVE_ACTION', kind: 'smith' });
    expect(run.lifespan).toBe(58);
    expect(run.screen.kind).toBe('cardPick');
    const uid = run.deck.find((c) => c.cardId === 'yujianshu')!.uid;
    run = reduce(run, { t: 'PICK_CARD_SCREEN', uid });
    expect(run.deck.find((c) => c.uid === uid)!.upgraded).toBe(true);
    expect(run.stats.cardsUpgraded).toBe(1);
    expect(run.screen.kind).toBe('cave');
    if (run.screen.kind === 'cave') {
      expect(run.screen.remaining).toBe(1);
      expect(run.screen.used).toEqual(['smith']);
    }
  });
});

describe('丹毒阈值（§7.1）', () => {
  it('丹毒 ≥8 上限 −10；辟谷清毒后恢复', () => {
    let run = newRun(testProfile(), 'TOXIN', 0);
    run.toxin = 7;
    run.elixirs = ['huiyuandan'];
    run.hp = 50;
    run = reduce(run, { t: 'USE_ELIXIR', elixir: 'huiyuandan' }); // 回 18，毒 +1 → 8
    expect(run.toxin).toBe(8);
    expect(run.maxHp).toBe(98);
    expect(run.toxinMaxHpApplied).toBe(true);
    expect(run.hp).toBe(68);
    expect(run.stats.elixirsUsed).toBe(1);
    run.screen = { kind: 'cave', free: false, remaining: 2, used: [] };
    run = reduce(run, { t: 'CAVE_ACTION', kind: 'fast' }); // 清 4 → 4
    expect(run.toxin).toBe(4);
    expect(run.maxHp).toBe(108);
    expect(run.toxinMaxHpApplied).toBe(false);
  });

  it('地图服丹：大还丹回 50% 上限并燃寿 4（计入 lifespanBurned）', () => {
    let run = newRun(testProfile(), 'DAHUAN', 0);
    run.hp = 10;
    run.elixirs = ['dahuandan'];
    run = reduce(run, { t: 'USE_ELIXIR', elixir: 'dahuandan' });
    expect(run.hp).toBe(64);
    expect(run.lifespan).toBe(56);
    expect(run.stats.lifespanBurned).toBe(4);
    expect(run.toxin).toBe(3);
  });
});

describe('道果（§9.5）', () => {
  it('金丹凝五色：气海 +2，随后进入下一幕（幕二 12 层）', () => {
    let run = newRun(testProfile(), 'DAOGUO', 0);
    run.screen = { kind: 'daoguo', options: ['jindanwuse', 'randengxuming', 'tiegu'] };
    run = reduce(run, { t: 'PICK_DAOGUO', id: 'jindanwuse' });
    expect(run.poolCap).toBe(8);
    expect(run.fruits).toContain('jindanwuse');
    expect(run.act).toBe(2);
    expect(run.map.layers).toHaveLength(12);
    expect(run.screen.kind).toBe('map');
  });

  it('燃灯续命：寿元 +25；铁骨：上限 +18 开局护体 +6', () => {
    let a = newRun(testProfile(), 'DG-A', 0);
    a.screen = { kind: 'daoguo', options: ['randengxuming'] };
    a = reduce(a, { t: 'PICK_DAOGUO', id: 'randengxuming' });
    expect(a.lifespan).toBe(85);
    let b = newRun(testProfile(), 'DG-B', 0);
    b.screen = { kind: 'daoguo', options: ['tiegu'] };
    b = reduce(b, { t: 'PICK_DAOGUO', id: 'tiegu' });
    expect(b.maxHp).toBe(126);
    expect(b.hp).toBe(126);
    expect(b.battleStartBlock).toBe(6);
  });

  it('斩三尸：心魔 −2，进斩牌（本命牌受保护），完成后切幕', () => {
    let run = newRun(testProfile(), 'DG-Z', 0);
    run.demon = 5;
    run.screen = { kind: 'daoguo', options: ['zhansanshi'] };
    run = reduce(run, { t: 'PICK_DAOGUO', id: 'zhansanshi' });
    expect(run.demon).toBe(3);
    expect(run.screen.kind).toBe('cardPick');
    // 本命牌不可斩
    const canjuan = run.deck.find((c) => c.cardId === 'canjuan')!;
    expect(reduce(run, { t: 'PICK_CARD_SCREEN', uid: canjuan.uid })).toBe(run);
    // 跳过 → 切幕
    run = reduce(run, { t: 'PICK_CARD_SCREEN', uid: -1 });
    expect(run.act).toBe(2);
  });
});

describe('坊市（§9.4）', () => {
  function shopRun(seed: string): RunState {
    const run = newRun(testProfile(), seed, 0);
    run.gold = 200;
    run.screen = {
      kind: 'shop', items: [],
      removePrice: 88, removeUsed: false,
      xinzhaiPrice: 66, xinzhaiUsed: false, discount: 1,
    };
    return run;
  }

  it('斩尘缘 88 灵石每店限 1；本命牌不可斩', () => {
    let run = shopRun('SHOP-R');
    const canjuan = run.deck.find((c) => c.cardId === 'canjuan')!;
    expect(reduce(run, { t: 'SHOP_REMOVE_CARD', uid: canjuan.uid })).toBe(run);
    const normal = run.deck.find((c) => c.cardId === 'yujianshu')!;
    run = reduce(run, { t: 'SHOP_REMOVE_CARD', uid: normal.uid });
    expect(run.deck).toHaveLength(7);
    expect(run.gold).toBe(112);
    // 每店限 1
    const second = run.deck.find((c) => c.cardId === 'yujianshu')!;
    expect(reduce(run, { t: 'SHOP_REMOVE_CARD', uid: second.uid })).toBe(run);
  });

  it('心斋 66 灵石心魔 −1，每店限 1', () => {
    let run = shopRun('SHOP-X');
    run.demon = 3;
    run = reduce(run, { t: 'SHOP_XINZHAI' });
    expect(run.demon).toBe(2);
    expect(run.gold).toBe(134);
    expect(reduce(run, { t: 'SHOP_XINZHAI' })).toBe(run);
  });

  it('购买丹方与灵材包入账', () => {
    let run = shopRun('SHOP-B');
    run.screen = {
      kind: 'shop',
      items: [
        { kind: 'recipe', id: 'kaiqiaodan', price: 50, sold: false },
        { kind: 'materials', id: 'yusui', count: 3, price: 30, sold: false },
      ],
      removePrice: 88, removeUsed: false, xinzhaiPrice: 66, xinzhaiUsed: false, discount: 1,
    };
    run = reduce(run, { t: 'BUY_ITEM', index: 0 });
    expect(run.recipes).toContain('kaiqiaodan');
    run = reduce(run, { t: 'BUY_ITEM', index: 1 });
    expect(run.materials.yusui).toBe(3);
    expect(run.gold).toBe(120);
    // 已售出不可重复购买
    expect(reduce(run, { t: 'BUY_ITEM', index: 0 })).toBe(run);
  });
});

describe('灵田与奖励灵材（§9.3/§4.7）', () => {
  it('进入灵田得 2–4 份灵材（幕一 2 份）', () => {
    const run = newRun(testProfile(), 'FIELD', 0);
    const fieldNode = run.map.layers[0].find((n) => n.type === 'field')!;
    const next = reduce(run, { t: 'CHOOSE_NODE', node: fieldNode.id });
    expect(next.screen.kind).toBe('reward');
    if (next.screen.kind === 'reward') {
      const total = Object.values(next.screen.materials ?? {}).reduce((a, b) => a + b, 0);
      expect(total).toBe(2);
      const after = reduce(next, { t: 'TAKE_REWARD_MATERIALS' });
      const owned = Object.values(after.materials).reduce((a, b) => a + b, 0);
      expect(owned).toBe(2);
    }
  });
});

describe('事件系统（§10）', () => {
  it('同种子同事件同后果（种子驱动）', () => {
    for (const seed of ['EV1', 'EV2', 'EV3', 'EV4']) {
      const run = newRun(testProfile(), seed, 0);
      const eventNode = run.map.layers[0].find((n) => n.type === 'event');
      if (!eventNode) continue;
      const a = reduce(run, { t: 'CHOOSE_NODE', node: eventNode.id });
      const b = reduce(run, { t: 'CHOOSE_NODE', node: eventNode.id });
      expect(a.screen.kind).toBe('event');
      expect(JSON.stringify(a.screen)).toBe(JSON.stringify(b.screen));
      const afterA = reduce(a, { t: 'EVENT_OPTION', option: 0 });
      const afterB = reduce(b, { t: 'EVENT_OPTION', option: 0 });
      expect(JSON.stringify(afterA.rng)).toBe(JSON.stringify(afterB.rng));
      return;
    }
    throw new Error('测试种子中未找到底层事件节点');
  });

  it('事件寿元代价：requireLifespan 守门、正常扣减、平安符每幕首次减 2', () => {
    const setup = () => {
      const run = newRun(testProfile(), 'EV-LIFE', 0);
      run.screen = { kind: 'event', eventId: 'shiyuezhiye', stage: 0, resultText: null, disabled: [] };
      run.usedEvents.push('shiyuezhiye');
      return run;
    };
    // 寿元不足 requireLifespan(3) 时选项被拒
    const poor = setup();
    poor.lifespan = 2;
    expect(reduce(poor, { t: 'EVENT_OPTION', option: 1 })).toBe(poor);
    // 正常扣 2 年
    const normal = reduce(setup(), { t: 'EVENT_OPTION', option: 1 });
    expect(normal.lifespan).toBe(58);
    // 平安符：每幕第一次失寿减 2 年
    const guarded = setup();
    guarded.relics.push('pinganfu');
    const after = reduce(guarded, { t: 'EVENT_OPTION', option: 1 });
    expect(after.lifespan).toBe(60);
    expect(after.flags['pinganfuUsed']).toBe(1);
  });
});

describe('分数与道号（§12.4/§3.3）', () => {
  it('分数公式：幕/精英/Boss/气血/寿元/道心', () => {
    const run = newRun(testProfile(), 'SCORE', 0);
    run.stats.elitesKilled = 2;
    run.stats.bossesKilled = 1;
    run.hp = 50;
    run.lifespan = 40;
    run.flags['daoxin'] = 1;
    // 3×300 + 2×30 + 1×80 + 50×2 + 40×3 + 100 = 1360
    expect(computeScore(run, true)).toBe(1360);
    expect(computeDaowei(run, true)).toBe(15 * 3 + 5 * 2 + 15 * 1 + 13);
  });

  it('失败保底道行 5；守心通关道号带前缀', () => {
    const run = newRun(testProfile(), 'DAOWEI', 0);
    run.hp = 0;
    run.lifespan = 0;
    run.flags['turnsTotal'] = 999;
    expect(computeDaowei(run, false)).toBeGreaterThanOrEqual(5);
    expect(makeDaohao(run)).toBe('守心·万剑真君'); // 剑修主金行，demon 0
    run.demon = 3;
    expect(makeDaohao(run)).toBe('万剑真君');
  });
});
