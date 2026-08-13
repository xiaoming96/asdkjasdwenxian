/**
 * 局外进度（v3）：结算入账、成就判定、图鉴收录、宿慧三选一（§11.1）。
 * v3 删除解锁树：buyUnlock 移除，里程碑由 data/milestones.ts 按道行阈值自动解锁。
 */
import type { LegacyState, Profile, RunState } from '../core/types';
import { computeDaowei } from '../core/run';
import { CARDS, getCard } from '../data/cards';
import { RELICS, getRelic } from '../data/relics';
import { ENEMIES } from '../data/enemies';

/** 宿慧业力表（§11.1）：卡按稀有度 普0/稀1/史2/传3（起始与诅咒按 0 计） */
const CARD_KARMA: Record<string, number> = {
  starter: 0, common: 0, rare: 1, epic: 2, legendary: 3, curse: 0,
};

/** 宿慧业力表（§11.1）：法宝按品级 凡1/灵2/仙3/劫4 */
const RELIC_KARMA: Record<string, number> = {
  fan: 1, ling: 2, xian: 3, jie: 4,
};

/** 结算一局：道行入账 + 成就（20，v3 判定）+ 图鉴收录 */
export function settleRun(profile: Profile, run: RunState, victory: boolean): Profile {
  const p: Profile = JSON.parse(JSON.stringify(profile));
  const daowei = computeDaowei(run, victory);
  p.daowei += daowei;
  p.totalDaoweiEarned += daowei;
  p.runsTotal += 1;
  if (victory) {
    p.wins += 1;
    p.maxAscensionCleared = Math.max(p.maxAscensionCleared, run.ascension);
  }
  // 图鉴收录
  for (const c of run.deck) {
    if (!p.seenCards.includes(c.cardId)) p.seenCards.push(c.cardId);
  }
  for (const r of run.relics) {
    if (!p.seenRelics.includes(r)) p.seenRelics.push(r);
  }
  for (const key of Object.keys(run.flags)) {
    if (key.startsWith('seen_')) {
      const id = key.slice(5);
      if (!p.seenEnemies.includes(id)) p.seenEnemies.push(id);
    }
  }

  // ---- 成就（§11.5，恰 20 项；v2 废弃项 baidubuqin/wendaobainian/feishengsanci/wuqingdao 已移除）----
  const unlock = (id: string) => {
    if (!p.achievements.includes(id)) p.achievements.push(id);
  };
  // 初窥门径：首次突破筑基（打过幕一即算）
  if (run.act >= 2 || victory) unlock('chukui');
  if (victory) {
    unlock('jindandadao');   // 金丹大道：首次通关
    unlock('bairifeisheng'); // 白日飞升：首次渡过九重天劫
    if (run.deck.length <= 10) unlock('dadaozhijian');           // 大道至简：卡组 ≤10 通关（v3 收紧）
    if (run.demon === 0) unlock('shouxinruyu');                  // 守心如玉：全程心魔 0 通关
    if (run.stats.elixirsUsed === 0) unlock('bigushanren');      // 辟谷仙人：全程不服丹通关
    if (run.stats.lifespanBurned >= 30) unlock('randengzhe');    // 燃灯者：累计燃寿 ≥30 年并通关
    if (run.ascension >= 9) unlock('jiutianlanyue');             // 九天揽月：九重天通关
    const daohao = (run.screen.kind === 'end' && run.screen.daohao) || null;
    if (daohao && !p.daohaoList.includes(daohao)) p.daohaoList.push(daohao);
  }
  if ((run.flags['zhoutianTotal'] ?? 0) >= 5) unlock('zhoutianyuanman'); // 周天圆满
  if ((run.flags['maxHit'] ?? 0) >= 80) unlock('yijianpowanfa');        // 一剑破万法（v3 提至 ≥80）
  if (run.stats.elixirsUsed >= 10) unlock('yaodaobingchu');             // 药到病除：一局服丹 10 枚
  if (p.runsTotal >= 10) unlock('zhuanshichongxiu');                    // 转世重修：累计 10 局
  // 一诺千金：单局走完全部 6 条因果链的善份。
  // 宽松实现：六条链（chain_linghu/jingdi/zuidao/xianghuo/fangsheng 的完成记号 +
  // 心魔来访任一选项）由 run.ts/events 在完成时写入 'chainDone_*' flag，此处只数键数 ≥6，
  // 不校验具体链 id——引擎侧新增链或改名不影响本判定。
  if (Object.keys(run.flags).filter((k) => k.startsWith('chainDone_')).length >= 6) unlock('yinuoqianjin');
  // 战斗内追踪的成就旗标
  if ((run.flags['jieleiClean'] ?? 0) >= 3 && !run.flags['jieleiDirty']) unlock('sanjieqidu'); // 三劫齐渡
  if (run.flags['ach_wulei']) unlock('wuleihongding');     // 五雷轰顶：单场 25 层灼烧
  if (run.flags['ach_shenwai']) unlock('shenwaihuashen');  // 身外化身：心魔战相变阶段不掉血
  // 图鉴集齐
  if (p.seenRelics.length >= Object.keys(RELICS).length) unlock('qiankunzaishou');
  const cardTotal = Object.values(CARDS).filter((c) => c.rarity !== 'curse').length;
  if (p.seenCards.length >= cardTotal) unlock('wanxianggengxin');
  if (p.seenEnemies.length >= Object.keys(ENEMIES).length) unlock('xiangyaochumo');
  // 每日天机与角色胜场
  if (victory) {
    const charKey = Object.keys(run.flags).find((k) => k.startsWith('char_'))?.slice(5) ?? 'jianxiu';
    p.winsByChar[charKey] = (p.winsByChar[charKey] ?? 0) + 1;
    // 天机不可泄露：本地版以"每日天机通关"替代（前 10% 需后端榜单，P1）
    if (Object.keys(run.flags).some((k) => k.startsWith('daily'))) unlock('tianjibukexie');
  }
  return p;
}

