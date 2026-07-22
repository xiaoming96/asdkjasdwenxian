/**
 * 核心类型定义（策划案 §16.3）
 * 引擎唯一入口：next = reduce(state, action)，全程不可变数据。
 */
import type { CardElement, Element } from './wuxing';
import type { RngState } from './rng';

// ---------- 卡牌 ----------

export type CardType = 'attack' | 'defense' | 'skill' | 'power' | 'curse';
export type Rarity = 'starter' | 'common' | 'rare' | 'epic' | 'legendary' | 'curse';

/** 状态效果关键词（策划案 §4.5 + 实现所需内部状态） */
export type StatusId =
  | 'gangqi' // 罡气：每层攻击伤害 +1
  | 'guben' // 固本：每层回合开始 +2 护体
  | 'huichun' // 回春：每层回合结束回 1 血，每回合 −1
  | 'zhuoshao' // 灼烧：每层回合结束受 1 真实伤害，每回合 −1
  | 'zhangdu' // 瘴毒：每层回合结束受 1 伤随后 −1
  | 'chanfu' // 缠缚：下次攻击 −40%/层，最多 3 层
  | 'pojia' // 破甲：护体获取无效，持续 1 回合
  | 'xuruo' // 虚弱：攻击 −25%，按回合衰减
  | 'yishang' // 易伤：受攻击 +50%，按回合衰减
  | 'fanci' // 反刺：本回合被攻击时反弹 X 伤（飞剑还击/荆棘藤甲）
  | 'fanshao' // 反烧：本回合攻击你的敌人 +X 灼烧（火浣纱）
  | 'tengou' // 青藤傀儡：每回合吸收至多 X 伤（层数=剩余回合，flags 存上限）
  | 'niepan' // 浴火涅槃：死亡时以 X% 气血复活
  | 'yinguo' // 因果轮回：下次受到的攻击伤害 X% 反弹
  | 'nextTurnDraw' // 下回合抽 X
  | 'nextTurnEnergy' // 下回合 +X 灵气
  | 'nextTurnBlock' // 下回合 +X 护体
  | 'retainBlock' // 回合结束保留全部护体一次（玄武镇海）
  | 'drawDown' // 下回合抽牌 −X（魅惑/咆哮）
  | 'energyDown' // 下回合灵气 −X（偷灵）
  | 'handCapDown' // 手牌上限 −X（忘川渡鬼）
  | 'blockHalf' // 护体获取 −50%（剑域），按回合衰减
  | 'guishaDan' // 龟息丹：本回合受伤减半
  | '_baguaUsed' // 内部：八卦镜本场已触发
  | '_tengouCap'; // 内部：藤偶每回合吸收上限

/** 特殊脚本效果 id（数据驱动 DSL 覆盖不了的 <20 张卡） */
export type SpecialId =
  | 'cuifeng' // 淬锋：本回合接下来 N 张攻击牌 +X 伤
  | 'jinleifu' // 金雷符：若触发行云流水改为对全体
  | 'jianqizongheng' // 剑气纵横：伤害 = 本回合已打出牌数 ×N
  | 'baihong' // 白虹贯日：目标有破甲则翻倍
  | 'huichunshu' // 回春术：每场限 2 次
  | 'mudun' // 木遁：若触发行云流水抽 1
  | 'chunhui' // 春回大地：移除全部负面，每个抽 1（升级：并回 2 血）
  | 'kurong' // 枯荣轮转：失去 X 血获得 3 灵气抽 3
  | 'hanlu' // 寒露：击杀回 4 血 +1 灵气
  | 'jiling' // 汲灵术：行位变水
  | 'guanlan' // 观澜：预视牌库顶 N 张可弃，然后抽 1
  | 'jinghua' // 镜花水月：复制手牌
  | 'canghai' // 沧海纳川：弃全部手牌每张 +N 护体回 1 血
  | 'dayan' // 大衍回澜：弃牌堆选 1 置顶
  | 'yinhuo' // 引火符：灼烧翻倍（升级 +2）
  | 'zhulong' // 烛龙之目：若行位为木 +1 灵气
  | 'sanmei' // 三昧真火：消耗其余全部灵气每点 N 伤
  | 'yinghuo' // 荧惑守心：X 费 X×N 伤 +X 灼烧
  | 'dadimaidong' // 大地脉动：每层固本额外 +3
  | 'chengshan' // 承山印：伤害 = 当前护体 ×N%
  | 'guanxiang' // 观想五行：检视顶 5 选 N 入手
  | 'wuxinglunzhuan' // 五行轮转：弃手重抽，五行互异则减费
  | 'zuowang' // 坐忘：放逐任意手牌每张 +1 灵气（升级：并抽 1）
  | 'zhoutianX' // 周天大衍诀：免费打出牌库顶 X 张
  | 'yezhang'; // 业障：花 2 灵气打出以放逐

