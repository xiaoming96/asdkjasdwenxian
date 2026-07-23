/**
 * 局外进度：结算入账、成就判定、图鉴收录。
 */
import type { Profile, RunState } from '../core/types';
import { computeDaowei } from '../core/run';
import { CARDS, getCard } from '../data/cards';
import { RELICS } from '../data/relics';
import { ENEMIES } from '../data/enemies';
import { UNLOCKS } from '../data/unlocks';

/** 结算一局：道行入账 + 成就 + 图鉴 */
export function settleRun(profile: Profile, run: RunState, victory: boolean): Profile {
  const p: Profile = JSON.parse(JSON.stringify(profile));
  const daowei = computeDaowei(run, victory);
  p.daowei += daowei;
  p.totalDaoweiEarned += daowei;
  p.runsTotal += 1;
  if (victory) {
    p.wins += 1;
    p.maxAscensionCleared = Math.max(p.maxAscensionCleared, run.ascension);
    if (!p.unlocked.includes('yichongtian')) p.unlocked.push('yichongtian');
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
  // 成就
  const unlock = (id: string) => {
    if (!p.achievements.includes(id)) p.achievements.push(id);
  };
  if (run.act >= 2 || victory) unlock('chukui');
  if (victory) {
    unlock('jindandadao');
    unlock('bairifeisheng');
    if (run.deck.length <= 12) unlock('dadaozhijian');
    if (!run.deck.some((c) => getCard(c.cardId).type === 'curse')) unlock('baidubuqin');
    if (run.stats.cardsUpgraded === 0) unlock('wuqingdao');
    if (run.ascension >= 9) unlock('jiutianlanyue');
    const daohao = (run.screen.kind === 'end' && run.screen.daohao) || null;
    if (daohao && !p.daohaoList.includes(daohao)) p.daohaoList.push(daohao);
  }
  if ((run.flags['zhoutianTotal'] ?? 0) >= 5) unlock('zhoutianyuanman');
  if ((run.flags['maxHit'] ?? 0) >= 60) unlock('yijianpowanfa');
  if (run.stats.potionsUsed >= 10) unlock('yaodaobingchu');
  if (p.runsTotal >= 10) unlock('zhuanshichongxiu');
  if (p.runsTotal >= 100) unlock('wendaobainian');
  // 战斗内追踪的成就旗标
  if ((run.flags['jieleiClean'] ?? 0) >= 3 && !run.flags['jieleiDirty']) unlock('sanjieqidu');
  if (run.flags['ach_wulei']) unlock('wuleihongding');
  if (run.flags['ach_shenwai']) unlock('shenwaihuashen');
  // 图鉴集齐
  if (p.seenRelics.length >= Object.keys(RELICS).length) unlock('qiankunzaishou');
  const cardTotal = Object.values(CARDS).filter((c) => c.rarity !== 'curse').length;
  if (p.seenCards.length >= cardTotal) unlock('wanxianggengxin');
  const enemyTotal = Object.keys(ENEMIES).length;
  if (p.seenEnemies.length >= enemyTotal) unlock('xiangyaochumo');
  // 飞升三次（3 角色各通关）与每日天机
  if (victory) {
    const charKey = Object.keys(run.flags).find((k) => k.startsWith('char_'))?.slice(5) ?? 'jianxiu';
    p.winsByChar[charKey] = (p.winsByChar[charKey] ?? 0) + 1;
    if (Object.keys(p.winsByChar).length >= 3) unlock('feishengsanci');
    // 天机不可泄露：本地版以"每日天机通关"替代（前 10% 需后端榜单，P1）
    if (Object.keys(run.flags).some((k) => k.startsWith('daily'))) unlock('tianjibukexie');
  }
  return p;
}

export function buyUnlock(profile: Profile, id: string): Profile | null {
  const def = UNLOCKS[id];
  if (!def || profile.unlocked.includes(id) || profile.daowei < def.cost) return null;
  const p: Profile = JSON.parse(JSON.stringify(profile));
  p.daowei -= def.cost;
  p.unlocked.push(id);
  return p;
}
