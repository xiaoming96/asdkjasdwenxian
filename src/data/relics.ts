/**
 * 法宝系统（策划案 §6，25 件，v3 效果表）
 *
 * 本文件只是数据表（id/name/grade/text），效果的具体实现在引擎里：
 *   - 挂点 combat = src/core/combat.ts（战斗内钩子，按 id 检查）
 *   - 挂点 run    = src/core/run.ts（地图/坊市/洞府/事件/奖励等局内钩子）
 *
 * id 全部沿用 v2；获取途径：精英必掉、坊市购买、事件；同名法宝不重复。
 * 劫宝仅九重天难度或隐藏事件掉落，纳劫宝加心魔（心魔结算在 run.ts 纳取时刻）。
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

// ───────── 凡品 10 ─────────

// 挂点 combat：每场战斗首次触发【克伐】时，该击伤害 +6
def({ id: 'taomujian', name: '桃木剑', grade: 'fan', text: '每场战斗你第一次触发【克伐】时，该击额外 +6 伤' });
// 挂点 combat：每场战斗首次"敌攻克制你护体"时，克制判定改为平属（1:1 消耗护体）
def({ id: 'baguajing', name: '八卦镜', grade: 'fan', text: '每场战斗第一次"敌攻克制你护体"时，改判为平属（1:1）' });
// 挂点 run：每幕第一次失去寿元时减免 2 年（幕切换时重置标记）
def({ id: 'pinganfu', name: '平安符', grade: 'fan', text: '每幕第一次失去寿元时，减免 2 年' });
// 挂点 run：每座坊市结算首件购买半价（每座坊市各自重置）
def({ id: 'tongqianjian', name: '铜钱剑', grade: 'fan', text: '每座坊市首件购买半价' });
// 挂点 combat：己方施加的灼烧衰减规则改为每回合 −1（覆盖默认减半衰减）
def({ id: 'dengxincao', name: '灯芯草', grade: 'fan', text: '你施加的灼烧衰减改为每回合 −1（不再减半）' });
// 挂点 run：地图生成/渲染时秘境节点（?）显示真实类型
def({ id: 'luopan', name: '罗盘', grade: 'fan', text: '秘境节点（?）显示真实类型' });
// 挂点 run：丹盒容量 elixirCap +1；每幕 1 次炼丹不耗寿元（幕切换时重置）
def({ id: 'yuhulu', name: '玉葫芦', grade: 'fan', text: '丹盒 +1 格；每幕 1 次炼丹不耗寿元' });
// 挂点 run：洞府各行动的寿元消耗 −1 年（下限 1 年）
def({ id: 'putuan', name: '蒲团', grade: 'fan', text: '洞府行动寿元消耗 −1 年（下限 1）' });
// 挂点 run：战斗奖励界面卡牌奖励可跳过转录，改得任意灵材 ×2
def({ id: 'zhujian', name: '竹简', grade: 'fan', text: '战斗卡牌奖励可跳过，转录为拓片：得任意灵材 ×2' });
// 挂点 run：战斗灵石奖励 +30%；每幕开始心魔 +1
def({ id: 'moyupixiu', name: '墨玉貔貅', grade: 'fan', text: '战斗灵石奖励 +30%；每幕开始心魔 +1（貔貅吞财，天道记账）' });

// ───────── 灵品 8 ─────────

// 挂点 combat：每回合第一次触发得气段时，额外吐纳 +1
def({ id: 'wuxingzhu', name: '五行珠', grade: 'ling', text: '每回合第一次得气时，额外吐纳 +1' });
// 挂点 combat：每次触发五行周天时，对全体敌人降小雷（8 伤）
def({ id: 'leijimu', name: '雷击木', grade: 'ling', text: '每次触发五行周天，对全体敌人降小雷（8 伤）' });
// 挂点 combat：己方土属性护体回合结束不衰减
def({ id: 'xuanguijia', name: '玄龟甲', grade: 'ling', text: '你的土属性护体回合结束不衰减' });
// 挂点 run：每局一次，事件的负面结果可重掷（用后本局失效）
def({ id: 'jiuweihuhao', name: '九尾狐毫', grade: 'ling', text: '每局一次：事件的负面结果重掷' });
// 挂点 run：解锁地图任意处炼丹（无需洞府节点；寿元照耗）
def({ id: 'qingtongdanlu', name: '青铜丹炉', grade: 'ling', text: '炉火常温：洞府炼丹不计入两项行动之数（寿元照耗）' });
// 挂点 combat：金牌得气段触发时，该牌伤害 +2
def({ id: 'jiansui', name: '剑穗', grade: 'ling', text: '你的金牌得气段触发时，该牌 +2 伤' });
// 挂点 combat：每场战斗开始行位初始化为玩家选定之行（开局即可接顺生链）
def({ id: 'hetu', name: '河图', grade: 'ling', text: '每场战斗开始，行位初始为你选定之行（开局即可接链）' });
// 挂点 combat：袖藏（回合结束保留手牌）上限 +1，共可留 2 张
def({ id: 'luoshu', name: '洛书', grade: 'ling', text: '袖藏上限 +1（共 2 张）' });

// ───────── 仙品 4 ─────────

// 挂点 combat：每场战斗 1 次，结束回合时将全部手牌袖藏至下回合
def({ id: 'kunlunjing', name: '昆仑镜', grade: 'xian', text: '每场战斗 1 次：结束回合时将全部手牌袖藏至下回合' });
// 挂点 combat：每局一次，受致死伤害时燃寿 10 年保留 1 血（燃寿走 run 侧寿元账）
def({ id: 'bumiedeng', name: '不灭灯', grade: 'xian', text: '每局一次：受致死伤害时燃寿 10 年，保留 1 血' });
// 挂点 run：纳取时一次性结算寿元 +15 年、气血上限 +15
def({ id: 'pantao', name: '蟠桃', grade: 'xian', text: '获得时寿元 +15 年，气血上限 +15' });
// 挂点 combat：己方双行牌与无属性牌均视为【随行】，自动顺生接链
def({ id: 'taijitu', name: '太极图', grade: 'xian', text: '你的双行牌与无属性牌均视为【随行】（自动顺生接链）' });

// ───────── 劫宝 3 ─────────

// 挂点 combat：每场战斗开始对全体敌人 8 雷伤、自身受 3 伤；挂点 run：纳取时心魔 +2
def({ id: 'tianleicuiti', name: '天雷淬体', grade: 'jie', text: '每场战斗开始对全体敌人 8 雷伤，自身受 3 伤；纳取时心魔 +2' });
// 挂点 run：气海上限 poolCap +2；纳取时心魔 +3，且本局心魔下限锁为 3
def({ id: 'xinmozhong', name: '心魔种', grade: 'jie', text: '气海上限 +2；纳取时心魔 +3，且本局心魔不可低于 3' });
// 挂点 combat：死亡结算时若寿元 ≥20 年，燃尽至 10 年并复活至 30% 气血（每局一次）；挂点 run：纳取时心魔 +2
def({ id: 'yingbiantaiguang', name: '婴变胎光', grade: 'jie', text: '死亡时若寿元 ≥20 年：燃尽至 10 年，原地重修复活至 30% 气血（每局一次）；纳取时心魔 +2' });

export function relicsByGrade(grade: RelicGrade): RelicDef[] {
  return Object.values(RELICS).filter((r) => r.grade === grade);
}

export function getRelic(id: string): RelicDef {
  const r = RELICS[id];
  if (!r) throw new Error(`未知法宝: ${id}`);
  return r;
}
