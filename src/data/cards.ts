/**
 * 全卡表 v3（策划案 §5.4 75 张 + §5.5 诅咒 5 张）
 *
 * 每张有属性牌为两段式：base（基础段，必然生效）+ sheng（得气段，得气时追加）。
 * 参悟（升级）后对应 upBase / upSheng。无属性牌与诅咒无 sheng 段。
 *
 * ── 得气段合并约定（与 core/combat.ts 共同遵守）──
 * 1. 叠加式：得气时数值字段按 base + sheng 合计（如 淬锋 base n:4 + sheng n:2 → 得气改为 +6）。
 * 2. 负值抵消：得气段的负值用于抵消基础段同名数值，引擎按合计钳到 ≥0。
 *    示例：炎爆 base { selfBurn:2 } + sheng { selfBurn:-2 } → 得气时自身不灼烧；
 *          枯荣轮转 base { burnLife:1 } + sheng { burnLife:-1 } → 得气时免燃寿；
 *          火德真身 sheng applySelf { zhuoshao:-99 } → 打出瞬间清空自身灼烧（钳到 0）。
 * 3. 布尔覆盖：sheng 中显式 exhaust:false 表示得气时取消基础段的放逐
 *    （一剑破万法「不放逐」、汲灵术「不放逐」；布尔按覆盖合并，数值按叠加合并）。
 * 4. bonusDamage / extraHit / makeAoe 为得气段专用攻击修饰，并入本牌攻击结算（§16.3 契约）。
 *
 * 特殊脚本卡仅使用 types.ts 的 SpecialId 联合；DSL 能表达的一律不开 special。
 */
import type { CardDef } from '../core/types';

export const CARDS: Record<string, CardDef> = {};

function def(c: CardDef) {
  CARDS[c.id] = c;
}

// ================= 金（13）——直伤、剥增益、护体武器化 =================

def({
  id: 'yujianshu', name: '御剑术', element: 'metal', type: 'attack', cost: 1, rarity: 'starter',
  text: '9 伤', shengText: '+4 伤',
  upText: '12 伤', upShengText: '+5 伤',
  base: { damage: 9 }, sheng: { bonusDamage: 4 },
  upBase: { damage: 12 }, upSheng: { bonusDamage: 5 },
});
def({
  id: 'lianhuanjian', name: '连环剑', element: 'metal', type: 'attack', cost: 1, rarity: 'common',
  text: '4 伤 ×2 段', shengText: '再 +1 段（×3）',
  upText: '5 伤 ×2 段', upShengText: '再 +1 段（×3）',
  base: { damage: 4, times: 2 }, sheng: { extraHit: true },
  upBase: { damage: 5, times: 2 }, upSheng: { extraHit: true },
});
def({
  id: 'duanjinzhi', name: '断金指', element: 'metal', type: 'attack', cost: 0, rarity: 'common',
  text: '4 伤', shengText: '抽 1',
  upText: '6 伤', upShengText: '抽 1',
  base: { damage: 4 }, sheng: { draw: 1 },
  upBase: { damage: 6 }, upSheng: { draw: 1 },
});
def({
  // special 'cuifeng'：本回合接下来 n2 张攻击牌 +n 伤；得气合计 n=6（约定 1）
  id: 'cuifeng', name: '淬锋', element: 'metal', type: 'skill', cost: 1, rarity: 'common',
  text: '本回合接下来 2 张攻击牌 +4 伤', shengText: '改为 +6 伤',
  upText: '本回合接下来 3 张攻击牌 +4 伤', upShengText: '改为 +6 伤',
  base: { special: 'cuifeng', n: 4, n2: 2 }, sheng: { n: 2 },
  upBase: { special: 'cuifeng', n: 4, n2: 3 }, upSheng: { n: 2 },
});
def({
  // 反刺走 fanci 状态；得气合计反刺 6
  id: 'feijianhuanji', name: '飞剑还击', element: 'metal', type: 'defense', cost: 1, rarity: 'common',
  text: '8 金护体；本回合被攻击时反刺 4', shengText: '反刺 6',
  upText: '11 金护体；本回合被攻击时反刺 4', upShengText: '反刺 6',
  base: { block: 8, applySelf: { fanci: 4 } }, sheng: { applySelf: { fanci: 2 } },
  upBase: { block: 11, applySelf: { fanci: 4 } }, upSheng: { applySelf: { fanci: 2 } },
});
def({
  // 得气变全体：纯 DSL makeAoe，不开 special
  id: 'jinleifu', name: '金雷符', element: 'metal', type: 'attack', cost: 2, rarity: 'common',
  text: '13 伤', shengText: '改为对全体',
  upText: '17 伤', upShengText: '改为对全体',
  base: { damage: 13 }, sheng: { makeAoe: true },
  upBase: { damage: 17 }, upSheng: { makeAoe: true },
});
def({
  // 得气段「每个目标被移除 1 层增益」：DSL 无通用移除增益字段，
  // 暂以 -1 罡气近似（负值钳到 ≥0，约定 2）；契约缺口已在汇报中列出
  id: 'wanjianjue', name: '万剑诀', element: 'metal', type: 'attack', cost: 3, rarity: 'rare',
  text: '对全体 10 伤', shengText: '每个目标被移除 1 层增益',
  upText: '对全体 14 伤', upShengText: '每个目标被移除 1 层增益',
  base: { damage: 10, aoe: true }, sheng: { applyEnemyAll: { gangqi: -1 } },
  upBase: { damage: 14, aoe: true }, upSheng: { applyEnemyAll: { gangqi: -1 } },
});
def({
  // special 'jianqizongheng' 置于 sheng：得气段=本回合每次得气（含本次）额外 +n 伤
  id: 'jianqizongheng', name: '剑气纵横', element: 'metal', type: 'attack', cost: 2, rarity: 'rare',
  text: '8 伤', shengText: '本回合每次得气（含本次）+4 伤',
  upText: '10 伤', upShengText: '本回合每次得气（含本次）+5 伤',
  base: { damage: 8 }, sheng: { special: 'jianqizongheng', n: 4 },
  upBase: { damage: 10 }, upSheng: { special: 'jianqizongheng', n: 5 },
});
def({
  // 心法：n=每回合第一张金牌加伤；得气段为打出瞬间一次性抽 1
  id: 'gengjinjianyu', name: '庚金剑域', element: 'metal', type: 'power', cost: 2, rarity: 'rare',
  text: '每回合你的第一张金牌 +5 伤', shengText: '打出时：抽 1',
  upText: '每回合你的第一张金牌 +8 伤', upShengText: '打出时：抽 1',
  base: { n: 5 }, sheng: { draw: 1 },
  upBase: { n: 8 }, upSheng: { draw: 1 },
});
def({
  // special 'baihong'：目标无护体时 +n 伤；得气段 +伤与软化走 DSL
  id: 'baihongguanri', name: '白虹贯日', element: 'metal', type: 'attack', cost: 2, rarity: 'epic',
  text: '17 伤；目标无护体则 +8', shengText: '+8 伤，并使目标【软化】',
  upText: '21 伤；目标无护体则 +8', upShengText: '+10 伤，并使目标【软化】',
  base: { special: 'baihong', damage: 17, n: 8 }, sheng: { bonusDamage: 8, applyEnemy: { ruanhua: 1 } },
  upBase: { special: 'baihong', damage: 21, n: 8 }, upSheng: { bonusDamage: 10, applyEnemy: { ruanhua: 1 } },
});
def({
  id: 'tiangangjianzhen', name: '天罡剑阵', element: 'metal', type: 'skill', cost: 2, rarity: 'epic',
  text: '获得 2 层罡气', shengText: '+1 层固本',
  upText: '获得 3 层罡气', upShengText: '+1 层固本',
  base: { applySelf: { gangqi: 2 } }, sheng: { applySelf: { guben: 1 } },
  upBase: { applySelf: { gangqi: 3 } }, upSheng: { applySelf: { guben: 1 } },
});
def({
  // 心法：n=每第 n 张金牌触发「抽 1 并吐纳 +1」；得气段为打出瞬间抽 2
  id: 'jianxintongming', name: '剑心通明', element: 'metal', type: 'power', cost: 3, rarity: 'epic',
  text: '你每打出第 3 张金牌：抽 1 并吐纳 +1', shengText: '打出时：立即抽 2',
  upText: '你每打出第 2 张金牌：抽 1 并吐纳 +1', upShengText: '打出时：立即抽 2',
  base: { n: 3 }, sheng: { draw: 2 },
  upBase: { n: 2 }, upSheng: { draw: 2 },
});
def({
  // n=耗尽罡气每层加伤（SpecialId 无对应项，契约缺口已汇报，暂由引擎按牌 id 识别）；
  // 得气段 exhaust:false=不放逐（约定 3）
  id: 'yijianpowanfa', name: '一剑破万法', element: 'metal', type: 'attack', cost: 4, rarity: 'legendary',
  text: '30 伤，无视护体；耗尽你全部罡气，每层 +6 伤；放逐', shengText: '不放逐',
  upText: '36 伤，无视护体；耗尽你全部罡气，每层 +7 伤；放逐', upShengText: '不放逐',
  base: { damage: 30, ignoreBlock: true, exhaust: true, n: 6 }, sheng: { exhaust: false },
  upBase: { damage: 36, ignoreBlock: true, exhaust: true, n: 7 }, upSheng: { exhaust: false },
});