export interface CardEffects {
  damage?: number;
  times?: number;
  aoe?: boolean;
  ignoreBlock?: boolean;
  block?: number;
  draw?: number;
  energy?: number;
  heal?: number;
  maxHp?: number;
  selfDamage?: number; // 自身受伤（走护体）
  loseHp?: number; // 直接失血（无视护体）
  applyEnemy?: Partial<Record<StatusId, number>>;
  applyEnemyAll?: Partial<Record<StatusId, number>>;
  applySelf?: Partial<Record<StatusId, number>>;
  zhise?: boolean; // 滞涩：目标意图延迟 1 回合（撼地/山崩）
  exhaust?: boolean; // 放逐
  special?: SpecialId;
  n?: number; // 特殊效果/心法参数
  n2?: number; // 次要参数
}

export interface CardDef {
  id: string;
  name: string;
  element: CardElement;
  type: CardType;
  cost: number | 'X';
  rarity: Rarity;
  text: string;
  upText: string;
  base: CardEffects;
  up: CardEffects;
  /** 技能牌需要选择敌方目标（如引火符） */
  targetEnemy?: boolean;
  /** 诅咒可打出（业障） */
  playableCurse?: boolean;
}

export interface CardInstance {
  uid: number;
  cardId: string;
  upgraded: boolean;
  /** 本回合临时费用（复制品 0 费等），回合结束清除 */
  tempCost?: number;
  /** 回合结束放逐（镜花水月复制品） */
  vanish?: boolean;
}

// ---------- 敌人 ----------

export type EnemyTier = 'normal' | 'elite' | 'boss';

export interface EnemyMove {
  id: string;
  name: string;
  kind: 'attack' | 'defend' | 'buff' | 'debuff' | 'charge' | 'unknown';
  damage?: number;
  times?: number;
  block?: number;
  gainSelf?: Partial<Record<StatusId, number>>;
  applyPlayer?: Partial<Record<StatusId, number>>;
  healSelf?: number;
  loseSelfHp?: number;
  addCurse?: string; // 向玩家弃牌堆塞诅咒
  special?: string; // 脚本行为 id
  n?: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  element: CardElement;
  hp: number;
  count?: number; // 群体（纸人 ×3）
  act: 1 | 2 | 3;
  tier: EnemyTier;
  moves: EnemyMove[];
  ai?: string; // 特殊 AI 脚本 id（Boss/精英）
  note?: string; // 教学点
}

export interface EnemyState {
  uid: number;
  enemyId: string;
  name: string;
  element: CardElement;
  hp: number;
  maxHp: number;
  block: number;
  statuses: Partial<Record<StatusId, number>>;
  moveIndex: number;
  intent: EnemyMove | null;
  zhiseCd: number; // 滞涩内置 CD（2 回合 1 次）
  flags: Record<string, number>; // 脚本状态
}

// ---------- 战斗 ----------

