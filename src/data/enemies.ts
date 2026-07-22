/**
 * 敌人设计（策划案 §8：30 敌 + 6 精英 + 3 Boss）
 * moves 为循环行为模式；特殊逻辑走 ai / special 脚本（combat.ts 中实现）。
 */
import type { EnemyDef } from '../core/types';

export const ENEMIES: Record<string, EnemyDef> = {};

function def(e: EnemyDef) {
  ENEMIES[e.id] = e;
}

// ================= 第一幕普通敌人（10，§8.2） =================

def({
  id: 'zhiren', name: '纸人', element: 'none', hp: 12, count: 3, act: 1, tier: 'normal', note: 'AOE 价值',
  moves: [{ id: 'scratch', name: '抓挠', kind: 'attack', damage: 4 }],
});
def({
  id: 'yehu', name: '野狐', element: 'wood', hp: 26, act: 1, tier: 'normal', note: '干扰节奏',
  moves: [
    { id: 'bite', name: '咬', kind: 'attack', damage: 6 },
    { id: 'meihuo', name: '魅惑', kind: 'debuff', applyPlayer: { drawDown: 1 } },
  ],
});
def({
  id: 'denglonggui', name: '灯笼鬼', element: 'fire', hp: 30, act: 1, tier: 'normal', note: '增长型要速杀',
  moves: [
    { id: 'ranyan', name: '燃焰', kind: 'attack', damage: 5, applyPlayer: { zhuoshao: 1 } },
    { id: 'ziran', name: '自燃', kind: 'buff', gainSelf: { gangqi: 2 } },
  ],
});
def({
  id: 'yinfeng', name: '阴风', element: 'water', hp: 28, act: 1, tier: 'normal', note: '负面清理',
  moves: [
    { id: 'yinxi', name: '阴袭', kind: 'attack', damage: 5 },
    { id: 'shigufeng', name: '蚀骨风', kind: 'debuff', applyPlayer: { xuruo: 1 } },
  ],
});
def({
  id: 'shuigui', name: '水鬼', element: 'water', hp: 34, act: 1, tier: 'normal', note: '打盾时机',
  moves: [
    { id: 'tuozhuai1', name: '拖拽', kind: 'attack', damage: 7 },
    { id: 'qianshui', name: '潜水', kind: 'defend', block: 8 },
    { id: 'tuozhuai2', name: '拖拽', kind: 'attack', damage: 7 },
  ],
});
def({
  id: 'sheyao', name: '蛇妖', element: 'wood', hp: 38, act: 1, tier: 'normal', note: '持续伤害压力',
  moves: [
    { id: 'chanrao', name: '缠绕', kind: 'debuff', applyPlayer: { xuruo: 2 } },
    { id: 'duya', name: '毒牙', kind: 'attack', damage: 6, applyPlayer: { zhuoshao: 2 } },
  ],
});
def({
  id: 'tiaoshi', name: '跳尸', element: 'earth', hp: 44, act: 1, tier: 'normal', note: '大招回合叠护体',
  moves: [
    { id: 'nao', name: '挠', kind: 'attack', damage: 5 },
    { id: 'xuli', name: '蓄力', kind: 'charge' },
    { id: 'mengpu', name: '猛扑', kind: 'attack', damage: 14 },
  ],
});
def({
  id: 'shanxiao', name: '山魈', element: 'metal', hp: 46, act: 1, tier: 'normal', note: '站撸会输', ai: 'shanxiao',
  moves: [
    { id: 'shifu1', name: '石斧', kind: 'attack', damage: 8 },
    { id: 'haojiao', name: '嚎叫', kind: 'buff', gainSelf: { gangqi: 2 } },
    { id: 'shifu2', name: '石斧', kind: 'attack', damage: 10 },
  ],
});
def({
  id: 'huoya', name: '火鸦', element: 'fire', hp: 18, count: 2, act: 1, tier: 'normal', note: '击杀顺序', ai: 'huoya',
  moves: [{ id: 'zhuo', name: '啄', kind: 'attack', damage: 4 }],
});
def({
  id: 'shijing', name: '石精', element: 'earth', hp: 50, act: 1, tier: 'normal', note: '破甲/穿透价值',
  moves: [
    { id: 'yanke', name: '岩壳', kind: 'defend', block: 8, gainSelf: { guben: 1 } },
    { id: 'zaji', name: '砸击', kind: 'attack', damage: 9 },
  ],
});

