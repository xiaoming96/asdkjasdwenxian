/** 地图界面（策划案 §13.2 #2：手卷式纵向滚动） */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Action, MapNode, NodeType, RunState } from '../core/types';
import { selectableNodes } from '../core/map';
import { actBg } from './art';

const NODE_ICON: Record<NodeType, string> = {
  battle: '⚔', elite: '💀', event: '🏮', shop: '🛖', cave: '🧘', boss: '👑', unknown: '❓',
};
const NODE_LABEL: Record<NodeType, string> = {
  battle: '妖兽', elite: '精英', event: '奇遇', shop: '坊市', cave: '洞府', boss: '天劫', unknown: '未知',
};

const ACT_TITLES = ['第一幕 · 炼气→筑基', '第二幕 · 筑基→金丹', '第三幕 · 金丹→飞升'];
const ACT_QUOTES = ['仙路已断？以身问之。', '心中魔，最难渡。', '雷霆雨露，俱是天恩。'];

export function MapScreen(props: { run: RunState; dispatch: (a: Action) => void }) {
  const { run, dispatch } = props;
  const selectable = selectableNodes(run);
  const hasLuopan = run.relics.includes('luopan');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function tapNode(n: MapNode) {
    if (selectable.includes(n.id)) {
      dispatch({ t: 'CHOOSE_NODE', node: n.id });
      return;
    }
    // 不可达节点：给出提示（只能走与当前位置相连的下一层）
    setHint(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(false), 1800);
  }

  useEffect(() => {
    // 初始滚动到当前位置附近（底部为起点）
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    if (run.floor >= 0) {
      const ratio = 1 - (run.floor + 1) / run.map.layers.length;
      el.scrollTop = el.scrollHeight * ratio - el.clientHeight / 2;
    }
  }, [run.floor]);

  function nodeCls(n: MapNode): string {
    const cls = ['map-node'];
    if (selectable.includes(n.id)) cls.push('selectable');
    if (n.id === run.nodeId) cls.push('current');
    else if (n.layer < run.floor) cls.push('visited');
    return cls.join(' ');
  }

  function display(n: MapNode): NodeType {
    if (n.type === 'unknown' && hasLuopan && n.revealedType) return n.revealedType;
    return n.type;
  }

  return (
    <div
      class="map-scroll fade-in"
      ref={scrollRef}
      style={{ backgroundImage: `linear-gradient(rgba(244,239,230,0.72), rgba(244,239,230,0.8)), url(${actBg(run.act)})`, backgroundSize: 'cover', backgroundPosition: 'center top' }}
    >
      <div class="map-act-title">{ACT_TITLES[run.act - 1]}</div>
      <div class="map-act-sub">「{ACT_QUOTES[run.act - 1]}」 · 种子 {run.seed}</div>
      <div class="map-layers">
        {run.map.layers.map((row, li) => (
          <div key={li} class="map-row">
            {row.map((n) => (
              <div
                key={n.id}
                class={nodeCls(n)}
                onClick={() => tapNode(n)}
              >
                {NODE_ICON[display(n)]}
                <span class="node-label">{NODE_LABEL[display(n)]}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {hint && (
        <div class="map-hint">仙途须循路而行：只能选带红光的相邻节点</div>
      )}
      {run.floor < 0 && (
        <div class="map-hint start-cue">↓ 点击最下方带红光的节点，从此启程</div>
      )}
    </div>
  );
}