// ================= 木（13）——瘴毒、回复、藤甲 =================

def({
  id: 'tengmanfu', name: '藤蔓缚', element: 'wood', type: 'attack', cost: 1, rarity: 'common',
  text: '6 伤', shengText: '你获得 6 木护体',
  upText: '8 伤', upShengText: '你获得 8 木护体',
  base: { damage: 6 }, sheng: { block: 6 },
  upBase: { damage: 8 }, upSheng: { block: 8 },
});
def({
  id: 'zhangduzhi', name: '瘴毒指', element: 'wood', type: 'attack', cost: 1, rarity: 'common',
  text: '5 伤 +2 瘴毒', shengText: '+2 瘴毒',
  upText: '7 伤 +2 瘴毒', upShengText: '+2 瘴毒',
  base: { damage: 5, applyEnemy: { zhangdu: 2 } }, sheng: { applyEnemy: { zhangdu: 2 } },
  upBase: { damage: 7, applyEnemy: { zhangdu: 2 } }, upSheng: { applyEnemy: { zhangdu: 2 } },
});
def({
  // special 'huichunshu'：每场限 2 次，n=回血量
  id: 'huichunshu', name: '回春术', element: 'wood', type: 'skill', cost: 1, rarity: 'common',
  text: '回 5 血（每场限 2 次）', shengText: '+2 层回春',
  upText: '回 7 血（每场限 2 次）', upShengText: '+2 层回春',
  base: { special: 'huichunshu', n: 5 }, sheng: { applySelf: { huichun: 2 } },
  upBase: { special: 'huichunshu', n: 7 }, upSheng: { applySelf: { huichun: 2 } },
});
def({
  // 得气合计反刺 5（3+2）
  id: 'jingjitengjia', name: '荆棘藤甲', element: 'wood', type: 'defense', cost: 1, rarity: 'common',
  text: '7 木护体；本回合攻击你的敌人受 3 伤', shengText: '受 5 伤',
  upText: '10 木护体；本回合攻击你的敌人受 3 伤', upShengText: '受 5 伤',
  base: { block: 7, applySelf: { fanci: 3 } }, sheng: { applySelf: { fanci: 2 } },
  upBase: { block: 10, applySelf: { fanci: 3 } }, upSheng: { applySelf: { fanci: 2 } },
});
def({
  id: 'mudun', name: '木遁', element: 'wood', type: 'defense', cost: 1, rarity: 'common',
  text: '9 木护体', shengText: '抽 1',
  upText: '12 木护体', upShengText: '抽 1',
  base: { block: 9 }, sheng: { draw: 1 },
  upBase: { block: 12 }, upSheng: { draw: 1 },
});
def({
  id: 'shengshengbuxi', name: '生生不息', element: 'wood', type: 'skill', cost: 2, rarity: 'common',
  text: '获得 3 层回春', shengText: '+2 层（共 5）',
  upText: '获得 5 层回春', upShengText: '+2 层（共 7）',
  base: { applySelf: { huichun: 3 } }, sheng: { applySelf: { huichun: 2 } },
  upBase: { applySelf: { huichun: 5 } }, upSheng: { applySelf: { huichun: 2 } },
});
def({
  // 得气追加一段：aoe 攻击 extraHit 即「再对全体 5 伤」
  id: 'qianmuci', name: '千木刺', element: 'wood', type: 'attack', cost: 2, rarity: 'rare',
  text: '对全体 5 伤 +1 瘴毒', shengText: '再对全体 5 伤',
  upText: '对全体 7 伤 +1 瘴毒', upShengText: '再对全体 7 伤',
  base: { damage: 5, aoe: true, applyEnemyAll: { zhangdu: 1 } }, sheng: { extraHit: true },
  upBase: { damage: 7, aoe: true, applyEnemyAll: { zhangdu: 1 } }, upSheng: { extraHit: true },
});
def({
  // special 'chunhui'：移除自身全部负面，每个抽 1；得气合计 n=3 → 每个回 3 血；参悟基础段并吐纳 +1
  id: 'chunhuidadi', name: '春回大地', element: 'wood', type: 'skill', cost: 1, rarity: 'rare',
  text: '移除自身全部负面，每移除 1 个抽 1', shengText: '每个再回 3 血',
  upText: '移除自身全部负面，每移除 1 个抽 1，并吐纳 +1', upShengText: '每个再回 3 血',
  base: { special: 'chunhui' }, sheng: { n: 3 },
  upBase: { special: 'chunhui', energy: 1 }, upSheng: { n: 3 },
});
def({
  // 心法：n=每回合结束回血量；得气段为打出瞬间立获 4 层回春
  id: 'gumuchangqing', name: '古木长青', element: 'wood', type: 'power', cost: 2, rarity: 'rare',
  text: '每回合结束回 2 血', shengText: '打出时：立获 4 层回春',
  upText: '每回合结束回 3 血', upShengText: '打出时：立获 4 层回春',
  base: { n: 2 }, sheng: { applySelf: { huichun: 4 } },
  upBase: { n: 3 }, upSheng: { applySelf: { huichun: 4 } },
});
def({
  // tengou=剩余回合，_tengouCap=每回合承伤上限，_tengouThorn=带刺（攻它者 +1 瘴毒）
  id: 'qingtengkuilei', name: '青藤傀儡', element: 'wood', type: 'skill', cost: 2, rarity: 'epic',
  text: '召唤藤偶替你承伤（上限 7/回合），持续 3 回合', shengText: '藤偶带刺：攻它者 +1 瘴毒',
  upText: '召唤藤偶替你承伤（上限 10/回合），持续 3 回合', upShengText: '藤偶带刺：攻它者 +1 瘴毒',
  base: { applySelf: { tengou: 3, _tengouCap: 7 } }, sheng: { applySelf: { _tengouThorn: 1 } },
  upBase: { applySelf: { tengou: 3, _tengouCap: 10 } }, upSheng: { applySelf: { _tengouThorn: 1 } },
});
def({
  // 心法：在场=你施加的瘴毒不再衰减；参悟 n=每回合全体 +n 瘴毒；得气段为打出瞬间全体 +3 瘴毒
  id: 'wandushixin', name: '万毒噬心', element: 'wood', type: 'power', cost: 3, rarity: 'epic',
  text: '你施加的瘴毒不再衰减', shengText: '打出时：全体 +3 瘴毒',
  upText: '你施加的瘴毒不再衰减，且每回合全体 +1 瘴毒', upShengText: '打出时：全体 +3 瘴毒',
  base: {}, sheng: { applyEnemyAll: { zhangdu: 3 } },
  upBase: { n: 1 }, upSheng: { applyEnemyAll: { zhangdu: 3 } },
});
def({
  id: 'jianmuqingtian', name: '建木擎天', element: 'wood', type: 'skill', cost: 3, rarity: 'epic',
  text: '气血上限 +8 并回 8（放逐）', shengText: '再 +4 / 回 4',
  upText: '气血上限 +12 并回 12（放逐）', upShengText: '再 +4 / 回 4',
  base: { maxHp: 8, heal: 8, exhaust: true }, sheng: { maxHp: 4, heal: 4 },
  upBase: { maxHp: 12, heal: 12, exhaust: true }, upSheng: { maxHp: 4, heal: 4 },
});
def({
  // special 'kurong'：燃寿走 run 层；得气 burnLife 合计 0 → 免燃寿（约定 2）
  id: 'kuronglunzhuan', name: '枯荣轮转', element: 'wood', type: 'skill', cost: 1, rarity: 'legendary',
  text: '燃寿 1 年：吐纳 +3，抽 3', shengText: '本次不燃寿',
  upText: '燃寿 1 年：吐纳 +3，抽 4', upShengText: '本次不燃寿',
  base: { special: 'kurong', burnLife: 1, energy: 3, draw: 3 }, sheng: { burnLife: -1 },
  upBase: { special: 'kurong', burnLife: 1, energy: 3, draw: 4 }, upSheng: { burnLife: -1 },
});

