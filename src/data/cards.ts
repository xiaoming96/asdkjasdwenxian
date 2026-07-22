/**
 * 全卡表（策划案 §5，75 张 + 5 诅咒）
 * 效果为数据驱动 DSL，少数特殊卡走 special 脚本（§16.3）。
 */
import type { CardDef } from '../core/types';

export const CARDS: Record<string, CardDef> = {};

function def(c: CardDef) {
  CARDS[c.id] = c;
}

// ================= 金（13）——直伤、破甲、剑修核心 =================

def({
  id: 'yujianshu', name: '御剑术', element: 'metal', type: 'attack', cost: 1, rarity: 'starter',
  text: '造成 8 伤', upText: '造成 11 伤',
  base: { damage: 8 }, up: { damage: 11 },
});
def({
  id: 'lianhuanjian', name: '连环剑', element: 'metal', type: 'attack', cost: 1, rarity: 'common',
  text: '4 伤 ×2 段', upText: '5 伤 ×2 段',
  base: { damage: 4, times: 2 }, up: { damage: 5, times: 2 },
});
def({
  id: 'duanjinzhi', name: '断金指', element: 'metal', type: 'attack', cost: 0, rarity: 'common',
  text: '3 伤', upText: '5 伤',
  base: { damage: 3 }, up: { damage: 5 },
});
def({
  id: 'cuifeng', name: '淬锋', element: 'metal', type: 'skill', cost: 1, rarity: 'common',
  text: '本回合接下来 2 张攻击牌 +4 伤', upText: '本回合接下来 2 张攻击牌 +6 伤',
  base: { special: 'cuifeng', n: 4, n2: 2 }, up: { special: 'cuifeng', n: 6, n2: 2 },
});
def({
  id: 'feijianhuanji', name: '飞剑还击', element: 'metal', type: 'defense', cost: 1, rarity: 'common',
  text: '7 护体；本回合每次被攻击反刺 4 伤', upText: '10 护体，反刺 6 伤',
  base: { block: 7, applySelf: { fanci: 4 } }, up: { block: 10, applySelf: { fanci: 6 } },
});
def({
  id: 'jinleifu', name: '金雷符', element: 'metal', type: 'attack', cost: 2, rarity: 'common',
  text: '14 伤；若触发行云流水，改为对全体', upText: '18 伤；若触发行云流水，改为对全体',
  base: { damage: 14, special: 'jinleifu' }, up: { damage: 18, special: 'jinleifu' },
});
def({
  id: 'wanjianjue', name: '万剑诀', element: 'metal', type: 'attack', cost: 3, rarity: 'rare',
  text: '对全体 11 伤', upText: '对全体 15 伤',
  base: { damage: 11, aoe: true }, up: { damage: 15, aoe: true },
});
def({
  id: 'jianqizongheng', name: '剑气纵横', element: 'metal', type: 'attack', cost: 2, rarity: 'rare',
  text: '伤害 = 本回合已打出牌数 ×4', upText: '伤害 = 本回合已打出牌数 ×5',
  base: { special: 'jianqizongheng', n: 4 }, up: { special: 'jianqizongheng', n: 5 },
});
def({
  id: 'gengjinjianyu', name: '庚金剑域', element: 'metal', type: 'power', cost: 2, rarity: 'rare',
  text: '每回合你的第一张金牌 +5 伤', upText: '每回合你的第一张金牌 +8 伤',
  base: { n: 5 }, up: { n: 8 },
});
def({
  id: 'baihongguanri', name: '白虹贯日', element: 'metal', type: 'attack', cost: 2, rarity: 'epic',
  text: '18 伤；目标有破甲则翻倍', upText: '22 伤；目标有破甲则翻倍',
  base: { damage: 18, special: 'baihong' }, up: { damage: 22, special: 'baihong' },
});
def({
  id: 'tiangangjianzhen', name: '天罡剑阵', element: 'metal', type: 'skill', cost: 2, rarity: 'epic',
  text: '获得 2 层罡气', upText: '获得 3 层罡气',
  base: { applySelf: { gangqi: 2 } }, up: { applySelf: { gangqi: 3 } },
});
def({
  id: 'jianxintongming', name: '剑心通明', element: 'metal', type: 'power', cost: 3, rarity: 'epic',
  text: '每打出 3 张金牌：抽 1 并 +1 灵气', upText: '每打出 2 张金牌：抽 1 并 +1 灵气',
  base: { n: 3 }, up: { n: 2 },
});
def({
  id: 'yijianpowanfa', name: '一剑破万法', element: 'metal', type: 'attack', cost: 4, rarity: 'legendary',
  text: '44 伤，无视护体；打出后放逐', upText: '52 伤，无视护体；打出后放逐',
  base: { damage: 44, ignoreBlock: true, exhaust: true }, up: { damage: 52, ignoreBlock: true, exhaust: true },
});

