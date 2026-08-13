/**
 * 五行系统 v3（策划案 v3.0 §4.4）
 * 相生（顺环）：木 → 火 → 土 → 金 → 水 → 木
 * 相克（隔位）：木克土 土克水 水克火 火克金 金克木
 *
 * v3 起五行不再是数值乘区：
 * - 相生 → 【得气】：解锁卡牌第二段效果（一卡多态）
 * - 相克 → 【克伐】五动词（对敌，按克向各有专属功能）
 * - 护体带五行属性 → 敌我攻防双向生克（护体效率 blockRatio）
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

/** a 是否生 b（行位 a → 打 b 牌可【得气】） */
export function generates(a: Element, b: Element): boolean {
  return SHENG[a] === b;
}

/** a 是否克 b（用 a 属性攻击 b 属性敌人触发【克伐】；b 攻 a 护体时护体效率减半） */
export function overcomes(a: Element, b: Element): boolean {
  return KE[a] === b;
}

/**
 * 【克伐】动词（§4.4 ④）——攻击牌克制敌人属性时触发，无统一伤害乘区：
 * - jianfa 剪伐（金克木）：移除目标至多 2 层增益（罡气优先，其次固本），每移除 1 层此击 +4 伤
 * - potu   破土（木克土）：目标护体立即减半（向下取整），且其本回合无法再获得护体
 * - zhise  滞涩（土克水）：目标当前意图延迟 1 回合执行（同一敌人每 2 回合限 1 次）
 * - jiaoxi 浇熄（水克火）：若目标处于蓄力（charge）意图：取消其蓄力改为普通行动；否则移除其 1 层增益
 * - rongduan 熔锻（火克金）：此击 50% 伤害无视护体（向下取整部分直击气血），命中后目标【软化】
 */
export type KefaVerb = 'jianfa' | 'potu' | 'zhise' | 'jiaoxi' | 'rongduan';

export const KEFA_VERB: Record<Element, KefaVerb> = {
  metal: 'jianfa', // 金克木
  wood: 'potu', // 木克土
  earth: 'zhise', // 土克水
  water: 'jiaoxi', // 水克火
  fire: 'rongduan', // 火克金
};

export const KEFA_NAME: Record<KefaVerb, string> = {
  jianfa: '剪伐',
  potu: '破土',
  zhise: '滞涩',
  jiaoxi: '浇熄',
  rongduan: '熔锻',
};

/**
 * 护体效率（§4.4 ⑤）：返回"每 1 点伤害消耗多少点护体"。
 * - 敌攻克制护体属性 → 2（挡不住：1 伤耗 2 护体）
 * - 护体属性克制敌攻 → 0.5（挡得好：2 伤耗 1 护体）
 * - 任一方为无属性 / 其余关系 → 1（1:1，新手安全垫）
 */
export function blockRatio(attackElem: CardElement, blockElem: CardElement): 0.5 | 1 | 2 {
  if (attackElem === 'none' || blockElem === 'none') return 1;
  if (overcomes(attackElem, blockElem)) return 2;
  if (overcomes(blockElem, attackElem)) return 0.5;
  return 1;
}

/**
 * 按护体效率结算一次攻击。返回 { hpLoss, blockLoss }。
 * r=2：吸收量 = min(dmg, floor(block/2))，耗护体 = 吸收量×2
 * r=0.5：吸收量 = min(dmg, block×2)，耗护体 = ceil(吸收量/2)
 * r=1：吸收量 = min(dmg, block)
 */
export function absorbWithBlock(
  dmg: number,
  block: number,
  ratio: 0.5 | 1 | 2,
): { hpLoss: number; blockLoss: number } {
  let absorbed: number;
  let blockLoss: number;
  if (ratio === 2) {
    absorbed = Math.min(dmg, Math.floor(block / 2));
    blockLoss = absorbed * 2;
  } else if (ratio === 0.5) {
    absorbed = Math.min(dmg, block * 2);
    blockLoss = Math.ceil(absorbed / 2);
  } else {
    absorbed = Math.min(dmg, block);
    blockLoss = absorbed;
  }
  return { hpLoss: dmg - absorbed, blockLoss };
}
