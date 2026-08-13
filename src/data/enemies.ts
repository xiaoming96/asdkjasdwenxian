/**
 * 敌人设计 v3（策划案 v3.0 §8：28 普通 + 6 精英 + 3 Boss + 九重天劫波次）
 *
 * 约定（与 core/combat.ts 共同遵守，special/ai 语义见 core/types.ts EnemyMove 注释）：
 * - moves 为循环行为模式（moveIndex 取模）；"每第 3 回合 X" 用三步循环表达。
 * - element 字段即该敌人攻击自带的五行属性（与玩家护体属性做生克，§4.4 ⑤）。
 * - 条件行为（"性情"）走 ai 脚本：combat.ts 读 ai 字段覆盖默认循环。
 * - note 字段 = 策划案表格最后一列的"教学点 / 性情"说明，供图鉴与设计参考。
 * - 敌人 id 全部沿用 v2（美术素材复用）。
 */
import type { EnemyDef } from '../core/types';

export const ENEMIES: Record<string, EnemyDef> = {};

function def(e: EnemyDef) {
  ENEMIES[e.id] = e;
}

// ================= 第一幕（炼气~筑基）普通敌人（10，§8.2） =================

def({
  id: 'zhiren', name: '纸人', element: 'none', hp: 16, count: 3, act: 1, tier: 'normal',
  note: 'AOE 价值',
  moves: [{ id: 'scratch', name: '抓挠', kind: 'attack', damage: 4 }],
});
def({
  id: 'yehu', name: '野狐', element: 'wood', hp: 36, act: 1, tier: 'normal', ai: 'yehu',
  note: '干扰节奏；性情：你手牌 ≥6 时必用魅惑',
  moves: [
    { id: 'bite', name: '咬', kind: 'attack', damage: 7 },
    { id: 'meihuo', name: '魅惑', kind: 'debuff', applyPlayer: { drawDown: 1 } },
  ],
});
def({
  id: 'denglonggui', name: '灯笼鬼', element: 'fire', hp: 42, act: 1, tier: 'normal',
  note: '增长型要速杀；水护体挡火攻',
  moves: [
    { id: 'ranyan', name: '燃焰', kind: 'attack', damage: 6, applyPlayer: { zhuoshao: 1 } },
    { id: 'ziran', name: '自燃', kind: 'buff', gainSelf: { gangqi: 2 } },
  ],
});
def({
  id: 'yinfeng', name: '阴风', element: 'water', hp: 38, act: 1, tier: 'normal',
  note: '负面节奏',
  moves: [
    { id: 'yinxi', name: '阴袭', kind: 'attack', damage: 6 },
    { id: 'shigufeng', name: '蚀骨风', kind: 'debuff', applyPlayer: { qizhi: 1 } },
  ],
});
def({
  id: 'shuigui', name: '水鬼', element: 'water', hp: 46, act: 1, tier: 'normal',
  note: '属性护体教学：它的水攻克你的火护体',
  moves: [
    { id: 'tuozhuai1', name: '拖拽', kind: 'attack', damage: 9 },
    { id: 'qianshui', name: '潜水', kind: 'defend', block: 10 },
    { id: 'tuozhuai2', name: '拖拽', kind: 'attack', damage: 9 },
  ],
});
def({
  id: 'sheyao', name: '蛇妖', element: 'wood', hp: 52, act: 1, tier: 'normal',
  note: '持续伤害压力',
  moves: [
    { id: 'duya', name: '毒牙', kind: 'attack', damage: 7, applyPlayer: { zhangdu: 2 } },
    { id: 'tuxin', name: '吐信', kind: 'debuff', applyPlayer: { qizhi: 1 } },
  ],
});
def({
  id: 'tiaoshi', name: '跳尸', element: 'earth', hp: 60, act: 1, tier: 'normal',
  note: '大招回合叠护体；木攻【破土】它',
  moves: [
    { id: 'nao', name: '挠', kind: 'attack', damage: 6 },
    { id: 'xuli', name: '蓄力', kind: 'charge' },
    { id: 'mengpu', name: '猛扑', kind: 'attack', damage: 18 },
  ],
});
def({
  id: 'shanxiao', name: '山魈', element: 'metal', hp: 64, act: 1, tier: 'normal', ai: 'shanxiao',
  note: '敌人会读行位；性情：你行位为金时，夺魂嚎改为对你 11 伤（与你争锋）',
  moves: [
    { id: 'shifu', name: '石斧', kind: 'attack', damage: 9 },
    { id: 'duohunhao', name: '夺魂嚎', kind: 'buff', gainSelf: { gangqi: 2 } },
  ],
});
def({
  id: 'huoya', name: '火鸦', element: 'fire', hp: 24, count: 2, act: 1, tier: 'normal', ai: 'huoya',
  note: '击杀顺序；性情：同伴死亡后 +2 罡气',
  moves: [{ id: 'zhuo', name: '啄', kind: 'attack', damage: 5 }],
});
def({
  id: 'shijing', name: '石精', element: 'earth', hp: 70, act: 1, tier: 'normal',
  note: '【破土】/【熔锻】价值',
  moves: [
    { id: 'yanke', name: '岩壳', kind: 'defend', block: 10, gainSelf: { guben: 1 } },
    { id: 'zaji', name: '砸击', kind: 'attack', damage: 12 },
  ],
});

