/**
 * 核心类型定义（策划案 v3.0 §16.3）
 * ⚠️ v3 并行开发契约文件：本文件与 wuxing.ts 为最终契约，各模块代理不得修改；
 *    发现契约缺口请在完成汇报中提出，由集成负责人统一变更。
 * 引擎唯一入口：next = reduce(state, action)，全程不可变数据。
 *
 * ── 模块归属（并行开发文件所有权）──
 *   src/data/cards.ts        全卡表（75+5，两段式）
 *   src/data/enemies.ts      敌人表（含九重天劫波次）
 *   src/data/relics.ts       法宝 25（保留 v2 的 id 命名）
 *   src/data/alchemy.ts      丹方/灵材（替代已删除的 potions.ts）+ src/data/daoguo.ts 道果（替代 breakthroughs.ts）
 *   src/data/milestones.ts   里程碑与角色（替代 unlocks.ts）
 *   src/data/events.ts       奇遇 30 + 内置事件（jieyun 劫云压顶等）
 *   src/data/places.ts       地图地名池（舆图化）
 *   src/core/combat.ts       战斗引擎   src/core/run.ts + map.ts 冒险层
 */
import type { CardElement, Element } from './wuxing';
import type { RngState } from './rng';

// ---------- 基础 ----------

export type CardType = 'attack' | 'defense' | 'skill' | 'power' | 'curse';
export type Rarity = 'starter' | 'common' | 'rare' | 'epic' | 'legendary' | 'curse';
export type Realm = 'lianqi' | 'zhuji' | 'jindan'; // 境界：炼气 / 筑基 / 金丹（§3.2 规则解锁）

/** 灵材（§7.2）：灵草（木/水敌）、玉髓（金/土敌）、妖丹（火及兽形敌）、雷砂（精英/Boss） */
export type MaterialId = 'lingcao' | 'yusui' | 'yaodan' | 'leisha';

/**
 * 状态效果（§4.5）。结算规则：
 * - gangqi 罡气：每层攻击 +1；不衰减（双方）
 * - guben 固本：每层回合开始 +2 护体；玩家产生土属性护体，敌人产生其自身属性护体；不衰减
 * - huichun 回春：每层回合结束回 1 血；每回合 −1（玩家）
 * - zhuoshao 灼烧（双方）：己方回合结束受层数真实伤害（无视护体），随后层数减半（向下取整）
 * - zhangdu 瘴毒（敌）：其每次行动结算后受层数伤害；其回合结束层数 −1
 * - qizhi 气滞（双方）：出伤 ×0.7（向下取整）；每回合 −1
 * - pozhan 破绽（双方）：受攻击 ×1.4（向下取整）；每回合 −1
 * - ruanhua 软化（敌）：护体获取减半；持续 1 回合，不叠加可刷新（熔锻附带）
 * - sleeveBan 封袖藏（玩家）：无法袖藏；按回合 −1（蜘蛛精织网 1 / 忘川渡鬼摆渡 2）
 * - tunaDown 下回合吐纳 −X（水猴子偷灵 / 山神下签）
 * - retainBlock 本回合结束护体不衰减一次（玄武镇海/镇岳玺得气段、龟息丹）
 */
export type StatusId =
  | 'gangqi' | 'guben' | 'huichun' | 'zhuoshao' | 'zhangdu'
  | 'qizhi' | 'pozhan' | 'ruanhua'
  | 'fanci'         // 反刺：本回合被攻击时反弹 X 伤
  | 'fanshao'       // 反烧：本回合攻击你的敌人 +X 灼烧
  | 'tengou'        // 青藤傀儡剩余回合（吸收上限存 _tengouCap；参悟带刺存 _tengouThorn）
  | 'niepan'        // 浴火涅槃：死亡时以 X% 上限复活
  | 'yinguo'        // 因果轮回：下次受到的攻击伤害 X% 反弹
  | 'nextTurnDraw' | 'nextTurnBlock'
  | 'retainBlock' | 'drawDown' | 'tunaDown' | 'sleeveBan'
  | 'blockHalf'     // 护体获取 −50%（剑冢之主剑域），按回合衰减
  | 'guixiDan'      // 龟息丹：本回合受伤减半
  | '_baguaUsed' | '_tengouCap' | '_tengouThorn';

