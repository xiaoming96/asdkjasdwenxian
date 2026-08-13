/**
 * 晒战绩分享图（策划案 §13.2 #8：1080×1920）
 * Canvas 绘制后触发下载，无外部依赖。
 * v3：统计新增 余寿 X 载 / 心魔 N / 道号 三条。
 */
import type { RunState } from '../core/types';
import { getCard } from '../data/cards';

const EL_NAMES: Record<string, string> = {
  metal: '金', wood: '木', water: '水', fire: '火', earth: '土', none: '无',
};
const EL_COLORS: Record<string, string> = {
  metal: '#b8860b', wood: '#3f7d3a', water: '#3b5b7a', fire: '#c3272b', earth: '#8b6b3d', none: '#555555',
};

export function makeShareImage(run: RunState): void {
  const s = run.screen;
  if (s.kind !== 'end') return;
  const W = 1080, H = 1920;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;

  // 宣纸底
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#f7f2e5');
  bg.addColorStop(1, '#ece4cf');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // 边框
  g.strokeStyle = '#2b2b2b';
  g.lineWidth = 8;
  g.strokeRect(40, 40, W - 80, H - 80);
  g.strokeStyle = 'rgba(184,134,11,0.6)';
  g.lineWidth = 3;
  g.strokeRect(58, 58, W - 116, H - 116);

  g.textAlign = 'center';
  g.fillStyle = '#2b2b2b';
  g.font = 'bold 120px "Kaiti SC", KaiTi, serif';
  g.fillText('问 长 生', W / 2, 250);

  // 朱砂印章
  g.save();
  g.translate(W - 200, 320);
  g.rotate(0.08);
  g.fillStyle = '#c3272b';
  g.fillRect(-60, -60, 120, 120);
  g.fillStyle = '#f4efe6';
  g.font = 'bold 44px "Kaiti SC", KaiTi, serif';
  g.fillText(s.victory ? '飞升' : '道消', 0, 16);
  g.restore();

  g.font = 'bold 64px "Kaiti SC", KaiTi, serif';
  g.fillStyle = s.victory ? '#b8860b' : '#4a5568';
  g.fillText(s.victory ? '白 日 飞 升' : '生 平 卷 轴', W / 2, 420);

  if (s.daohao) {
    g.fillStyle = '#c3272b';
    g.font = 'bold 76px "Kaiti SC", KaiTi, serif';
    g.fillText(`道号 · ${s.daohao}`, W / 2, 540);
  }
  g.fillStyle = '#555';
  g.font = '40px "Kaiti SC", KaiTi, serif';
  g.fillText(s.cause, W / 2, s.daohao ? 630 : 540);

  // 统计（v3：余寿 / 心魔 / 道号 三条入列）
  const rows: [string, string][] = [
    ['行至', `第${['一', '二', '三'][run.act - 1]}幕 · 第 ${run.floor + 1} 层`],
    ['斩妖', `${run.flags['kills'] ?? 0}`],
    ['精英 / 天劫', `${run.stats.elitesKilled} / ${run.stats.bossesKilled}`],
    ['周天次数', `${run.flags['zhoutianTotal'] ?? 0}`],
    ['服丹', `${run.stats.elixirsUsed} 枚`],
    ['余寿', `${Math.max(0, run.lifespan)} 载`],
    ['心魔', `${run.demon}`],
    ['道号', s.daohao ?? '——'],
    ['分数', `${s.score}`],
    ['道行', `+${s.daowei}`],
    ['种子', run.seed],
  ];
  let y = 720;
  const rowH = 80;
  g.font = '42px "Kaiti SC", KaiTi, serif';
  for (const [k, v] of rows) {
    g.textAlign = 'left';
    g.fillStyle = '#6b6154';
    g.fillText(k, 160, y);
    g.textAlign = 'right';
    g.fillStyle = k === '道号' && s.daohao ? '#c3272b' : '#2b2b2b';
    g.fillText(v, W - 160, y);
    g.strokeStyle = 'rgba(43,43,43,0.18)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(160, y + 20);
    g.lineTo(W - 160, y + 20);
    g.stroke();
    y += rowH;
  }

  // 卡组五行分布
  const counts: Record<string, number> = {};
  for (const c of run.deck) {
    const el = getCard(c.cardId).element;
    counts[el] = (counts[el] ?? 0) + 1;
  }
  g.textAlign = 'center';
  g.fillStyle = '#6b6154';
  g.font = '40px "Kaiti SC", KaiTi, serif';
  g.fillText(`最终卡组 ${run.deck.length} 张`, W / 2, y + 40);
  const els = Object.entries(counts).filter(([, n]) => n > 0);
  const total = run.deck.length || 1;
  let x = 160;
  const barY = y + 90, barW = W - 320, barH = 46;
  for (const [el, n] of els) {
    const w = (n / total) * barW;
    g.fillStyle = EL_COLORS[el];
    g.fillRect(x, barY, w, barH);
    if (w > 60) {
      g.fillStyle = '#f4efe6';
      g.font = 'bold 30px "Kaiti SC", KaiTi, serif';
      g.fillText(`${EL_NAMES[el]}${n}`, x + w / 2, barY + 33);
    }
    x += w;
  }

  g.fillStyle = '#8a7f6c';
  g.font = '34px "Kaiti SC", KaiTi, serif';
  g.fillText('修仙肉鸽卡牌 · 五行相生相克 · 一局一世', W / 2, H - 130);

  // 下载
  const a = document.createElement('a');
  a.download = `问长生_${s.victory ? '飞升' : '战报'}_${run.seed}.png`;
  a.href = cv.toDataURL('image/png');
  a.click();
}