// ================= 第一幕精英（2，§8.3） =================

def({
  id: 'heiwuchang', name: '黑无常', element: 'water', hp: 48, act: 1, tier: 'elite', ai: 'wuchang',
  moves: [{ id: 'suohun', name: '锁魂', kind: 'attack', damage: 7, applyPlayer: { xuruo: 1 } }],
});
def({
  id: 'baiwuchang', name: '白无常', element: 'metal', hp: 44, act: 1, tier: 'elite', ai: 'wuchang_bai',
  moves: [{ id: 'zhaohunfan', name: '招魂幡', kind: 'buff', special: 'zhaohun' }],
});
def({
  id: 'tongjiashi', name: '铜甲尸', element: 'metal', hp: 105, act: 1, tier: 'elite', ai: 'tongjiashi',
  note: '压制输出轴、诅咒管理',
  moves: [{ id: 'huizhao', name: '挥爪', kind: 'attack', damage: 9 }],
});

// ================= 第一幕 Boss：筑基雷劫·雷灵傀儡（§8.4） =================

def({
  id: 'leiling_kuilei', name: '雷灵傀儡', element: 'metal', hp: 240, act: 1, tier: 'boss', ai: 'leiling',
  moves: [
    { id: 'leiyin', name: '雷引', kind: 'defend', block: 8, gainSelf: { gangqi: 1 } },
    { id: 'tianleixili', name: '天雷洗礼', kind: 'attack', damage: 12 },
    { id: 'lianhuanlei', name: '连环雷', kind: 'attack', damage: 6, times: 2 },
  ],
});

// ================= 第二幕普通敌人（10，§8.5） =================

def({
  id: 'huapi', name: '画皮', element: 'water', hp: 72, act: 2, tier: 'normal',
  moves: [
    { id: 'simian', name: '撕面', kind: 'attack', damage: 11 },
    { id: 'huanhuo', name: '幻惑', kind: 'debuff', applyPlayer: { xuruo: 1, yishang: 1 } },
  ],
});
def({
  id: 'zhizhujing', name: '蜘蛛精', element: 'wood', hp: 84, act: 2, tier: 'normal',
  moves: [
    { id: 'tusi', name: '吐丝', kind: 'debuff', addCurse: 'chenyuan' },
    { id: 'shiyao', name: '噬咬', kind: 'attack', damage: 9, applyPlayer: { zhuoshao: 3 } },
  ],
});
def({
  id: 'shuihouzi', name: '水猴子', element: 'water', hp: 76, act: 2, tier: 'normal',
  moves: [
    { id: 'touxi', name: '偷袭', kind: 'attack', damage: 8 },
    { id: 'touling', name: '偷灵', kind: 'debuff', applyPlayer: { energyDown: 1 } },
  ],
});
def({
  id: 'nuomiangui', name: '傩面鬼', element: 'none', hp: 80, act: 2, tier: 'normal', ai: 'nuomian',
  moves: [
    { id: 'huanmian', name: '换面', kind: 'buff', special: 'huanmian' },
    { id: 'jida', name: '击打', kind: 'attack', damage: 9 },
  ],
});
def({
  id: 'gunv', name: '骨女', element: 'water', hp: 88, act: 2, tier: 'normal',
  moves: [
    { id: 'changu', name: '缠骨', kind: 'attack', damage: 9 },
    { id: 'beiqi', name: '悲泣', kind: 'debuff', special: 'beiqi' },
  ],
});
def({
  id: 'panguanbiling', name: '判官笔灵', element: 'metal', hp: 95, act: 2, tier: 'normal',
  moves: [
    { id: 'zhupi', name: '朱批', kind: 'debuff', applyPlayer: { yishang: 2 } },
    { id: 'chuo', name: '戳', kind: 'attack', damage: 11 },
  ],
});
def({
  id: 'yecha', name: '夜叉', element: 'fire', hp: 92, act: 2, tier: 'normal',
  moves: [
    { id: 'huiji', name: '挥戟', kind: 'attack', damage: 13 },
    { id: 'huohou', name: '火吼', kind: 'buff', gainSelf: { gangqi: 2 }, loseSelfHp: 2 },
  ],
});
def({
  id: 'shiqun', name: '尸群', element: 'earth', hp: 20, count: 4, act: 2, tier: 'normal', ai: 'shiqun',
  moves: [{ id: 'nao', name: '挠', kind: 'attack', damage: 4 }],
});
def({
  id: 'zheng', name: '狰', element: 'fire', hp: 100, act: 2, tier: 'normal',
  moves: [
    { id: 'baozhua1', name: '豹爪', kind: 'attack', damage: 11 },
    { id: 'paoxiao', name: '咆哮', kind: 'debuff', applyPlayer: { drawDown: 1 } },
    { id: 'baozhua2', name: '豹爪', kind: 'attack', damage: 13 },
  ],
});
def({
  id: 'jinjiakuilei', name: '金甲傀儡', element: 'metal', hp: 110, act: 2, tier: 'normal',
  moves: [
    { id: 'jianbi', name: '剑臂', kind: 'attack', damage: 10, times: 2 },
    { id: 'chonggou', name: '重构', kind: 'defend', block: 12 },
  ],
});