// ================= 第一幕精英（2，§8.3） =================
// 黑白无常为双体精英：elitePool 只出黑无常，入场时由 combat 同场生成白无常。

def({
  id: 'heiwuchang', name: '黑无常', element: 'water', hp: 64, act: 1, tier: 'elite', ai: 'wuchang',
  note: '集火顺序与速战；勾魂催你速战（拖久记贪账）；性情：白无常死亡后狂暴（每回合 +2 罡气）',
  moves: [
    { id: 'suohun1', name: '锁魂', kind: 'attack', damage: 9 },
    { id: 'suohun2', name: '锁魂', kind: 'attack', damage: 9 },
    { id: 'gouhun', name: '勾魂', kind: 'debuff', special: 'zhihun' }, // 每第 3 回合：你心魔 +1
  ],
});
def({
  id: 'baiwuchang', name: '白无常', element: 'metal', hp: 58, act: 1, tier: 'elite', ai: 'wuchang_bai',
  note: '辅助位：招魂幡为黑无常 +3 罡气或 +10 护体；性情：黑无常死亡后狂暴（每回合 +2 罡气）',
  moves: [{ id: 'zhaohunfan', name: '招魂幡', kind: 'buff', special: 'zhaohun' }],
});
def({
  id: 'tongjiashi', name: '铜甲尸', element: 'metal', hp: 140, act: 1, tier: 'elite', ai: 'tongjiashi',
  note: '压制输出轴（火攻【熔锻】剥壳）、丹毒外源管理；被动：每回合 +8 金护体（ai 脚本处理）',
  moves: [
    { id: 'huizhao1', name: '挥爪', kind: 'attack', damage: 10 },
    { id: 'huizhao2', name: '挥爪', kind: 'attack', damage: 10 },
    { id: 'shidu', name: '尸毒', kind: 'debuff', special: 'shidu' }, // 每第 3 回合：你丹毒 +1
  ],
});

// ================= 第一幕 Boss：筑基雷劫·雷灵傀儡（§8.4） =================
// 劫雷机制走 ai 'leiling' 脚本：第 4/8/12 回合降下 22/30/38 伤金属性劫雷（提前 1 回合明示，
// 憋火护体承接是最优解——护体属性期中考试）；第三道劫雷后狂暴：每回合 +2 罡气。

def({
  id: 'leiling_kuilei', name: '雷灵傀儡', element: 'metal', hp: 300, act: 1, tier: 'boss', ai: 'leiling',
  note: '护体属性期中考试：劫雷（金）用火护体承接；第三道劫雷后狂暴（软性斩杀计时器）',
  moves: [
    { id: 'leiyin', name: '雷引', kind: 'defend', block: 10, gainSelf: { gangqi: 1 } },
    { id: 'tianleixili', name: '天雷洗礼', kind: 'attack', damage: 14 },
    { id: 'lianhuanlei', name: '连环雷', kind: 'attack', damage: 7, times: 2 },
  ],
});

// ================= 第二幕（筑基~金丹）普通敌人（10，§8.5） =================

