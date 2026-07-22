import { describe, it, expect } from 'vitest';
import { initRngState, rngNext, rngInt, rngShuffle, RNG_STREAMS } from './rng';

describe('多流种子随机（§16.4）', () => {
  it('同种子完全可重放', () => {
    const a = initRngState('SEED1');
    const b = initRngState('SEED1');
    let sa = a, sb = b;
    for (let i = 0; i < 100; i++) {
      const ra = rngNext(sa, 'map');
      const rb = rngNext(sb, 'map');
      expect(ra.value).toBe(rb.value);
      sa = ra.state;
      sb = rb.state;
    }
  });

  it('不同流互不影响（看奖励不改变地图）', () => {
    const s0 = initRngState('SEED2');
    // 直接取 map 流
    const direct = rngNext(s0, 'map').value;
    // 先消耗 cardReward 流再取 map 流
    let s = s0;
    for (let i = 0; i < 10; i++) s = rngNext(s, 'cardReward').state;
    const after = rngNext(s, 'map').value;
    expect(after).toBe(direct);
  });

  it('不同种子产生不同序列', () => {
    const a = rngNext(initRngState('AAA'), 'shuffle').value;
    const b = rngNext(initRngState('BBB'), 'shuffle').value;
    expect(a).not.toBe(b);
  });

  it('rngInt 含端点且均匀落界', () => {
    let s = initRngState('RANGE');
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const r = rngInt(s, 'misc', 1, 3);
      s = r.state;
      expect(r.value).toBeGreaterThanOrEqual(1);
      expect(r.value).toBeLessThanOrEqual(3);
      seen.add(r.value);
    }
    expect(seen.size).toBe(3);
  });

  it('洗牌为置换且不修改原数组', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const r = rngShuffle(initRngState('SHUF'), 'shuffle', arr);
    expect(arr).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...r.value].sort((a, b) => a - b)).toEqual(arr);
  });

  it('全部流已初始化', () => {
    const s = initRngState('X');
    for (const stream of RNG_STREAMS) expect(typeof s[stream]).toBe('number');
  });
});
