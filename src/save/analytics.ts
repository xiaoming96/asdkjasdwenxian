/**
 * 埋点（策划案 §16.8）
 * 本地环形缓冲实现（localStorage，上限 500 条），预留 endpoint 上报口。
 * 事件：run_start / node_enter / battle_end / card_pick / card_played / run_end / meta_unlock
 */

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

export function track(name: string, props: Record<string, string | number | boolean> = {}) {
  const ev: TrackEvent = { t: Date.now(), name, props };
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
