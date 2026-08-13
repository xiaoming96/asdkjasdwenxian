/**
 * 存档（策划案 §16.5）
 * profile 与 run 分 key 存 localStorage；带 schemaVersion，损坏时保留 profile 丢弃 run。
 *
 * v3（SCHEMA_VERSION=3）变更：
 * - Profile 删除 unlocked 字段（v3 无解锁树：道行只涨不花，里程碑按阈值自动解锁，
 *   见 data/milestones.ts computeUnlocked）；新增 legacy 宿慧（§11.1）。
 * - 旧版（schemaVersion < 3）的局内存档与 v3 引擎字段完全不兼容，直接丢弃；
 *   profile 照常迁移保留（道行/成就/图鉴/道号谱均不丢失）。
 */
import type { Profile, RunState } from '../core/types';

export const SCHEMA_VERSION = 3;
const PROFILE_KEY = 'wcs_profile';
const RUN_KEY = 'wcs_run';

export function defaultProfile(): Profile {
  return {
    schemaVersion: SCHEMA_VERSION,
    daowei: 0,
    achievements: [],
    runsTotal: 0,
    wins: 0,
    maxAscensionCleared: -1,
    seenCards: [],
    seenRelics: [],
    seenEnemies: [],
    daohaoList: [],
    totalDaoweiEarned: 0,
    winsByChar: {},
    legacy: { kind: null, karma: 0 },
    settings: { music: 0.6, sfx: 0.8 },
  };
}

/**
 * Profile 版本迁移函数表：schemaVersion n → n+1，链式执行。
 * v1/v2 → v3：删除解锁树字段 unlocked，保留 daowei/成就/图鉴/runsTotal/道号谱等；
 * 缺省 legacy。v2 的 daowei 是可花费的余额（buyUnlock 会扣减），而 v3 道行只涨不花，
 * 故迁移时以 totalDaoweiEarned（历史总入账）回填，取两者较大值。
 */
const PROFILE_MIGRATIONS: Record<number, (p: Record<string, unknown>) => void> = {
  // v0（无版本号的最早期档）→ v1：无结构变化
  0: () => {},
  // v1 → v2：无结构变化（占位直通）
  1: () => {},
  // v2 → v3：解锁树 → 里程碑自动解锁 + 宿慧
  2: (p) => {
    delete p.unlocked;
    const daowei = typeof p.daowei === 'number' ? p.daowei : 0;
    const earned = typeof p.totalDaoweiEarned === 'number' ? p.totalDaoweiEarned : 0;
    p.daowei = Math.max(daowei, earned);
    if (!p.legacy) p.legacy = { kind: null, karma: 0 };
  },
};

/**
 * Run 版本迁移函数表：仅供 ≥3 的未来版本使用；
 * schemaVersion < 3 的旧局不迁移，在 loadRun 中直接丢弃（return null 路径）。
 */
const RUN_MIGRATIONS: Record<number, (r: Record<string, unknown>) => void> = {};

function hasStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function loadProfile(): Profile {
  if (!hasStorage()) return defaultProfile();
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return defaultProfile();
    const data = JSON.parse(raw) as Profile & Record<string, unknown>;
    let v = data.schemaVersion ?? 0;
    while (v < SCHEMA_VERSION) {
      PROFILE_MIGRATIONS[v]?.(data);
      v += 1;
      data.schemaVersion = v;
    }
    return { ...defaultProfile(), ...data };
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(p: Profile) {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    // 存储满/隐私模式：静默失败
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** 局存档：每个 Action 后调用，节流 300ms（§16.5） */
export function saveRunThrottled(run: RunState | null) {
  if (!hasStorage()) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveRunNow(run), 300);
}

export function saveRunNow(run: RunState | null) {
  if (!hasStorage()) return;
  try {
    if (!run || run.over) localStorage.removeItem(RUN_KEY);
    else localStorage.setItem(RUN_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, run }));
  } catch {
    // 静默失败
  }
}

export function loadRun(): RunState | null {
  if (!hasStorage()) return null;
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { schemaVersion: number; run: RunState } & Record<string, unknown>;
    let v = data.schemaVersion ?? 0;
    // v3 引擎与旧局字段不兼容：旧局丢弃，profile 照常保留
    if (v < 3) {
      console.info('旧版仙途已随天地大变化去，来世重修');
      try { localStorage.removeItem(RUN_KEY); } catch { /* 忽略 */ }
      return null;
    }
    while (v < SCHEMA_VERSION) {
      RUN_MIGRATIONS[v]?.(data);
      v += 1;
    }
    if (!data.run || !data.run.seed) return null;
    return data.run;
  } catch {
    // 损坏：丢弃 run，保留 profile
    try { localStorage.removeItem(RUN_KEY); } catch { /* 忽略 */ }
    return null;
  }
}

export function clearRun() {
  if (!hasStorage()) return;
  try { localStorage.removeItem(RUN_KEY); } catch { /* 忽略 */ }
}