// ================= 第二幕精英（2，§8.6） =================

def({
  id: 'huyaojiangjun', name: '虎妖将军', element: 'metal', hp: 190, act: 2, tier: 'elite',
  moves: [
    { id: 'huxiao', name: '虎啸', kind: 'buff', gainSelf: { gangqi: 2 } },
    { id: 'pikan', name: '劈砍', kind: 'attack', damage: 16 },
    { id: 'hengsao', name: '横扫', kind: 'attack', damage: 12, special: 'suijia', n: 4 },
  ],
});
def({
  id: 'tengyao', name: '千年藤妖', element: 'wood', hp: 210, act: 2, tier: 'elite',
  moves: [
    { id: 'tengbian', name: '藤鞭', kind: 'attack', damage: 7, times: 2, applyPlayer: { xuruo: 1 } },
    { id: 'xisui', name: '吸髓', kind: 'attack', damage: 8, special: 'xisui' },
    { id: 'jingjizitai', name: '荆棘姿态', kind: 'buff', special: 'jingji', n: 4 },
  ],
});

// ================= 第二幕 Boss：金丹心魔劫·心魔（§8.7） =================

def({
  id: 'xinmo', name: '心魔', element: 'none', hp: 420, act: 2, tier: 'boss', ai: 'xinmo',
  moves: [
    { id: 'diyu', name: '心魔低语', kind: 'unknown', special: 'diyu' },
    { id: 'kaowen', name: '道心拷问', kind: 'unknown', special: 'kaowen' },
    { id: 'tunshi', name: '吞噬', kind: 'attack', damage: 12, special: 'tunshi' },
  ],
});
def({
  id: 'zhinian', name: '执念分身', element: 'none', hp: 40, act: 2, tier: 'boss',
  moves: [{ id: 'nianya', name: '念压', kind: 'attack', damage: 4 }],
});

// ================= 第三幕普通敌人（8，§8.8） =================

def({
  id: 'yinbing', name: '阴兵', element: 'earth', hp: 45, count: 3, act: 3, tier: 'normal', ai: 'yinbing',
  moves: [{ id: 'chuo', name: '戳', kind: 'attack', damage: 6 }],
});
def({
  id: 'jianzhongyiling', name: '剑冢遗灵', element: 'metal', hp: 140, act: 3, tier: 'normal',
  moves: [
    { id: 'wanjian', name: '万剑', kind: 'attack', damage: 7, times: 3 },
    { id: 'jianyi', name: '剑意', kind: 'buff', gainSelf: { gangqi: 3 } },
  ],
});
def({
  id: 'leishou', name: '雷兽', element: 'metal', hp: 150, act: 3, tier: 'normal',
  moves: [
    { id: 'leijia', name: '雷甲', kind: 'defend', block: 10, gainSelf: { gangqi: 1 } },
    { id: 'xulei', name: '蓄雷', kind: 'charge' },
    { id: 'leiya', name: '雷牙', kind: 'attack', damage: 18 },
  ],
});
def({
  id: 'wangchuandugui', name: '忘川渡鬼', element: 'water', hp: 155, act: 3, tier: 'normal',
  moves: [
    { id: 'baidu', name: '摆渡', kind: 'debuff', applyPlayer: { handCapDown: 2 } },
    { id: 'chuanjiang', name: '船桨', kind: 'attack', damage: 14 },
  ],
});
def({
  id: 'jiuweihusi', name: '九尾狐嗣', element: 'wood', hp: 160, act: 3, tier: 'normal',
  moves: [
    { id: 'meiluan', name: '魅乱', kind: 'debuff', applyPlayer: { xuruo: 1, yishang: 1 } },
    { id: 'siyao', name: '撕咬', kind: 'attack', damage: 15 },
  ],
});
def({
  id: 'dinglukuilei', name: '鼎炉傀儡', element: 'fire', hp: 165, act: 3, tier: 'normal',
  moves: [
    { id: 'penyan', name: '喷焰', kind: 'attack', damage: 12, applyPlayer: { zhuoshao: 2 } },
    { id: 'luwen', name: '炉温上升', kind: 'buff', gainSelf: { gangqi: 1 } },
  ],
});
def({
  id: 'shiyuetiangou', name: '食月天狗', element: 'none', hp: 170, act: 3, tier: 'normal',
  moves: [
    { id: 'tunyue1', name: '吞月', kind: 'unknown' },
    { id: 'tunyue2', name: '吞月', kind: 'unknown' },
    { id: 'yueshi', name: '月蚀', kind: 'attack', damage: 24 },
  ],
});
def({
  id: 'shanshencanxiang', name: '山神残像', element: 'earth', hp: 180, act: 3, tier: 'normal',
  moves: [
    { id: 'shinu', name: '石怒', kind: 'attack', damage: 13 },
    { id: 'bengluo', name: '崩落', kind: 'attack', damage: 18, loseSelfHp: 10 },
  ],
});