// ================= 木（13）——续航、瘴毒、控制 =================

def({
  id: 'tengmanfu', name: '藤蔓缚', element: 'wood', type: 'attack', cost: 1, rarity: 'common',
  text: '5 伤 +1 缠缚', upText: '7 伤 +2 缠缚',
  base: { damage: 5, applyEnemy: { chanfu: 1 } }, up: { damage: 7, applyEnemy: { chanfu: 2 } },
});
def({
  id: 'zhangduzhi', name: '瘴毒指', element: 'wood', type: 'attack', cost: 1, rarity: 'common',
  text: '4 伤 +3 瘴毒', upText: '4 伤 +5 瘴毒',
  base: { damage: 4, applyEnemy: { zhangdu: 3 } }, up: { damage: 4, applyEnemy: { zhangdu: 5 } },
});
def({
  id: 'huichunshu', name: '回春术', element: 'wood', type: 'skill', cost: 1, rarity: 'common',
  text: '回 4 血（每场限 2 次）', upText: '回 6 血（每场限 2 次）',
  base: { special: 'huichunshu', n: 4 }, up: { special: 'huichunshu', n: 6 },
});
def({
  id: 'jingjitengjia', name: '荆棘藤甲', element: 'wood', type: 'defense', cost: 1, rarity: 'common',
  text: '6 护体；本回合攻击你的敌人受 3 伤', upText: '8 护体；本回合攻击你的敌人受 5 伤',
  base: { block: 6, applySelf: { fanci: 3 } }, up: { block: 8, applySelf: { fanci: 5 } },
});
def({
  id: 'mudun', name: '木遁', element: 'wood', type: 'defense', cost: 1, rarity: 'common',
  text: '8 护体；若触发行云流水，抽 1', upText: '11 护体；若触发行云流水，抽 1',
  base: { block: 8, special: 'mudun' }, up: { block: 11, special: 'mudun' },
});
def({
  id: 'shengshengbuxi', name: '生生不息', element: 'wood', type: 'skill', cost: 2, rarity: 'common',
  text: '获得 3 层回春', upText: '获得 5 层回春',
  base: { applySelf: { huichun: 3 } }, up: { applySelf: { huichun: 5 } },
});
def({
  id: 'qianmuci', name: '千木刺', element: 'wood', type: 'attack', cost: 2, rarity: 'rare',
  text: '对全体 6 伤 +1 缠缚', upText: '对全体 8 伤 +2 缠缚',
  base: { damage: 6, aoe: true, applyEnemyAll: { chanfu: 1 } }, up: { damage: 8, aoe: true, applyEnemyAll: { chanfu: 2 } },
});
def({
  id: 'chunhuidadi', name: '春回大地', element: 'wood', type: 'skill', cost: 1, rarity: 'rare',
  text: '移除自身全部负面，每移除 1 个抽 1', upText: '移除自身全部负面，每移除 1 个抽 1 并回 2 血',
  base: { special: 'chunhui' }, up: { special: 'chunhui', n: 2 },
});
def({
  id: 'gumuchangqing', name: '古木长青', element: 'wood', type: 'power', cost: 2, rarity: 'rare',
  text: '每回合结束回 2 血', upText: '每回合结束回 3 血',
  base: { n: 2 }, up: { n: 3 },
});
def({
  id: 'qingtengkuilei', name: '青藤傀儡', element: 'wood', type: 'skill', cost: 2, rarity: 'epic',
  text: '召唤藤偶替你承受伤害（上限 6/回合），持续 3 回合', upText: '藤偶承受上限 9/回合，持续 3 回合',
  base: { applySelf: { tengou: 3 }, n: 6 }, up: { applySelf: { tengou: 3 }, n: 9 },
});
def({
  id: 'wandushixin', name: '万毒噬心', element: 'wood', type: 'power', cost: 3, rarity: 'epic',
  text: '敌人瘴毒不再衰减，且每回合 +1 层', upText: '敌人瘴毒不再衰减，且每回合 +2 层',
  base: { n: 1 }, up: { n: 2 },
});
def({
  id: 'jianmuqingtian', name: '建木擎天', element: 'wood', type: 'skill', cost: 3, rarity: 'epic',
  text: '气血上限 +7 并回 7（放逐）', upText: '气血上限 +10 并回 10（放逐）',
  base: { maxHp: 7, heal: 7, exhaust: true }, up: { maxHp: 10, heal: 10, exhaust: true },
});
def({
  id: 'kuronglunzhuan', name: '枯荣轮转', element: 'wood', type: 'skill', cost: 1, rarity: 'legendary',
  text: '失去 7 气血：获得 3 灵气并抽 3', upText: '失去 5 气血：获得 3 灵气并抽 3',
  base: { special: 'kurong', loseHp: 7, energy: 3, draw: 3 }, up: { special: 'kurong', loseHp: 5, energy: 3, draw: 3 },
});

