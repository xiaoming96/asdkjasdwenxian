/**
 * 五行系统（策划案 §4.4）
 * 相生（顺环）：木 → 火 → 土 → 金 → 水 → 木
 * 相克（隔位）：木克土 土克水 水克火 火克金 金克木
 */

export type Element = 'wood' | 'fire' | 'earth' | 'metal' | 'water';
export type CardElement = Element | 'none';

export const ELEMENTS: readonly Element[] = ['wood', 'fire', 'earth', 'metal', 'water'];

export const ELEMENT_NAME: Record<Element, string> = {
  wood: '木',
  fire: '火',
  earth: '土',
  metal: '金',
  water: '水',
};

/** 相生：key 生 value */
export const SHENG: Record<Element, Element> = {
  wood: 'fire',
  fire: 'earth',
  earth: 'metal',
  metal: 'water',
  water: 'wood',
};

/** 相克：key 克 value */
export const KE: Record<Element, Element> = {
  wood: 'earth',
  earth: 'water',
  water: 'fire',
  fire: 'metal',
  metal: 'wood',
};

/** a 是否生 b（行位 a → 打 b 牌触发行云流水） */
export function generates(a: Element, b: Element): boolean {
  return SHENG[a] === b;
}

/** a 是否克 b（用 a 属性攻击 b 属性敌人触发克制） */
export function overcomes(a: Element, b: Element): boolean {
  return KE[a] === b;
}

/** 相克附加的异常（策划案 §4.4 ②） */
export type KeEffect = 'pojia' | 'chanfu' | 'zhise' | 'ximie' | 'rongchuan';

export const KE_EFFECT: Record<Element, KeEffect> = {
  metal: 'pojia', // 金克木 → 破甲
  wood: 'chanfu', // 木克土 → 缠缚
  earth: 'zhise', // 土克水 → 滞涩
  water: 'ximie', // 水克火 → 熄灭
  fire: 'rongchuan', // 火克金 → 熔穿（3 层灼烧）
};