/** 特殊脚本卡 id（DSL 覆盖不了的卡；语义详见 §5.4 对应行） */
export type SpecialId =
  | 'cuifeng'         // 淬锋：本回合接下来 n2 张攻击牌 +n 伤
  | 'jianqizongheng'  // 剑气纵横：damage 基础；得气段=本回合每次得气（含本次）额外 +n 伤
  | 'baihong'         // 白虹贯日：damage；目标无护体时 +n；得气段另有 ruanhua
  | 'huichunshu'      // 回春术：每场限 2 次（heal 走 special 结算）
  | 'chunhui'         // 春回大地：移除自身全部负面，每个抽 1；n>0 时每个回 n 血
  | 'kurong'          // 枯荣轮转：燃寿 1 年（得气时免燃寿），energy/draw 生效
  | 'hanlu'           // 寒露：击杀时回 4 血并吐纳 +1
  | 'jiling'          // 汲灵术：+energy，行位变水
  | 'guanlan'         // 观澜：预视牌库顶 n 张可弃任意 → pendingChoice 'scry'
  | 'jinghua'         // 镜花水月：复制你本场上一张打出的牌入手（0 费，回合末消散；得气段可袖藏；upgraded 复制参悟态）
  | 'canghai'         // 沧海纳川：选择弃任意张手牌 → pendingChoice 'discardHand'，每张 +n 护体（水）；得气段每张回 2 血
  | 'yinhuo'          // 引火符【引爆】：目标立即受其灼烧层数伤害（层数保留）；得气段引爆 2 次
  | 'sanmei'          // 三昧真火：燃尽剩余全部灵气（先扣本牌费用），每点 n 伤
  | 'yinghuo'         // 荧惑守心：X 费，X×n 伤 + X 灼烧；得气段每点 +2 伤
  | 'dadimaidong'     // 大地脉动：block + 每层固本额外 +n 护体
  | 'chengshan'       // 承山印【掷山】：失去你至多 n 点护体，造成失去量 ×n2% 伤害
  | 'guanxiang'       // 观想五行：检视牌库顶 5 张，选 n 张入手 → pendingChoice 'pickTop'
  | 'canjuan'         // 问长生·残卷：检视牌库顶 n 张选 1 入手 → pendingChoice 'pickTop'
  | 'wuxinglunzhuan'  // 五行轮转：选任意张手牌洗回牌库 → pendingChoice 'returnHand'，每张吐纳 +1
  | 'zuowang'         // 坐忘：放逐任意张手牌 → pendingChoice 'exhaustHand'，每张吐纳 +1 并抽 1；参悟每张再回 2 血
  | 'zhoutianX'       // 周天大衍诀：亮出牌库顶 X 张，沿当前行位可顺生衔接者依次免费打出（随机目标），其余弃去；参悟：其余入手
  | 'yezhang';        // 业障：可花 2 灵气打出以放逐

export interface CardEffects {
  damage?: number;
  times?: number;
  aoe?: boolean;
  ignoreBlock?: boolean;
  bonusDamage?: number;   // 得气段：并入本牌每一段伤害
  extraHit?: boolean;     // 得气段：攻击追加一段
  makeAoe?: boolean;      // 得气段：本牌改为对全体（金雷符）
  block?: number;         // 护体（属性 = 本牌五行；无属性牌产生无属性护体）
  draw?: number;
  energy?: number;        // 吐纳 +X
  heal?: number;
  maxHp?: number;
  selfDamage?: number;    // 自身受伤（走护体）
  loseHp?: number;        // 直接失血（无视护体）
  burnLife?: number;      // 燃寿 X 年（枯荣轮转等）
  selfBurn?: number;      // 自身 +X 灼烧（炎爆）
  applyEnemy?: Partial<Record<StatusId, number>>;
  applyEnemyAll?: Partial<Record<StatusId, number>>;
  applySelf?: Partial<Record<StatusId, number>>;
  zhise?: boolean;        // 直接滞涩目标（撼地/山崩，无需克向）
  exhaust?: boolean;      // 放逐
  special?: SpecialId;
  n?: number;
  n2?: number;
}