// ================= 水（13）——过牌、袖藏、气海 =================

def({
  id: 'yinlingjue', name: '引灵诀', element: 'water', type: 'skill', cost: 1, rarity: 'starter',
  text: '吐纳 +2', shengText: '抽 1',
  upText: '吐纳 +3', upShengText: '抽 1',
  base: { energy: 2 }, sheng: { draw: 1 },
  upBase: { energy: 3 }, upSheng: { draw: 1 },
});
def({
  // 双行牌（§4.4 ①）：效果全在 dual 字段（a=水选项 b=金选项），base/upBase 留空防止重复结算；
  // 得气时 a、b 皆得。金选项复用 special 'cuifeng'（本回合接下来 1 张攻击牌 +n 伤）
  id: 'runfeng', name: '润锋', element: 'water', type: 'skill', cost: 0, rarity: 'starter',
  dual: {
    elements: ['water', 'metal'],
    a: { draw: 1 }, b: { special: 'cuifeng', n: 3, n2: 1 },
    aUp: { draw: 2 }, bUp: { special: 'cuifeng', n: 5, n2: 1 },
    textA: '水：抽 1', textB: '金：本回合下一张攻击牌 +3 伤',
  },
  text: '双行（水/金）择一：水＝抽 1；金＝本回合下一张攻击牌 +3 伤', shengText: '两个选项皆得',
  upText: '双行（水/金）择一：水＝抽 2；金＝本回合下一张攻击牌 +5 伤', upShengText: '两个选项皆得',
  base: {}, upBase: {},
});
def({
  id: 'xuanbingci', name: '玄冰刺', element: 'water', type: 'attack', cost: 1, rarity: 'common',
  text: '8 伤', shengText: '目标气滞 1',
  upText: '11 伤', upShengText: '目标气滞 1',
  base: { damage: 8 }, sheng: { applyEnemy: { qizhi: 1 } },
  upBase: { damage: 11 }, upSheng: { applyEnemy: { qizhi: 1 } },
});
def({
  // special 'hanlu'：击杀时回 4 血并吐纳 +1
  id: 'hanlu', name: '寒露', element: 'water', type: 'attack', cost: 1, rarity: 'common',
  text: '6 伤；若击杀：回 4 血并吐纳 +1', shengText: '+3 伤',
  upText: '9 伤；若击杀：回 4 血并吐纳 +1', upShengText: '+3 伤',
  base: { damage: 6, special: 'hanlu' }, sheng: { bonusDamage: 3 },
  upBase: { damage: 9, special: 'hanlu' }, upSheng: { bonusDamage: 3 },
});
def({
  id: 'chaoxijue', name: '潮汐诀', element: 'water', type: 'defense', cost: 1, rarity: 'common',
  text: '8 水护体', shengText: '下回合开始抽 1',
  upText: '11 水护体', upShengText: '下回合开始抽 1',
  base: { block: 8 }, sheng: { applySelf: { nextTurnDraw: 1 } },
  upBase: { block: 11 }, upSheng: { applySelf: { nextTurnDraw: 1 } },
});
def({
  // special 'jiling'：+energy，行位变水；得气段 exhaust:false=不放逐（约定 3）
  id: 'jilingshu', name: '汲灵术', element: 'water', type: 'skill', cost: 0, rarity: 'common',
  text: '吐纳 +1；行位变为「水」（放逐）', shengText: '不放逐',
  upText: '吐纳 +2；行位变为「水」（放逐）', upShengText: '不放逐',
  base: { special: 'jiling', energy: 1, exhaust: true }, sheng: { exhaust: false },
  upBase: { special: 'jiling', energy: 2, exhaust: true }, upSheng: { exhaust: false },
});
def({
  // special 'guanlan'：预视牌库顶 n 张可弃任意 → pendingChoice 'scry'；得气合计预视 5 张
  id: 'guanlan', name: '观澜', element: 'water', type: 'skill', cost: 1, rarity: 'common',
  text: '预视牌库顶 3 张，可弃任意，然后抽 1', shengText: '预视 5 张',
  upText: '预视牌库顶 3 张，可弃任意，然后抽 2', upShengText: '预视 5 张',
  base: { special: 'guanlan', n: 3, draw: 1 }, sheng: { n: 2 },
  upBase: { special: 'guanlan', n: 3, draw: 2 }, upSheng: { n: 2 },
});
def({
  // special 'jinghua'：复制本场上一张打出的牌入手（0 费，回合末消散）；
  // 得气=复制品可袖藏、参悟=复制参悟态，均由引擎按 deqi/upgraded 处理，sheng 仅作标记
  id: 'jinghuashuiyue', name: '镜花水月', element: 'water', type: 'skill', cost: 1, rarity: 'rare',
  text: '复制你本场上一张打出的牌入手（0 费，回合末消散）', shengText: '复制品可袖藏',
  upText: '复制你本场上一张打出的牌入手（0 费，回合末消散；复制品为参悟态）', upShengText: '复制品可袖藏',
  base: { special: 'jinghua' }, sheng: {},
  upBase: { special: 'jinghua' }, upSheng: {},
});
def({
  // 心法：n=每回合前 n 张水牌费用 −1；得气段为打出瞬间吐纳 +2
  id: 'shangshanruoshui', name: '上善若水', element: 'water', type: 'power', cost: 2, rarity: 'rare',
  text: '每回合第一张水牌费用 −1', shengText: '打出时：吐纳 +2',
  upText: '每回合前两张水牌费用 −1', upShengText: '打出时：吐纳 +2',
  base: { n: 1 }, sheng: { energy: 2 },
  upBase: { n: 2 }, upSheng: { energy: 2 },
});
def({
  id: 'xuanwuzhenhai', name: '玄武镇海', element: 'water', type: 'defense', cost: 3, rarity: 'rare',
  text: '20 水护体', shengText: '本回合结束不衰减',
  upText: '26 水护体', upShengText: '本回合结束不衰减',
  base: { block: 20 }, sheng: { applySelf: { retainBlock: 1 } },
  upBase: { block: 26 }, upSheng: { applySelf: { retainBlock: 1 } },
});
def({
  // 心法：n=回合开始行位为水时吐纳量；参悟 n2=1 表示条件放宽为「水或金」；
  // 得气段「行位立即变水」：本牌为水行牌，打出时行位本就更新为水，无需额外 DSL，sheng 仅作标记
  id: 'tianyishengshui', name: '天一生水', element: 'water', type: 'power', cost: 3, rarity: 'epic',
  text: '回合开始若行位为水：吐纳 +2', shengText: '打出时：行位立即变水',
  upText: '回合开始若行位为水或金：吐纳 +2', upShengText: '打出时：行位立即变水',
  base: { n: 2 }, sheng: {},
  upBase: { n: 2, n2: 1 }, upSheng: {},
});
def({
  // special 'canghai'：pendingChoice 'discardHand'，每弃 1 张 +n 水护体；得气 n2=每张回血
  id: 'canghainachuan', name: '沧海纳川', element: 'water', type: 'skill', cost: 2, rarity: 'epic',
  text: '弃任意张手牌，每弃 1 张 +7 水护体', shengText: '每张再回 2 血',
  upText: '弃任意张手牌，每弃 1 张 +9 水护体', upShengText: '每张再回 2 血',
  base: { special: 'canghai', n: 7 }, sheng: { n2: 2 },
  upBase: { special: 'canghai', n: 9 }, upSheng: { n2: 2 },
});
def({
  // 心法：在场=袖藏无上限且袖藏牌下回合费用 −1；参悟 n=1 表示本牌费用 −1（即 3 费；
  // CardDef 无 upCost 字段，契约缺口已汇报，暂由引擎按 upgraded 处理）
  id: 'beimingtuntian', name: '北冥吞天', element: 'water', type: 'power', cost: 4, rarity: 'legendary',
  text: '你的袖藏无上限，且袖藏牌下回合费用 −1', shengText: '打出时：抽 2',
  upText: '你的袖藏无上限，且袖藏牌下回合费用 −1（本牌费用 3）', upShengText: '打出时：抽 2',
  base: {}, sheng: { draw: 2 },
  upBase: { n: 1 }, upSheng: { draw: 2 },
});

