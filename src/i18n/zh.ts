/**
 * 文案表脚手架（策划案 §16.2 i18n）
 * v1 简体中文首发；英文为 P1。当前先收敛高频 UI 文案，
 * 后续增量把散落在组件中的字符串迁移进来，再补 en.ts。
 */

export const ZH = {
  appName: '问长生',
  menu: {
    start: '启 程',
    continue: '续 前 缘',
    daily: '每日天机',
    codex: '藏 经 阁',
    rebirth: '转 世',
    settings: '设置',
    achievements: '成就',
  },
  battle: {
    endTurn: '结束回合',
    deck: '牌组',
    drawPile: '抽牌',
    discardPile: '弃牌',
    exhaustPile: '放逐',
    turn: '回合',
    xingwei: '行位',
    wuxingHelp: '☯五行',
  },
  map: {
    startCue: '↓ 点击最下方带红光的节点，从此启程',
    pathHint: '仙途须循路而行：只能选带红光的相邻节点',
  },
} as const;

type Dict = typeof ZH;
let current: Dict = ZH;

export function t(): Dict {
  return current;
}

export function setLocale(dict: Dict) {
  current = dict;
}
