/**
 * 美术资源映射（策划案 §14）
 * 全部为原创生成水墨素材，WebP 压缩，按需懒加载。
 */
import type { CardElement } from '../core/wuxing';
import cardArtMap from '../data/cardArtMap.json';

const CARD_ART_MAP = cardArtMap as Record<string, { file: string; title: string; museum: string }>;

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

/** 卡面主图：优先每张卡独立的博物馆 CC0 古画，缺失时回退五行题材生成图 */
export function cardArt(cardId: string, element: CardElement, isCurse: boolean): string {
  const mapped = CARD_ART_MAP[cardId];
  if (mapped) return mapped.file;
  if (isCurse) return '/assets/cards/card_curse.webp';
  return `/assets/cards/card_${element}.webp`;
}

/** 卡面古画出处（藏经阁/详情用） */
export function cardArtSource(cardId: string): { title: string; museum: string } | null {
  return CARD_ART_MAP[cardId] ?? null;
}

/** 每幕战场/地图背景 */
export function actBg(act: 1 | 2 | 3): string {
  return `/assets/bg_act${act}.webp`;
}