// ================= 水（13）——过牌、灵气、循环 =================

def({
  id: 'yinlingjue', name: '引灵诀', element: 'water', type: 'skill', cost: 1, rarity: 'starter',
  text: '抽 2', upText: '抽 3',
  base: { draw: 2 }, up: { draw: 3 },
});
def({
  id: 'xuanbingci', name: '玄冰刺', element: 'water', type: 'attack', cost: 1, rarity: 'common',
  text: '7 伤', upText: '10 伤',
  base: { damage: 7 }, up: { damage: 10 },
});
def({
  id: 'hanlu', name: '寒露', element: 'water', type: 'attack', cost: 1, rarity: 'common',
  text: '6 伤；击杀时回 4 血 +1 灵气', upText: '9 伤；击杀时回 4 血 +1 灵气',
  base: { damage: 6, special: 'hanlu' }, up: { damage: 9, special: 'hanlu' },
});
def({
  id: 'chaoxijue', name: '潮汐诀', element: 'water', type: 'defense', cost: 1, rarity: 'common',
  text: '7 护体；下回合抽 1', upText: '10 护体；下回合抽 1',
  base: { block: 7, applySelf: { nextTurnDraw: 1 } }, up: { block: 10, applySelf: { nextTurnDraw: 1 } },
});
def({
  id: 'jilingshu', name: '汲灵术', element: 'water', type: 'skill', cost: 0, rarity: 'common',
  text: '+1 灵气，行位变为"水"（放逐）', upText: '+1 灵气，行位变为"水"',
  base: { energy: 1, special: 'jiling', exhaust: true }, up: { energy: 1, special: 'jiling' },
});
def({
  id: 'guanlan', name: '观澜', element: 'water', type: 'skill', cost: 1, rarity: 'common',
  text: '预视牌库顶 3 张，可弃任意，然后抽 1', upText: '预视牌库顶 5 张，可弃任意，然后抽 1',
  base: { special: 'guanlan', n: 3 }, up: { special: 'guanlan', n: 5 },
});
def({
  id: 'jinghuashuiyue', name: '镜花水月', element: 'water', type: 'skill', cost: 1, rarity: 'rare',
  text: '复制 1 张手牌（复制品 0 费，回合末放逐）', upText: '复制 1 张手牌（复制品 0 费，保留）',
  base: { special: 'jinghua' }, up: { special: 'jinghua', n: 1 },
});
def({
  id: 'shangshanruoshui', name: '上善若水', element: 'water', type: 'power', cost: 2, rarity: 'rare',
  text: '每回合第一张水牌费用 −1', upText: '每回合前两张水牌费用 −1',
  base: { n: 1 }, up: { n: 2 },
});
def({
  id: 'xuanwuzhenhai', name: '玄武镇海', element: 'water', type: 'defense', cost: 3, rarity: 'rare',
  text: '20 护体；本回合结束不清零', upText: '26 护体；本回合结束不清零',
  base: { block: 20, applySelf: { retainBlock: 1 } }, up: { block: 26, applySelf: { retainBlock: 1 } },
});
def({
  id: 'tianyishengshui', name: '天一生水', element: 'water', type: 'power', cost: 3, rarity: 'epic',
  text: '灵气上限 +1；气血上限 −8', upText: '灵气上限 +1；气血上限 −4',
  base: { n: 8 }, up: { n: 4 },
});
def({
  id: 'canghainachuan', name: '沧海纳川', element: 'water', type: 'skill', cost: 2, rarity: 'epic',
  text: '弃全部手牌，每弃 1 张：+6 护体、回 1 血', upText: '弃全部手牌，每弃 1 张：+8 护体、回 1 血',
  base: { special: 'canghai', n: 6 }, up: { special: 'canghai', n: 8 },
});
def({
  id: 'dayanhuilan', name: '大衍回澜', element: 'water', type: 'attack', cost: 2, rarity: 'epic',
  text: '13 伤；从弃牌堆选 1 张置于牌库顶', upText: '17 伤；从弃牌堆选 1 张置于牌库顶',
  base: { damage: 13, special: 'dayan' }, up: { damage: 17, special: 'dayan' },
});
def({
  id: 'beimingtuntian', name: '北冥吞天', element: 'water', type: 'power', cost: 4, rarity: 'legendary',
  text: '每回合开始额外抽 2', upText: '每回合开始额外抽 2（费用 3）',
  base: { n: 2 }, up: { n: 2 },
});

