/**
 * 无头模拟器 CLI（策划案 §16.6）
 * 用法：npm run sim -- --bots greedy --runs 1000 --ascension 0 [--seed BASE]
 * 输出：通关率、分幕死亡热图、平均回合数——对照 §12.3 门槛表。
 */
import { newRun, reduce } from '../core/run';
import { defaultProfile } from '../save/storage';
import { botAction, BotRng, type BotKind } from './bots';
import type { RunState } from '../core/types';

interface SimResult {
  victory: boolean;
  act: number;
  floor: number;
  score: number;
  turns: number;
  battles: number;
  cause: string;
  pickedCards: string[];
  enemyLoss: Record<string, { loss: number; count: number }>;
}

function parseArgs(): { bots: BotKind; runs: number; ascension: number; seed: string; verbose: boolean; benchmark: boolean } {
  const args = process.argv.slice(2);
  const get = (name: string, dflt: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
  };
  const benchmark = args.includes('--benchmark'); // 基准种子集回归（§17）：固定种子可比对
  return {
    bots: (get('bots', 'greedy') as BotKind),
    runs: parseInt(get('runs', benchmark ? '200' : '1000'), 10),
    ascension: parseInt(get('ascension', '0'), 10),
    seed: benchmark ? 'BENCH' : get('seed', 'SIMBASE'),
    verbose: args.includes('--verbose'),
    benchmark,
  };
}

export function simulateOne(seed: string, bots: BotKind, ascension: number): SimResult {
  const profile = defaultProfile();
  // 模拟时解锁全部内容池（评估完整卡池平衡）
  const unlocked = ['cangjinge', 'jianyichuji', 'qingnangcanjuan', 'xuanshuixinde', 'lihuoxinde', 'houtuxinde', 'chuanshuomizong', 'dongfuliandan'];
  let run: RunState = newRun(profile, seed, ascension);
  const rng = new BotRng(seed + ':bot');
  let guard = 0;
  const GUARD_MAX = 20000;

  // 分析数据（§12.3/§16.6）：每卡 pick、每敌人平均损血
  const pickedCards: string[] = [];
  const enemyLoss: Record<string, { loss: number; count: number }> = {};
  let battleKey: string | null = null;
  let hpBefore = 0;

  while (!run.over && guard < GUARD_MAX) {
    guard += 1;
    const action = botAction(run, bots, rng);
    if (!action) break;
    // 记录卡牌 pick
    if (action.t === 'PICK_REWARD_CARD' && action.index >= 0 && run.screen.kind === 'reward' && run.screen.cards) {
      const pick = run.screen.cards[action.index];
      if (pick) pickedCards.push(pick.cardId);
    }
    const next = reduce(run, action, unlocked);
    if (next === run) {
      // 非法动作（Bot 决策与状态不一致）：强制兜底
      const fallback = run.battle ? { t: 'END_TURN' as const } : null;
      if (!fallback) break;
      const n2 = reduce(run, fallback, unlocked);
      if (n2 === run) break;
      run = n2;
      continue;
    }
    // 记录每敌人损血（战斗开始/结束边界）
    if (!run.battle && next.battle) {
      battleKey = [...new Set(next.battle.enemies.map((e) => e.enemyId))].join('+');
      hpBefore = run.hp;
    } else if (run.battle && !next.battle && battleKey) {
      const rec = (enemyLoss[battleKey] ??= { loss: 0, count: 0 });
      rec.loss += Math.max(0, hpBefore - next.hp);
      rec.count += 1;
      battleKey = null;
    }
    run = next;
  }

  const end = run.screen.kind === 'end' ? run.screen : null;
  return {
    victory: end?.victory ?? false,
    act: run.act,
    floor: run.floor,
    score: end?.score ?? 0,
    turns: run.flags['turnsTotal'] ?? 0,
    battles: run.stats.battles,
    cause: end?.cause ?? (guard >= GUARD_MAX ? '模拟超时' : '未结束'),
    pickedCards,
    enemyLoss,
  };
}

