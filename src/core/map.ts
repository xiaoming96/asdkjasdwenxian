/**
 * 地图生成（策划案 §9.1–9.2）
 * 幕一 14 层，幕二/三 15 层；每层 2–4 节点；种子驱动随机游走生成 5 条路径。
 * 固定规则：第 1 层必普通战；倒数第 2 层必洞府；最后一层 Boss；幕二/三第 8 层必坊市。
 */
import type { ActMap, MapNode, NodeType, RunState } from './types';
import { rngInt, rngNext, rngWeighted } from './rng';

const WIDTH = 4;

/** 节点类型与概率（§9.2） */
const NODE_TYPES: { type: NodeType; weight: number }[] = [
  { type: 'battle', weight: 44 },
  { type: 'event', weight: 22 },
  { type: 'elite', weight: 9 },
  { type: 'shop', weight: 5 },
  { type: 'cave', weight: 12 },
  { type: 'unknown', weight: 8 },
];

export function generateActMap(run: RunState, act: 1 | 2 | 3): ActMap {
  const layerCount = act === 1 ? 14 : 15;
  // 每层节点占位：paths 随机游走
  const present: boolean[][] = Array.from({ length: layerCount - 1 }, () => Array(WIDTH).fill(false));
  const edges = new Set<string>(); // "layer:x1>x2"

  let eliteWeight = run.ascension >= 2 ? 14 : 9; // 二重天：精英 9%→14%
  if (run.flags['dailyShajie']) eliteWeight *= 2; // 每日天机·杀劫：精英翻倍
  const eventWeight = run.flags['dailyYinguo'] ? 44 : 22; // 因果昭昭：事件概率翻倍

  // 5 条路径（前 4 条从 4 个不同起点出发，第 5 条随机）
  const starts = [0, 1, 2, 3];
  for (let p = 0; p < 5; p++) {
    let x: number;
    if (p < 4) x = starts[p];
    else {
      const r = rngInt(run.rng, 'map', 0, WIDTH - 1);
      run.rng = r.state;
      x = r.value;
    }
    present[0][x] = true;
    for (let layer = 1; layer < layerCount - 1; layer++) {
      // 带偏向的随机游走：-1/0/+1
      const candidates: number[] = [];
      for (const dx of [-1, 0, 1]) {
        const nx = x + dx;
        if (nx < 0 || nx >= WIDTH) continue;
        // 防交叉：若存在边 (x-1 → x)，则从 x 不能走到 x-1（反之亦然）
        if (dx === -1 && edges.has(`${layer - 1}:${x - 1}>${x}`)) continue;
        if (dx === 1 && edges.has(`${layer - 1}:${x + 1}>${x}`)) continue;
        candidates.push(nx);
      }
      const r = rngInt(run.rng, 'map', 0, candidates.length - 1);
      run.rng = r.state;
      const nx = candidates[r.value];
      edges.add(`${layer - 1}:${x}>${nx}`);
      present[layer][nx] = true;
      x = nx;
    }
    // 最后一层全部连 Boss（生成时隐含）
  }

  // 构建节点
  const layers: MapNode[][] = [];
  for (let layer = 0; layer < layerCount - 1; layer++) {
    const row: MapNode[] = [];
    for (let x = 0; x < WIDTH; x++) {
      if (!present[layer][x]) continue;
      row.push({ id: `${act}-${layer}-${x}`, layer, x, type: 'battle', edges: [] });
    }
    layers.push(row);
  }
  // Boss 层
  layers.push([{ id: `${act}-${layerCount - 1}-0`, layer: layerCount - 1, x: 1, type: 'boss', edges: [] }]);

  // 连边（edges 指向下一层节点 id）
  for (const key of edges) {
    const [l, pair] = key.split(':');
    const [x1, x2] = pair.split('>').map(Number);
    const layer = Number(l);
    const from = layers[layer].find((n) => n.x === x1);
    const to = layers[layer + 1]?.find((n) => n.x === x2);
    if (from && to) from.edges.push(to.id);
  }
  // 倒数第二层 → Boss
  for (const n of layers[layerCount - 2]) n.edges.push(layers[layerCount - 1][0].id);

  // ---- 类型分配 ----
  for (let layer = 0; layer < layerCount - 1; layer++) {
    for (const node of layers[layer]) {
      if (layer === 0) { node.type = 'battle'; continue; } // 第 1 层必普通战
      if (layer === layerCount - 2) { node.type = 'cave'; continue; } // 倒数第 2 层必洞府
      if (act >= 2 && layer === 7) { node.type = 'shop'; continue; } // 幕二/三第 8 层必坊市

      // 概率掷骰 + 约束（精英不出现于 1–4 层；精英/坊市/洞府同路径不连续）
      for (let attempt = 0; attempt < 8; attempt++) {
        const weights = [
          NODE_TYPES[0].weight,
          eventWeight,
          layer < 4 ? 0 : eliteWeight,
          NODE_TYPES[3].weight,
          NODE_TYPES[4].weight,
          NODE_TYPES[5].weight,
        ];
        const r = rngWeighted(run.rng, 'map', weights);
        run.rng = r.state;
        const type = NODE_TYPES[r.value].type;
        // 同路径不连续：检查所有指向本节点的上层节点
        if (type === 'elite' || type === 'shop' || type === 'cave') {
          const parents = layers[layer - 1].filter((p) => p.edges.includes(node.id));
          if (parents.some((p) => p.type === type)) continue;
        }
        node.type = type;
        break;
      }
      // 未知节点：预掷真实类型（罗盘显示用，§9.2：战斗 40/奇遇 35/坊市 15/洞府 10）
      if (node.type === 'unknown') {
        const r = rngWeighted(run.rng, 'map', [40, 35, 15, 10]);
        run.rng = r.state;
        node.revealedType = (['battle', 'event', 'shop', 'cave'] as NodeType[])[r.value];
      }
    }
  }

  return { act, layers };
}

/** 当前可选节点 */
export function selectableNodes(run: RunState): string[] {
  const { layers } = run.map;
  if (run.floor < 0) return layers[0].map((n) => n.id); // 未出发：底部任意起点
  const cur = layers[run.floor]?.find((n) => n.id === run.nodeId);
  if (!cur) return [];
  return cur.edges;
}

export function findNode(run: RunState, id: string): MapNode | undefined {
  for (const row of run.map.layers) {
    const n = row.find((x) => x.id === id);
    if (n) return n;
  }
  return undefined;
}

/** 忘川摆渡：跳至本幕任意未达层（简化为向上跳 2 层的随机节点） */
export function baiduJump(run: RunState): void {
  const targetLayer = Math.min(run.floor + 2, run.map.layers.length - 2);
  const row = run.map.layers[targetLayer];
  if (!row || row.length === 0) return;
  const r = rngNext(run.rng, 'map');
  run.rng = r.state;
  const node = row[Math.floor(r.value * row.length)];
  run.floor = targetLayer;
  run.nodeId = node.id;
}