// ================= 火（13）——灼烧、AOE、高伤带代价 =================

def({
  id: 'huodanshu', name: '火弹术', element: 'fire', type: 'attack', cost: 1, rarity: 'common',
  text: '6 伤 +2 灼烧', upText: '8 伤 +3 灼烧',
  base: { damage: 6, applyEnemy: { zhuoshao: 2 } }, up: { damage: 8, applyEnemy: { zhuoshao: 3 } },
});
def({
  id: 'yinhuofu', name: '引火符', element: 'fire', type: 'skill', cost: 1, rarity: 'common', targetEnemy: true,
  text: '目标灼烧层数翻倍', upText: '目标灼烧层数翻倍后 +2',
  base: { special: 'yinhuo' }, up: { special: 'yinhuo', n: 2 },
});
def({
  id: 'yanbao', name: '炎爆', element: 'fire', type: 'attack', cost: 2, rarity: 'common',
  text: '15 伤；自身受 3 伤', upText: '19 伤；自身受 3 伤',
  base: { damage: 15, selfDamage: 3 }, up: { damage: 19, selfDamage: 3 },
});
def({
  id: 'huohuansha', name: '火浣纱', element: 'fire', type: 'defense', cost: 1, rarity: 'common',
  text: '6 护体；本回合攻击你的敌人 +2 灼烧', upText: '9 护体；本回合攻击你的敌人 +3 灼烧',
  base: { block: 6, applySelf: { fanshao: 2 } }, up: { block: 9, applySelf: { fanshao: 3 } },
});
def({
  id: 'liaoyuan', name: '燎原', element: 'fire', type: 'attack', cost: 2, rarity: 'common',
  text: '对全体 8 伤 +1 灼烧', upText: '对全体 10 伤 +2 灼烧',
  base: { damage: 8, aoe: true, applyEnemyAll: { zhuoshao: 1 } }, up: { damage: 10, aoe: true, applyEnemyAll: { zhuoshao: 2 } },
});
def({
  id: 'zhulongzhimu', name: '烛龙之目', element: 'fire', type: 'skill', cost: 1, rarity: 'common',
  text: '抽 2；若行位为木，+1 灵气', upText: '抽 3；若行位为木，+1 灵气',
  base: { draw: 2, special: 'zhulong' }, up: { draw: 3, special: 'zhulong' },
});
def({
  id: 'sanmeizhenhuo', name: '三昧真火', element: 'fire', type: 'attack', cost: 3, rarity: 'rare',
  text: '消耗其余全部灵气，每点造成 10 伤', upText: '消耗其余全部灵气，每点造成 12 伤',
  base: { special: 'sanmei', n: 10 }, up: { special: 'sanmei', n: 12 },
});
def({
  id: 'fengmingqishan', name: '凤鸣岐山', element: 'fire', type: 'skill', cost: 2, rarity: 'rare',
  text: '全体敌人 +4 灼烧；自身回 3 血', upText: '全体敌人 +6 灼烧；自身回 3 血',
  base: { applyEnemyAll: { zhuoshao: 4 }, heal: 3 }, up: { applyEnemyAll: { zhuoshao: 6 }, heal: 3 },
});
def({
  id: 'lihuoxinjing', name: '离火心经', element: 'fire', type: 'power', cost: 2, rarity: 'rare',
  text: '你施加的灼烧 +1 层', upText: '你施加的灼烧 +2 层',
  base: { n: 1 }, up: { n: 2 },
});
def({
  id: 'fentian', name: '焚天', element: 'fire', type: 'attack', cost: 4, rarity: 'epic',
  text: '34 伤 +6 灼烧', upText: '42 伤 +8 灼烧',
  base: { damage: 34, applyEnemy: { zhuoshao: 6 } }, up: { damage: 42, applyEnemy: { zhuoshao: 8 } },
});
def({
  id: 'huodezhenshen', name: '火德真身', element: 'fire', type: 'power', cost: 3, rarity: 'epic',
  text: '每回合你的第一张攻击牌附加 5 灼烧', upText: '每回合你的第一张攻击牌附加 8 灼烧',
  base: { n: 5 }, up: { n: 8 },
});
def({
  id: 'yuhuoniepan', name: '浴火涅槃', element: 'fire', type: 'skill', cost: 3, rarity: 'epic',
  text: '本场死亡时以 50% 气血复活（放逐）', upText: '本场死亡时以 65% 气血复活（放逐）',
  base: { applySelf: { niepan: 50 }, exhaust: true }, up: { applySelf: { niepan: 65 }, exhaust: true },
});
def({
  id: 'yinghuoshouxin', name: '荧惑守心', element: 'fire', type: 'attack', cost: 'X', rarity: 'legendary',
  text: '消耗 X 灵气：X×9 伤 + X 灼烧', upText: '消耗 X 灵气：X×11 伤 + X 灼烧',
  base: { special: 'yinghuo', n: 9 }, up: { special: 'yinghuo', n: 11 },
});