function main() {
  const { bots, runs, ascension, seed, verbose, benchmark } = parseArgs();
  console.log(`《问长生》无头模拟器 · bot=${bots} runs=${runs} ascension=${ascension}${benchmark ? ' · 基准种子集' : ''}`);
  const start = Date.now();
  const results: SimResult[] = [];
  let errors = 0;
  for (let i = 0; i < runs; i++) {
    try {
      results.push(simulateOne(`${seed}-${i}`, bots, ascension));
    } catch (err) {
      errors += 1;
      if (verbose || errors <= 5) console.error(`  局 ${i} 异常:`, err instanceof Error ? err.message : err);
    }
    if ((i + 1) % 200 === 0) console.log(`  ...已完成 ${i + 1}/${runs}`);
  }
  const ms = Date.now() - start;

  const wins = results.filter((r) => r.victory).length;
  const actDeaths = [0, 0, 0];
  for (const r of results) {
    if (!r.victory) actDeaths[Math.min(2, r.act - 1)] += 1;
  }
  const act1Pass = results.filter((r) => r.victory || r.act >= 2).length;
  const avgTurnsPerBattle = results.reduce((s, r) => s + (r.battles > 0 ? r.turns / r.battles : 0), 0) / Math.max(1, results.length);

  console.log('');
  console.log('==== 结果（对照 §12.3 门槛） ====');
  console.log(`总局数: ${results.length}（异常 ${errors}）  用时: ${(ms / 1000).toFixed(1)}s`);
  console.log(`通关率: ${((wins / Math.max(1, results.length)) * 100).toFixed(2)}%  （random 门槛 <1%，greedy 门槛 8–15%）`);
  console.log(`幕一通过率: ${((act1Pass / Math.max(1, results.length)) * 100).toFixed(2)}%  （greedy 门槛 55–70%）`);
  console.log(`分幕死亡: 幕一 ${actDeaths[0]} / 幕二 ${actDeaths[1]} / 幕三 ${actDeaths[2]}`);
  console.log(`平均单场回合: ${avgTurnsPerBattle.toFixed(2)}  （门槛 3–5，幕三 4–6）`);
  const avgScore = results.reduce((s, r) => s + r.score, 0) / Math.max(1, results.length);
  console.log(`平均分数: ${avgScore.toFixed(0)}`);

  // 死因排行（辅助定位平衡问题）
  const causes = new Map<string, number>();
  for (const r of results) {
    if (!r.victory) causes.set(r.cause, (causes.get(r.cause) ?? 0) + 1);
  }
  const top = [...causes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log('死因排行:');
  for (const [cause, n] of top) console.log(`  ${n} × ${cause}`);

  // 每卡 pick/win 相关性（§12.3：偏离均值 ±8% 标红人工复查）
  const overallWin = wins / Math.max(1, results.length);
  const pickStat = new Map<string, { picks: number; wins: number }>();
  for (const r of results) {
    for (const cardId of new Set(r.pickedCards)) {
      const st = pickStat.get(cardId) ?? { picks: 0, wins: 0 };
      st.picks += 1;
      if (r.victory) st.wins += 1;
      pickStat.set(cardId, st);
    }
  }
  const flagged = [...pickStat.entries()]
    .filter(([, s]) => s.picks >= 20)
    .map(([id, s]) => ({ id, picks: s.picks, wr: s.wins / s.picks, dev: s.wins / s.picks - overallWin }))
    .sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev));
  console.log('每卡 pick/win 偏离（样本 ≥20，前 12）:');
  for (const f of flagged.slice(0, 12)) {
    const mark = Math.abs(f.dev) >= 0.08 ? ' ⚠复查' : '';
    console.log(`  ${f.id}: picks=${f.picks} 胜率=${(f.wr * 100).toFixed(1)}% 偏离=${(f.dev * 100).toFixed(1)}%${mark}`);
  }

  // 每敌人平均损血（前 12）
  const lossAgg = new Map<string, { loss: number; count: number }>();
  for (const r of results) {
    for (const [k, v] of Object.entries(r.enemyLoss)) {
      const st = lossAgg.get(k) ?? { loss: 0, count: 0 };
      st.loss += v.loss;
      st.count += v.count;
      lossAgg.set(k, st);
    }
  }
  const lossTop = [...lossAgg.entries()]
    .filter(([, v]) => v.count >= 10)
    .map(([k, v]) => ({ k, avg: v.loss / v.count, n: v.count }))
    .sort((a, b) => b.avg - a.avg);
  console.log('每敌人平均损血（场次 ≥10，前 12）:');
  for (const l of lossTop.slice(0, 12)) console.log(`  ${l.k}: ${l.avg.toFixed(1)} 血/场（${l.n} 场）`);
}

main();
