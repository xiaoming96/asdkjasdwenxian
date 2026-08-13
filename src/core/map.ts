/**
 * 地图生成 v3（策划案 §9.2–9.3）
 * 幕一 11 层，幕二/三各 12 层；底层固定三选一起点（妖兽战/奇遇/灵田）；顶层 Boss。
 * 每条边带寿元年数 1–3（基础 1 年；30% 概率远边 +1；通向精英/坊市/灵田的高价值边再 +1，上限 3）。
 * 节点带舆图地名（data/places.ts 地名池，同幕不重复）；生成保底每幕坊市 ≥1、洞府 ≥2。
 */
import type { ActMap, MapNode, NodeType, RunState } from './types';
import { rngInt, rngNext, rngPick, rngShuffle, rngWeighted } from './rng';
import { PLACE_POOLS } from '../data/places';

const WIDTH = 4;

/** 节点类型与概率（§9.3；顺序与 weights 对应） */
const ROLL_TYPES: NodeType[] = ['battle', 'event', 'elite', 'cave', 'field', 'shop', 'unknown'];
const ROLL_WEIGHTS = [40, 18, 10, 10, 8, 6, 8];

/** 秘境（?）真型掷骰（§9.3）：战 40 / 奇遇 30 / 灵田 15 / 坊市 8 / 洞府 7 */
const SECRET_TYPES: NodeType[] = ['battle', 'event', 'field', 'shop', 'cave'];
const SECRET_WEIGHTS = [40, 30, 15, 8, 7];

/** 远边加价的高价值节点（§9.2：远边偏向精英/坊市/灵田） */
const HIGH_VALUE: NodeType[] = ['elite', 'shop', 'field'];

