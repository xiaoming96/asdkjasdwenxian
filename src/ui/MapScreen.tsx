/**
 * 舆图（策划案 v3 §9.1–§9.3：行脚赶路式地图）
 * - 节点 = 地标（图标 + 竖排地名），当前位置立行脚小人
 * - 边 = 山径（SVG 曲线，标注寿元年数；耗时越长越迂回），走过的路朱砂描线
 * - 御空/缩地：筑基/金丹解锁，点按钮进入御空模式，隔层节点泛蓝可点
 * 布局沿用纵向卷轴 column-reverse（起点在底部），滚动定位逻辑保留。
 */
import './map.css';
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Action, MapEdge, MapNode, NodeType, RunState } from '../core/types';
import { selectableNodes } from '../core/map';
import { actBg } from './art';
// game-icons.net 图标（CC BY 3.0，§14.1 白名单来源，署名见 CREDITS）
import iconBattle from './icons/battle.svg?raw';
import iconElite from './icons/elite.svg?raw';
import iconEvent from './icons/event.svg?raw';
import iconShop from './icons/shop.svg?raw';
import iconCave from './icons/cave.svg?raw';
import iconBoss from './icons/boss.svg?raw';
import iconUnknown from './icons/unknown.svg?raw';

// 灵田药草图标：原创代码绘制（遵守 AGENTS.md 素材规则）
const iconField =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
  + '<path fill="currentColor" d="M244 484c0-118 4-186 12-288 8 102 12 170 12 288z"/>'
  + '<path fill="currentColor" d="M250 348C150 338 88 276 68 184c102 12 168 74 182 164z"/>'
  + '<path fill="currentColor" d="M262 348c100-10 162-72 182-164-102 12-168 74-182 164z"/>'
  + '<path fill="currentColor" d="M256 214c-42-42-42-110 0-158 42 48 42 116 0 158z"/>'
  + '</svg>';

// 行脚小人（斗笠 + 蓑衣 + 竹杖）：原创代码绘制
const TRAVELER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
  + '<line x1="47" y1="16" x2="47" y2="60" stroke="#6b4a2a" stroke-width="3" stroke-linecap="round"/>'
  + '<path d="M20 60 Q22 34 32 27 Q42 34 44 60 Z" fill="#2b2b2b"/>'
  + '<path d="M27 29 Q32 24 37 29 L37 33 Q32 30 27 33 Z" fill="#c9a86a"/>'
  + '<path d="M8 26 Q32 2 56 26 Z" fill="#8b6b3d" stroke="#2b2b2b" stroke-width="2" stroke-linejoin="round"/>'
  + '</svg>';

const NODE_ICON: Record<NodeType, string> = {
  battle: iconBattle, elite: iconElite, event: iconEvent, shop: iconShop,
  cave: iconCave, field: iconField, boss: iconBoss, unknown: iconUnknown,
};
const NODE_COLOR: Record<NodeType, string> = {
  battle: '#2b2b2b', elite: '#c3272b', event: '#b8860b', shop: '#8b6b3d',
  cave: '#3f7d3a', field: '#2e8b57', boss: '#c3272b', unknown: '#4a5568',
};
const NODE_LABEL: Record<NodeType, string> = {
  battle: '妖兽', elite: '精英', event: '奇遇', shop: '坊市',
  cave: '洞府', field: '灵田', boss: '天劫', unknown: '秘境',
};

const ACT_TITLES = ['第一幕 · 炼气→筑基', '第二幕 · 筑基→金丹', '第三幕 · 金丹→飞升'];
const ACT_QUOTES = ['仙路已断？以身问之。', '心中魔，最难渡。', '雷霆雨露，俱是天恩。'];
const YEAR_TEXT = ['一年', '二年', '三年'];

// 舆图几何：4 列网格（与 core/map.ts 的 WIDTH 一致）；行高与 map.css 中 .map-row 保持同步
const COLS = 4;
const ROW_H = 104;
const VIEW_W = 400;

/** 节点横向位置（0–1）；Boss 独占一层时居中 */
function fx(n: MapNode): number {
  if (n.type === 'boss') return 0.5;
  return (Math.min(Math.max(n.x, 0), COLS - 1) + 0.5) / COLS;
}

