/**
 * 无头模拟器 CLI v3（策划案 §16.6，指标对照 §12.3 门槛表）
 *
 * 用法：pnpm sim -- --bots greedy --runs 500 --ascension 0 [--seed BASE] [--benchmark] [--verbose]
 *   --bots greedy|random|blind|all
 *          all 时依次跑三种 bot，并输出 greedy vs blind 的综合效能比（知识变现倍率估算，§12.2 门槛 ≤1.8×）
 *   --benchmark 基准种子集回归模式：固定种子 BENCH-i，跨版本可比对
 *
 * 进程内直跑 core（reduce），全程固定种子序列，禁 Math.random（§16.4）。
 * 防死循环：单场战斗 ≥60 回合判负并记异常；单局 ≥3000 action 中止并记异常。
 */
import { newRun, reduce } from '../core/run';
import { defaultProfile } from '../save/storage';
import { computeUnlocked } from '../data/milestones';
import { botAction, BotRng, type BotKind } from './bots';
import type { RunState } from '../core/types';

/** 模拟按满配解锁跑（全卡池），避免空 unlocked 把卡池锁在普通级使平衡数据失真 */
const FULL_UNLOCKED = computeUnlocked({ daowei: 99999, runsTotal: 99 });

const MAX_ACTIONS = 3000;      // 单局动作上限
const MAX_BATTLE_TURNS = 60;   // 单场战斗回合上限（判负）

type CauseClass = 'battle' | 'zuohua' | 'toxin' | 'anomaly';

export interface SimResult {
  victory: boolean;
  act: number;
  floor: number;
  score: number;
  cause: string;
  causeClass: CauseClass | null;  // 通关时为 null
  battles: number;                // 战斗场数（含未打完的最后一场）
  battleTurns: number;            // 各场回合数合计
  shengTotal: number;             // 全局得气总次数
  zhoutianTotal: number;          // 全局五行周天总次数
  jieTurns: number | null;        // 九重天劫战回合数（未打到为 null）
  demonAct2End: number | null;    // 幕二末（进幕三时）心魔值
  demonFinal: number;
  lifespanLeft: number;
  actions: number;
  anomaly: string | null;
  pickedCards: string[];
}

function classifyCause(cause: string): CauseClass {
  if (/坐化|寿元/.test(cause)) return 'zuohua';
  if (/丹毒/.test(cause)) return 'toxin';
  return 'battle';
}

export function simulateOne(seed: string, bot: BotKind, ascension: number): SimResult {
  let run: RunState = newRun(defaultProfile(), seed, ascension);
  const rng = new BotRng(seed + ':bot:' + bot);

  let actions = 0;
  let anomaly: string | null = null;
  const pickedCards: string[] = [];

  // 战斗统计（得气经 deqiCountTurn 的回合内增量累计；场次边界结算 turnsTotal / zhoutianTotal）
  let shengTotal = 0;
  let zhoutianTotal = 0;
  let battles = 0;
  let battleTurns = 0;
  let jieTurns: number | null = null;
  let demonAct2End: number | null = null;
  let prevTurn = -1;
  let prevDeqi = 0;

  const flushBattle = (b: NonNullable<RunState['battle']>) => {
    battles += 1;
    const turns = Math.max(b.turnsTotal ?? 0, b.turn);
    battleTurns += turns;
    zhoutianTotal += b.zhoutianTotal;
    if (b.waveIndex >= 0) jieTurns = turns; // 九重天劫
    prevTurn = -1;
    prevDeqi = 0;
  };

  while (!run.over) {
    if (actions >= MAX_ACTIONS) {
      anomaly = `单局动作数超 ${MAX_ACTIONS}，中止`;
      break;
    }
    if (run.battle && run.battle.turn >= MAX_BATTLE_TURNS) {
      anomaly = `单场战斗超 ${MAX_BATTLE_TURNS} 回合，判负`;
      break;
    }
    const action = botAction(run, bot, rng);
    if (!action) break;

    // 记录卡牌 pick（pick/win 相关性，§12.3）
    if (action.t === 'PICK_REWARD_CARD' && action.index >= 0 && run.screen.kind === 'reward' && run.screen.cards) {
      const pick = run.screen.cards[action.index];
      if (pick) pickedCards.push(pick.cardId);
    }

    const next = reduce(run, action, FULL_UNLOCKED);
    actions += 1;
    if (next === run) {
      // 非法动作（Bot 决策与引擎状态不一致）：兜底一次，仍无效则中止
      const fallback = run.battle
        ? ({ t: 'END_TURN' } as const)
        : run.screen.kind === 'reward'
          ? ({ t: 'LEAVE_REWARD' } as const)
          : run.screen.kind === 'shop'
            ? ({ t: 'LEAVE_SHOP' } as const)
            : run.screen.kind === 'event'
              ? ({ t: 'LEAVE_EVENT' } as const)
              : run.screen.kind === 'cave'
                ? ({ t: 'CAVE_LEAVE' } as const)
                : null;
      const n2 = fallback ? reduce(run, fallback, FULL_UNLOCKED) : run;
      if (n2 === run) {
        anomaly = `Bot 卡死（${action.t} 在 ${run.battle ? 'battle' : run.screen.kind} 下无效）`;
        break;
      }
      actions += 1;
      run = n2;
      continue;
    }

    // ---- 指标边界检测 ----
    // 得气：deqiCountTurn 回合内单调增，跨回合重置
    if (next.battle) {
      if (!run.battle || next.battle.turn !== prevTurn) {
        prevTurn = next.battle.turn;
        prevDeqi = 0;
      }
      const d = next.battle.deqiCountTurn - prevDeqi;
      if (d > 0) shengTotal += d;
      prevDeqi = next.battle.deqiCountTurn;
    }
    // 战斗结束边界
    if (run.battle && !next.battle) flushBattle(run.battle);
    // 幕二 → 幕三：记录幕二末心魔值
    if (run.act === 2 && next.act === 3) demonAct2End = next.demon;

    run = next;
  }

  if (run.battle) flushBattle(run.battle); // 死在战斗中 / 判负中止：补记最后一场

  const end = run.screen.kind === 'end' ? run.screen : null;
  const victory = !anomaly && (end?.victory ?? false);
  const cause = anomaly ?? end?.cause ?? '未结束';
  return {
    victory,
    act: run.act,
    floor: run.floor,
    score: end?.score ?? 0,
    cause,
    causeClass: victory ? null : anomaly ? 'anomaly' : classifyCause(cause),
    battles,
    battleTurns,
    shengTotal,
    zhoutianTotal,
    jieTurns,
    demonAct2End,
    demonFinal: run.demon,
    lifespanLeft: run.lifespan,
    actions,
    anomaly,
    pickedCards,
  };
}