// ================= 火（13）——灼烧、引爆、高伤带代价 =================

def({
  id: 'huodanshu', name: '火弹术', element: 'fire', type: 'attack', cost: 1, rarity: 'common',
  text: '6 伤 +2 灼烧', shengText: '+2 灼烧',
  upText: '8 伤 +3 灼烧', upShengText: '+2 灼烧',
  base: { damage: 6, applyEnemy: { zhuoshao: 2 } }, sheng: { applyEnemy: { zhuoshao: 2 } },
  upBase: { damage: 8, applyEnemy: { zhuoshao: 3 } }, upSheng: { applyEnemy: { zhuoshao: 2 } },
});
def({
  // special 'yinhuo'【引爆】：n=引爆倍率%（参悟 ×1.5=150）；得气 n2=+1 次引爆（合计 2 次）；
  // 技能需选敌方目标 → targetEnemy
  id: 'yinhuofu', name: '引火符', element: 'fire', type: 'skill', cost: 1, rarity: 'common', targetEnemy: true,
  text: '【引爆】：目标立即受其灼烧层数的伤害（层数照常保留）', shengText: '引爆结算 2 次',
  upText: '【引爆】：目标立即受其灼烧层数 ×1.5 的伤害（层数照常保留）', upShengText: '引爆结算 2 次',
  base: { special: 'yinhuo', n: 100 }, sheng: { n2: 1 },
  upBase: { special: 'yinhuo', n: 150 }, upSheng: { n2: 1 },
});
def({
  // 自灼走 selfBurn；得气 selfBurn 合计 0 → 自身不灼烧（约定 2，引擎钳到 ≥0）
  id: 'yanbao', name: '炎爆', element: 'fire', type: 'attack', cost: 2, rarity: 'common',
  text: '16 伤；自身 +2 灼烧', shengText: '自身不灼烧',
  upText: '20 伤；自身 +2 灼烧', upShengText: '自身不灼烧',
  base: { damage: 16, selfBurn: 2 }, sheng: { selfBurn: -2 },
  upBase: { damage: 20, selfBurn: 2 }, upSheng: { selfBurn: -2 },
});
def({
  // 反烧走 fanshao 状态；得气合计 +3 灼烧
  id: 'huohuansha', name: '火浣纱', element: 'fire', type: 'defense', cost: 1, rarity: 'common',
  text: '7 火护体；本回合攻击你的敌人 +2 灼烧', shengText: '+3 灼烧',
  upText: '10 火护体；本回合攻击你的敌人 +2 灼烧', upShengText: '+3 灼烧',
  base: { block: 7, applySelf: { fanshao: 2 } }, sheng: { applySelf: { fanshao: 1 } },
  upBase: { block: 10, applySelf: { fanshao: 2 } }, upSheng: { applySelf: { fanshao: 1 } },
});
def({
  id: 'liaoyuan', name: '燎原', element: 'fire', type: 'attack', cost: 2, rarity: 'common',
  text: '对全体 7 伤 +1 灼烧', shengText: '+1 灼烧',
  upText: '对全体 9 伤 +2 灼烧', upShengText: '+1 灼烧',
  base: { damage: 7, aoe: true, applyEnemyAll: { zhuoshao: 1 } }, sheng: { applyEnemyAll: { zhuoshao: 1 } },
  upBase: { damage: 9, aoe: true, applyEnemyAll: { zhuoshao: 2 } }, upSheng: { applyEnemyAll: { zhuoshao: 1 } },
});
def({
  id: 'zhulongzhimu', name: '烛龙之目', element: 'fire', type: 'skill', cost: 1, rarity: 'common',
  text: '抽 2', shengText: '吐纳 +1',
  upText: '抽 3', upShengText: '吐纳 +1',
  base: { draw: 2 }, sheng: { energy: 1 },
  upBase: { draw: 3 }, upSheng: { energy: 1 },
});
def({
  // special 'sanmei'：燃尽剩余全部灵气（先扣本牌费用），每点 n 伤；得气合计 14（参悟 16）
  id: 'sanmeizhenhuo', name: '三昧真火', element: 'fire', type: 'attack', cost: 2, rarity: 'rare',
  text: '燃尽气海剩余灵气：每点 12 伤（单体）', shengText: '每点 14 伤',
  upText: '燃尽气海剩余灵气：每点 14 伤（单体）', upShengText: '每点 16 伤',
  base: { special: 'sanmei', n: 12 }, sheng: { n: 2 },
  upBase: { special: 'sanmei', n: 14 }, upSheng: { n: 2 },
});
def({
  id: 'fengmingqishan', name: '凤鸣岐山', element: 'fire', type: 'skill', cost: 2, rarity: 'rare',
  text: '全体敌人 +4 灼烧；自身回 3 血', shengText: '+2 灼烧',
  upText: '全体敌人 +6 灼烧；自身回 3 血', upShengText: '+2 灼烧',
  base: { applyEnemyAll: { zhuoshao: 4 }, heal: 3 }, sheng: { applyEnemyAll: { zhuoshao: 2 } },
  upBase: { applyEnemyAll: { zhuoshao: 6 }, heal: 3 }, upSheng: { applyEnemyAll: { zhuoshao: 2 } },
});
def({
  // 心法：n=你施加的灼烧额外层数；得气段为打出瞬间全体 +2 灼烧
  id: 'lihuoxinjing', name: '离火心经', element: 'fire', type: 'power', cost: 2, rarity: 'rare',
  text: '你施加的灼烧 +1 层', shengText: '打出时：全体 +2 灼烧',
  upText: '你施加的灼烧 +2 层', upShengText: '打出时：全体 +2 灼烧',
  base: { n: 1 }, sheng: { applyEnemyAll: { zhuoshao: 2 } },
  upBase: { n: 2 }, upSheng: { applyEnemyAll: { zhuoshao: 2 } },
});
def({
  id: 'fentian', name: '焚天', element: 'fire', type: 'attack', cost: 4, rarity: 'epic',
  text: '32 伤 +5 灼烧', shengText: '再 +10 伤',
  upText: '40 伤 +5 灼烧', upShengText: '再 +10 伤',
  base: { damage: 32, applyEnemy: { zhuoshao: 5 } }, sheng: { bonusDamage: 10 },
  upBase: { damage: 40, applyEnemy: { zhuoshao: 5 } }, upSheng: { bonusDamage: 10 },
});
def({
  // 心法：n=每回合第一张攻击牌附加灼烧；得气段以大负值清空自身灼烧（约定 2，钳到 0）
  id: 'huodezhenshen', name: '火德真身', element: 'fire', type: 'power', cost: 3, rarity: 'epic',
  text: '每回合你的第一张攻击牌附加 4 灼烧', shengText: '打出时：自身灼烧全清',
  upText: '每回合你的第一张攻击牌附加 6 灼烧', upShengText: '打出时：自身灼烧全清',
  base: { n: 4 }, sheng: { applySelf: { zhuoshao: -99 } },
  upBase: { n: 6 }, upSheng: { applySelf: { zhuoshao: -99 } },
});
def({
  // niepan=死亡时弃全部手牌，每张以 X% 上限气血复活；
  // 得气段「复活时清除全部负面」以 n=1 标记（DSL 无对应字段，契约缺口已汇报）
  id: 'yuhuoniepan', name: '浴火涅槃', element: 'fire', type: 'skill', cost: 3, rarity: 'epic',
  text: '本场死亡时：弃全部手牌，每张以 12% 上限气血复活（放逐）', shengText: '复活时清除全部负面',
  upText: '本场死亡时：弃全部手牌，每张以 15% 上限气血复活（放逐）', upShengText: '复活时清除全部负面',
  base: { applySelf: { niepan: 12 }, exhaust: true }, sheng: { n: 1 },
  upBase: { applySelf: { niepan: 15 }, exhaust: true }, upSheng: { n: 1 },
});
def({
  // special 'yinghuo'：X 费，X×n 伤 + X 灼烧；得气 n 合计 12（参悟 14）
  id: 'yinghuoshouxin', name: '荧惑守心', element: 'fire', type: 'attack', cost: 'X', rarity: 'legendary',
  text: '燃 X 灵气：X×10 伤 + X 灼烧', shengText: '每点再 +2 伤',
  upText: '燃 X 灵气：X×12 伤 + X 灼烧', upShengText: '每点再 +2 伤',
  base: { special: 'yinghuo', n: 10 }, sheng: { n: 2 },
  upBase: { special: 'yinghuo', n: 12 }, upSheng: { n: 2 },
});

