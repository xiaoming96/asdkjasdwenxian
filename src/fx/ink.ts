/**
 * 水墨特效层（策划案 §13.4 / §14.1）
 * 全屏叠加 canvas：墨溅（命中）、金色气脉（行云流水）、劫雷白金闪。
 */

interface Blot {
  x: number; y: number; r: number; vr: number; alpha: number; color: string;
}

let canvas: HTMLCanvasElement | null = null;
let cx: CanvasRenderingContext2D | null = null;
let blots: Blot[] = [];
let flashAlpha = 0;
let flashColor = '#fff';
let raf = 0;
// 滞气墨浊（四角向内漫墨，约 180ms 消散，非阻塞）
let murkAlpha = 0;

// 祥云粒子层（§14.1：程序化祥云，主界面/地图缓慢漂浮）
interface Cloud { x: number; y: number; w: number; speed: number; alpha: number }
const clouds: Cloud[] = [];
let cloudsOn = false;

export function setAmbientClouds(on: boolean) {
  if (on === cloudsOn) return;
  cloudsOn = on;
  if (on && clouds.length === 0) {
    for (let i = 0; i < 6; i++) {
      clouds.push({
        x: (i * 631) % (window.innerWidth || 480),
        y: 60 + ((i * 173) % 380),
        w: 90 + ((i * 97) % 130),
        speed: 0.08 + (i % 3) * 0.05,
        alpha: 0.05 + (i % 3) * 0.02,
      });
    }
  }
}

export function initFx(el: HTMLCanvasElement) {
  canvas = el;
  cx = el.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  loop();
}

function resize() {
  if (!canvas) return;
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
}

function loop() {
  raf = requestAnimationFrame(loop);
  if (!canvas || !cx) return;
  cx.clearRect(0, 0, canvas.width, canvas.height);
  const dpr = devicePixelRatio;
  // 祥云层：多个模糊椭圆缓慢横移
  if (cloudsOn) {
    for (const c of clouds) {
      c.x += c.speed;
      if (c.x > (canvas.width / dpr) + c.w) c.x = -c.w;
      const grad = cx.createRadialGradient(c.x * dpr, c.y * dpr, 0, c.x * dpr, c.y * dpr, c.w * dpr);
      grad.addColorStop(0, `rgba(255, 253, 246, ${c.alpha})`);
      grad.addColorStop(1, 'rgba(255, 253, 246, 0)');
      cx.fillStyle = grad;
      cx.beginPath();
      cx.ellipse(c.x * dpr, c.y * dpr, c.w * dpr, c.w * 0.38 * dpr, 0, 0, Math.PI * 2);
      cx.fill();
    }
  }
  // 墨点
  for (const b of blots) {
    cx.globalAlpha = Math.max(0, b.alpha);
    cx.fillStyle = b.color;
    cx.beginPath();
    cx.arc(b.x * dpr, b.y * dpr, b.r * dpr, 0, Math.PI * 2);
    cx.fill();
    b.r += b.vr;
    b.alpha -= 0.035;
  }
  blots = blots.filter((b) => b.alpha > 0);
  // 滞气墨浊：四个屏角的墨色晕染快速漫入又散去（§13.4 滞气 180ms）
  if (murkAlpha > 0) {
    const w = canvas.width;
    const h = canvas.height;
    const rad = Math.max(w, h) * 0.42;
    const corners: [number, number][] = [[0, 0], [w, 0], [0, h], [w, h]];
    for (const [mx, my] of corners) {
      const grad = cx.createRadialGradient(mx, my, 0, mx, my, rad);
      grad.addColorStop(0, `rgba(30, 28, 26, ${murkAlpha})`);
      grad.addColorStop(1, 'rgba(30, 28, 26, 0)');
      cx.globalAlpha = 1;
      cx.fillStyle = grad;
      cx.fillRect(0, 0, w, h);
    }
    murkAlpha -= 0.034; // 0.38 起，60fps 下约 11 帧 ≈ 180ms
  }
  // 全屏闪
  if (flashAlpha > 0) {
    cx.globalAlpha = flashAlpha;
    cx.fillStyle = flashColor;
    cx.fillRect(0, 0, canvas.width, canvas.height);
    flashAlpha -= 0.06;
  }
  cx.globalAlpha = 1;
}

export function stopFx() {
  cancelAnimationFrame(raf);
  window.removeEventListener('resize', resize);
}

/** 墨溅（命中点） */
export function inkSplash(x: number, y: number, color = 'rgba(43,43,43,0.85)') {
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + x * 0.01;
    const d = 6 + ((i * 13) % 22);
    blots.push({
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d,
      r: 3 + ((i * 7) % 9),
      vr: 0.6,
      alpha: 0.8,
      color,
    });
  }
  blots.push({ x, y, r: 12, vr: 1.4, alpha: 0.9, color });
}

/** 劫雷：全屏白金闪 */
export function thunderFlash() {
  flashColor = '#f7ecc8';
  flashAlpha = 0.9;
  document.body.classList.add('shake');
  setTimeout(() => document.body.classList.remove('shake'), 400);
}

/** 行云流水金色涟漪 */
export function goldRipple(x: number, y: number) {
  blots.push({ x, y, r: 8, vr: 2.2, alpha: 0.65, color: 'rgba(184,134,11,0.5)' });
  blots.push({ x, y, r: 4, vr: 1.6, alpha: 0.8, color: 'rgba(184,134,11,0.8)' });
}

/** 得气：鎏金点亮涟漪（v3 §4.4①，得气段点亮瞬间在出牌点绽开） */
export function deqiFlash(x: number, y: number) {
  blots.push({ x, y, r: 5, vr: 2.8, alpha: 0.9, color: 'rgba(255, 219, 112, 0.9)' });
  blots.push({ x, y, r: 12, vr: 2.2, alpha: 0.6, color: 'rgba(216, 168, 32, 0.6)' });
  blots.push({ x, y, r: 20, vr: 1.6, alpha: 0.35, color: 'rgba(184, 134, 11, 0.4)' });
  // 四点金屑外溅
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + y * 0.01;
    blots.push({
      x: x + Math.cos(a) * 18,
      y: y + Math.sin(a) * 18,
      r: 2.5, vr: 0.9, alpha: 0.8,
      color: 'rgba(229, 181, 68, 0.85)',
    });
  }
}

/** 滞气：全屏四角墨浊 180ms（v3 §4.4②，非阻塞演出） */
export function zhiqiInk() {
  murkAlpha = 0.38;
}