export function generateActMap(run: RunState, act: 1 | 2 | 3): ActMap {
  const layerCount = act === 1 ? 11 : 12;
  const walkLayers = layerCount - 1; // 除 Boss 层外的层数

  // ---- 占位：自底部 3 个起点做带偏向的随机游走生成 5 条路径 ----
  const present: boolean[][] = Array.from({ length: walkLayers }, () => Array<boolean>(WIDTH).fill(false));
  const edgeKeys = new Set<string>(); // "layer:x1>x2"

  for (let p = 0; p < 5; p++) {
    let x: number;
    if (p < 3) x = p;
    else {
      const r = rngInt(run.rng, 'map', 0, 2);
      run.rng = r.state;
      x = r.value;
    }
    present[0][x] = true;
    for (let layer = 1; layer < walkLayers; layer++) {
      const candidates: number[] = [];
      for (const dx of [-1, 0, 1]) {
        const nx = x + dx;
        if (nx < 0 || nx >= WIDTH) continue;
        // 防交叉：若存在边 (x-1 → x)，则从 x 不能走到 x-1（反之亦然）
        if (dx === -1 && edgeKeys.has(`${layer - 1}:${x - 1}>${x}`)) continue;
        if (dx === 1 && edgeKeys.has(`${layer - 1}:${x + 1}>${x}`)) continue;
        candidates.push(nx);
      }
      const r = rngInt(run.rng, 'map', 0, candidates.length - 1);
      run.rng = r.state;
      const nx = candidates[r.value];
      edgeKeys.add(`${layer - 1}:${x}>${nx}`);
      present[layer][nx] = true;
      x = nx;
    }
  }

  // ---- 构建节点 ----
  const layers: MapNode[][] = [];
  for (let layer = 0; layer < walkLayers; layer++) {
    const row: MapNode[] = [];
    for (let x = 0; x < WIDTH; x++) {
      if (!present[layer][x]) continue;
      row.push({ id: `${act}-${layer}-${x}`, layer, x, type: 'battle', placeName: '', edges: [] });
    }
    layers.push(row);
  }
  // Boss 层
  layers.push([{ id: `${act}-${layerCount - 1}-0`, layer: layerCount - 1, x: 1, type: 'boss', placeName: '', edges: [] }]);

  // ---- 连边（先建结构，年数在类型分配后再定） ----
  for (const key of edgeKeys) {
    const [l, pair] = key.split(':');
    const [x1, x2] = pair.split('>').map(Number);
    const layer = Number(l);
    const from = layers[layer].find((n) => n.x === x1);
    const to = layers[layer + 1]?.find((n) => n.x === x2);
    if (from && to && !from.edges.some((e) => e.to === to.id)) from.edges.push({ to: to.id, years: 1 });
  }
  // 倒数第二层 → Boss
  for (const n of layers[layerCount - 2]) n.edges.push({ to: layers[layerCount - 1][0].id, years: 1 });

  // ---- 类型分配 ----
  // 底层固定三选一：妖兽战 / 奇遇 / 灵田 各一（§9.2），顺序种子随机
  const startTypes = rngShuffle(run.rng, 'map', ['battle', 'event', 'field'] as NodeType[]);
  run.rng = startTypes.state;
  layers[0].forEach((n, i) => { n.type = startTypes.value[i % 3]; });

  const eliteWeight = run.flags['dailyShajie'] ? ROLL_WEIGHTS[2] * 2 : ROLL_WEIGHTS[2]; // 每日天机·杀劫：精英翻倍
  const eventWeight = run.flags['dailyYinguo'] ? ROLL_WEIGHTS[1] * 2 : ROLL_WEIGHTS[1]; // 因果昭昭：事件概率翻倍

  for (let layer = 1; layer < walkLayers; layer++) {
    for (const node of layers[layer]) {
      // 概率掷骰 + 约束（精英不出 1–3 层；精英/坊市/洞府同路径不连续）
      for (let attempt = 0; attempt < 8; attempt++) {
        const weights = [
          ROLL_WEIGHTS[0],
          eventWeight,
          layer < 3 ? 0 : eliteWeight,
          ROLL_WEIGHTS[3],
          ROLL_WEIGHTS[4],
          ROLL_WEIGHTS[5],
          ROLL_WEIGHTS[6],
        ];
        const r = rngWeighted(run.rng, 'map', weights);
        run.rng = r.state;
        const type = ROLL_TYPES[r.value];
        if (type === 'elite' || type === 'shop' || type === 'cave') {
          const parents = layers[layer - 1].filter((p) => p.edges.some((e) => e.to === node.id));
          if (parents.some((p) => p.type === type)) continue;
        }
        node.type = type;
        break;
      }
      // 秘境：预掷真实类型（罗盘揭示用）
      if (node.type === 'unknown') {
        const r = rngWeighted(run.rng, 'map', SECRET_WEIGHTS);
        run.rng = r.state;
        node.revealedType = SECRET_TYPES[r.value];
      }
    }
  }

  // ---- 保底：每幕坊市 ≥1、洞府 ≥2（不足则改写随机普通战节点） ----
  const middle = layers.slice(1, walkLayers).flat();
  const need: NodeType[] = [];
  const shopCount = middle.filter((n) => n.type === 'shop').length;
  const caveCount = middle.filter((n) => n.type === 'cave').length;
  for (let i = shopCount; i < 1; i++) need.push('shop');
  for (let i = caveCount; i < 2; i++) need.push('cave');
  if (need.length > 0) {
    const battles = rngShuffle(run.rng, 'map', middle.filter((n) => n.type === 'battle'));
    run.rng = battles.state;
    for (const t of need) {
      const cand = battles.value.shift();
      if (cand) cand.type = t;
    }
  }

  // ---- 边年数（§9.2）：基础 1 年；30% 远边 +1；通向高价值节点 +1；上限 3 ----
  const byId = new Map<string, MapNode>();
  for (const row of layers) for (const n of row) byId.set(n.id, n);
  for (const row of layers) {
    for (const n of row) {
      for (const e of n.edges) {
        const target = byId.get(e.to);
        let years = 1;
        const r = rngNext(run.rng, 'map');
        run.rng = r.state;
        if (r.value < 0.3) years += 1;
        if (target && HIGH_VALUE.includes(target.type)) years += 1;
        e.years = Math.min(3, years);
      }
    }
  }

  // ---- 舆图地名（同幕同类型不重复；池尽则循环复用） ----
  const namePools: Partial<Record<NodeType, string[]>> = {};
  const nameCursor: Partial<Record<NodeType, number>> = {};
  const nameFor = (type: NodeType): string => {
    if (type === 'boss') return PLACE_POOLS.boss?.[act - 1] ?? '劫云深处';
    if (!namePools[type]) {
      const r = rngShuffle(run.rng, 'map', PLACE_POOLS[type] ?? []);
      run.rng = r.state;
      namePools[type] = r.value;
      nameCursor[type] = 0;
    }
    const pool = namePools[type]!;
    if (pool.length === 0) return '无名之地';
    const name = pool[(nameCursor[type] ?? 0) % pool.length];
    nameCursor[type] = (nameCursor[type] ?? 0) + 1;
    return name;
  };
  for (const row of layers) for (const n of row) n.placeName = nameFor(n.type);

  return { act, layers };
}

/** 当前可选节点（循路而行：未出发时为底层起点三选一） */
export function selectableNodes(run: RunState): string[] {
  const { layers } = run.map;
  if (run.floor < 0) return layers[0].map((n) => n.id);
  const cur = layers[run.floor]?.find((n) => n.id === run.nodeId);
  if (!cur) return [];
  return cur.edges.map((e) => e.to);
}

/** 御空可达节点（§9.2：跳过下一层，直达隔层 floor+2 全部节点；次数/寿元校验在 run.ts） */
export function flyTargets(run: RunState): string[] {
  if (run.floor < 0) return [];
  const row = run.map.layers[run.floor + 2];
  return row ? row.map((n) => n.id) : [];
}

export function findNode(run: RunState, id: string): MapNode | undefined {
  for (const row of run.map.layers) {
    const n = row.find((x) => x.id === id);
    if (n) return n;
  }
  return undefined;
}

/**
 * 忘川摆渡：向上跳 offset 层的随机节点（简化实现，不触发节点内容、不耗边年数）。
 * 不会跳入 Boss 层（至多到倒数第二层）。
 */
export function jumpToLayer(run: RunState, offset: number): void {
  const targetLayer = Math.max(0, Math.min(run.floor + offset, run.map.layers.length - 2));
  const row = run.map.layers[targetLayer];
  if (!row || row.length === 0) return;
  const r = rngPick(run.rng, 'map', row);
  run.rng = r.state;
  run.floor = targetLayer;
  run.nodeId = r.value.id;
}