// ================= 土（13）——护体、固本、山岳 =================

def({
  // v3 新增起始防御：土生金，先守中后御剑即得气（开局连招教学，§5.2）
  id: 'shouzhong', name: '守中', element: 'earth', type: 'defense', cost: 1, rarity: 'starter',
  text: '8 土护体', shengText: '+1 层固本',
  upText: '11 土护体', upShengText: '+1 层固本',
  base: { block: 8 }, sheng: { applySelf: { guben: 1 } },
  upBase: { block: 11 }, upSheng: { applySelf: { guben: 1 } },
});
def({
  id: 'tiebushan', name: '铁布衫', element: 'earth', type: 'defense', cost: 1, rarity: 'common',
  text: '10 土护体', shengText: '回 2 血',
  upText: '14 土护体', upShengText: '回 2 血',
  base: { block: 10 }, sheng: { heal: 2 },
  upBase: { block: 14 }, upSheng: { heal: 2 },
});
def({
  id: 'luoshi', name: '落石', element: 'earth', type: 'attack', cost: 1, rarity: 'common',
  text: '7 伤', shengText: '+4 伤',
  upText: '10 伤', upShengText: '+4 伤',
  base: { damage: 7 }, sheng: { bonusDamage: 4 },
  upBase: { damage: 10 }, upSheng: { bonusDamage: 4 },
});
def({
  id: 'panshijue', name: '磐石诀', element: 'earth', type: 'skill', cost: 1, rarity: 'common',
  text: '+1 层固本', shengText: '+1 层（共 2）',
  upText: '+2 层固本', upShengText: '+1 层（共 3）',
  base: { applySelf: { guben: 1 } }, sheng: { applySelf: { guben: 1 } },
  upBase: { applySelf: { guben: 2 } }, upSheng: { applySelf: { guben: 1 } },
});
def({
  id: 'shifushu', name: '石肤术', element: 'earth', type: 'defense', cost: 1, rarity: 'common',
  text: '9 土护体', shengText: '下回合开始 +4 护体',
  upText: '12 土护体', upShengText: '下回合开始 +4 护体',
  base: { block: 9 }, sheng: { applySelf: { nextTurnBlock: 4 } },
  upBase: { block: 12 }, upSheng: { applySelf: { nextTurnBlock: 4 } },
});
def({
  // zhise=直接滞涩目标（无需克向，§16.3）
  id: 'handi', name: '撼地', element: 'earth', type: 'attack', cost: 2, rarity: 'common',
  text: '12 伤', shengText: '目标【滞涩】',
  upText: '16 伤', upShengText: '目标【滞涩】',
  base: { damage: 12 }, sheng: { zhise: true },
  upBase: { damage: 16 }, upSheng: { zhise: true },
});
def({
  // special 'dadimaidong'：block + 你每层固本额外 +n 护体
  id: 'dadimaidong', name: '大地脉动', element: 'earth', type: 'defense', cost: 2, rarity: 'rare',
  text: '12 土护体；你每层固本额外 +3', shengText: '+1 层固本',
  upText: '16 土护体；你每层固本额外 +3', upShengText: '+1 层固本',
  base: { special: 'dadimaidong', block: 12, n: 3 }, sheng: { applySelf: { guben: 1 } },
  upBase: { special: 'dadimaidong', block: 16, n: 3 }, upSheng: { applySelf: { guben: 1 } },
});
def({
  // special 'chengshan'【掷山】：失去至多 n 点护体，造成失去量 ×n2% 伤害；得气掷出上限合计 18
  id: 'chengshanyin', name: '承山印', element: 'earth', type: 'attack', cost: 3, rarity: 'rare',
  text: '【掷山】：失去你至多 12 点护体，造成其 1.5 倍伤害', shengText: '掷出上限 +6（至 18）',
  upText: '【掷山】：失去你至多 12 点护体，造成其 2 倍伤害', upShengText: '掷出上限 +6（至 18）',
  base: { special: 'chengshan', n: 12, n2: 150 }, sheng: { n: 6 },
  upBase: { special: 'chengshan', n: 12, n2: 200 }, upSheng: { n: 6 },
});
def({
  // 心法：n=回合衰减固定值（替代「减半」）；得气段为打出瞬间 +8 土护体
  id: 'houdezaiwu', name: '厚德载物', element: 'earth', type: 'power', cost: 2, rarity: 'rare',
  text: '你的护体回合衰减从「减半」改为「固定 −4」', shengText: '打出时：+8 土护体',
  upText: '你的护体回合衰减从「减半」改为「固定 −2」', upShengText: '打出时：+8 土护体',
  base: { n: 4 }, sheng: { block: 8 },
  upBase: { n: 2 }, upSheng: { block: 8 },
});
def({
  id: 'shanbeng', name: '山崩', element: 'earth', type: 'attack', cost: 3, rarity: 'epic',
  text: '24 伤 + 目标【滞涩】', shengText: '+8 伤',
  upText: '30 伤 + 目标【滞涩】', upShengText: '+8 伤',
  base: { damage: 24, zhise: true }, sheng: { bonusDamage: 8 },
  upBase: { damage: 30, zhise: true }, upSheng: { bonusDamage: 8 },
});
def({
  // 心法：n=护体获取加成%；得气段为打出瞬间 +2 层固本
  id: 'budongrushan', name: '不动如山', element: 'earth', type: 'power', cost: 3, rarity: 'epic',
  text: '你获得的护体 +33%', shengText: '打出时：+2 层固本',
  upText: '你获得的护体 +50%', upShengText: '打出时：+2 层固本',
  base: { n: 33 }, sheng: { applySelf: { guben: 2 } },
  upBase: { n: 50 }, upSheng: { applySelf: { guben: 2 } },
});
def({
  id: 'wahuangxirang', name: '娲皇息壤', element: 'earth', type: 'skill', cost: 2, rarity: 'epic',
  text: '回 14 血（放逐）', shengText: '再 +1 层固本',
  upText: '回 18 血（放逐）', upShengText: '再 +1 层固本',
  base: { heal: 14, exhaust: true }, sheng: { applySelf: { guben: 1 } },
  upBase: { heal: 18, exhaust: true }, upSheng: { applySelf: { guben: 1 } },
});
def({
  id: 'zhenyuexi', name: '镇岳玺', element: 'earth', type: 'defense', cost: 3, rarity: 'epic',
  text: '26 土护体 +2 层固本', shengText: '本回合结束不衰减',
  upText: '32 土护体 +2 层固本', upShengText: '本回合结束不衰减',
  base: { block: 26, applySelf: { guben: 2 } }, sheng: { applySelf: { retainBlock: 1 } },
  upBase: { block: 32, applySelf: { guben: 2 } }, upSheng: { applySelf: { retainBlock: 1 } },
});

