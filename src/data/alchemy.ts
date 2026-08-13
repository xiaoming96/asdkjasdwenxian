/**
 * 炼丹系统数据（策划案 §7：丹方 × 灵材 × 丹毒；替代已删除的 potions.ts）
 *
 * 效果实现挂点约定：
 * - 战斗内服丹（不耗灵气）：core/combat.ts 的 useElixirInBattle（USE_ELIXIR）
 * - 地图上服丹（仅 mapUsable ⊙ 项）：core/run.ts 处理 USE_ELIXIR（battle 为 null 时）
 * - 服用即累积 toxin 丹毒（0–12 夹取），阈值效果（≥4 开局 2 真伤 / ≥8 上限 −10 / =12 入节点 −3 血）
 *   由 run.ts 统一结算；道果"药王鼎"使各阈值 +4。
 * - 炼制：洞府 CAVE_ACTION 'brew'（run.ts）：校验丹方持有 + 灵材扣减 → 入 run.elixirs（上限 elixirCap）。
 */
import type { MaterialId, RecipeDef } from '../core/types';

/** 灵材名称（§7.2）：灵草（木/水敌）、玉髓（金/土敌）、妖丹（火及兽形敌）、雷砂（精英/Boss 限定） */
export const MATERIAL_NAME: Record<MaterialId, string> = {
  lingcao: '灵草',
  yusui: '玉髓',
  yaodan: '妖丹',
  leisha: '雷砂',
};

/** 丹方全表（§7.3，12 方）。key = id，顺序与策划案表格一致。 */
export const RECIPES: Record<string, RecipeDef> = {};
function def(r: RecipeDef) {
  RECIPES[r.id] = r;
}

// 回元丹 ⊙｜回 18 血｜毒 1｜灵草 ×2
// 挂点：combat.ts useElixirInBattle 回血；地图服用在 run.ts（同为回 18 血，不超上限）。
def({
  id: 'huiyuandan',
  name: '回元丹',
  text: '回 18 血',
  toxin: 1,
  cost: { lingcao: 2 },
  mapUsable: true,
});

// 聚灵丹｜吐纳 +3｜毒 1｜玉髓 ×1
// 挂点：combat.ts useElixirInBattle 灵气 +3（筑基后受气海上限 run.poolCap 约束）。
def({
  id: 'julingdan',
  name: '聚灵丹',
  text: '吐纳 +3',
  toxin: 1,
  cost: { yusui: 1 },
});

// 玄武丹｜获得 14 点土护体｜毒 1｜玉髓 ×1 + 妖丹 ×1
// 挂点：combat.ts useElixirInBattle 加护体，blockElement 置为 'earth'（土）。
def({
  id: 'xuanwudan',
  name: '玄武丹',
  text: '获得 14 点土护体',
  toxin: 1,
  cost: { yusui: 1, yaodan: 1 },
});

// 开窍丹｜检视牌库顶 5 张，选 2 入手｜毒 1｜灵草 ×1
// 挂点：combat.ts useElixirInBattle 生成 pendingChoice 'pickTop'（顶 5 选 2）。
def({
  id: 'kaiqiaodan',
  name: '开窍丹',
  text: '检视牌库顶 5 张，选 2 入手',
  toxin: 1,
  cost: { lingcao: 1 },
});

// 清心丹 ⊙｜心魔 −1，移除自身全部负面；净清丹毒 2 点（唯一负毒丹）｜毒 −2｜灵草 ×3
// 挂点：combat.ts useElixirInBattle 清负面状态 + demon −1；地图服用在 run.ts（demon −1）。
// toxin 为 -2 净清：run.ts 的丹毒累积逻辑对负值直接减毒（下限 0）。
def({
  id: 'qingxindan',
  name: '清心丹',
  text: '心魔 −1，移除自身全部负面；净清丹毒 2 点',
  toxin: -2,
  cost: { lingcao: 3 },
  mapUsable: true,
});