export interface CardDef {
  id: string;
  name: string;
  element: CardElement;
  /**
   * 双行牌（润锋）：打出时选 a/b 定其行（PLAY_CARD.dualPick，缺省 'a'）。
   * 得气时 a、b 两组效果皆得。elements[0] 对应 a，elements[1] 对应 b。
   */
  dual?: {
    elements: [Element, Element];
    a: CardEffects; b: CardEffects;
    aUp: CardEffects; bUp: CardEffects;
    textA: string; textB: string;
  };
  type: CardType;
  cost: number | 'X';
  rarity: Rarity;
  text: string;            // 基础段文本
  shengText?: string;      // 得气段文本（卡面第二行）
  upText: string;
  upShengText?: string;
  base: CardEffects;       // 基础段
  sheng?: CardEffects;     // 得气段（得气时在基础段之外追加；bonusDamage/extraHit/makeAoe 并入攻击结算）
  upBase: CardEffects;     // 参悟后基础段
  upSheng?: CardEffects;   // 参悟后得气段
  targetEnemy?: boolean;   // 技能牌需要选敌方目标（引火符等）
  playableCurse?: boolean;
  bonded?: boolean;        // 本命牌：不可斩去、不可复制（问长生·残卷）
}

export interface CardInstance {
  uid: number;
  cardId: string;
  upgraded: boolean;
  tempCost?: number;       // 本回合临时费用（复制品 0 费等）
  vanish?: boolean;        // 回合结束放逐（镜花水月未参悟复制品）
}

// ---------- 敌人 ----------

export type EnemyTier = 'normal' | 'elite' | 'boss';

/**
 * 敌方行为 special 约定（data/enemies.ts 与 core/combat.ts 共同遵守）：
 * 沿用 v2：zhaohun 招魂幡 / huanmian 换面 / beiqi 悲泣 / diyu 心魔低语 / kaowen 道心拷问
 *          tunshi 吞噬 / xinmojielei 心魔劫雷 / xisui 吸髓 / jingji 荆棘姿态 / suijia 横扫击碎护体
 *          jielei 筑基劫雷 / tianfa 灭雷天罚 / wendao 道雷问道
 * v3 新增：zhihun 勾魂（黑无常：你心魔 +1）
 *          shidu 尸毒（铜甲尸：你丹毒 +1）
 *          zhiwang 织网（蜘蛛精：sleeveBan 1）
 *          baidu 摆渡（忘川渡鬼：sleeveBan 2）
 *          touling 偷灵（水猴子：tunaDown 1）
 *          tanying 贪影（心魔 ≥7 行为：洗 1 张【贪嗔】入你抽牌堆）
 *          zhuxin 诛心（道雷开场：你手牌中费用最高的牌本场 +1 费）
 * AI 性情脚本（EnemyDef.ai）：shanxiao（山魈读行位）/ yehu（野狐读手牌数）/ zheng（狰欺火护体）等，combat.ts 实现。
 */
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
  special?: string;
  n?: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  element: CardElement;   // 敌人攻击带此属性（与玩家护体属性做生克，§4.4 ⑤）
  hp: number;
  count?: number;
  act: 1 | 2 | 3;
  tier: EnemyTier;
  moves: EnemyMove[];
  ai?: string;
  note?: string;          // 教学点 / 性情说明（图鉴与设计用）
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
  zhiseCd: number;
  flags: Record<string, number>;
}

// ---------- 战斗 ----------

export interface PendingChoice {
  kind:
    | 'scry'          // 观澜：可弃任意
    | 'pickTop'       // 观想五行/残卷：顶 N 选 M 入手
    | 'exhaustHand'   // 坐忘：放逐任意张
    | 'discardHand'   // 沧海纳川：弃任意张（每张 +护体/回血）
    | 'returnHand'    // 五行轮转：洗回任意张（每张吐纳 +1）
    | 'dilemma';      // 二选一/多选一（道心拷问、问道、河图选行位、劫云压顶等）
  cards?: CardInstance[];
  maxPick?: number;
  data?: Record<string, number>;
  prompt: string;
  options?: string[];
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
  blockElement: CardElement; // 护体属性 = 最后一次获得护体的来源（固本为土；'none' 为无属性护体）
  energy: number;            // 灵气；筑基后为气海存灵（跨回合保留，上限 run.poolCap）
  statuses: Partial<Record<StatusId, number>>;
  attackBuffs: { bonus: number; left: number }[]; // 淬锋类
}

