import { describe, it, expect } from 'vitest';
import { ELEMENTS, SHENG, KE, generates, overcomes, KE_EFFECT } from './wuxing';

describe('五行系统（§4.4）', () => {
  it('相生顺环：木→火→土→金→水→木', () => {
    expect(SHENG.wood).toBe('fire');
    expect(SHENG.fire).toBe('earth');
    expect(SHENG.earth).toBe('metal');
    expect(SHENG.metal).toBe('water');
    expect(SHENG.water).toBe('wood');
  });

  it('相克隔位：木克土 土克水 水克火 火克金 金克木', () => {
    expect(KE.wood).toBe('earth');
    expect(KE.earth).toBe('water');
    expect(KE.water).toBe('fire');
    expect(KE.fire).toBe('metal');
    expect(KE.metal).toBe('wood');
  });

  it('每个元素恰好生一个、克一个、被一个生、被一个克', () => {
    for (const el of ELEMENTS) {
      expect(ELEMENTS.filter((x) => generates(el, x))).toHaveLength(1);
      expect(ELEMENTS.filter((x) => overcomes(el, x))).toHaveLength(1);
      expect(ELEMENTS.filter((x) => generates(x, el))).toHaveLength(1);
      expect(ELEMENTS.filter((x) => overcomes(x, el))).toHaveLength(1);
    }
  });

  it('相克附加异常映射（§4.4 ②）', () => {
    expect(KE_EFFECT.metal).toBe('pojia'); // 金克木 → 破甲
    expect(KE_EFFECT.wood).toBe('chanfu'); // 木克土 → 缠缚
    expect(KE_EFFECT.earth).toBe('zhise'); // 土克水 → 滞涩
    expect(KE_EFFECT.water).toBe('ximie'); // 水克火 → 熄灭
    expect(KE_EFFECT.fire).toBe('rongchuan'); // 火克金 → 熔穿
  });
});
