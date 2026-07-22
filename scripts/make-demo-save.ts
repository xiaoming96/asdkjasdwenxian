/**
 * 生成演示用存档（第三幕·九重天劫），写入 public/dev_jie_run.json。
 * 用法：npx tsx scripts/make-demo-save.ts
 * 浏览器控制台注入：
 *   localStorage.setItem('wcs_run', await fetch('/dev_jie_run.json').then(r => r.text())); location.reload();
 */
import { writeFileSync } from 'node:fs';
import { newRun } from '../src/core/run';
import { startBattle, makeCard } from '../src/core/combat';
import { defaultProfile } from '../src/save/storage';

const run = newRun(defaultProfile(), 'DEMO-JIE', 0);
run.act = 3;
run.hp = 80;
run.maxHp = 90;
run.gold = 120;
run.energyMax = 4;
run.relics = ['taomujian', 'xuanguijia', 'taijitu', 'hetu'];
run.potions = ['huixuedan', 'lingqisan', 'jingangwan'];
run.breakthroughs = ['jindanningcheng', 'wuxingtiaohe'];
run.liushuiBonus = 0.4;
// 一套能打的卡组
run.deck = [];
for (const id of [
  'yujianshu', 'yujianshu', 'lianhuanjian', 'jinleifu', 'wanjianjue',
  'tiebushan', 'tiebushan', 'shifushu', 'zhenyuexi',
  'yinlingjue', 'xuanbingci', 'chaoxijue',
  'huodanshu', 'liaoyuan', 'tengmanfu', 'shengshengbuxi',
]) run.deck.push(makeCard(run, id, true));
startBattle(run, 'boss');
writeFileSync('public/dev_jie_run.json', JSON.stringify({ schemaVersion: 1, run }));
console.log('已写入 public/dev_jie_run.json（第三幕九重天劫演示存档）');
