/** 叙事演出（策划案 §3.3）：开局卷轴、幕标题页、Boss 战前对白 */
import { useEffect, useState } from 'preact/hooks';
import type { RunState } from '../core/types';

/** 开局竖排卷轴文本（§3.1 背景，可跳过） */
export function IntroScroll(props: { onDone: () => void }) {
  return (
    <div class="narrative-overlay" onClick={props.onDone}>
      <div class="intro-scroll">
        <div class="intro-text">
          <p>上古天倾，仙路断绝三千年。</p>
          <p>凡间灵气稀薄，修士寿不过三百，止步金丹。</p>
          <p>你是一名无门无派的散修，</p>
          <p>于上古遗迹中拾得残卷《问长生》，</p>
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

/** Boss 战前对白（心魔引用本局数据，§3.3/§8.7） */
export function bossDialogue(run: RunState, bossId: string): string[] {
  switch (bossId) {
    case 'leiling_kuilei':
      return ['雷云翻涌，傀儡的双目亮起电光。', '「筑基者，问天之始。三道雷落，尔能承否？」'];
    case 'xinmo': {
      const kills = run.flags['kills'] ?? 0;
      const upgraded = run.stats.cardsUpgraded;
      return [
        `「你杀了 ${kills} 只妖，参悟了 ${upgraded} 门功法，就为了多活几年？」`,
        '黑雾凝成你的模样，缓缓拔剑。「别怕。我，即是你。」',
      ];
    }
    default:
      return ['九霄雷动，天门轰然洞开。', '「渡此九劫，白日飞升。陨于此地，道消身殒。」'];
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
