/**
 * BGM（策划案 §15.1 场景分配的程序化实现）
 * 按 AGENTS.md 素材规则：音频调研文档白名单不在仓库、外部音乐包授权无法逐项核实，
 * v1 采用 Web Audio 程序化合成的古琴风环境音乐（宫商角徵羽五声音阶），零授权风险；
 * 正式版可按《素材调研-音频素材.md》白名单替换为成品曲目。
 *
 * 场景：menu 空灵 / map 清雅 / battle 渐紧 / boss 鼓点压迫 / jie 低音威压。
 */

export type BgmScene = 'off' | 'menu' | 'map' | 'battle' | 'boss' | 'jie';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let delaySend: GainNode | null = null;
let volume = 0.6;
let scene: BgmScene = 'off';
let timer: ReturnType<typeof setInterval> | null = null;
let step = 0;

/** 独立小型 LCG（禁止 Math.random；BGM 属 UI 层，无需游戏 RNG 流） */
let lcg = 0x2f6e2b1;
function rand(): number {
  lcg = (Math.imul(lcg, 48271) + 11) >>> 0;
  return lcg / 4294967296;
}

function ensureCtx(): boolean {
  if (typeof window === 'undefined') return false;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = volume * 0.5;
      master.connect(ctx.destination);
      // 简易山谷回声：反馈延迟
      const delay = ctx.createDelay(2);
      delay.delayTime.value = 0.45;
      const fb = ctx.createGain();
      fb.gain.value = 0.35;
      const wet = ctx.createGain();
      wet.gain.value = 0.4;
      delay.connect(fb).connect(delay);
      delay.connect(wet).connect(master);
      delaySend = ctx.createGain();
      delaySend.connect(delay);
    } catch {
      return false;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return true;
}

/** 五声音阶（C 宫）：宫 商 角 徵 羽 */
const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0];
/** 低沉变体（羽调式感觉，用于幕三/劫战） */
const PENTA_DARK = [220.0, 261.63, 293.66, 329.63, 392.0];

/** 古琴风拨弦：基频 + 泛音，指数衰减，轻微滑音 */
function pluck(freq: number, when: number, dur = 2.6, gain = 0.22, dark = false) {
  if (!ctx || !master || !delaySend) return;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = dark ? 1200 : 2200;
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq * 0.985, t);
  osc.frequency.exponentialRampToValueAtTime(freq, t + 0.06); // 上滑入音
  osc2.type = 'sine';
  osc2.frequency.value = freq * 2.005; // 轻微失谐泛音
  const g2 = ctx.createGain();
  g2.gain.value = 0.25;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(lp);
  osc2.connect(g2).connect(lp);
  lp.connect(g);
  g.connect(master);
  g.connect(delaySend);
  osc.start(t); osc.stop(t + dur + 0.1);
  osc2.start(t); osc2.stop(t + dur + 0.1);
}

/** 低鼓（boss/jie 用） */
function drum(when: number, gain = 0.3) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(90, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.25);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  osc.connect(g).connect(master);
  osc.start(t); osc.stop(t + 0.6);
}

/** 每拍调度：按场景决定密度与音域 */
function tick() {
  if (!ctx || scene === 'off') return;
  step += 1;
  const dark = scene === 'jie' || scene === 'boss';
  const scale = dark ? PENTA_DARK : PENTA;

  switch (scene) {
    case 'menu': // 空灵：稀疏高音区，长回声
      if (rand() < 0.55) {
        const n = scale[Math.floor(rand() * 5)] * (rand() < 0.3 ? 2 : 1);
        pluck(n, 0, 3.4, 0.16);
      }
      break;
    case 'map': // 清雅：中速中音区，偶尔双音
      if (rand() < 0.75) {
        const n = scale[Math.floor(rand() * 5)];
        pluck(n, 0, 2.6, 0.18);
        if (rand() < 0.25) pluck(n * 1.5, 0.28, 2.0, 0.1);
      }
      break;
    case 'battle': // 渐紧：更密，低八度衬底
      if (step % 4 === 0) pluck(scale[0] / 2, 0, 3.0, 0.14);
      if (rand() < 0.85) pluck(scale[Math.floor(rand() * 5)], rand() * 0.2, 1.8, 0.17);
      break;
    case 'boss': // 鼓点 + 中低音
      if (step % 2 === 0) drum(0, 0.26);
      if (rand() < 0.7) pluck(scale[Math.floor(rand() * 5)], 0.1, 1.6, 0.15, true);
      break;
    case 'jie': // 威压：慢鼓 + 低音长音
      if (step % 2 === 0) drum(0, 0.34);
      if (step % 4 === 1) pluck(scale[Math.floor(rand() * 3)] / 2, 0, 4.0, 0.2, true);
      if (rand() < 0.4) pluck(scale[Math.floor(rand() * 5)], 0.3, 1.6, 0.12, true);
      break;
  }
}

function beatMs(): number {
  switch (scene) {
    case 'menu': return 2400;
    case 'map': return 1500;
    case 'battle': return 900;
    case 'boss': return 750;
    case 'jie': return 800;
    default: return 1500;
  }
}

export function setBgmScene(next: BgmScene) {
  if (next === scene) return;
  scene = next;
  step = 0;
  if (timer) { clearInterval(timer); timer = null; }
  if (next === 'off' || volume <= 0) return;
  if (!ensureCtx()) return;
  timer = setInterval(tick, beatMs());
  tick();
}

export function setBgmVolume(v: number) {
  volume = v;
  if (master && ctx) master.gain.linearRampToValueAtTime(v * 0.5, ctx.currentTime + 0.3);
  if (v <= 0) {
    if (timer) { clearInterval(timer); timer = null; }
  } else if (!timer && scene !== 'off' && ensureCtx()) {
    timer = setInterval(tick, beatMs());
  }
}

/** 浏览器自动播放策略：首次用户交互后启动 */
export function unlockBgm() {
  if (scene !== 'off' && ensureCtx() && !timer && volume > 0) {
    timer = setInterval(tick, beatMs());
  }
}