export interface PendingChoice {
  kind:
    | 'scry' // 观澜：可弃任意
    | 'pickHand' // 镜花水月：选手牌复制
    | 'pickDiscard' // 大衍回澜：弃牌堆选 1 置顶
    | 'pickTop' // 观想五行：顶 5 选 N
    | 'exhaustHand' // 坐忘：放逐任意张
    | 'dilemma'; // 道心拷问/问道：二选一
  cards?: CardInstance[];
  maxPick?: number;
  data?: Record<string, number>;
  prompt: string;
  options?: string[]; // dilemma 选项文本
  sourceCard?: string;
  upgraded?: boolean;
}

export interface PowerState {
  cardId: string;
  upgraded: boolean;
  counter: number;
}

export interface PlayerBattleState {
  block: number;
  energy: number;
  statuses: Partial<Record<StatusId, number>>;
  /** 淬锋类：接下来 left 张攻击牌 +bonus 伤 */
  attackBuffs: { bonus: number; left: number }[];
}

export interface BattleState {
  battleType: EnemyTier;
  outcome: 'ongoing' | 'victory' | 'defeat';
  enemies: EnemyState[];
  hand: CardInstance[];
  drawPile: CardInstance[];
  discardPile: CardInstance[];
  exhaustPile: CardInstance[];
  player: PlayerBattleState;
  turn: number;
  xingwei: Element | null; // 行位
  liushuiRefunded: number; // 本回合已返还灵气数
  liushuiCount: number; // 本回合触发行云流水次数
  chainLinks: number; // 本回合顺环连续触发计数（周天用）
  zhoutianTriggered: boolean; // 本回合已触发周天
  zhoutianTotal: number; // 本局周天次数（分数/成就）
  cardsPlayed: number; // 本回合打出牌数
  attacksPlayed: number; // 本回合打出攻击牌数
  playedByElement: Record<string, number>; // 本场各行打出计数（剑心通明等）
  powers: PowerState[];
  huichunshuUses: number;
  freeNextCard: boolean; // 周天奖励：下一张牌 0 费
  pendingChoice: PendingChoice | null;
  wuxingDanNext: boolean; // 五行丹：下一张牌视为任意五行
  longhuBonus: number; // 龙虎丹：本场攻击 +3
  tianjiActive: boolean; // 天机丸
  waveIndex: number; // 九重天劫当前道数（0 基）
  turnsTotal: number; // 本局累计回合（分数）
  log: string[]; // 战斗日志（UI/调试）
}

// ---------- 地图 ----------

export type NodeType = 'battle' | 'elite' | 'event' | 'shop' | 'cave' | 'boss' | 'unknown';

export interface MapNode {
  id: string;
  layer: number;
  x: number; // 0-3 横向位置
  type: NodeType;
  revealedType?: NodeType; // 罗盘揭示未知节点
  edges: string[]; // 指向上一层节点 id
}

export interface ActMap {
  act: 1 | 2 | 3;
  layers: MapNode[][];
}

// ---------- 冒险层界面 ----------

export interface RewardScreen {
  kind: 'reward';
  gold: number;
  cards: { cardId: string; upgraded: boolean }[] | null; // null=已选/跳过
  relic: string | null;
  potion: string | null;
  goldTaken: boolean;
}

export interface ShopItem {
  kind: 'card' | 'relic' | 'potion';
  id: string;
  upgraded?: boolean;
  price: number;
  sold: boolean;
}

export interface ShopScreen {
  kind: 'shop';
  items: ShopItem[];
  removePrice: number;
  removeUsed: boolean;
  discount: number; // 1 = 原价，0.9 铜钱剑，0.8 蜃楼
}

export interface EventScreen {
  kind: 'event';
  eventId: string;
  stage: number; // 多阶段事件
  resultText: string | null; // 已选后果文本
  disabled: number[]; // 不可选选项
}

export interface CaveScreen {
  kind: 'cave';
  free: boolean; // 空置洞府事件
}

export interface BreakthroughScreen {
  kind: 'breakthrough';
  options: string[]; // 突破 id 三选一
}