// ================= 土（13）——护体、固本、反压 =================

def({
  id: 'tiebushan', name: '铁布衫', element: 'earth', type: 'defense', cost: 1, rarity: 'starter',
  text: '7 护体', upText: '10 护体',
  base: { block: 7 }, up: { block: 10 },
});
def({
  id: 'hangtu', name: '夯土', element: 'earth', type: 'defense', cost: 1, rarity: 'common',
  text: '5 护体；下回合再 +5 护体', upText: '7 护体；下回合再 +7 护体',
  base: { block: 5, applySelf: { nextTurnBlock: 5 } }, up: { block: 7, applySelf: { nextTurnBlock: 7 } },
});
def({
  id: 'luoshi', name: '落石', element: 'earth', type: 'attack', cost: 1, rarity: 'common',
  text: '7 伤', upText: '10 伤',
  base: { damage: 7 }, up: { damage: 10 },
});
def({
  id: 'panshijue', name: '磐石诀', element: 'earth', type: 'skill', cost: 1, rarity: 'common',
  text: '+1 层固本', upText: '+2 层固本',
  base: { applySelf: { guben: 1 } }, up: { applySelf: { guben: 2 } },
});
def({
  id: 'shifushu', name: '石肤术', element: 'earth', type: 'defense', cost: 1, rarity: 'common',
  text: '8 护体', upText: '12 护体',
  base: { block: 8 }, up: { block: 12 },
});
def({
  id: 'handi', name: '撼地', element: 'earth', type: 'attack', cost: 2, rarity: 'common',
  text: '11 伤 + 滞涩', upText: '15 伤 + 滞涩',
  base: { damage: 11, zhise: true }, up: { damage: 15, zhise: true },
});
def({
  id: 'dadimaidong', name: '大地脉动', element: 'earth', type: 'defense', cost: 2, rarity: 'rare',
  text: '13 护体；每层固本额外 +3', upText: '17 护体；每层固本额外 +3',
  base: { block: 13, special: 'dadimaidong', n: 3 }, up: { block: 17, special: 'dadimaidong', n: 3 },
});
def({
  id: 'chengshanyin', name: '承山印', element: 'earth', type: 'attack', cost: 3, rarity: 'rare',
  text: '伤害 = 当前护体值', upText: '伤害 = 当前护体值 ×1.3',
  base: { special: 'chengshan', n: 100 }, up: { special: 'chengshan', n: 130 },
});
def({
  id: 'houdezaiwu', name: '厚德载物', element: 'earth', type: 'power', cost: 2, rarity: 'rare',
  text: '回合结束保留至多 8 护体', upText: '回合结束保留至多 12 护体',
  base: { n: 8 }, up: { n: 12 },
});
def({
  id: 'shanbeng', name: '山崩', element: 'earth', type: 'attack', cost: 3, rarity: 'epic',
  text: '27 伤 + 滞涩', upText: '34 伤 + 滞涩',
  base: { damage: 27, zhise: true }, up: { damage: 34, zhise: true },
});
def({
  id: 'budongrushan', name: '不动如山', element: 'earth', type: 'power', cost: 3, rarity: 'epic',
  text: '你获得的护体 +33%', upText: '你获得的护体 +50%',
  base: { n: 33 }, up: { n: 50 },
});
def({
  id: 'wahuangxirang', name: '娲皇息壤', element: 'earth', type: 'skill', cost: 2, rarity: 'epic',
  text: '回 12 血（放逐）', upText: '回 16 血（放逐）',
  base: { heal: 12, exhaust: true }, up: { heal: 16, exhaust: true },
});
def({
  id: 'zhenyuexi', name: '镇岳玺', element: 'earth', type: 'defense', cost: 3, rarity: 'epic',
  text: '30 护体 +2 固本', upText: '38 护体 +2 固本',
  base: { block: 30, applySelf: { guben: 2 } }, up: { block: 38, applySelf: { guben: 2 } },
});

