/**
 * 每日天机（策划案 §11.3，本地版）
 * 每日统一种子（日期派生）+ 1 条变异规则。
 */
import { hashSeed } from '../core/rng';

export interface DailyMutation {
  id: string;
  name: string;
  text: string;
  flag: string; // 写入 run.flags 的键
}

export const DAILY_MUTATIONS: DailyMutation[] = [
  { id: 'muxing', name: '木行昌盛', text: '木牌 −1 费', flag: 'dailyMuxing' },
  { id: 'tianhuo', name: '天火燎原', text: '灼烧结算 ×2', flag: 'dailyTianhuo' },
  { id: 'lingchao', name: '灵潮汹涌', text: '灵气 4，抽牌 +1', flag: 'dailyLingchao' },
  { id: 'dadao50', name: '大道五十', text: '起始牌库扩为 25 张', flag: 'dailyDadao' },
  { id: 'shajie', name: '杀劫', text: '精英翻倍，法宝掉落翻倍', flag: 'dailyShajie' },
  { id: 'pinji', name: '贫瘠之年', text: '坊市涨价 50%，删牌免费', flag: 'dailyPinji' },
  { id: 'wanwu', name: '万物有灵', text: '全部敌人随机换五行', flag: 'dailyWanwu' },
  { id: 'xinmo', name: '心魔滋长', text: '每幕开始 +1 心魔诅咒', flag: 'dailyXinmo' },
  { id: 'tianjiluan', name: '天机紊乱', text: '意图数值隐藏，抽牌 +1', flag: 'dailyTianjiluan' },
  { id: 'guiyi', name: '五行归一', text: '本日只出某一行的卡', flag: 'dailyGuiyi' },
  { id: 'qingshen', name: '轻身如燕', text: '手牌上限 6，每回合抽 6', flag: 'dailyQingshen' },
  { id: 'yinguo', name: '因果昭昭', text: '事件概率翻倍', flag: 'dailyYinguo' },
];

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dailySeed(): string {
  return `TIANJI-${todayKey()}`;
}

export function dailyMutation(): DailyMutation {
  const h = hashSeed(dailySeed());
  return DAILY_MUTATIONS[h % DAILY_MUTATIONS.length];
}