/** 过渡期兼容：core/map.ts 尚未升级 v3 时 edges 可能仍是 string[]（视为 1 年） */
function normEdge(e: MapEdge): { to: string; years: number } {
  const raw = e as unknown as MapEdge | string;
  if (typeof raw === 'string') return { to: raw, years: 1 };
  return { to: raw.to, years: Math.min(3, Math.max(1, raw.years)) };
}

/**
 * 行脚足迹（朱砂描线用）：RunState 不存路径史，UI 层按 seed+act 记录经过的节点。
 * sessionStorage 持久化；中途读档缺失的层留空（该段不描线，仅节点淡显）。
 */
function syncTrail(run: RunState): string[] {
  const key = `wcs_trail:${run.seed}:${run.act}`;
  let trail: string[] = [];
  try {
    const saved = sessionStorage.getItem(key);
    if (saved) trail = JSON.parse(saved) as string[];
  } catch { trail = []; }
  if (run.floor >= 0 && run.nodeId) {
    trail = trail.slice(0, run.floor + 1);
    for (let i = 0; i < run.floor; i++) if (trail[i] === undefined) trail[i] = '';
    trail[run.floor] = run.nodeId;
    try { sessionStorage.setItem(key, JSON.stringify(trail)); } catch { /* 私隐模式等：忽略 */ }
  }
  return trail;
}