// ---------- 宿慧三选一（§11.1） ----------

export interface LegacyPick {
  kind: 'card' | 'relic' | 'daoxing';
  uid?: number;      // kind='card'：本局卡组中该牌的 uid
  relicId?: string;  // kind='relic'：本局法宝 id
}

/**
 * 结算页选定宿慧，写入 profile.legacy（供下一世 newRun 读取，开局后由 consumeLegacy 清空）。
 * 业力（§11.1）：卡 普0/稀1/史2/传3；法宝 凡1/灵2/仙3/劫4；
 * 道行 kind：不带实物，道行额外 +15，业力 0。
 * 通关后转世：天道嘉许，业力 −1（下限 0）。
 * 非法选择（uid/relicId 不在本局中）原样返回 profile。
 */
export function pickLegacy(profile: Profile, run: RunState, pick: LegacyPick): Profile {
  const p: Profile = JSON.parse(JSON.stringify(profile));
  let legacy: LegacyState;
  if (pick.kind === 'card') {
    const inst = run.deck.find((c) => c.uid === pick.uid);
    if (!inst) return profile;
    const def = getCard(inst.cardId);
    legacy = {
      kind: 'card',
      cardId: inst.cardId,
      upgraded: inst.upgraded,
      karma: CARD_KARMA[def.rarity] ?? 0,
    };
  } else if (pick.kind === 'relic') {
    if (!pick.relicId || !run.relics.includes(pick.relicId)) return profile;
    legacy = {
      kind: 'relic',
      relicId: pick.relicId,
      karma: RELIC_KARMA[getRelic(pick.relicId).grade] ?? 1,
    };
  } else {
    legacy = { kind: 'daoxing', karma: 0 };
    p.daowei += 15;
    p.totalDaoweiEarned += 15;
  }
  const victory = run.screen.kind === 'end' && run.screen.victory;
  if (victory) legacy.karma = Math.max(0, legacy.karma - 1);
  p.legacy = legacy;
  return p;
}

/** 宿慧用完即清（App 在 newRun 读取 profile.legacy 之后立即调用） */
export function consumeLegacy(profile: Profile): Profile {
  return { ...profile, legacy: { kind: null, karma: 0 } };
}