def({
  id: 'huapi', name: '画皮', element: 'water', hp: 96, act: 2, tier: 'normal',
  note: '双负面压力：气滞削你输出、破绽放大它下刀',
  moves: [
    { id: 'simian', name: '撕面', kind: 'attack', damage: 12 },
    { id: 'huanhuo', name: '幻惑', kind: 'debuff', applyPlayer: { qizhi: 1, pozhan: 1 } },
  ],
});
def({
  id: 'zhizhujing', name: '蜘蛛精', element: 'wood', hp: 110, act: 2, tier: 'normal',
  note: '织网封你袖藏：手牌规划被打断的回合要提前想好',
  moves: [
    { id: 'zhiwang', name: '织网', kind: 'debuff', special: 'zhiwang' }, // 你本回合结束无法袖藏（sleeveBan 1）
    { id: 'shiyao', name: '噬咬', kind: 'attack', damage: 10, applyPlayer: { zhangdu: 3 } },
  ],
});
def({
  id: 'shuihouzi', name: '水猴子', element: 'water', hp: 100, act: 2, tier: 'normal',
  note: '偷灵蚀你气海：筑基后灵气储蓄不再绝对安全',
  moves: [
    { id: 'touxi', name: '偷袭', kind: 'attack', damage: 9 },
    { id: 'touling', name: '偷灵', kind: 'debuff', special: 'touling' }, // 你下回合吐纳 −1（tunaDown 1）
  ],
});
def({
  id: 'nuomiangui', name: '傩面鬼', element: 'none', hp: 105, act: 2, tier: 'normal',
  note: '换面随机三选一（+10 护体 / +2 罡气 / 施你气滞 1）：面对不确定性的防御规划',
  moves: [
    { id: 'huanmian', name: '换面', kind: 'buff', special: 'huanmian' },
    { id: 'jida', name: '击打', kind: 'attack', damage: 10 },
  ],
});
def({
  id: 'gunv', name: '骨女', element: 'water', hp: 115, act: 2, tier: 'normal',
  note: '悲泣磨你牌库：抽牌堆顶 2 张进弃牌堆，循环轴被拉长',
  moves: [
    { id: 'changu', name: '缠骨', kind: 'attack', damage: 10 },
    { id: 'beiqi', name: '悲泣', kind: 'debuff', special: 'beiqi' }, // 你牌库顶 2 张进弃牌堆
  ],
});
def({
  id: 'panguanbiling', name: '判官笔灵', element: 'metal', hp: 125, act: 2, tier: 'normal',
  note: '朱批记你破绽：吃 2 层破绽后的戳很痛，优先解或抢节奏',
  moves: [
    { id: 'zhupi', name: '朱批', kind: 'debuff', applyPlayer: { pozhan: 2 } },
    { id: 'chuo', name: '戳', kind: 'attack', damage: 12 },
  ],
});
def({
  id: 'yecha', name: '夜叉', element: 'fire', hp: 120, act: 2, tier: 'normal',
  note: '火吼自伤换罡气：增长型，越拖越凶',
  moves: [
    { id: 'huiji', name: '挥戟', kind: 'attack', damage: 14 },
    { id: 'huohou', name: '火吼', kind: 'buff', gainSelf: { gangqi: 2 }, loseSelfHp: 2 },
  ],
});
def({
  id: 'shiqun', name: '尸群', element: 'earth', hp: 28, count: 4, act: 2, tier: 'normal', ai: 'shiqun',
  note: 'AOE 与斩杀节奏：每死 1 只，余者 +1 罡气——慢刀会越砍越痛',
  moves: [{ id: 'nao', name: '挠', kind: 'attack', damage: 5 }],
});
def({
  id: 'zheng', name: '狰', element: 'fire', hp: 130, act: 2, tier: 'normal', ai: 'zheng',
  note: '性情：你有火护体时优先咆哮（欺火）——它知道火护体挡不住它的火攻',
  moves: [
    { id: 'baozhua1', name: '豹爪', kind: 'attack', damage: 12 },
    { id: 'paoxiao', name: '咆哮', kind: 'debuff', applyPlayer: { drawDown: 1 } },
    { id: 'baozhua2', name: '豹爪', kind: 'attack', damage: 14 },
  ],
});
def({
  id: 'jinjiakuilei', name: '金甲傀儡', element: 'metal', hp: 145, act: 2, tier: 'normal',
  note: '高频攻 + 厚金护体：【熔锻】直击、【剪伐】拆增益的教材',
  moves: [
    { id: 'jianbi', name: '剑臂', kind: 'attack', damage: 11, times: 2 },
    { id: 'chonggou', name: '重构', kind: 'defend', block: 14 },
  ],
});

// ================= 第二幕精英（2，§8.6） =================

