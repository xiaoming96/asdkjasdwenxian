/**
 * 多流种子随机数（策划案 §16.4）
 * 单一局种子派生多条独立 RNG 流，保证"看奖励再读档"无法改变结果，
 * 且每日天机可重放校验。所有随机必须经由本模块取数。
 */

export const RNG_STREAMS = [
  'map',
  'cardReward',
  'shuffle',
  'enemyAI',
  'event',
  'shop',
  'misc',
] as const;

export type RngStream = (typeof RNG_STREAMS)[number];

export type RngState = Record<RngStream, number>;

/** 字符串哈希为 32 位无符号整数（FNV-1a） */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 由局种子派生各流初始状态 */
export function initRngState(seed: string): RngState {
  const base = hashSeed(seed);
  const state = {} as RngState;
  RNG_STREAMS.forEach((stream, i) => {
    state[stream] = (base ^ hashSeed(stream) ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0;
  });
  return state;
}

/** mulberry32：推进一步，返回 [0,1) 与新状态 */
function mulberry32Step(state: number): { value: number; next: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, next };
}

/** 取一个 [0,1) 随机数，返回值与更新后的 RngState（不可变） */
export function rngNext(state: RngState, stream: RngStream): { value: number; state: RngState } {
  const { value, next } = mulberry32Step(state[stream]);
  return { value, state: { ...state, [stream]: next } };
}

/** 取 [min, max] 整数（含端点） */
export function rngInt(
  state: RngState,
  stream: RngStream,
  min: number,
  max: number,
): { value: number; state: RngState } {
  const r = rngNext(state, stream);
  return { value: min + Math.floor(r.value * (max - min + 1)), state: r.state };
}

/** 从数组中取一个元素 */
export function rngPick<T>(
  state: RngState,
  stream: RngStream,
  arr: readonly T[],
): { value: T; state: RngState } {
  const r = rngInt(state, stream, 0, arr.length - 1);
  return { value: arr[r.value], state: r.state };
}

/** 按权重取索引 */
export function rngWeighted(
  state: RngState,
  stream: RngStream,
  weights: readonly number[],
): { value: number; state: RngState } {
  const total = weights.reduce((a, b) => a + b, 0);
  const r = rngNext(state, stream);
  let x = r.value * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x < 0) return { value: i, state: r.state };
  }
  return { value: weights.length - 1, state: r.state };
}

/** Fisher-Yates 洗牌（返回新数组） */
export function rngShuffle<T>(
  state: RngState,
  stream: RngStream,
  arr: readonly T[],
): { value: T[]; state: RngState } {
  const out = [...arr];
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    const r = rngInt(s, stream, 0, i);
    s = r.state;
    [out[i], out[r.value]] = [out[r.value], out[i]];
  }
  return { value: out, state: s };
}

/** 生成一个随机局种子（使用时间与计数器，非游戏内随机） */
let seedCounter = 0;
export function generateRunSeed(): string {
  seedCounter++;
  const t = Date.now().toString(36);
  const c = (hashSeed(t + ':' + seedCounter) % 46656).toString(36).padStart(3, '0');
  return (t + c).toUpperCase();
}