// 五行丹｜你的下一张牌视为任意行（必得气）｜毒 2｜妖丹 ×2
// 挂点：combat.ts useElixirInBattle 置 battle.wuxingDanNext = true（契约字段，出牌结算时消耗）。
def({
  id: 'wuxingdan',
  name: '五行丹',
  text: '你的下一张牌视为任意行（必得气）',
  toxin: 2,
  cost: { yaodan: 2 },
});

// 龙虎丹｜本场战斗攻击 +4｜毒 2｜妖丹 ×2
// 挂点：combat.ts useElixirInBattle 置 battle.longhuBonus += 4（契约字段，并入攻击结算）。
def({
  id: 'longhudan',
  name: '龙虎丹',
  text: '本场战斗攻击 +4',
  toxin: 2,
  cost: { yaodan: 2 },
});

// 龟息丹｜本回合所受伤害减半，且护体本回合结束不衰减｜毒 1｜玉髓 ×2
// 挂点：combat.ts useElixirInBattle 施加状态 guixiDan 1（受伤减半）+ retainBlock 1（护体不衰减）。
def({
  id: 'guixidan',
  name: '龟息丹',
  text: '本回合所受伤害减半，且护体本回合结束不衰减',
  toxin: 1,
  cost: { yusui: 2 },
});

// 化煞丹｜全体敌人 +4 瘴毒 +2 灼烧｜毒 2｜妖丹 ×1 + 雷砂 ×1
// 挂点：combat.ts useElixirInBattle 对全体敌人施加 zhangdu 4 + zhuoshao 2。
def({
  id: 'huashadan',
  name: '化煞丹',
  text: '全体敌人 +4 瘴毒 +2 灼烧',
  toxin: 2,
  cost: { yaodan: 1, leisha: 1 },
});

// 大还丹 ⊙（稀方）｜回 50% 上限气血；燃寿 4 年｜毒 3｜灵草 ×3 + 玉髓 ×1
// 挂点：combat.ts useElixirInBattle 回血 + run.lifespan −4；地图服用在 run.ts（同效果，寿元归零坐化判定）。
def({
  id: 'dahuandan',
  name: '大还丹',
  text: '回 50% 上限气血；燃寿 4 年',
  toxin: 3,
  cost: { lingcao: 3, yusui: 1 },
  rare: true,
  mapUsable: true,
});

// 悟道丹 ⊙（稀方）｜立即参悟 1 张牌｜毒 2｜雷砂 ×2
// 挂点：战斗内在 combat.ts useElixirInBattle 生成选牌参悟流程；
//       地图服用在 run.ts 进入 CardPickScreen（mode 'upgrade'）选 1 张参悟。
def({
  id: 'wudaodan',
  name: '悟道丹',
  text: '立即参悟 1 张牌',
  toxin: 2,
  cost: { leisha: 2 },
  rare: true,
  mapUsable: true,
});

// 天机丹（稀方）｜本场敌人意图数值全显示，且你每回合抽牌 +1｜毒 2｜雷砂 ×1 + 妖丹 ×1
// 挂点：combat.ts useElixirInBattle 置 battle.tianjiActive = true（契约字段：UI 显示意图数值；回合开始抽牌 +1）。
def({
  id: 'tianjidan',
  name: '天机丹',
  text: '本场敌人意图数值全显示，且你每回合抽牌 +1',
  toxin: 2,
  cost: { leisha: 1, yaodan: 1 },
  rare: true,
});

/** 全部丹方 id（表序） */
export const RECIPE_IDS: string[] = Object.keys(RECIPES);

/** 常规丹方（非稀方）：坊市常规货架 / 随机丹方池用 */
export const COMMON_RECIPES: string[] = RECIPE_IDS.filter((id) => !RECIPES[id].rare);

/** 按 id 取丹方；未知 id 视为数据错误直接抛出 */
export function getRecipe(id: string): RecipeDef {
  const r = RECIPES[id];
  if (!r) throw new Error(`未知丹方: ${id}`);
  return r;
}