def({
  id: 'huyaojiangjun', name: '虎妖将军', element: 'metal', hp: 250, act: 2, tier: 'elite',
  note: '横扫击碎护体：不能只靠一层薄盾苟，护体要留冗余或掐它的循环',
  moves: [
    { id: 'huxiao', name: '虎啸', kind: 'buff', gainSelf: { gangqi: 2 } },
    { id: 'pikan', name: '劈砍', kind: 'attack', damage: 18 },
    { id: 'hengsao', name: '横扫', kind: 'attack', damage: 14, special: 'suijia', n: 6 }, // 并击碎你 6 点护体
  ],
});
def({
  id: 'tengyao', name: '千年藤妖', element: 'wood', hp: 280, act: 2, tier: 'elite',
  note: '吸髓回血拖节奏、荆棘惩罚小刀连打：攒大点数、择时出手',
  moves: [
    { id: 'tengbian', name: '藤鞭', kind: 'attack', damage: 8, times: 2 },
    { id: 'xisui', name: '吸髓', kind: 'attack', damage: 9, special: 'xisui' }, // 对你 9 伤并自回等量
    { id: 'jingjizitai', name: '荆棘姿态', kind: 'buff', special: 'jingji', n: 5 }, // 2 回合内你每次攻击它受 5 伤
  ],
});

// ================= 第二幕 Boss：金丹心魔劫·心魔（§8.7） =================
// 你的心魔劫是你自己养大的——动态部分全部由 ai 'xinmo' 脚本处理：
// - 气血 = 380 + 40×心魔值（0~9 → 380~740；此处 hp 为基础 380）；
// - 属性轮转：每 2 回合按相生顺序切换自身五行（木→火→土→金→水），攻击属性同步变；
// - 行为池按心魔值解锁：道心拷问（≥3）、贪影 tanying（≥7 洗【贪嗔】入你抽牌堆）；
// - 执念相变：每损失 1/3 血量召执念分身（心魔 ≥6 召 2 只否则 1 只），本体蓄力 2 回合放
//   "心魔劫雷 26"（存活分身每只 +8）；劫数蓄力不可被浇熄，杀分身直接削减劫雷伤害；
// - 道心通明：心魔 0 进场 → 仅 380 血、无分身相变，胜后获【明镜止水】。

def({
  id: 'xinmo', name: '心魔', element: 'none', hp: 380, act: 2, tier: 'boss', ai: 'xinmo',
  note: '克伐与护体属性的期末考试；心魔值决定血量与行为池——贪账是它的粮草',
  moves: [
    { id: 'diyu', name: '心魔低语', kind: 'unknown', special: 'diyu' },     // 复制你卡组基础伤害最高的攻击牌打向你
    { id: 'kaowen', name: '道心拷问', kind: 'unknown', special: 'kaowen' }, // 二选一：弃 2 或受 16（心魔 ≥5：弃 3 或受 22）
    { id: 'tunshi', name: '吞噬', kind: 'attack', damage: 14, special: 'tunshi' }, // 对你 14 伤并自回 14
  ],
});
def({
  id: 'zhinian', name: '执念分身', element: 'none', hp: 50, act: 2, tier: 'boss',
  note: '心魔相变召出：杀一只即削心魔劫雷 8 伤——是压力也是解题口',
  moves: [{ id: 'nianya', name: '念压', kind: 'attack', damage: 4 }],
});

// ================= 第三幕（金丹~飞升）普通敌人（8，§8.8） =================