/**
 * 行位/得气核心判定（combat.ts 实现，此处为契约）：
 *   elem = dual ? 所选行 : def.element
 *   hasSheng = !!def.sheng || !!def.dual
 *   得气 deqi = elem!=='none' && hasSheng && !shengBlocked
 *               && ( tianren || (stance && generates(stance, elem)) )
 *   顺生链 chain：elem!=='none' 时，若 stance && generates(stance,elem) → chain.push(elem)，否则 chain=[elem]
 *   五行周天：chain 覆盖 5 行（道果"一气化三清"为 4 行）→ 天人合一：吐纳 +3，tianren=true；每回合限 1 次
 *   tianren：下一张有得气段的牌双段齐发（无视行位），消耗后清除
 *   滞气：打出克制当前行位之行的牌（overcomes(elem, stance)）→ 结算完本牌后 shengBlocked=true；
 *         下一张有属性牌无论是否顺生均不得气，并消耗 shengBlocked
 *   行位更新：elem!=='none' → stance=elem；回合开始清空（金丹"周天自运"后跨回合保留）
 *   无属性牌：不改行位、不断链、无得气段
 */
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
  stance: Element | null;      // 行位
  shengBlocked: boolean;       // 滞气
  chain: Element[];            // 当前顺生链
  tianren: boolean;            // 天人合一待发
  zhoutianTriggered: boolean;  // 本回合已触发周天
  zhoutianTotal: number;
  sleeved: CardInstance[];     // 袖藏区（回合结束选择，下回合开始先入手）
  sleeveCapBonus: number;      // 本回合袖藏上限加成（冥想）；基础上限 1，洛书 +1，北冥吞天无上限
  lastPlayed: string | null;   // 本场上一张打出的牌 id（镜花水月）
  deqiCountTurn: number;       // 本回合得气次数
  cardsPlayed: number;
  attacksPlayed: number;
  playedByElement: Record<string, number>; // 各行打出计数 + 通用计数器（'_attacked'、'_kefaFirst' 等）
  powers: PowerState[];
  huichunshuUses: number;
  pendingChoice: PendingChoice | null;
  wuxingDanNext: boolean;      // 五行丹：下一张牌视为任意行（必得气）
  longhuBonus: number;         // 龙虎丹：本场攻击 +4
  tianjiActive: boolean;       // 天机丹
  waveIndex: number;           // 九重天劫当前道数（0 基；非劫战 -1）
  turnsTotal: number;
  log: string[];
}

// ---------- 地图（v3：边带寿元年数 + 地名 + 灵田） ----------

export type NodeType = 'battle' | 'elite' | 'event' | 'shop' | 'cave' | 'field' | 'boss' | 'unknown';

export interface MapEdge {
  to: string;
  years: number; // 走此边消耗寿元 1–3 年；远边通向高价值节点
}

export interface MapNode {
  id: string;
  layer: number;
  x: number;
  type: NodeType;
  revealedType?: NodeType; // 罗盘揭示秘境真型
  placeName: string;       // 舆图地名（data/places.ts 地名池，按幕不重复）
  edges: MapEdge[];        // 指向上一层节点
}

export interface ActMap {
  act: 1 | 2 | 3;
  layers: MapNode[][];
}

// ---------- 冒险层界面 ----------

export interface RewardScreen {
  kind: 'reward';
  gold: number;
  cards: { cardId: string; upgraded: boolean }[] | null;
  relic: string | null;
  materials: Partial<Record<MaterialId, number>> | null; // 灵材战利品
  goldTaken: boolean;
}

export interface ShopItem {
  kind: 'card' | 'relic' | 'recipe' | 'materials';
  id: string;              // materials 时为 MaterialId
  upgraded?: boolean;
  count?: number;          // materials 包数量（默认 3）
  price: number;
  sold: boolean;
}

export interface ShopScreen {
  kind: 'shop';
  items: ShopItem[];
  removePrice: number;     // 斩尘缘 88，每座坊市限 1 次（不涨价）
  removeUsed: boolean;
  xinzhaiPrice: number;    // 心斋 66：心魔 −1，每座坊市限 1 次
  xinzhaiUsed: boolean;
  discount: number;        // 1 原价；0.8 蜃楼
}

export interface EventScreen {
  kind: 'event';
  eventId: string;
  stage: number;
  resultText: string | null;
  disabled: number[];
}

/** 洞府（§9.4）：每座至多执行 2 项不同行动，各自耗寿元（闭关 3 年回 36 / 参悟 2 年 / 炼丹 2 年 / 辟谷 2 年清 4 丹毒；蒲团 −1 年下限 1） */
export interface CaveScreen {
  kind: 'cave';
  free: boolean;           // 空置洞府：免费执行 1 项（不耗寿元）
  remaining: number;       // 剩余可执行项数（常规 2 / free 1）
  used: string[];          // 已执行的行动 kind
}