// ================= 无属性（10）——万金油与构筑胶水（无得气段，不改行位） =================

def({
  // v3 新增本命牌：bonded=不可斩去、不可复制；special 'canjuan'：检视顶 n 张选 1 入手；
  // 参悟 n2=1 表示可将 1 张置于库底
  id: 'canjuan', name: '问长生·残卷', element: 'none', type: 'skill', cost: 1, rarity: 'starter', bonded: true,
  text: '检视牌库顶 3 张，选 1 入手',
  upText: '检视牌库顶 4 张，选 1 入手，并可将 1 张置于库底',
  base: { special: 'canjuan', n: 3 },
  upBase: { special: 'canjuan', n: 4, n2: 1 },
});
def({
  id: 'jingxin', name: '静心', element: 'none', type: 'skill', cost: 0, rarity: 'common',
  text: '5 无属性护体',
  upText: '8 无属性护体',
  base: { block: 5 },
  upBase: { block: 8 },
});
def({
  // 「本回合袖藏上限 +1」写入 BattleState.sleeveCapBonus，以 n=1 标记（DSL 无对应字段，契约缺口已汇报）
  id: 'mingxiang', name: '冥想', element: 'none', type: 'skill', cost: 1, rarity: 'common',
  text: '抽 1；本回合袖藏上限 +1',
  upText: '抽 2；本回合袖藏上限 +1',
  base: { draw: 1, n: 1 },
  upBase: { draw: 2, n: 1 },
});
def({
  // special 'guanxiang'：检视牌库顶 5 张，选 n 张入手 → pendingChoice 'pickTop'
  id: 'guanxiangwuxing', name: '观想五行', element: 'none', type: 'skill', cost: 1, rarity: 'common',
  text: '检视牌库顶 5 张，选 1 入手',
  upText: '检视牌库顶 5 张，选 2 入手',
  base: { special: 'guanxiang', n: 1 },
  upBase: { special: 'guanxiang', n: 2 },
});
def({
  id: 'powang', name: '破妄', element: 'none', type: 'attack', cost: 1, rarity: 'rare',
  text: '8 伤，无视护体',
  upText: '11 伤，无视护体',
  base: { damage: 8, ignoreBlock: true },
  upBase: { damage: 11, ignoreBlock: true },
});
def({
  // yinguo=下次受到的攻击伤害 X% 反弹
  id: 'yinguolunhui', name: '因果轮回', element: 'none', type: 'skill', cost: 2, rarity: 'rare',
  text: '下次受到的攻击伤害 100% 反弹',
  upText: '下次受到的攻击伤害 150% 反弹',
  base: { applySelf: { yinguo: 100 } },
  upBase: { applySelf: { yinguo: 150 } },
});
def({
  // special 'wuxinglunzhuan'：pendingChoice 'returnHand'，每张吐纳 +1；
  // 参悟「本牌费用 0」：CardDef 无 upCost 字段（契约缺口已汇报），暂由引擎按 upgraded 处理
  id: 'wuxinglunzhuan', name: '五行轮转', element: 'none', type: 'skill', cost: 1, rarity: 'rare',
  text: '将任意张手牌洗回牌库，每张吐纳 +1',
  upText: '将任意张手牌洗回牌库，每张吐纳 +1（本牌费用 0）',
  base: { special: 'wuxinglunzhuan' },
  upBase: { special: 'wuxinglunzhuan' },
});
def({
  // special 'zuowang'：pendingChoice 'exhaustHand'，每张吐纳 +1 并抽 1；参悟 n=每张再回 2 血
  id: 'zuowang', name: '坐忘', element: 'none', type: 'skill', cost: 1, rarity: 'epic',
  text: '放逐任意张手牌，每张吐纳 +1 并抽 1',
  upText: '放逐任意张手牌，每张吐纳 +1 并抽 1，每张再回 2 血',
  base: { special: 'zuowang' },
  upBase: { special: 'zuowang', n: 2 },
});
def({
  // 心法：在场=无属性牌获得【随行】（引擎按 power 实现）；参悟 n=1 表示每回合第一张无属性牌费用 −1
  id: 'daofaziran', name: '道法自然', element: 'none', type: 'power', cost: 2, rarity: 'epic',
  text: '你的无属性牌获得【随行】：打出时视为当前行位所生之行，将行位推进一格（可充当周天链环；无属性牌本身仍无得气段）',
  upText: '你的无属性牌获得【随行】：打出时视为当前行位所生之行，将行位推进一格；每回合第一张无属性牌费用 −1',
  base: {},
  upBase: { n: 1 },
});
def({
  // special 'zhoutianX'：亮出牌库顶 X 张，沿当前行位可顺生衔接者依次免费打出（随机目标），其余弃去；
  // 参悟 n=1 表示未打出者入手而非弃去
  id: 'zhoutiandayanjue', name: '周天大衍诀', element: 'none', type: 'skill', cost: 'X', rarity: 'legendary',
  text: '亮出牌库顶 X 张：其中沿当前行位可顺生衔接者依次免费打出（随机目标），其余弃去',
  upText: '亮出牌库顶 X 张：其中沿当前行位可顺生衔接者依次免费打出（随机目标），未打出者入手',
  base: { special: 'zhoutianX' },
  upBase: { special: 'zhoutianX', n: 1 },
});

