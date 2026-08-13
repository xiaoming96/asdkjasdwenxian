/**
 * 埋点（策划案 §16.8，自托管轻量方案或 Umami）
 * 本地环形缓冲实现（localStorage，上限 500 条），预留 endpoint 上报口。
 *
 * 事件全集与字段约定（调用点在 UI 层）：
 *   run_start      { seed, tier, karma }                    tier = ascension 重天数
 *   node_enter     { type, floor, lifespanLeft }            type = NodeType
 *   battle_end     { enemy, turns, hpLost, shengCount }     shengCount = 本场得气总次数
 *   card_pick      { offered, picked }                      offered 为逗号分隔的候选卡 id 串；跳过时 picked=''
 *   card_played    { card, sheng, kefa }                    sheng = 是否得气；kefa = 是否触发克伐
 *   alchemy        { recipe, toxinAfter }                   炼/服丹后的丹毒值
 *   demon_change   { delta, source }                        心魔变动来源（事件 id / 'xinzhai' / 'relic:xxx' 等）
 *   run_end        { result, cause, floor, score, deckSize, lifespanLeft, demonFinal }
 *   legacy_pick    { kind, karma }                          宿慧三选一（card/relic/daoxing）与业力
 *   meta_milestone { id }                                   里程碑解锁
 *
 * 支撑 §12.3 真实玩家数据复核，特别是得气触发率、坐化率、心魔分布三条新曲线。
 */

/** §16.8 事件名全集（类型提示用；track 调用请从中取值） */
export type AnalyticsEventName =
  | 'run_start'
  | 'node_enter'
  | 'battle_end'
  | 'card_pick'
  | 'card_played'
  | 'alchemy'
  | 'demon_change'
  | 'run_end'
  | 'legacy_pick'
  | 'meta_milestone';

export interface TrackEvent {
  t: number; // 时间戳
  name: string;
  props: Record<string, string | number | boolean>;
}

const KEY = 'wcs_events';
const MAX = 500;

/** 可选上报端点（Umami 或自托管，P1 接入时设置） */
let endpoint: string | null = null;
export function setAnalyticsEndpoint(url: string | null) {
  endpoint = url;
}

export function track(event: AnalyticsEventName, data: Record<string, string | number | boolean> = {}) {
  const ev: TrackEvent = { t: Date.now(), name: event, props: data };
  try {
    const raw = localStorage.getItem(KEY);
    const list: TrackEvent[] = raw ? JSON.parse(raw) : [];
    list.push(ev);
    if (list.length > MAX) list.splice(0, list.length - MAX);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // 存储不可用：静默
  }
  if (endpoint) {
    try {
      void fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ev),
        keepalive: true,
      });
    } catch {
      // 上报失败不影响游戏
    }
  }
}

export function getTrackedEvents(): TrackEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
