/**
 * 道果数据（策划案 §9.5；替代已删除的 breakthroughs.ts）
 *
 * 幕 Boss 后突破：规则解锁（气海/御空、周天自运/缩地）由 run.ts 直接给予；
 * 随后从道果池抽 3 供选 1（七重天难度下为二选一），经 DaoguoScreen → PICK_DAOGUO 写入 run.fruits。
 *
 * 效果实现挂点：
 * - 一次性效果（randengxuming / tiegu 上限 / zhansanshi）：run.ts 在 PICK_DAOGUO 时立即结算；
 * - 常驻数值（jindanwuse 气海上限 / tiegu 开局护体 / yaowangding 阈值与服丹抽牌）：run.ts 读取 run.fruits；
 * - 战斗内规则改写（jiantai / niyunzhenqi / yingerbaodan / yiqihuasanqing）：combat.ts 读取 run.fruits。
 */

export interface DaoguoDef {
  id: string;
  name: string;
  text: string;
}

export const DAOGUO: Record<string, DaoguoDef> = {};
function def(d: DaoguoDef) {
  DAOGUO[d.id] = d;
}

// 金丹凝五色：run.ts 选取时 poolCap += 2（炼气期无气海，仅筑基后有意义）。
def({ id: 'jindanwuse', name: '金丹凝五色', text: '气海上限 +2' });

// 剑胎：combat.ts 得气判定中，金牌视为常驻得气（无需行位顺生）。
def({ id: 'jiantai', name: '剑胎', text: '你的金牌得气段常驻生效（无需行位）' });

// 药王鼎：run.ts 丹毒阈值判定（4/8/12 → 8/12/16）各 +4；服丹后（战斗内在 combat.ts）抽 1。
def({ id: 'yaowangding', name: '药王鼎', text: '丹毒各阈值 +4；服丹后抽 1' });

// 逆运真气：combat.ts 滞气逻辑关闭（不再置 shengBlocked）；强逆（克制当前行位）打出的牌视为得气。
def({ id: 'niyunzhenqi', name: '逆运真气', text: '【滞气】不再触发；且强逆打出的牌视为得气' });

// 婴儿抱丹：combat.ts 回合开始时若气海存灵 ≥4：+1 层固本并抽 1。
def({ id: 'yingerbaodan', name: '婴儿抱丹', text: '回合开始若气海存灵 ≥4：+1 层固本并抽 1' });

// 燃灯续命：run.ts 选取时 lifespan += 25（一次性）。
def({ id: 'randengxuming', name: '燃灯续命', text: '寿元 +25 年' });

// 一气化三清：combat.ts 五行周天判定由集齐 5 行改为任意 4 行即触发。
def({ id: 'yiqihuasanqing', name: '一气化三清', text: '五行周天改为集齐任意 4 行即触发' });

// 铁骨：run.ts 选取时 maxHp += 18（并回等量血）；battleStartBlock += 6（土属性护体，开战由 combat.ts 读取）。
def({ id: 'tiegu', name: '铁骨', text: '气血上限 +18；每场战斗开局 +6 土护体' });

// 斩三尸：run.ts 选取时进入 CardPickScreen（mode 'remove'，count 2，bonded 本命牌不可斩）；demon −2（下限 0）。
def({ id: 'zhansanshi', name: '斩三尸', text: '立即斩去至多 2 张牌；心魔 −2' });

export const DAOGUO_IDS: string[] = Object.keys(DAOGUO);