export function MapScreen(props: { run: RunState; dispatch: (a: Action) => void }) {
  const { run, dispatch } = props;
  const selectable = selectableNodes(run);
  const hasLuopan = run.relics.includes('luopan');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flyMode, setFlyMode] = useState(false);

  const layerCount = run.map.layers.length;
  const mapH = layerCount * ROW_H;
  const trail = syncTrail(run);

  // 御空（筑基 2 次 3 年/次）/ 缩地（金丹 3 次 2 年/次）
  const jindan = run.realm === 'jindan';
  const flyName = jindan ? '缩地' : '御空';
  const flyCost = jindan ? 2 : 3;
  const flyMax = jindan ? 3 : 2;
  const flyLayer = run.floor + 2; // 隔层直达
  const flyVisible = run.realm !== 'lianqi' && run.flyUsed < flyMax
    && run.floor >= 0 && flyLayer <= layerCount - 1;

  function showHint(text: string) {
    setHint(text);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 1800);
  }

  function tapNode(n: MapNode) {
    if (flyMode) {
      if (n.layer === flyLayer) {
        dispatch({ t: 'FLY_NODE', node: n.id });
        setFlyMode(false);
      } else {
        showHint(`${flyName}之中：请点隔层泛蓝光的落点，或再按一次按钮收势`);
      }
      return;
    }
    if (selectable.includes(n.id)) {
      dispatch({ t: 'CHOOSE_NODE', node: n.id });
      return;
    }
    showHint('仙途须循路而行：只能选带红光的相邻之地');
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

  useEffect(() => {
    // 落子后自动收势
    setFlyMode(false);
  }, [run.floor, run.nodeId]);

  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }, []);

  function nodeCls(n: MapNode): string {
    const cls = ['map-node'];
    if (flyMode && n.layer === flyLayer) cls.push('fly-target');
    if (selectable.includes(n.id)) cls.push('selectable');
    if (n.id === run.nodeId) cls.push('current');
    else if (n.layer < run.floor) cls.push('visited');
    return cls.join(' ');
  }

  function display(n: MapNode): NodeType {
    if (n.type === 'unknown' && hasLuopan && n.revealedType) return n.revealedType;
    return n.type;
  }

  // 节点坐标（viewBox 单位；x 按列比例、y 自顶向下）
  const pos: Record<string, { x: number; y: number }> = {};
  for (const row of run.map.layers) {
    for (const n of row) {
      pos[n.id] = { x: fx(n) * VIEW_W, y: (layerCount - 1 - n.layer) * ROW_H + ROW_H / 2 };
    }
  }

  // 山径：每条边一条曲线 + 年数标注；耗时越长曲率越大（每幕 ≤80 条，直接渲染）
  const edgeEls: JSX.Element[] = [];
  for (const row of run.map.layers) {
    for (const n of row) {
      for (const rawEdge of n.edges) {
        const e = normEdge(rawEdge);
        const a = pos[n.id];
        const b = pos[e.to];
        if (!a || !b) continue;
        const dir = (n.layer + n.x + Math.round((b.x / VIEW_W) * COLS)) % 2 === 0 ? 1 : -1;
        const walked = trail[n.layer] === n.id && trail[n.layer + 1] === e.to;
        let d: string;
        let lx: number;
        let ly: number;
        if (e.years >= 3) {
          // 三年远路：S 形大迂回
          const bend = 40 * dir;
          const c1x = a.x + bend, c1y = a.y - ROW_H * 0.3;
          const c2x = b.x - bend, c2y = b.y + ROW_H * 0.3;
          d = `M ${a.x} ${a.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${b.x} ${b.y}`;
          lx = (a.x + 3 * c1x + 3 * c2x + b.x) / 8;
          ly = (a.y + 3 * c1y + 3 * c2y + b.y) / 8;
        } else {
          // 一年近路微弯，二年中弯
          const bend = (e.years === 1 ? 10 : 26) * dir;
          const cx = (a.x + b.x) / 2 + bend, cy = (a.y + b.y) / 2;
          d = `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
          lx = (a.x + 2 * cx + b.x) / 4;
          ly = (a.y + 2 * cy + b.y) / 4;
        }
        edgeEls.push(
          <g key={`${n.id}>${e.to}`}>
            <path class={`map-path years-${e.years}${walked ? ' walked' : ''}`} d={d} />
            <text class={`map-edge-years${walked ? ' walked' : ''}`} x={lx} y={ly}>
              {YEAR_TEXT[e.years - 1]}
            </text>
          </g>,
        );
      }
    }
  }

  return (
    <div
      class="map-scroll yu-map fade-in"
      ref={scrollRef}
      style={{ backgroundImage: `linear-gradient(rgba(244,239,230,0.72), rgba(244,239,230,0.8)), url(${actBg(run.act)})`, backgroundSize: 'cover', backgroundPosition: 'center top' }}
    >
      <div class="map-topbar">
        <div class={`map-title${run.lifespan <= 15 ? ' low' : ''}`}>
          择路而行 · 余寿{run.lifespan}载
        </div>
        <div class="map-topbar-sub">
          {ACT_TITLES[run.act - 1]} ·「{ACT_QUOTES[run.act - 1]}」· 种子 {run.seed}
        </div>
        {flyVisible && (
          <button
            class={`fly-btn${flyMode ? ' armed' : ''}`}
            onClick={() => setFlyMode(!flyMode)}
          >
            {flyMode ? `${flyName}中 · 点隔层蓝光落点（再按收势）` : `${flyName}（耗${flyCost}年）`}
          </button>
        )}
      </div>
      <div class={`map-layers${flyMode ? ' flying' : ''}`}>
        <svg class="map-paths" viewBox={`0 0 ${VIEW_W} ${mapH}`} preserveAspectRatio="none">
          {edgeEls}
        </svg>
        {run.map.layers.map((row, li) => (
          <div key={li} class="map-row" style={{ height: `${ROW_H}px` }}>
            {row.map((n) => (
              <div
                key={n.id}
                class="map-spot"
                style={{ left: `${fx(n) * 100}%` }}
                onClick={() => tapNode(n)}
              >
                <div class={nodeCls(n)}>
                  <span
                    class="node-svg"
                    style={{ color: NODE_COLOR[display(n)] }}
                    dangerouslySetInnerHTML={{ __html: NODE_ICON[display(n)] }}
                  />
                  <span class="node-label">{NODE_LABEL[display(n)]}</span>
                </div>
                <span class="place-name">{n.placeName}</span>
                {n.id === run.nodeId && (
                  <span class="map-traveler" dangerouslySetInnerHTML={{ __html: TRAVELER_SVG }} />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      {hint && <div class="map-hint">{hint}</div>}
      {run.floor < 0 && (
        <div class="map-hint start-cue">仙途万里，步步耗寿——选一处落脚</div>
      )}
    </div>
  );
}