// ================= 无属性（10）——万金油与构筑胶水 =================

def({
  id: 'tuna', name: '吐纳', element: 'none', type: 'skill', cost: 1, rarity: 'common',
  text: '+1 灵气，回 2 血', upText: '+1 灵气，回 4 血',
  base: { energy: 1, heal: 2 }, up: { energy: 1, heal: 4 },
});
def({
  id: 'jingxin', name: '静心', element: 'none', type: 'skill', cost: 0, rarity: 'common',
  text: '4 护体', upText: '7 护体',
  base: { block: 4 }, up: { block: 7 },
});
def({
  id: 'mingxiang', name: '冥想', element: 'none', type: 'skill', cost: 1, rarity: 'common',
  text: '抽 1；下回合开始 +1 灵气', upText: '抽 2；下回合开始 +1 灵气',
  base: { draw: 1, applySelf: { nextTurnEnergy: 1 } }, up: { draw: 2, applySelf: { nextTurnEnergy: 1 } },
});
def({
  id: 'guanxiangwuxing', name: '观想五行', element: 'none', type: 'skill', cost: 1, rarity: 'common',
  text: '检视牌库顶 5 张，选 1 入手', upText: '检视牌库顶 5 张，选 2 入手',
  base: { special: 'guanxiang', n: 1 }, up: { special: 'guanxiang', n: 2 },
});
def({
  id: 'powang', name: '破妄', element: 'none', type: 'attack', cost: 1, rarity: 'rare',
  text: '7 伤，无视护体', upText: '10 伤，无视护体',
  base: { damage: 7, ignoreBlock: true }, up: { damage: 10, ignoreBlock: true },
});
def({
  id: 'yinguolunhui', name: '因果轮回', element: 'none', type: 'skill', cost: 2, rarity: 'rare',
  text: '下次受到的攻击伤害 100% 反弹', upText: '下次受到的攻击伤害 150% 反弹',
  base: { applySelf: { yinguo: 100 } }, up: { applySelf: { yinguo: 150 } },
});
def({
  id: 'wuxinglunzhuan', name: '五行轮转', element: 'none', type: 'skill', cost: 1, rarity: 'rare',
  text: '弃全部手牌重抽等量；若新手牌五行互不相同，本回合它们费用 −1', upText: '同左；本牌费用 0',
  base: { special: 'wuxinglunzhuan' }, up: { special: 'wuxinglunzhuan' },
});
def({
  id: 'zuowang', name: '坐忘', element: 'none', type: 'skill', cost: 1, rarity: 'epic',
  text: '放逐任意张手牌，每张 +1 灵气', upText: '放逐任意张手牌，每张 +1 灵气并抽 1',
  base: { special: 'zuowang' }, up: { special: 'zuowang', n: 1 },
});
def({
  id: 'daofaziran', name: '道法自然', element: 'none', type: 'power', cost: 2, rarity: 'epic',
  text: '行云流水的每回合灵气返还上限 +2', upText: '行云流水的每回合灵气返还上限 +3',
  base: { n: 2 }, up: { n: 3 },
});
def({
  id: 'zhoutiandayanjue', name: '周天大衍诀', element: 'none', type: 'skill', cost: 'X', rarity: 'legendary',
  text: '免费依次打出牌库顶 X 张牌（随机目标）', upText: '免费依次打出牌库顶 X 张牌（可自选目标）',
  base: { special: 'zhoutianX' }, up: { special: 'zhoutianX', n: 1 },
});

