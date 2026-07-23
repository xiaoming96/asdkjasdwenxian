/**
 * 局外进度：结算入账、成就判定、图鉴收录。
 */
import type { Profile, RunState } from '../core/types';
import { computeDaowei } from '../core/run';
import { getCard } from '../data/cards';
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
