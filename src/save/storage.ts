/**
 * 存档（策划案 §16.5）
 * profile 与 run 分 key 存 localStorage；带 schemaVersion，损坏时保留 profile 丢弃 run。
 */
import type { Profile, RunState } from '../core/types';

export const SCHEMA_VERSION = 1;
const PROFILE_KEY = 'wcs_profile';
const RUN_KEY = 'wcs_run';

export function defaultProfile(): Profile {
  return {
    schemaVersion: SCHEMA_VERSION,
    daowei: 0,
    unlocked: ['cangjinge'],
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
    settings: { music: 0.6, sfx: 0.8 },
  };
}

/** 版本迁移函数表：schemaVersion n → n+1 */
const PROFILE_MIGRATIONS: Record<number, (p: Record<string, unknown>) => void> = {};
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