export interface EndScreen {
  kind: 'end';
  victory: boolean;
  cause: string;
  score: number;
  daowei: number; // 本局所得道行
  daohao: string | null; // 通关道号
}

export interface CardPickScreen {
  kind: 'cardPick'; // 事件中获得/升级/删除牌的选择界面
  mode: 'remove' | 'upgrade' | 'transform';
  count: number;
  reason: string;
  next: string | null; // 完成后回到的事件阶段
}

export type Screen =
  | { kind: 'map' }
  | RewardScreen
  | ShopScreen
  | EventScreen
  | CaveScreen
  | BreakthroughScreen
  | EndScreen
  | CardPickScreen;

// ---------- 局（Run） ----------

export interface RunStats {
  elitesKilled: number;
  bossesKilled: number;
  potionsUsed: number;
  cardsUpgraded: number;
  damageTaken: number;
  battles: number;
}

export interface RunState {
  seed: string;
  ascension: number; // 0 + 一重天~九重天 1-9
  act: 1 | 2 | 3;
  floor: number; // 当前所在层（-1 = 未出发）
  nodeId: string | null;
  hp: number;
  maxHp: number;
  gold: number;
  deck: CardInstance[];
  relics: string[];
  potions: string[];
  potionCap: number;
  breakthroughs: string[];
  liushuiBonus: number; // 行云流水加成（0.25 → 0.4 五行调和）
  liushuiRefundCap: number; // 每回合灵气返还上限（基础 2）
  drawPerTurn: number;
  energyMax: number;
  battleStartBlock: number; // 肉身成圣等
  map: ActMap;
  battle: BattleState | null;
  screen: Screen;
  rng: RngState;
  stats: RunStats;
  removeCostBase: number; // 删牌 75，每购 +25
  usedEvents: string[];
  uidCounter: number;
  flags: Record<string, number>; // 杂项（功德/香火/放生等延时效果）
  gongdeBattles: number; // 功德：下 3 场战斗开局 +1 灵气
  over: boolean;
}

// ---------- 局外（Profile） ----------

export interface Profile {
  schemaVersion: number;
  daowei: number; // 道行
  unlocked: string[]; // 解锁树节点
  achievements: string[];
  runsTotal: number;
  wins: number;
  maxAscensionCleared: number;
  seenCards: string[];
  seenRelics: string[];
  seenEnemies: string[];
  daohaoList: string[];
  totalDaoweiEarned: number;
  settings: { music: number; sfx: number };
}

// ---------- Action ----------

export type Action =
  | { t: 'PLAY_CARD'; uid: number; target?: number }
  | { t: 'END_TURN' }
  | { t: 'USE_POTION'; potion: string; target?: number }
  | { t: 'DISCARD_POTION'; potion: string }
  | { t: 'RESOLVE_CHOICE'; picks: number[] } // pendingChoice 的选择（uid 或选项序号）
  | { t: 'CHOOSE_NODE'; node: string }
  | { t: 'PICK_REWARD_CARD'; index: number } // -1 = 跳过
  | { t: 'TAKE_REWARD_GOLD' }
  | { t: 'TAKE_REWARD_RELIC' }
  | { t: 'TAKE_REWARD_POTION' }
  | { t: 'LEAVE_REWARD' }
  | { t: 'BUY_ITEM'; index: number }
  | { t: 'SHOP_REMOVE_CARD'; uid: number }
  | { t: 'LEAVE_SHOP' }
  | { t: 'EVENT_OPTION'; option: number }
  | { t: 'LEAVE_EVENT' }
  | { t: 'CAVE_OPTION'; option: 'rest' | 'upgrade' | 'alchemy' }
  | { t: 'CAVE_PICK_CARD'; uid: number }
  | { t: 'PICK_CARD_SCREEN'; uid: number } // cardPick 界面选择
  | { t: 'PICK_BREAKTHROUGH'; id: string };