// ---------- 批量运行与报表 ----------

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function pct(n: number, d: number): string {
  return `${((n / Math.max(1, d)) * 100).toFixed(2)}%`;
}

interface BotReport {
  bot: BotKind;
  runs: number;
  errors: number;
  winRate: number;
  act1Pass: number;
  avgScore: number;
  results: SimResult[];
}

function runBatch(bot: BotKind, runs: number, ascension: number, seedBase: string, verbose: boolean): BotReport {
  console.log(`\n>>> bot=${bot} runs=${runs} ascension=${ascension} seedBase=${seedBase}`);
  const start = Date.now();
  const results: SimResult[] = [];
  let errors = 0;
  for (let i = 0; i < runs; i++) {
    try {
      results.push(simulateOne(`${seedBase}-${i}`, bot, ascension));
    } catch (err) {
      errors += 1;
      if (verbose || errors <= 5) console.error(`  局 ${i} 异常:`, err instanceof Error ? err.message : err);
    }
    if ((i + 1) % 100 === 0) console.log(`  ...已完成 ${i + 1}/${runs}`);
  }
  const ms = Date.now() - start;
  const n = results.length;
  const wins = results.filter((r) => r.victory).length;
  const act1Pass = results.filter((r) => r.victory || r.act >= 2).length;
  const avgScore = results.reduce((s, r) => s + r.score, 0) / Math.max(1, n);

  // ---- §12.3 指标对照 ----
  const deaths = results.filter((r) => !r.victory);
  const byClass: Record<CauseClass, number> = { battle: 0, zuohua: 0, toxin: 0, anomaly: 0 };
  for (const r of deaths) byClass[r.causeClass ?? 'battle'] += 1;
  const demonMid = median(results.filter((r) => r.demonAct2End !== null).map((r) => r.demonAct2End!));
  const totalBattles = results.reduce((s, r) => s + r.battles, 0);
  const shengPerBattle = results.reduce((s, r) => s + r.shengTotal, 0) / Math.max(1, totalBattles);
  const zhoutianPerRun = results.reduce((s, r) => s + r.zhoutianTotal, 0) / Math.max(1, n);
  const avgBattleTurns = results.reduce((s, r) => s + r.battleTurns, 0) / Math.max(1, totalBattles);
  const jie = results.filter((r) => r.jieTurns !== null).map((r) => r.jieTurns!);
  const avgJieTurns = jie.length > 0 ? jie.reduce((a, b) => a + b, 0) / jie.length : null;
  const avgLifespan = results.reduce((s, r) => s + r.lifespanLeft, 0) / Math.max(1, n);
  const winLifespans = results.filter((r) => r.victory).map((r) => r.lifespanLeft);
  const avgWinLifespan = winLifespans.length > 0 ? winLifespans.reduce((a, b) => a + b, 0) / winLifespans.length : null;
  const anomalies = results.filter((r) => r.anomaly).length;

  console.log(`\n==== ${bot} · 结果（对照 §12.3 门槛） ====`);
  console.log(`总局数: ${n}（跑挂 ${errors}，异常局 ${anomalies}）  用时: ${(ms / 1000).toFixed(1)}s`);
  console.log(`通关率: ${pct(wins, n)}  （greedy 门槛 8–15%；random <1%）`);
  console.log(`幕一通过率: ${pct(act1Pass, n)}  （greedy 门槛 55–70%）`);
  console.log(`死因分布: 战死 ${byClass.battle}（${pct(byClass.battle, n)}）/ 坐化 ${byClass.zuohua}（${pct(byClass.zuohua, n)}）/ 丹毒 ${byClass.toxin}（${pct(byClass.toxin, n)}）/ 异常 ${byClass.anomaly}`);
  console.log(`坐化占死因比例: ${pct(byClass.zuohua, Math.max(1, deaths.length))}  （门槛 <10%，一重天 <5%）`);
  console.log(`心魔中位数（幕二末，进幕三 ${results.filter((r) => r.demonAct2End !== null).length} 局）: ${demonMid === null ? '—' : demonMid}  （门槛 3–5）`);
  console.log(`每场平均得气次数: ${shengPerBattle.toFixed(2)}  （门槛 ≥4）`);
  console.log(`五行周天: ${zhoutianPerRun.toFixed(2)} 次/局`);
  console.log(`平均单场回合: ${avgBattleTurns.toFixed(2)}  （门槛 3–5，幕三 4–6）`);
  console.log(`九重天劫平均回合: ${avgJieTurns === null ? '—（未打到）' : avgJieTurns.toFixed(2) + `（${jie.length} 场）`}  （门槛 14–20）`);
  console.log(`剩余寿元均值: 全部 ${avgLifespan.toFixed(1)} 年${avgWinLifespan === null ? '' : ` / 通关局 ${avgWinLifespan.toFixed(1)} 年`}`);
  console.log(`平均分数: ${avgScore.toFixed(0)}`);

  // 死因排行（辅助定位平衡问题）
  const causes = new Map<string, number>();
  for (const r of deaths) causes.set(r.cause, (causes.get(r.cause) ?? 0) + 1);
  const top = [...causes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log('死因排行:');
  for (const [cause, c] of top) console.log(`  ${c} × ${cause}`);

  // 每卡 pick/win 相关性（§12.3：偏离均值 ±8% 标红人工复查）
  const overallWin = wins / Math.max(1, n);
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

  return { bot, runs: n, errors, winRate: overallWin, act1Pass: act1Pass / Math.max(1, n), avgScore, results };
}

// ---------- 入口 ----------

function parseArgs(): { bots: BotKind | 'all'; runs: number; ascension: number; seed: string; verbose: boolean; benchmark: boolean } {
  const args = process.argv.slice(2);
  const get = (name: string, dflt: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
  };
  const benchmark = args.includes('--benchmark'); // 基准种子集回归（§17）：固定种子可比对
  return {
    bots: get('bots', 'greedy') as BotKind | 'all',
    runs: parseInt(get('runs', benchmark ? '200' : '500'), 10),
    ascension: parseInt(get('ascension', '0'), 10),
    seed: benchmark ? 'BENCH' : get('seed', 'SIMBASE'),
    verbose: args.includes('--verbose'),
    benchmark,
  };
}

function main() {
  const { bots, runs, ascension, seed, verbose, benchmark } = parseArgs();
  console.log(`《问长生》无头模拟器 v3 · bots=${bots} runs=${runs} ascension=${ascension}${benchmark ? ' · 基准种子集' : ''}`);

  if (bots !== 'all') {
    runBatch(bots, runs, ascension, seed, verbose);
    return;
  }

  // all：三种 bot 同种子集依次跑；greedy vs blind → 知识变现倍率估算
  const greedy = runBatch('greedy', runs, ascension, seed, verbose);
  const blind = runBatch('blind', runs, ascension, seed, verbose);
  const random = runBatch('random', runs, ascension, seed, verbose);
  void random;

  console.log('\n==== 知识变现倍率估算（greedy vs blind，§12.2 门槛 ≤1.8×，超 2.0 砍段值） ====');
  console.log(`通关率: ${(greedy.winRate * 100).toFixed(2)}% vs ${(blind.winRate * 100).toFixed(2)}%  （比 ${blind.winRate > 0 ? (greedy.winRate / blind.winRate).toFixed(2) : '∞'}）`);
  console.log(`幕一通过率: ${(greedy.act1Pass * 100).toFixed(2)}% vs ${(blind.act1Pass * 100).toFixed(2)}%  （比 ${blind.act1Pass > 0 ? (greedy.act1Pass / blind.act1Pass).toFixed(2) : '∞'}）`);
  const ratio = blind.avgScore > 0 ? greedy.avgScore / blind.avgScore : Infinity;
  console.log(`平均分数: ${greedy.avgScore.toFixed(0)} vs ${blind.avgScore.toFixed(0)}`);
  console.log(`综合效能比（按平均分数，分数公式已聚合幕数/血/寿元/周天）: ≈ ${Number.isFinite(ratio) ? ratio.toFixed(2) : '∞'}${Number.isFinite(ratio) && ratio > 1.8 ? '  ⚠ 超 1.8×' : ''}`);
}

main();
