/**
 * 里程碑与角色（策划案 v3 §11.1，替代已删除的 unlocks.ts）
 * v3 删除"道行解锁树"：道行（daowei）只涨不花，里程碑按阈值自动解锁；
 * 卡池渐进与道行无关，按 runsTotal 自动推进（第 1 局精简池 → 第 4 局起全池）。
 */

export interface MilestoneDef {
  id: string;
  name: string;
  daowei: number; // 达到此道行自动解锁
  text: string;
}

/** 里程碑表（§11.1，按道行阈值升序） */
export const MILESTONES: MilestoneDef[] = [
  { id: 'cangjinge', name: '藏经阁', daowei: 0, text: '图鉴功能（默认开）' },
  { id: 'guanxingtai', name: '观星台', daowei: 20, text: '结算页显示种子与统计明细，可复制种子开局' },
  { id: 'daohaopu', name: '道号谱', daowei: 30, text: '通关道号收集页' },
  { id: 'meiritianji', name: '每日天机', daowei: 50, text: '每日挑战模式' },
  { id: 'jiebaomiwen', name: '劫宝秘闻', daowei: 80, text: '劫宝进入隐藏事件池' },
  { id: 'tixiu_tieniu', name: '体修·铁牛', daowei: 120, text: '新角色（土/木向，起始卡组不同）' },
  { id: 'danxiu_qingheng', name: '丹修·青蘅', daowei: 240, text: '新角色（水/火向，药毒流）' },
];

/**
 * 计算当前已解锁集合：里程碑 id + 卡池层级标记。
 * 卡池渐进（§11.1，按 runsTotal 自动推进，与道行无关）：
 *   第 1 局（runsTotal=0）只有普通卡池；
 *   runsTotal ≥1 → 'pool_rare'（第 2 局稀有全开）；
 *   runsTotal ≥2 → 'pool_epic'（第 3 局史诗入池）；
 *   runsTotal ≥3 → 'pool_legendary'（第 4 局起全池）。
 * dailyMode=true（每日天机，§11.3 公平性强制统一配置）：返回全部里程碑与全部 pool_*。
 */
export function computeUnlocked(
  profile: { daowei: number; runsTotal: number },
  dailyMode?: boolean,
): string[] {
  if (dailyMode) {
    return [...MILESTONES.map((m) => m.id), 'pool_rare', 'pool_epic', 'pool_legendary'];
  }
  const unlocked: string[] = [];
  for (const m of MILESTONES) {
    if (profile.daowei >= m.daowei) unlocked.push(m.id);
  }
  if (profile.runsTotal >= 1) unlocked.push('pool_rare');
  if (profile.runsTotal >= 2) unlocked.push('pool_epic');
  if (profile.runsTotal >= 3) unlocked.push('pool_legendary');
  return unlocked;
}

/**
 * 角色起始卡组（v3：每人 8 张，均含本命牌"问长生·残卷" canjuan，不可斩去）。
 * unlock 为对应里程碑 id（null = 初始可用）。
 */
export const CHARACTERS: Record<string, { name: string; deck: string[]; unlock: string | null }> = {
  jianxiu: {
    name: '剑修',
    deck: ['yujianshu', 'yujianshu', 'yujianshu', 'shouzhong', 'shouzhong', 'runfeng', 'yinlingjue', 'canjuan'],
    unlock: null,
  },
  tieniu: {
    name: '体修·铁牛',
    // 土/木向：重护体与固本回春
    deck: ['luoshi', 'luoshi', 'shouzhong', 'shouzhong', 'panshijue', 'tengmanfu', 'huichunshu', 'canjuan'],
    unlock: 'tixiu_tieniu',
  },
  qingheng: {
    name: '丹修·青蘅',
    // 水/火向：药毒流
    deck: ['huodanshu', 'huodanshu', 'xuanbingci', 'zhangduzhi', 'jingxin', 'yinlingjue', 'zhulongzhimu', 'canjuan'],
    unlock: 'danxiu_qingheng',
  },
};