def({
  id: 'yinbing', name: '阴兵', element: 'earth', hp: 60, count: 3, act: 3, tier: 'normal', ai: 'yinbing',
  note: '列阵：存活 ≥2 时各 +5 护体/回合——集火破阵优于平均伤害',
  moves: [{ id: 'chuo', name: '戳', kind: 'attack', damage: 7 }],
});
def({
  id: 'jianzhongyiling', name: '剑冢遗灵', element: 'metal', hp: 190, act: 3, tier: 'normal',
  note: '多段小刀 + 剑意滚罡气：【剪伐】拆增益、厚护体扛多段',
  moves: [
    { id: 'wanjian', name: '万剑', kind: 'attack', damage: 8, times: 3 },
    { id: 'jianyi', name: '剑意', kind: 'buff', gainSelf: { gangqi: 3 } },
  ],
});
def({
  id: 'leishou', name: '雷兽', element: 'metal', hp: 200, act: 3, tier: 'normal',
  note: '三步循环大招：蓄雷回合是输出/叠火护体的窗口',
  moves: [
    { id: 'leijia', name: '雷甲', kind: 'defend', block: 12, gainSelf: { gangqi: 1 } },
    { id: 'xulei', name: '蓄雷', kind: 'charge' },
    { id: 'leiya', name: '雷牙', kind: 'attack', damage: 22 },
  ],
});
def({
  id: 'wangchuandugui', name: '忘川渡鬼', element: 'water', hp: 210, act: 3, tier: 'normal',
  note: '摆渡封你 2 回合袖藏：依赖袖藏续航的构筑要备好当回合解法',
  moves: [
    { id: 'baidu', name: '摆渡', kind: 'debuff', special: 'baidu' }, // 你 2 回合无法袖藏（sleeveBan 2）
    { id: 'chuanjiang', name: '船桨', kind: 'attack', damage: 16 },
  ],
});
def({
  id: 'jiuweihusi', name: '九尾狐嗣', element: 'wood', hp: 220, act: 3, tier: 'normal',
  note: '魅乱双负面接重咬：解负面或用护体属性对冲它的木攻',
  moves: [
    { id: 'meiluan', name: '魅乱', kind: 'debuff', applyPlayer: { qizhi: 1, pozhan: 1 } },
    { id: 'siyao', name: '撕咬', kind: 'attack', damage: 18 },
  ],
});
def({
  id: 'dinglukuilei', name: '鼎炉傀儡', element: 'fire', hp: 225, act: 3, tier: 'normal',
  note: '炉温永久攀升（罡气不衰减）：硬计时器，水护体+速杀',
  moves: [
    { id: 'penyan', name: '喷焰', kind: 'attack', damage: 14, applyPlayer: { zhuoshao: 2 } },
    { id: 'luwen', name: '炉温上升', kind: 'buff', gainSelf: { gangqi: 1 } },
  ],
});
def({
  id: 'shiyuetiangou', name: '食月天狗', element: 'none', hp: 230, act: 3, tier: 'normal',
  note: '蓄力 2 回合意图问号：读不到数值的月蚀 28，防御要按最坏情况留',
  moves: [
    { id: 'tunyue1', name: '吞月', kind: 'unknown' },
    { id: 'tunyue2', name: '吞月', kind: 'unknown' },
    { id: 'yueshi', name: '月蚀', kind: 'attack', damage: 28 },
  ],
});
def({
  id: 'shanshencanxiang', name: '山神残像', element: 'earth', hp: 235, act: 3, tier: 'normal',
  note: '崩落自损 12 换 22 重击：它在自己倒计时，算好互换账',
  moves: [
    { id: 'shinu', name: '石怒', kind: 'attack', damage: 15 },
    { id: 'bengluo', name: '崩落', kind: 'attack', damage: 22, loseSelfHp: 12 },
  ],
});

// ================= 第三幕精英（2，§8.9） =================

def({
  id: 'jiao', name: '蛟', element: 'water', hp: 380, act: 3, tier: 'elite', ai: 'jiao',
  note: '性情：单回合被攻击 ≥3 次触发逆鳞（+3 罡气）——多段流要控刀数',
  moves: [
    { id: 'fanjiang', name: '翻江', kind: 'attack', damage: 18, block: 12 }, // 攻击同时 +12 水护体
    { id: 'longjuan', name: '龙卷', kind: 'attack', damage: 11, times: 2 },
  ],
});
def({
  id: 'jianzhongzhizhu', name: '剑冢之主', element: 'metal', hp: 360, act: 3, tier: 'elite',
  note: '剑域压你护体获取 −50%：在剑域窗口内要么闪避性回血，要么抢掉一斩前的输出',
  moves: [
    { id: 'yuwanjian', name: '御万剑', kind: 'attack', damage: 7, times: 4 },
    { id: 'jianyu', name: '剑域', kind: 'debuff', applyPlayer: { blockHalf: 2 } },
    { id: 'yizhan', name: '一斩', kind: 'attack', damage: 24 },
  ],
});

// ================= 第三幕终局 Boss：飞升·九重天劫（§8.10） =================
// 九道劫雷化身九个"雷灵"，连续车轮战：击杀当前雷灵立即进入下一道（同回合继续行动），
// 玩家全部状态跨波保留。每道五行不同——护体属性随波调整，属性系统的终局大考。
// 九道基础总血量 826，设计为 14–20 回合耐力战。combat.ts 以 waveIndex 驱动换波。

