/**
 * 生成演示用存档 v3（第三幕·九重天劫），写入 public/dev_jie_run.json。
 * 用法：npx tsx scripts/make-demo-save.ts
 * 浏览器控制台注入：
 *   localStorage.setItem('wcs_run', await fetch('/dev_jie_run.json').then(r => r.text())); location.reload();
 * 随后点击"续前缘"，直接进入第三幕九重天劫车轮战。
 *
 * 包装结构 {schemaVersion: 3, run}，与 src/save/storage.ts 的 loadRun 兼容。
 */
import { writeFileSync } from 'node:fs';
import { newRun } from '../src/core/run';
import { generateActMap } from '../src/core/map';
import { startBattle, makeCard } from '../src/core/combat';
import { defaultProfile } from '../src/save/storage';

const run = newRun(defaultProfile(), 'DEMO-JIE', 0);

// ---- 金丹期·第三幕临劫状态（三表：寿元 ~90 / 心魔 3 / 丹毒 2）----
run.act = 3;
run.realm = 'jindan';
run.maxHp = 130;          // 含道果"铁骨" +18 与蟠桃 +15 的成长
run.hp = 112;
run.gold = 150;
run.lifespan = 88;
run.demon = 3;
run.toxin = 2;
run.toxinMaxHpApplied = false;
run.karma = 0;
run.poolCap = 8;          // 气海：筑基 6 + 道果"金丹凝五色" +2
run.drawPerTurn = 4;
run.battleStartBlock = 6; // 道果"铁骨"：开局 6 点土护体
run.flyUsed = 0;

// ---- 法宝 6 件 / 道果 2 ----
run.relics = ['taomujian', 'xuanguijia', 'hetu', 'wuxingzhu', 'luoshu', 'pantao'];
run.fruits = ['jindanwuse', 'tiegu'];

// ---- 炼丹：丹方 / 丹盒 / 灵材若干 ----
run.recipes = ['huiyuandan', 'julingdan', 'xuanwudan', 'qingxindan'];
run.elixirs = ['huiyuandan', 'qingxindan', 'longhudan'];
run.elixirCap = 4;
run.materials = { lingcao: 2, yusui: 1, yaodan: 2, leisha: 1 };

// ---- 合理 25 张卡组（五行皆备，含参悟；true = 已参悟）----
run.deck = [];
const DECK: [string, boolean][] = [
  // 金 7：直伤主力
  ['yujianshu', true], ['yujianshu', true], ['lianhuanjian', true], ['cuifeng', true],
  ['wanjianjue', false], ['jianqizongheng', true], ['jinleifu', false],
  // 水 5：吐纳与滤抽
  ['yinlingjue', true], ['yinlingjue', false], ['xuanbingci', true], ['chaoxijue', false], ['jilingshu', false],
  // 木 3：持续与回复
  ['tengmanfu', false], ['shengshengbuxi', true], ['huichunshu', false],
  // 火 3：灼烧引爆
  ['huodanshu', true], ['liaoyuan', true], ['yinhuofu', false],
  // 土 5：护体防线
  ['shouzhong', false], ['tiebushan', true], ['tiebushan', false], ['zhenyuexi', true], ['dadimaidong', false],
  // 双行 / 本命
  ['runfeng', true], ['canjuan', false],
];
for (const [id, upgraded] of DECK) run.deck.push(makeCard(run, id, upgraded));

// ---- 舆图推进至幕三 Boss 层，随即入九重天劫 ----
run.map = generateActMap(run, 3);
const bossLayer = run.map.layers.length - 1;
run.floor = bossLayer;
run.nodeId = run.map.layers[bossLayer][0].id;

startBattle(run, 'boss'); // ACT_BOSS[3] = jiuchongtianjie（车轮战 waveIndex 驱动）

writeFileSync('public/dev_jie_run.json', JSON.stringify({ schemaVersion: 3, run }));
console.log(`已写入 public/dev_jie_run.json（第三幕九重天劫演示存档：卡组 ${run.deck.length} 张 / 法宝 ${run.relics.length} / 道果 ${run.fruits.length}）`);
