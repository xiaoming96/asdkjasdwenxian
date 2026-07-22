/**
 * 丹药系统（策划案 §7，12 种）
 * mapUsable = ⊙ 可在地图上使用；rare 影响掉落/售价。
 */

export interface PotionDef {
  id: string;
  name: string;
  text: string;
  mapUsable?: boolean;
  rare?: boolean;
  targetEnemy?: boolean;
}

export const POTIONS: Record<string, PotionDef> = {};
function def(p: PotionDef) {
  POTIONS[p.id] = p;
}

def({ id: 'huixuedan', name: '回血丹', text: '回 12 血', mapUsable: true });
def({ id: 'lingqisan', name: '灵气散', text: '+2 灵气' });
def({ id: 'jingangwan', name: '金刚丸', text: '+12 护体' });
def({ id: 'yunlingdan', name: '蕴灵丹', text: '抽 3' });
def({ id: 'qingxindan', name: '清心丹', text: '移除自身全部负面状态' });
def({ id: 'wuxingdan', name: '五行丹', text: '你的下一张牌视为任意五行（必触发行云流水）' });
def({ id: 'longhudan', name: '龙虎丹', text: '本场战斗攻击 +3' });
def({ id: 'guixidan', name: '龟息丹', text: '本回合受到伤害减半' });
def({ id: 'huashadan', name: '化煞丹', text: '全体敌人 +2 缠缚 +2 灼烧' });
def({ id: 'niepansan', name: '涅槃散', text: '回 30% 上限气血', mapUsable: true, rare: true });
def({ id: 'wudaodan', name: '悟道丹', text: '立即参悟 1 张牌', mapUsable: true, rare: true });
def({ id: 'tianjiwan', name: '天机丸', text: '本场战斗敌人意图数值全显示，且你抽牌 +1/回合', rare: true });

export function getPotion(id: string): PotionDef {
  const p = POTIONS[id];
  if (!p) throw new Error(`未知丹药: ${id}`);
  return p;
}

export const POTION_IDS = Object.keys(POTIONS);
export const COMMON_POTIONS = POTION_IDS.filter((id) => !POTIONS[id].rare);