// ================= 诅咒（5，§5.5）——心魔与业力的战斗投影 =================

def({
  // 心魔 ≥3：每场战斗开始入抽牌堆
  id: 'chenyuan', name: '尘缘', element: 'none', type: 'curse', cost: 0, rarity: 'curse',
  text: '不可打出，占手牌位',
  upText: '不可打出，占手牌位',
  base: {}, upBase: {},
});
def({
  // 心魔 ≥5；special 'yezhang'：可花 2 灵气打出以放逐之
  id: 'yezhang', name: '业障', element: 'none', type: 'curse', cost: 2, rarity: 'curse', playableCurse: true,
  text: '可花 2 灵气打出以放逐之，无其他效果',
  upText: '可花 2 灵气打出以放逐之，无其他效果',
  base: { special: 'yezhang', exhaust: true }, upBase: { special: 'yezhang', exhaust: true },
});
def({
  // 心魔 ≥7：在手牌时攻击牌减伤（引擎按 id 结算）
  id: 'tanchen', name: '贪嗔', element: 'none', type: 'curse', cost: 0, rarity: 'curse',
  text: '不可打出；在手牌时你的攻击牌 −2 伤',
  upText: '不可打出；在手牌时你的攻击牌 −2 伤',
  base: {}, upBase: {},
});
def({
  // 心魔 ≥9：回合结束仍在手牌受 3 伤（引擎按 id 结算）
  id: 'xinmo_curse', name: '心魔', element: 'none', type: 'curse', cost: 0, rarity: 'curse',
  text: '不可打出；回合结束仍在手牌：受 3 伤',
  upText: '不可打出；回合结束仍在手牌：受 3 伤',
  base: {}, upBase: {},
});
def({
  // 业力 ≥2：开局每 2 点业力永久入起始牌库 1 张；在手牌时封锁得气（引擎按 id 结算）
  id: 'yinguozhai', name: '因果债', element: 'none', type: 'curse', cost: 0, rarity: 'curse',
  text: '不可打出；在手牌时你无法得气',
  upText: '不可打出；在手牌时你无法得气',
  base: {}, upBase: {},
});

// ---------- 工具与导出 ----------

/** 起始卡组（剑修，§5.2，8 张）：御剑术 ×3、守中 ×2、润锋 ×1、引灵诀 ×1、问长生·残卷 ×1 */
export const STARTER_DECK: string[] = [
  'yujianshu', 'yujianshu', 'yujianshu',
  'shouzhong', 'shouzhong',
  'runfeng',
  'yinlingjue',
  'canjuan',
];

/** 按稀有度取卡（奖励池/坊市用） */
export function cardsByRarity(rarity: string): CardDef[] {
  return Object.values(CARDS).filter((c) => c.rarity === rarity);
}

/** 按 id 取卡定义；未知 id 直接抛错（数据完整性防线） */
export function getCard(id: string): CardDef {
  const c = CARDS[id];
  if (!c) throw new Error(`未知卡牌: ${id}`);
  return c;
}

/** 诅咒牌 id（战斗投影生成顺序：尘缘→业障→贪嗔→心魔；因果债由业力开局生成） */
export const CURSE_IDS = ['chenyuan', 'yezhang', 'tanchen', 'xinmo_curse', 'yinguozhai'];
