/**
 * 法宝系统（策划案 §6，25 件）
 * 效果钩子在 combat.ts / run.ts 中按 id 检查实现。
 */

export type RelicGrade = 'fan' | 'ling' | 'xian' | 'jie';

export interface RelicDef {
  id: string;
  name: string;
  grade: RelicGrade;
  text: string;
}

export const RELIC_GRADE_NAME: Record<RelicGrade, string> = {
  fan: '凡品',
  ling: '灵品',
  xian: '仙品',
  jie: '劫宝',
};

export const RELICS: Record<string, RelicDef> = {};
function def(r: RelicDef) {
  RELICS[r.id] = r;
}

// 凡品 10
def({ id: 'taomujian', name: '桃木剑', grade: 'fan', text: '每场战斗你的第一张攻击牌 +4 伤' });
def({ id: 'baguajing', name: '八卦镜', grade: 'fan', text: '每场战斗第一次受到的攻击伤害减半' });
def({ id: 'pinganfu', name: '平安符', grade: 'fan', text: '洞府休整额外回 8 血' });
def({ id: 'tongqianjian', name: '铜钱剑', grade: 'fan', text: '坊市卡牌 9 折' });
def({ id: 'dengxincao', name: '灯芯草', grade: 'fan', text: '每回合第一张火牌 +3 伤' });
def({ id: 'luopan', name: '罗盘', grade: 'fan', text: '未知节点（?）显示真实类型' });
def({ id: 'yuhulu', name: '玉葫芦', grade: 'fan', text: '丹药携带上限 +1' });
def({ id: 'putuan', name: '蒲团', grade: 'fan', text: '洞府参悟时额外回 6 血' });
def({ id: 'zhujian', name: '竹简', grade: 'fan', text: '战斗卡牌奖励可跳过换 8 灵石' });
def({ id: 'moyupixiu', name: '墨玉貔貅', grade: 'fan', text: '每场战斗结束额外 +3 灵石' });

// 灵品 8
def({ id: 'wuxingzhu', name: '五行珠', grade: 'ling', text: '每回合第一次行云流水额外 +1 灵气返还' });
def({ id: 'leijimu', name: '雷击木', grade: 'ling', text: '每场战斗第 3 回合 +1 灵气' });
def({ id: 'xuanguijia', name: '玄龟甲', grade: 'ling', text: '战斗开始获得 8 护体' });
def({ id: 'jiuweihuhao', name: '九尾狐毫', grade: 'ling', text: '每局一次：事件的负面结果重掷' });
def({ id: 'qingtongdanlu', name: '青铜丹炉', grade: 'ling', text: '每 3 场战斗获得 1 枚随机丹药' });
def({ id: 'jiansui', name: '剑穗', grade: 'ling', text: '每打出 3 张金牌抽 1' });
def({ id: 'hetu', name: '河图', grade: 'ling', text: '五行周天触发时额外 +1 灵气' });
def({ id: 'luoshu', name: '洛书', grade: 'ling', text: '每回合可保留 1 张手牌不弃置' });

// 仙品 4
def({ id: 'kunlunjing', name: '昆仑镜', grade: 'xian', text: '每回合第一张牌费用 −1' });
def({ id: 'bumiedeng', name: '不灭灯', grade: 'xian', text: '每局一次：致死伤害改为保留 1 血' });
def({ id: 'pantao', name: '蟠桃', grade: 'xian', text: '获得时气血上限 +20 并回满' });
def({ id: 'taijitu', name: '太极图', grade: 'xian', text: '相克乘区 ×1.5 → ×1.75' });

// 劫宝 3
def({ id: 'tianleicuiti', name: '天雷淬体', grade: 'jie', text: '每场战斗开始，对全体敌人 4 伤' });
def({ id: 'xinmozhong', name: '心魔种', grade: 'jie', text: '灵气上限 +1；每场战斗开始受 4 伤' });
def({ id: 'yingbiantaiguang', name: '婴变胎光', grade: 'jie', text: '回合结束若未打出攻击牌，下回合 +2 灵气' });

export function relicsByGrade(grade: RelicGrade): RelicDef[] {
  return Object.values(RELICS).filter((r) => r.grade === grade);
}

export function getRelic(id: string): RelicDef {
  const r = RELICS[id];
  if (!r) throw new Error(`未知法宝: ${id}`);
  return r;
}
