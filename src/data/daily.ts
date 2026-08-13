/**
 * 每日天机（策划案 v3 §11.3，本地版）
 * 每日统一种子（日期派生）+ 1 条变异规则。
 * 公平性强制：每日模式统一配置——全卡池、固定角色、无本命牌/残魂器、业力 0、难度固定三重天
 * （统一解锁由 milestones.computeUnlocked(profile, true) 提供）。
 */
import { hashSeed } from '../core/rng';

export interface DailyMutation {
  id: string;
  name: string;
  text: string;
  flag: string; // 写入 run.flags 的键，各系统按 flag 生效
}

/** 变异规则池（§11.3 v3，12 条） */
export const DAILY_MUTATIONS: DailyMutation[] = [
  { id: 'muxing', name: '木行昌盛', text: '木牌 −1 费', flag: 'dailyMuxing' },
  { id: 'tianhuo', name: '天火燎原', text: '灼烧不衰减', flag: 'dailyTianhuo' },
  { id: 'lingchao', name: '灵潮汹涌', text: '吐纳 +1，抽牌 +1', flag: 'dailyLingchao' },
  { id: 'dadao', name: '大道五十', text: '起始牌库扩为 25 张', flag: 'dailyDadao' },
  { id: 'shajie', name: '杀劫', text: '精英翻倍，法宝掉落翻倍', flag: 'dailyShajie' },
  { id: 'pinji', name: '贫瘠之年', text: '坊市涨价 50%，斩尘缘免费且不限次', flag: 'dailyPinji' },
  { id: 'wanwu', name: '万物有灵', text: '全部敌人随机换五行', flag: 'dailyWanwu' },
  { id: 'xinmo', name: '心魔滋长', text: '开局心魔 4', flag: 'dailyXinmo' },
  { id: 'wenluan', name: '天机紊乱', text: '意图数值隐藏，抽牌 +1', flag: 'dailyWenluan' },
  { id: 'guiyi', name: '五行归一', text: '本日奖励只出某一行的卡', flag: 'dailyGuiyi' },
  { id: 'zhaolu', name: '朝露之命', text: '开局寿元 30，但突破延寿翻倍', flag: 'dailyZhaolu' },
  { id: 'yinguo', name: '因果昭昭', text: '事件节点概率翻倍', flag: 'dailyYinguo' },
];

/** 今日日期键（本地时区，YYYY-MM-DD） */
export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 今日统一种子 */
export function dailySeed(): string {
  return `TIANJI-${todayKey()}`;
}

/** 今日变异规则（由日期种子确定） */
export function dailyMutation(): DailyMutation {
  const h = hashSeed(dailySeed());
  return DAILY_MUTATIONS[h % DAILY_MUTATIONS.length];
}
