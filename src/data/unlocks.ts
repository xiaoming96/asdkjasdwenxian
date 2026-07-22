/**
 * 局外解锁树（策划案 §11.1）
 * 道行一次性消费解锁；不提供局内数值加成，只扩充内容池与便利性。
 */

export interface UnlockDef {
  id: string;
  name: string;
  cost: number;
  text: string;
  auto?: boolean; // 通关自动
}

export const UNLOCKS: Record<string, UnlockDef> = {};
function def(u: UnlockDef) {
  UNLOCKS[u.id] = u;
}

def({ id: 'cangjinge', name: '藏经阁', cost: 0, text: '图鉴功能（默认开）' });
def({ id: 'jianyichuji', name: '剑意初集', cost: 20, text: '金系稀有 3 张入池' });
def({ id: 'qingnangcanjuan', name: '青囊残卷', cost: 20, text: '木系稀有 3 张入池' });
def({ id: 'dongfuliandan', name: '洞府炼丹', cost: 30, text: '洞府第三选项"炼丹"' });
def({ id: 'xuanshuixinde', name: '玄水心得', cost: 30, text: '水系史诗 2 张入池' });
def({ id: 'lihuoxinde', name: '离火心得', cost: 30, text: '火系史诗 2 张入池' });
def({ id: 'houtuxinde', name: '厚土心得', cost: 30, text: '土系史诗 2 张入池' });
def({ id: 'qiankundai', name: '乾坤袋', cost: 40, text: '起始 +15 灵石' });
def({ id: 'chuanshuomizong', name: '传说觅踪', cost: 50, text: '传说卡入 Boss 奖励池' });
def({ id: 'jiebaomiwen', name: '劫宝秘闻', cost: 50, text: '劫宝入隐藏事件池' });
def({ id: 'meiritianji', name: '每日天机', cost: 60, text: '解锁每日挑战模式' });
def({ id: 'yichongtian', name: '一重天', cost: 0, text: '解锁难度阶梯（通关自动）', auto: true });
def({ id: 'tixiu_tieniu', name: '体修·铁牛', cost: 80, text: '新角色（土/木向）' });
def({ id: 'danxiu_qingheng', name: '丹修·青蘅', cost: 120, text: '新角色（水/火向，药毒流）' });
def({ id: 'guanxingtai', name: '观星台', cost: 40, text: '结算页显示种子与统计明细，可复制种子开局' });
def({ id: 'daohaopu', name: '道号谱', cost: 30, text: '通关道号收集页' });

/** 解锁节点 → 锁定的卡（未解锁时不入奖励/坊市池） */
export const LOCKED_CARDS: Record<string, string[]> = {
  jianyichuji: ['wanjianjue', 'jianqizongheng', 'gengjinjianyu'],
  qingnangcanjuan: ['qianmuci', 'chunhuidadi', 'gumuchangqing'],
  xuanshuixinde: ['tianyishengshui', 'canghainachuan'],
  lihuoxinde: ['huodezhenshen', 'yuhuoniepan'],
  houtuxinde: ['budongrushan', 'wahuangxirang'],
};

export function lockedCardIds(unlocked: string[]): Set<string> {
  const locked = new Set<string>();
  for (const [node, cards] of Object.entries(LOCKED_CARDS)) {
    if (!unlocked.includes(node)) for (const c of cards) locked.add(c);
  }
  return locked;
}

/** 角色起始卡组 */
export const CHARACTERS: Record<string, { name: string; deck: string[]; unlock: string | null }> = {
  jianxiu: {
    name: '剑修',
    deck: ['yujianshu', 'yujianshu', 'yujianshu', 'yujianshu', 'yujianshu', 'tiebushan', 'tiebushan', 'tiebushan', 'tiebushan', 'yinlingjue'],
    unlock: null,
  },
  tieniu: {
    name: '体修·铁牛',
    deck: ['luoshi', 'luoshi', 'luoshi', 'tiebushan', 'tiebushan', 'tiebushan', 'panshijue', 'panshijue', 'tengmanfu', 'shengshengbuxi'],
    unlock: 'tixiu_tieniu',
  },
  qingheng: {
    name: '丹修·青蘅',
    deck: ['xuanbingci', 'xuanbingci', 'huodanshu', 'huodanshu', 'zhangduzhi', 'zhangduzhi', 'jingxin', 'jingxin', 'yinlingjue', 'huichunshu'],
    unlock: 'danxiu_qingheng',
  },
};
