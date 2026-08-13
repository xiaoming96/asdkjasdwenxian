/**
 * 五行系统 v3 测试（§4.4）：相生相克环、克伐动词映射、护体效率与吸收结算。
 */
import { describe, it, expect } from 'vitest';
import {
  ELEMENTS, SHENG, KE, KEFA_VERB, generates, overcomes, blockRatio, absorbWithBlock,
} from './wuxing';

describe('相生相克环', () => {
  it('相生：木→火→土→金→水→木', () => {
    expect(SHENG.wood).toBe('fire');
    expect(SHENG.fire).toBe('earth');
    expect(SHENG.earth).toBe('metal');
    expect(SHENG.metal).toBe('water');
    expect(SHENG.water).toBe('wood');
    // 环闭合：每个元素恰好被生一次
    expect(new Set(Object.values(SHENG)).size).toBe(5);
  });

  it('相克：木克土 土克水 水克火 火克金 金克木', () => {
    expect(KE.wood).toBe('earth');
    expect(KE.earth).toBe('water');
    expect(KE.water).toBe('fire');
    expect(KE.fire).toBe('metal');
    expect(KE.metal).toBe('wood');
    expect(new Set(Object.values(KE)).size).toBe(5);
  });

  it('generates / overcomes 与表一致，且互斥', () => {
    for (const a of ELEMENTS) {
      expect(generates(a, SHENG[a])).toBe(true);
      expect(overcomes(a, KE[a])).toBe(true);
      expect(generates(a, KE[a])).toBe(false);
      expect(overcomes(a, SHENG[a])).toBe(false);
      expect(generates(a, a)).toBe(false);
      expect(overcomes(a, a)).toBe(false);
    }
  });
});

describe('KEFA_VERB 克伐动词映射', () => {
  it('金剪伐 木破土 土滞涩 水浇熄 火熔锻', () => {
    expect(KEFA_VERB.metal).toBe('jianfa'); // 金克木
    expect(KEFA_VERB.wood).toBe('potu'); // 木克土
    expect(KEFA_VERB.earth).toBe('zhise'); // 土克水
    expect(KEFA_VERB.water).toBe('jiaoxi'); // 水克火
    expect(KEFA_VERB.fire).toBe('rongduan'); // 火克金
  });
});

describe('blockRatio 护体效率', () => {
  it('任一方无属性 → 1', () => {
    expect(blockRatio('none', 'fire')).toBe(1);
    expect(blockRatio('water', 'none')).toBe(1);
    expect(blockRatio('none', 'none')).toBe(1);
  });

  it('敌攻克护体 → 2；护体克敌攻 → 0.5', () => {
    expect(blockRatio('water', 'fire')).toBe(2); // 水克火
    expect(blockRatio('fire', 'water')).toBe(0.5);
    expect(blockRatio('metal', 'wood')).toBe(2); // 金克木
    expect(blockRatio('wood', 'metal')).toBe(0.5);
  });

  it('相生与同属 → 1', () => {
    expect(blockRatio('wood', 'fire')).toBe(1); // 木生火
    expect(blockRatio('fire', 'fire')).toBe(1);
    expect(blockRatio('earth', 'metal')).toBe(1);
  });
});

describe('absorbWithBlock 吸收结算', () => {
  it('r=1：吸收 = min(dmg, block)', () => {
    expect(absorbWithBlock(9, 5, 1)).toEqual({ hpLoss: 4, blockLoss: 5 });
    expect(absorbWithBlock(3, 5, 1)).toEqual({ hpLoss: 0, blockLoss: 3 });
  });

  it('r=2：吸收 = min(dmg, floor(block/2))，耗护体 ×2', () => {
    expect(absorbWithBlock(9, 10, 2)).toEqual({ hpLoss: 4, blockLoss: 10 });
    expect(absorbWithBlock(2, 10, 2)).toEqual({ hpLoss: 0, blockLoss: 4 });
    expect(absorbWithBlock(9, 7, 2)).toEqual({ hpLoss: 6, blockLoss: 6 }); // floor(7/2)=3
  });

  it('r=0.5：吸收 = min(dmg, block×2)，耗护体 = ceil(吸收/2)', () => {
    expect(absorbWithBlock(9, 6, 0.5)).toEqual({ hpLoss: 0, blockLoss: 5 });
    expect(absorbWithBlock(20, 6, 0.5)).toEqual({ hpLoss: 8, blockLoss: 6 });
    expect(absorbWithBlock(3, 6, 0.5)).toEqual({ hpLoss: 0, blockLoss: 2 });
  });

  it('零伤害与零护体边界', () => {
    expect(absorbWithBlock(0, 5, 1)).toEqual({ hpLoss: 0, blockLoss: 0 });
    expect(absorbWithBlock(7, 0, 2)).toEqual({ hpLoss: 7, blockLoss: 0 });
  });
});
