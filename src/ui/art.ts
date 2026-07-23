/**
 * 美术资源映射（策划案 §14）
 * 全部为原创生成水墨素材，WebP 压缩，按需懒加载。
 */
import type { CardElement } from '../core/wuxing';

/** 敌人立绘（九重天劫波次共用雷灵立绘，道雷独立） */
const ENEMY_ART_IDS = new Set([
  'zhiren', 'yehu', 'denglonggui', 'yinfeng', 'shuigui', 'sheyao', 'tiaoshi', 'shanxiao', 'huoya', 'shijing',
  'heiwuchang', 'baiwuchang', 'tongjiashi', 'leiling_kuilei',
  'huapi', 'zhizhujing', 'shuihouzi', 'nuomiangui', 'gunv', 'panguanbiling', 'yecha', 'shiqun', 'zheng', 'jinjiakuilei',
  'huyaojiangjun', 'tengyao', 'xinmo', 'zhinian',
  'yinbing', 'jianzhongyiling', 'leishou', 'wangchuandugui', 'jiuweihusi', 'dinglukuilei', 'shiyuetiangou', 'shanshencanxiang',
  'jiao', 'jianzhongzhizhu', 'daolei',
]);

const LEI_WAVES = new Set(['jingzhelei', 'yinshalei', 'zixiaolei', 'benlei', 'xuanlei', 'xianlei', 'falei', 'mielei']);

export function enemyArt(enemyId: string): string | null {
  if (ENEMY_ART_IDS.has(enemyId)) return `/assets/enemies/${enemyId}.webp`;
  if (LEI_WAVES.has(enemyId)) return '/assets/enemies/leiling.webp';
  return null;
}

/** 卡面主图：按五行分组的水墨题材图（诅咒独立） */
export function cardArt(element: CardElement, isCurse: boolean): string {
  if (isCurse) return '/assets/cards/card_curse.webp';
  return `/assets/cards/card_${element}.webp`;
}

/** 每幕战场/地图背景 */
export function actBg(act: 1 | 2 | 3): string {
  return `/assets/bg_act${act}.webp`;
}
