# AGENTS

## 用户规则（云端）

```
---
description: My cloud-only rule
alwaysApply: true
metadata:
  environments: cloud
---
需要绘制美术素材之前请确认在需求里没有写来源并且在网上找不到免费合适的，才绘制
```

美术素材取用顺序（据此规则与策划案 §14/§15）：先查需求文档写明的来源（本仓库为《问长生-游戏策划案.md》§14 美术规格、§15 音频设计点名的博物馆 CC0 古画、game-icons、OFL 字体、免费商用音频包；策划案引用的三份 `素材调研-*.md` 目前不在仓库内，若用户提供须以其白名单为准）；来源没有的再到网上找免费可商用素材（克利夫兰艺术博物馆 API `cc0=1`、Met API `isPublicDomain` 均已验证本环境可直连）；两者都没有（如成套妖怪立绘）才允许用图像生成绘制，并在授权台账中标注为原创生成。

## Cursor Cloud specific instructions

《问长生》：Vite + TypeScript + Preact 单页 Web 游戏（纯前端，无后端服务）。唯一需要运行的服务是 Vite 开发服务器：`pnpm dev`（监听 `0.0.0.0:5173`）。标准命令（dev/test/lint/build/sim）见 `README.md`。

非显而易见的注意事项：

- 包管理器为 pnpm。`typescript` 固定在 6.0.3：npm 上最新的 TypeScript 7（原生版）不满足 typescript-eslint 的 peer 依赖 `<6.1.0`，不要升级到 7.x。
- ESLint 规则禁止 `Math.random`（策划案 §16.4），全部随机必须走 `src/core/rng.ts` 的多流种子随机。`src/core/rng.ts` 自身豁免。
- 游戏引擎是纯函数 reducer：`reduce(state, action)` 入口在 `src/core/run.ts`，入口处 `structuredClone` 深拷贝，测试可依赖不可变性。不要在 UI 层直接改 `RunState`。
- 无头模拟器：`pnpm sim -- --bots greedy --runs 200 --ascension 0`（约 5 秒）。改动战斗/数值后建议跑一次，对照 README 中的 §12.3 门槛表。
- 端到端调试终局 Boss：`npx tsx scripts/make-demo-save.ts` 生成 `public/dev_jie_run.json`（已 gitignore），随后在浏览器控制台执行 `localStorage.setItem('wcs_run', await fetch('/dev_jie_run.json').then(r => r.text())); location.reload();` 并点击"续前缘"，即可直接进入第三幕九重天劫战斗。
- 存档在 localStorage：`wcs_profile`（局外进度）与 `wcs_run`（当前局）。测试时用 `localStorage.clear()` 重置到全新状态。
- 战斗内出牌交互：攻击牌需先点卡再点敌人；非指向牌点两次确认。自动化 UI 测试时注意这一点。
- 地图为纵向卷轴、column-reverse 布局：起点在最底部，只有带红色脉冲光圈的相邻节点可点击（点其他节点会弹出"循路而行"提示）。自动化 UI 测试时务必滚动到地图底部并点击红光节点的圆心。
- 用户要求子代理尽量使用与主对话相同的模型：创建子代理时显式传入 `claude-fable-5-thinking-high`（可恢复的子代理续用原模型，无需再传）。
- 素材授权台账在 `public/assets/CREDITS.md`，新增任何外部素材必须同步登记（名称/作者/馆方/URL/协议/取用日期）。
