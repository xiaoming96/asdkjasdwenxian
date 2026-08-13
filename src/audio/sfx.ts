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

/**
 * 带滑音/低通的合成音（水滴、心跳、浊弦、气泡等的通用底层）。
 * f0→f1 指数滑频；lowpass 可选，用于"闷"的音色。
 */
function glide(opts: {
  f0: number;
  f1?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  lowpass?: number;
  attack?: number;
}) {
  const a = ac();
  if (!a || sfxVolume <= 0) return;
  const { f0, f1 = f0, dur, type = 'sine', gain = 0.14, delay = 0, lowpass, attack = 0.008 } = opts;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur * 0.6);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain * sfxVolume, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let head: AudioNode = osc;
  if (lowpass) {
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = lowpass;
    osc.connect(lp);
    head = lp;
  }
  head.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/**
 * 滤波噪声扫频（布响、风声、金属噪声）：确定性伪噪声（同 noise()，禁 Math.random），
 * 经带通滤波，中心频率 f0→f1 扫动。
 */
function noiseSweep(opts: {
  dur: number;
  f0: number;
  f1?: number;
  q?: number;
  gain?: number;
  delay?: number;
}) {
  const a = ac();
  if (!a || sfxVolume <= 0) return;
  const { dur, f0, f1 = f0, q = 1.2, gain = 0.14, delay = 0 } = opts;
  const t0 = a.currentTime + delay;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.sin(i * 12.9898) * 43758.5453) % 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) bp.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain * sfxVolume, t0 + dur * 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp).connect(g).connect(a.destination);
  src.start(t0);
}

/** 漏刻水滴：正弦下滑点 + 两声渐弱回声（短混响感） */
function drip(gain = 0.16, delay = 0) {
  glide({ f0: 1400, f1: 620, dur: 0.09, gain, delay });
  glide({ f0: 1400, f1: 620, dur: 0.08, gain: gain * 0.4, delay: delay + 0.13 });
  glide({ f0: 1400, f1: 620, dur: 0.07, gain: gain * 0.16, delay: delay + 0.26 });
}

/** 低频闷跳（心跳/闷鼓的单击） */
function thump(gain = 0.2, delay = 0, f0 = 95, f1 = 42, dur = 0.22) {
  glide({ f0, f1, dur, gain, delay, lowpass: 220 });
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

  // ===== v3 新增（策划案 §15.2 音效事件表） =====

  /** 得气：对应行的五声单音，比行云流水更"点亮"（叠 2/3 次高频泛音） */
  deqi(el: Element) {
    const f = WUSHENG[el];
    tone(f, 0.45, 'triangle', 0.18);
    tone(f * 2, 0.3, 'sine', 0.09, 0.01);
    tone(f * 3, 0.22, 'sine', 0.05, 0.02);
  },
  /** 滞气：浊弦一声（低频闷弦 + 快速衰减） */
  zhiqi() {
    glide({ f0: 98, f1: 92, dur: 0.28, type: 'sawtooth', gain: 0.16, lowpass: 320 });
    glide({ f0: 196, f1: 180, dur: 0.14, type: 'triangle', gain: 0.06, lowpass: 400, delay: 0.01 });
  },
  /** 克伐：铜磬点 + 短金属噪声 */
  kefa() {
    tone(880, 0.22, 'triangle', 0.12);
    tone(1320, 0.16, 'sine', 0.05, 0.02);
    noiseSweep({ dur: 0.12, f0: 3200, f1: 2200, q: 3, gain: 0.08, delay: 0.01 });
  },
  /** 袖藏：布帛收拢（滤波噪声短扫，由高到低） */
  sleeve() {
    noiseSweep({ dur: 0.22, f0: 2600, f1: 700, q: 0.9, gain: 0.1 });
  },
  /** 炼丹：咕嘟气泡两声 + 瓷响 */
  brew() {
    glide({ f0: 260, f1: 640, dur: 0.09, gain: 0.13 });
    glide({ f0: 220, f1: 560, dur: 0.1, gain: 0.13, delay: 0.16 });
    tone(1800, 0.18, 'sine', 0.06, 0.32);
  },
  /** 寿元扣减：漏刻水滴（正弦点 + 短混响感） */
  lifespan() {
    drip(0.14);
  },
  /** 心魔+1：闷心跳一声（低频双跳，咚-哒） */
  demonUp() {
    thump(0.22, 0, 100, 44);
    thump(0.15, 0.19, 82, 40, 0.18);
  },
  /** 心斋-1：木鱼一声 */
  demonDown() {
    glide({ f0: 620, f1: 480, dur: 0.07, type: 'square', gain: 0.08, lowpass: 1200 });
    tone(240, 0.1, 'sine', 0.1, 0.005);
  },
  /** 丹毒过阈：心口闷鼓 */
  toxin() {
    thump(0.26, 0, 72, 34, 0.34);
    noiseSweep({ dur: 0.16, f0: 180, f1: 90, q: 0.8, gain: 0.07, delay: 0.02 });
  },
  /** 坐化：漏刻最后一滴 + 磬余韵（约 1.2s） */
  zuohua() {
    drip(0.16);
    tone(523.25, 0.95, 'sine', 0.12, 0.28);
    tone(1046.5, 0.7, 'sine', 0.05, 0.3);
  },
  /** 御空：风声掠过（噪声扫频 0.6s，先扬后抑） */
  fly() {
    noiseSweep({ dur: 0.34, f0: 400, f1: 1600, q: 0.7, gain: 0.12 });
    noiseSweep({ dur: 0.28, f0: 1600, f1: 500, q: 0.7, gain: 0.1, delay: 0.32 });
  },
  /** 服丹：瓷瓶开塞（potion 别名） */
  elixir() {
    sfx.potion();
  },
};