export interface DaoguoScreen {
  kind: 'daoguo';
  options: string[];       // 道果 id 三选一（七重天二选一）
}

export interface EndScreen {
  kind: 'end';
  victory: boolean;
  cause: string;
  score: number;
  daowei: number;
  daohao: string | null;
  // 宿慧三选一在 UI 层完成（EndView 读取 run.deck / run.relics，经 profileLogic.pickLegacy 写入 profile）
}

export interface CardPickScreen {
  kind: 'cardPick';
  mode: 'remove' | 'upgrade' | 'transform';
  count: number;
  reason: string;
  next: string | null;
}

export type Screen =
  | { kind: 'map' }
  | RewardScreen
  | ShopScreen
  | EventScreen
  | CaveScreen
  | DaoguoScreen
  | EndScreen
  | CardPickScreen;

// ---------- 炼丹（§7） ----------

export interface RecipeDef {
  id: string;
  name: string;
  text: string;
  toxin: number;                              // 服用后累积丹毒（清心丹为 -2 净清）
  cost: Partial<Record<MaterialId, number>>;  // 灵材配方
  rare?: boolean;
  mapUsable?: boolean;                        // ⊙ 地图可服
}

// ---------- 事件（§10；data/events.ts 与 core/run.ts 共同遵守） ----------

export interface EventOutcome {
  text: string;
  weight?: number;
  gold?: number;
  hp?: number;                       // 正回负失（失血保底 1）
  maxHp?: number;
  heal?: number | 'full' | 'half';
  lifespan?: number;                 // ± 寿元年（负 = 耗寿）
  demon?: number;                    // ± 心魔（0–9 夹取）
  toxin?: number;                    // ± 丹毒（0–12 夹取）
  materials?: Partial<Record<MaterialId, number>>;
  gainRecipe?: string;               // 丹方 id 或 'random'
  gainCardRarity?: Rarity;
  gainCardId?: string;
  gainCardUpgraded?: boolean;
  gainRelicGrade?: 'fan' | 'ling' | 'xian' | 'jie';
  gainRelicId?: string;
  upgradeRandom?: number;
  removeCards?: number;
  upgradeCards?: number;
  battle?: string;                   // 事件战敌人 id（'tiaoshi_x2'/'shiqun' 等约定串由 run.ts 解释）
  battleElite?: boolean;
  special?: string;                  // 事件脚本 id（run.ts 实现）
  flag?: string;
  flagValue?: number;
}

/**
 * 因果链 flag 约定（事件设置 → run.ts 触发下集）：
 *   chain_linghu（灵狐报恩→两幕后狐妖再会赠灵品）/ chain_jingdi（井底童子→幕三重逢赠稀方）
 *   chain_zuidao（醉道人→幕三再遇赠大还丹方）/ chain_xianghuo（香火→本幕 Boss 开局 +12 土护体）
 *   chain_fangsheng（放生→2 层后鲤跃）/ daolei_minus30（拒绝心魔来访→道雷 −30 血）
 * 内置事件：'jieyun'（劫云压顶：进入 Boss 节点前一次性弹出，noPool）
 */
export interface EventDef {
  id: string;
  name: string;
  scene: string;
  minAct?: 1 | 2 | 3;
  noPool?: boolean;                  // 不进随机池（jieyun / 因果链下集）
  options: {
    label: string;
    requireGold?: number;
    requireLifespan?: number;
    requireRelic?: boolean;
    outcomes: EventOutcome[];
  }[];
}

// ---------- 局（Run） ----------

export interface RunStats {
  elitesKilled: number;
  bossesKilled: number;
  elixirsUsed: number;
  cardsUpgraded: number;
  damageTaken: number;
  battles: number;
  lifespanBurned: number;  // 累计燃寿（成就"燃灯者"）
  brews: number;           // 炼丹次数
}