export interface LeiWave {
  id: string;
  name: string;
  element: EnemyDef['element'];
  hp: number;
  baseDamage: number;
  times?: number;
  special?: string;
  /** 开场脚本（入场时触发一次）：道雷 'zhuxin' 诛心——心魔 ≥6 时你手牌中费用最高的牌本场 +1 费 */
  opener?: string;
  breatherAfter?: boolean; // 渡过后【喘息】：回 12 血、抽 2、吐纳 +1（八重天难度取消）
}

// 基础总血 704（M4 调平：原 826 按耐力战 14–20 回合门槛下调 ~15%）
export const JIUCHONG_WAVES: LeiWave[] = [
  // 一：雷击 6
  { id: 'jingzhelei', name: '惊蛰雷', element: 'wood', hp: 34, baseDamage: 6 },
  // 二：雷击 7；死亡时施你气滞 1
  { id: 'yinshalei', name: '阴煞雷', element: 'water', hp: 41, baseDamage: 7, special: 'deathQizhi' },
  // 三：雷击 9；渡过后喘息
  { id: 'zixiaolei', name: '紫霄雷', element: 'fire', hp: 50, baseDamage: 9, breatherAfter: true },
  // 四：双击 6×2；每回合 +1 罡气
  { id: 'benlei', name: '奔雷', element: 'metal', hp: 60, baseDamage: 6, times: 2, special: 'gangqiPerTurn' },
  // 五：雷击 11 + 移除你 1 层增益
  { id: 'xuanlei', name: '玄雷', element: 'water', hp: 72, baseDamage: 11, special: 'ximie' },
  // 六：雷击 10 + 你 +2 灼烧；渡过后喘息
  { id: 'xianlei', name: '燹雷', element: 'fire', hp: 85, baseDamage: 10, special: 'burnPlayer', breatherAfter: true },
  // 七：雷击 13；场效果：你每回合第 3 次起的得气不触发得气段
  { id: 'falei', name: '罚雷', element: 'earth', hp: 100, baseDamage: 13, special: 'deqiCap' },
  // 八：雷击 15；每第 2 回合"天罚 22"——护体承接 ≥12 点则减半
  { id: 'mielei', name: '灭雷', element: 'metal', hp: 117, baseDamage: 15, special: 'tianfa' },
  // 九：雷击 17；基础血 145，实际 = 145 +（心魔+业力）×10（combat 处理）；
  //    每第 3 回合"问道"：弃 3 张或受 20 伤；低于 30% 血时"回光"：+3 罡气；
  //    心魔 ≥6 开场"诛心"（opener 'zhuxin'）；九重天难度追加第二形态（+90 血，雷击 +4）
  { id: 'daolei', name: '道雷', element: 'none', hp: 145, baseDamage: 17, special: 'wendao', opener: 'zhuxin' },
];

// 入口占位 def：combat.ts 见 id 'jiuchongtianjie' 即按 JIUCHONG_WAVES 车轮战展开（waveIndex 驱动），
// 此处数值 = 第一道惊蛰雷。
def({
  id: 'jiuchongtianjie', name: '九重天劫', element: 'wood', hp: 40, act: 3, tier: 'boss', ai: 'jiuchong',
  note: '属性系统终局大考：九道雷灵五行各异，护体属性随波调整；考验可持续输出与资源续航',
  moves: [{ id: 'leiji', name: '雷击', kind: 'attack', damage: 6 }],
});

// ================= 池与查询 =================

export function normalPool(act: 1 | 2 | 3): EnemyDef[] {
  return Object.values(ENEMIES).filter((e) => e.act === act && e.tier === 'normal');
}

/** 精英池：白无常不单独入池（随黑无常双体入场） */
export function elitePool(act: 1 | 2 | 3): EnemyDef[] {
  return Object.values(ENEMIES).filter(
    (e) => e.act === act && e.tier === 'elite' && e.id !== 'baiwuchang',
  );
}

export const ACT_BOSS: Record<1 | 2 | 3, string> = {
  1: 'leiling_kuilei',
  2: 'xinmo',
  3: 'jiuchongtianjie',
};

export function getEnemy(id: string): EnemyDef {
  const e = ENEMIES[id];
  if (!e) throw new Error(`未知敌人: ${id}`);
  return e;
}
