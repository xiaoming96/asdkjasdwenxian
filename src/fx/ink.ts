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