export interface RunState {
  seed: string;
  ascension: number;          // 0 + 一重天~九重天
  act: 1 | 2 | 3;
  floor: number;
  nodeId: string | null;
  realm: Realm;               // 炼气→筑基（幕一 Boss 后）→金丹（幕二 Boss 后）
  hp: number;
  maxHp: number;
  gold: number;
  lifespan: number;           // 寿元（年）：开局 60；移动/洞府/御空/事件消耗；突破 +60/+120；归零坐化
  demon: number;              // 心魔 0–9：战斗投影阈值 3尘缘/5业障/7贪嗔/9心魔
  toxin: number;              // 丹毒 0–12：≥4 战斗开局受 2 真伤；≥8 上限 −10；=12 每入节点 −3 血
  toxinMaxHpApplied: boolean; // ≥8 的上限 −10 是否已生效（跌破 8 时恢复）
  karma: number;              // 本世业力（宿慧带入；≥4 道雷强化）
  materials: Record<MaterialId, number>;
  recipes: string[];          // 已持有丹方（初始：huiyuandan/julingdan/xuanwudan）
  elixirs: string[];          // 丹盒（已炼成的丹）
  elixirCap: number;          // 4（玉葫芦 +1）
  deck: CardInstance[];
  relics: string[];
  fruits: string[];           // 道果
  poolCap: number;            // 气海上限（筑基 6；道果金丹凝五色 +2；炼气期无气海，每回合灵气=4 不储存）
  drawPerTurn: number;        // 4
  battleStartBlock: number;   // 道果"铁骨"等（土属性护体）
  flyUsed: number;            // 本幕御空/缩地已用次数（筑基 2 次 3 年/次；金丹 3 次 2 年/次）
  map: ActMap;
  battle: BattleState | null;
  screen: Screen;
  rng: RngState;
  stats: RunStats;
  usedEvents: string[];
  uidCounter: number;
  flags: Record<string, number>;
  gongdeBattles: number;
  over: boolean;
}

// ---------- 局外（Profile） ----------

/** 宿慧（§11.1）：结算三选一带走。业力 = 卡（普0稀1史2传3）/ 法宝（凡1灵2仙3劫4）；通关 −1 */
export interface LegacyState {
  kind: 'card' | 'relic' | 'daoxing' | null;
  cardId?: string;
  upgraded?: boolean;
  relicId?: string;
  karma: number;
}

export interface Profile {
  schemaVersion: number;
  daowei: number;             // 道行：只增不减的修为总量；里程碑按阈值自动解锁（milestones.ts）
  achievements: string[];
  runsTotal: number;          // 亦驱动卡池渐进：第 1 局普通、第 2 局+稀有、第 3 局+史诗、第 4 局起全池
  wins: number;
  maxAscensionCleared: number;
  seenCards: string[];
  seenRelics: string[];
  seenEnemies: string[];
  daohaoList: string[];
  totalDaoweiEarned: number;
  winsByChar: Record<string, number>;
  legacy: LegacyState;        // 下一世宿慧（newRun 读取，App 开局后调 consumeLegacy 清空）
  settings: { music: number; sfx: number };
}

// ---------- Action ----------

export type Action =
  | { t: 'PLAY_CARD'; uid: number; target?: number; dualPick?: 'a' | 'b' }
  | { t: 'END_TURN'; sleeveUids?: number[] }   // 袖藏选择（张数 ≤ 袖藏上限；sleeveBan 时无效）
  | { t: 'USE_ELIXIR'; elixir: string; target?: number }
  | { t: 'DISCARD_ELIXIR'; elixir: string }
  | { t: 'RESOLVE_CHOICE'; picks: number[] }
  | { t: 'CHOOSE_NODE'; node: string }
  | { t: 'FLY_NODE'; node: string }            // 御空：跳过下一层直达隔层可见节点
  | { t: 'PICK_REWARD_CARD'; index: number }   // -1 = 跳过（竹简：转录拓片得灵材×2）
  | { t: 'TAKE_REWARD_GOLD' }
  | { t: 'TAKE_REWARD_RELIC' }
  | { t: 'TAKE_REWARD_MATERIALS' }
  | { t: 'LEAVE_REWARD' }
  | { t: 'BUY_ITEM'; index: number }
  | { t: 'SHOP_REMOVE_CARD'; uid: number }     // 斩尘缘（bonded 本命牌不可斩）
  | { t: 'SHOP_XINZHAI' }                      // 心斋：66 灵石心魔 −1
  | { t: 'LEAVE_SHOP' }
  | { t: 'EVENT_OPTION'; option: number }
  | { t: 'LEAVE_EVENT' }
  | { t: 'CAVE_ACTION'; kind: 'rest' | 'smith' | 'brew' | 'fast'; recipeId?: string }
  | { t: 'CAVE_LEAVE' }
  | { t: 'CAVE_PICK_CARD'; uid: number }
  | { t: 'PICK_CARD_SCREEN'; uid: number }
  | { t: 'PICK_DAOGUO'; id: string };