// ================= 诅咒（5） =================

def({
  id: 'chenyuan', name: '尘缘', element: 'none', type: 'curse', cost: 0, rarity: 'curse',
  text: '不可打出，占手牌位', upText: '',
  base: {}, up: {},
});
def({
  id: 'xinmo_curse', name: '心魔', element: 'none', type: 'curse', cost: 0, rarity: 'curse',
  text: '不可打出；回合结束仍在手牌：受 2 伤', upText: '',
  base: {}, up: {},
});
def({
  id: 'yezhang', name: '业障', element: 'none', type: 'curse', cost: 2, rarity: 'curse', playableCurse: true,
  text: '可花 2 灵气打出以放逐之，无其他效果', upText: '',
  base: { special: 'yezhang', exhaust: true }, up: { special: 'yezhang', exhaust: true },
});
def({
  id: 'yinguozhai', name: '因果债', element: 'none', type: 'curse', cost: 0, rarity: 'curse',
  text: '不可打出；在手牌时你的行云流水不触发', upText: '',
  base: {}, up: {},
});
def({
  id: 'tanchen', name: '贪嗔', element: 'none', type: 'curse', cost: 0, rarity: 'curse',
  text: '不可打出；在手牌时你的攻击牌 −2 伤', upText: '',
  base: {}, up: {},
});

// ---------- 工具 ----------

/** 起始卡组（剑修，§5.2）：御剑术 ×5、铁布衫 ×4、引灵诀 ×1 */
export const STARTER_DECK: string[] = [
  'yujianshu', 'yujianshu', 'yujianshu', 'yujianshu', 'yujianshu',
  'tiebushan', 'tiebushan', 'tiebushan', 'tiebushan',
  'yinlingjue',
];

export function cardsByRarity(rarity: string): CardDef[] {
  return Object.values(CARDS).filter((c) => c.rarity === rarity);
}

export function getCard(id: string): CardDef {
  const c = CARDS[id];
  if (!c) throw new Error(`未知卡牌: ${id}`);
  return c;
}

export const CURSE_IDS = ['chenyuan', 'xinmo_curse', 'yezhang', 'yinguozhai', 'tanchen'];
