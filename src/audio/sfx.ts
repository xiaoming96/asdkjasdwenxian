/**
 * 音频（策划案 §15）：Web Audio 合成实现，无外部素材。
 * 行云流水 = 古琴上行单音，按五声（宫商角徵羽）对应五行（土金木火水传统配属）。
 */
import type { Element } from '../core/wuxing';

let ctx: AudioContext | null = null;
let sfxVolume = 0.8;

export function setSfxVolume(v: number) {
  sfxVolume = v;
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.16, delay = 0) {
  const a = ac();
  if (!a || sfxVolume <= 0) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain * sfxVolume, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, gain = 0.12, delay = 0) {
  const a = ac();
  if (!a || sfxVolume <= 0) return;
  const t0 = a.currentTime + delay;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.sin(i * 12.9898) * 43758.5453) % 1 * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const g = a.createGain();
  g.gain.setValueAtTime(gain * sfxVolume, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(g).connect(a.destination);
  src.start(t0);
}

/** 五声音高（宫商角徵羽 → 土金木火水），C 宫调 */
const WUSHENG: Record<Element, number> = {
  earth: 261.63, // 宫 C4
  metal: 293.66, // 商 D4
  wood: 329.63, // 角 E4
  fire: 392.0, // 徵 G4
  water: 440.0, // 羽 A4
};

export const sfx = {
  /** 出牌：纸滑 */
  playCard() {
    noise(0.08, 0.06);
  },
  /** 攻击命中：钝击 */
  hit() {
    tone(110, 0.12, 'square', 0.1);
    noise(0.1, 0.1);
  },
  /** 护体：石磨低音 */
  block() {
    tone(80, 0.2, 'sine', 0.14);
  },
  /** 行云流水：古琴上行单音（按五行音高） */
  liushui(el: Element) {
    tone(WUSHENG[el], 0.5, 'triangle', 0.2);
    tone(WUSHENG[el] * 2, 0.35, 'sine', 0.06, 0.02);
  },
  /** 五行周天：五音琶音 + 磬 */
  zhoutian() {
    const seq: Element[] = ['wood', 'fire', 'earth', 'metal', 'water'];
    seq.forEach((el, i) => tone(WUSHENG[el] * 2, 0.3, 'triangle', 0.14, i * 0.09));
    tone(1046.5, 0.9, 'sine', 0.1, 0.5);
  },
  /** 相克触发：铜磬点 */
  keZhi() {
    tone(880, 0.25, 'triangle', 0.12);
    tone(1320, 0.18, 'sine', 0.05, 0.03);
  },
  /** 抽牌 */
  draw() {
    noise(0.05, 0.04);
  },
  /** 丹药：瓷瓶开塞 */
  potion() {
    tone(600, 0.06, 'square', 0.06);
    tone(300, 0.15, 'sine', 0.1, 0.06);
  },
  /** 灵石：铜钱串 */
  gold() {
    tone(1200, 0.08, 'square', 0.05);
    tone(1500, 0.08, 'square', 0.05, 0.06);
  },
  /** 回合开始：木鱼一声 */
  turnStart() {
    tone(220, 0.09, 'square', 0.12);
  },
  /** 劫雷：雷暴 + 锣 */
  thunder() {
    noise(0.7, 0.25);
    tone(60, 0.8, 'sawtooth', 0.16, 0.02);
    tone(150, 1.0, 'sine', 0.1, 0.1);
  },
  /** 敌人死亡：琴弦 */
  enemyDie() {
    tone(200, 0.3, 'sawtooth', 0.06);
    noise(0.25, 0.06);
  },
  /** 胜利：编钟三音 */
  victory() {
    tone(523.25, 0.5, 'sine', 0.14, 0);
    tone(659.25, 0.5, 'sine', 0.14, 0.22);
    tone(783.99, 0.8, 'sine', 0.14, 0.44);
  },
  /** 死亡：琴弦崩断 */
  defeat() {
    tone(300, 0.08, 'sawtooth', 0.16);
    tone(90, 1.2, 'sine', 0.14, 0.08);
  },
  /** UI 点击 */
  click() {
    tone(700, 0.04, 'square', 0.04);
  },
  /** 突破：梵钟 */
  breakthrough() {
    tone(174.61, 2.0, 'sine', 0.2);
    tone(349.23, 1.4, 'sine', 0.08, 0.05);
  },
};
