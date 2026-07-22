/**
 * 突破奖励（策划案 §9.5，幕 Boss 后三选一，从奖励池抽 3）
 */

export interface BreakthroughDef {
  id: string;
  name: string;
  text: string;
}

export const BREAKTHROUGHS: Record<string, BreakthroughDef> = {};
function def(b: BreakthroughDef) {
  BREAKTHROUGHS[b.id] = b;
}

def({ id: 'jindanningcheng', name: '金丹凝成', text: '灵气上限 +1' });
def({ id: 'roushenchengsheng', name: '肉身成圣', text: '气血上限 +12，每场战斗开局 +5 护体' });
def({ id: 'shenshidazhang', name: '神识大涨', text: '每回合抽牌 +1；气血上限 −8' });
def({ id: 'wuxingtiaohe', name: '五行调和', text: '行云流水加成 25% → 40%' });
def({ id: 'jianxin_genji', name: '剑心通明（根基）', text: '你的金牌 +2 伤' });
def({ id: 'houde_genji', name: '厚德载物（根基）', text: '回合结束保留至多 10 护体' });
def({ id: 'yaowangchuancheng', name: '药王传承', text: '丹药上限 +2，立获 2 枚随机丹' });
def({ id: 'tianshengdaoti', name: '天生道体', text: '每回合第一次行云流水额外 +1 灵气' });
def({ id: 'dadaozhijian', name: '大道至简', text: '立即删除至多 2 张牌，气血上限 +10' });

export const BREAKTHROUGH_IDS = Object.keys(BREAKTHROUGHS);
