# 《问长生》

修仙题材单机肉鸽卡牌构筑游戏（Roguelike Deckbuilder）。手机浏览器 + 桌面 Web，竖屏单手可玩。

你是一名寿数将尽的散修，用一世寿元赌一条仙路：**寿元与心魔双时钟**全程拉扯——赶路省寿元但错过机缘，走捷径吃机缘但涨心魔；每张牌有基础段与**得气段**两段效果，沿五行相生的出牌顺序点亮第二段，出牌顺序本身就是构筑维度；**境界突破解锁规则**（筑基开气海、金丹周天自运）而非加数值；**炼丹**按丹方消耗灵材、服丹记丹毒账，"是药三分毒"是真实权衡；地图是一张**行脚舆图**，每条山径都标着要花掉的年数。

完整设计文档见 `问长生-游戏策划案.md`（v3.1 详案）。

## 快速开始

```bash
pnpm install        # 安装依赖
pnpm dev            # 开发服务器（默认 http://localhost:5173）
pnpm test           # 单元测试（vitest）
pnpm lint           # ESLint（含"禁止 Math.random"规则，策划案 §16.4）
pnpm build          # 生产构建（tsc + vite）
pnpm sim -- --bots greedy --runs 500 --ascension 0   # 无头模拟器（§16.6；--bots greedy|random|blind）
npx tsx scripts/fetch-museum-art.ts   # 重跑博物馆古画素材管线（产物已入库，一般无需执行）
```

## 美术素材来源

- 卡面主图（逐卡独立）与主界面/各幕背景：克利夫兰艺术博物馆（CC0）与大都会艺术博物馆（Open Access）公有领域古画，经统一做旧 LUT 处理；逐项登记于 `public/assets/CREDITS.md`（授权台账），游戏内设置页有"素材署名"入口。v3 新增守中/润锋/问长生·残卷三张卡面（博物馆 CC0 重构，登记见 CREDITS）。
- 敌人立绘（40 张）与劫战雷云背景：原创生成素材（博物馆藏品中无成套妖怪形象，符合"需求来源没有且网上找不到免费合适的才绘制"规则）。
- 音效：Web Audio 代码合成（得气按五声宫商角徵羽对应五行）。
- BGM：程序化古琴风场景音乐（主界面空灵/地图清雅/战斗渐紧/Boss 鼓点/劫战威压，§15.1 场景分配），零外部素材；正式版可按《素材调研-音频素材.md》白名单替换成品曲目。

## 技术栈

Vite + TypeScript + Preact；纯函数游戏引擎（零 DOM 依赖）；`localStorage` 存档；种子驱动多流 RNG。

## 模块结构（对应策划案 §16.2）

```
src/
  core/      纯函数游戏引擎
    types.ts    GameState / Action 定义（v3 并行开发契约文件）
    run.ts      冒险层 reducer（唯一入口 reduce(state, action)）
    combat.ts   战斗引擎（回合时序 §4.2、伤害与护体属性管线 §4.3、克伐五动词 §4.4）
    wuxing.ts   五行行位/得气/滞气/周天判定（§4.4）
    map.ts      种子驱动地图生成（§9.2：寿元边价、御空可达性、舆图地名）
    rng.ts      多流种子随机（map/cardReward/shuffle/enemyAI/event/shop/alchemy）
  data/      配置表：75 卡两段式+5 诅咒、25 法宝、12 丹方+4 灵材、
             敌人（含九重天劫）、事件 30+因果链、道果、里程碑、每日天机、地名池
  sim/       无头模拟器（Node CLI，random/greedy/blind bot，复用 core）
  ui/        Preact 界面（主界面/舆图/战斗/奖励/坊市/事件/洞府/突破/结算/藏经阁/轮回殿/设置）
  fx/        Canvas 水墨特效（墨溅/金色涟漪/劫雷白金闪）
  audio/     Web Audio 合成音效（得气按五声宫商角徵羽对应五行）
  save/      localStorage 存档与 schema 迁移
scripts/
  make-demo-save.ts     生成第三幕九重天劫演示存档（写入 public/dev_jie_run.json）
  fetch-museum-art.ts   博物馆 CC0 古画拉取/裁切/做旧管线（产出卡面、背景、授权台账）
```

## 平衡现状（对照策划案 §12.3 门槛）

**v3 重构后待复测（M4 平衡阶段随内容集成统一跑模拟）**。v3 验收门槛如下：

| 指标 | 门槛 |
|---|---|
| random bot 通关率 | < 1% |
| greedy bot 幕一通过率 | 55–70% |
| greedy bot 通关率（天道 0） | 8–15% |
| 坐化（寿元尽）占死因比例 | < 10%（一重天 < 5%） |
| 心魔值中位数（greedy 幕二末） | 3–5 |
| greedy bot 每场得气次数 | ≥ 4 |
| 知识变现（greedy vs blind 综合效能） | ≤ 1.8× |

## 与策划案的已知偏差

v2 偏差清单已随 v3 重构作废；v3 集成后的偏差由集成负责人在此补录。

- （待补录）