// ================= 第三幕精英（2，§8.9） =================

def({
  id: 'jiao', name: '蛟', element: 'water', hp: 300, act: 3, tier: 'elite', ai: 'jiao',
  moves: [
    { id: 'fanjiang', name: '翻江', kind: 'attack', damage: 16, block: 12 },
    { id: 'longjuan', name: '龙卷', kind: 'attack', damage: 10, times: 2 },
  ],
});
def({
  id: 'jianzhongzhizhu', name: '剑冢之主', element: 'metal', hp: 280, act: 3, tier: 'elite',
  moves: [
    { id: 'yuwanjian', name: '御万剑', kind: 'attack', damage: 6, times: 4 },
    { id: 'jianyu', name: '剑域', kind: 'debuff', applyPlayer: { blockHalf: 2 } },
    { id: 'yizhan', name: '一斩', kind: 'attack', damage: 20 },
  ],
});

// ================= 第三幕终局 Boss：飞升·九重天劫（§8.10） =================
// 九道劫雷 = 九个雷灵，连续车轮战，combat.ts 的 waveIndex 驱动。

export interface LeiWave {
  id: string;
  name: string;
  element: EnemyDef['element'];
  hp: number;
  baseDamage: number;
  times?: number;
  special?: string;
  breatherAfter?: boolean; // 渡过后喘息
}

export const JIUCHONG_WAVES: LeiWave[] = [
  { id: 'jingzhelei', name: '惊蛰雷', element: 'wood', hp: 30, baseDamage: 5 },
  { id: 'yinshalei', name: '阴煞雷', element: 'water', hp: 36, baseDamage: 6, special: 'deathXuruo' },
  { id: 'zixiaolei', name: '紫霄雷', element: 'fire', hp: 44, baseDamage: 8, breatherAfter: true },
  { id: 'benlei', name: '奔雷', element: 'metal', hp: 52, baseDamage: 5, times: 2, special: 'gangqiPerTurn' },
  { id: 'xuanlei', name: '玄雷', element: 'water', hp: 62, baseDamage: 10, special: 'ximie' },
  { id: 'xianlei', name: '燹雷', element: 'fire', hp: 74, baseDamage: 9, special: 'burnPlayer', breatherAfter: true },
  { id: 'falei', name: '罚雷', element: 'earth', hp: 88, baseDamage: 12, special: 'refundDown' },
  { id: 'mielei', name: '灭雷', element: 'metal', hp: 105, baseDamage: 14, special: 'tianfa' },
  { id: 'daolei', name: '道雷', element: 'none', hp: 130, baseDamage: 16, special: 'wendao' },
];

def({
  id: 'jiuchongtianjie', name: '九重天劫', element: 'wood', hp: 30, act: 3, tier: 'boss', ai: 'jiuchong',
  moves: [{ id: 'leiji', name: '雷击', kind: 'attack', damage: 5 }],
});

// ---------- 池 ----------

export function normalPool(act: 1 | 2 | 3): EnemyDef[] {
  return Object.values(ENEMIES).filter((e) => e.act === act && e.tier === 'normal');
}

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
