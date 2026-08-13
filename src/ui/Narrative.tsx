/** 叙事演出（策划案 §3.3）：开局卷轴、幕标题页、Boss 战前对白 */
import { useEffect, useState } from 'preact/hooks';
import type { RunState } from '../core/types';

/** 开局竖排卷轴文本（§3.1 背景 v3，可跳过） */
export function IntroScroll(props: { onDone: () => void }) {
  return (
    <div class="narrative-overlay" onClick={props.onDone}>
      <div class="intro-scroll">
        <div class="intro-text">
          <p>上古天倾，仙路断绝三千年。</p>
          <p>凡间灵气稀薄，凡人寿不过百。</p>
          <p>你是一名无门无派的散修，</p>
          <p>年过不惑，方于上古遗迹中拾得残卷《问长生》。</p>
          <p>此时，你只余六十载寿元。</p>
          <p>卷首只有一句话：</p>
          <p class="intro-quote">「仙路已断？以身问之。」</p>
        </div>
      </div>
      <button class="narrative-skip">轻触继续 ▸</button>
    </div>
  );
}

const ACT_TITLES = ['第 一 幕', '第 二 幕', '第 三 幕'];
const ACT_SUBS = ['炼气 · 筑基', '筑基 · 金丹', '金丹 · 飞升'];
const ACT_QUOTES = ['仙路已断？以身问之。', '心中魔，最难渡。', '雷霆雨露，俱是天恩。'];

/** 幕标题页：篆书大字 + 幕引，自动 2.4s 或轻触跳过 */
export function ActTitle(props: { act: 1 | 2 | 3; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(props.onDone, 2400);
    return () => clearTimeout(t);
  }, []);
  return (
    <div class="narrative-overlay act-title" onClick={props.onDone}>
      <div class="act-big">{ACT_TITLES[props.act - 1]}</div>
      <div class="act-sub">{ACT_SUBS[props.act - 1]}</div>
      <div class="act-quote">「{ACT_QUOTES[props.act - 1]}」</div>
    </div>
  );
}

/**
 * 本幕 Boss 战前引子（纯函数，§3.3：心魔劫引用玩家本局的贪婪记录，道雷引用业力）。
 * 是否/何处调用由战斗界面集成方决定；按 run.act 区分三场大劫：
 *   幕一 筑基雷劫 / 幕二 金丹心魔劫 / 幕三 飞升·九重天劫（道雷）。
 */
export function bossIntroLine(run: RunState): string {
  if (run.act === 1) {
    return '「筑基者，问天之始。三道雷落，尔能承否？」';
  }
  if (run.act === 2) {
    // 金丹心魔劫：按本局贪婪记录点名（赌石/砸神像/服丹/心魔账）
    const greeds: string[] = [];
    if (Object.keys(run.flags).some((k) => k.toLowerCase().includes('dushi'))) {
      greeds.push('在赌石摊前一掷千金');
    }
    if (run.flags['zashen']) greeds.push('亲手砸碎了神像');
    if (run.stats.elixirsUsed >= 6) greeds.push(`吞下了 ${run.stats.elixirsUsed} 枚丹药`);
    if (run.demon <= 0 && greeds.length === 0) {
      return '「你竟无贪无嗔？那我……又是从你心底哪一寸长出来的？」';
    }
    if (greeds.length > 0) {
      return `「你${greeds.join('，')}，就为了多活几年？心魔已记 ${run.demon} 笔，一笔一笔，同你清算。」`;
    }
    return `「走捷径的每一步，天道都记着。心魔 ${run.demon}——账，今日清。」`;
  }
  // 幕三 飞升·九重天劫：道雷按业力清算（§11.1：业力 ≥4 道雷强化）
  if (run.karma >= 4) {
    return `「你携前世因果闯此天门。业力 ${run.karma} 重，第九道雷，天道亲自执笔。」`;
  }
  if (run.karma > 0) {
    return `「宿慧随身，业力 ${run.karma} 重。九霄雷动，先偿旧债，再问长生。」`;
  }
  return '「一身清净，无债无欠。九雷过后，便是长生。」';
}

/** Boss 战前对白（多句版，心魔引用本局数据，§3.3/§8.7） */
export function bossDialogue(run: RunState, bossId: string): string[] {
  switch (bossId) {
    case 'leiling_kuilei':
      return ['雷云翻涌，傀儡的双目亮起电光。', bossIntroLine({ ...run, act: 1 })];
    case 'xinmo': {
      return [
        bossIntroLine({ ...run, act: 2 }),
        '黑雾凝成你的模样，缓缓拔剑。「别怕。我，即是你。」',
      ];
    }
    default:
      return ['九霄雷动，天门轰然洞开。', bossIntroLine({ ...run, act: 3 })];
  }
}

export function BossDialogue(props: { lines: string[]; onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const last = idx >= props.lines.length - 1;
  return (
    <div
      class="narrative-overlay boss-dialogue"
      onClick={() => (last ? props.onDone() : setIdx(idx + 1))}
    >
      <div class="dialogue-box">
        <p>{props.lines[idx]}</p>
        <span class="dialogue-next">{last ? '▸ 开战' : '▸ 继续'}</span>
      </div>
    </div>
  );
}
