/**
 * 博物馆公有领域古画拉取管线（策划案 §14.2，AGENTS.md 素材来源规则）
 *
 * 来源：
 *  - 克利夫兰艺术博物馆开放 API（share_license_status = CC0）
 *  - 大都会艺术博物馆 API（isPublicDomain = true）
 *
 * 产物：
 *  - public/assets/cardart/<cardId>.webp   每张卡独立卡面主图（512×640，统一做旧）
 *  - public/assets/bg_menu.webp / bg_act{1..3}.webp  长卷背景（竖构图裁切）
 *  - src/data/cardArtMap.json              卡牌 → 素材归属映射
 *  - public/assets/CREDITS.md              授权台账（名称/作者/馆方/URL/协议/取用日期）
 *
 * 用法：npx tsx scripts/fetch-museum-art.ts [--skip-download]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { CARDS } from '../src/data/cards';

const CMA_API = 'https://openaccess-api.clevelandart.org/api/artworks/';
const MET_SEARCH = 'https://collectionapi.metmuseum.org/public/collection/v1/search';
const MET_OBJECT = 'https://collectionapi.metmuseum.org/public/collection/v1/objects/';

interface Artwork {
  key: string; // 去重键
  title: string;
  creator: string;
  museum: string;
  license: string;
  pageUrl: string;
  imageUrl: string;
  width: number;
  height: number;
}

/** 各五行的检索主题（限定克利夫兰"Chinese Art"部门 + Met 亚洲部检索词） */
const ELEMENT_QUERIES: Record<string, string[]> = {
  metal: ['sword', 'bronze', 'gilt', 'armor', 'blade', 'metalwork', 'mirror'],
  wood: ['bamboo', 'pine', 'orchid', 'blossom', 'flowers', 'tree', 'garden'],
  water: ['river', 'wave', 'dragon', 'fish', 'lake', 'waterfall', 'moon'],
  fire: ['phoenix', 'red', 'lacquer', 'bird', 'rooster', 'sun'],
  earth: ['mountain', 'landscape', 'rock', 'jade', 'stone', 'peak'],
  none: ['calligraphy', 'immortal', 'daoist', 'cloud', 'scholar', 'sage'],
  curse: ['demon', 'zhong kui', 'ghost', 'mask', 'guardian'],
};

const BG_QUERIES = ['landscape handscroll', 'mountains mist landscape', 'landscape album'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'wenchangsheng-art-pipeline' } });
      if (res.ok) return await res.json();
    } catch {
      /* 重试 */
    }
    await sleep(500 * (attempt + 1));
  }
  return null;
}

/** 克利夫兰：CC0 + 有图 + 中国艺术部门 */
async function queryCma(q: string, limit = 40): Promise<Artwork[]> {
  const url = `${CMA_API}?q=${encodeURIComponent(q)}&cc0=1&has_image=1&department=Chinese%20Art&limit=${limit}`;
  const data = (await getJson(url)) as {
    data?: {
      id: number; title: string; creators?: { description?: string }[];
      images?: {
        web?: { url?: string; width?: string; height?: string };
        print?: { url?: string; width?: string; height?: string };
      };
      url?: string; share_license_status?: string;
    }[];
  } | null;
  if (!data?.data) return [];
  return data.data
    .filter((a) => a.images?.web?.url && a.share_license_status === 'CC0')
    .map((a) => {
      // 优先高清 print 图（约 3400px），避免裁切放大糊图
      const img = a.images!.print?.url ? a.images!.print! : a.images!.web!;
      return {
        key: `cma-${a.id}`,
        title: a.title || `Artwork ${a.id}`,
        creator: a.creators?.[0]?.description || '佚名',
        museum: 'The Cleveland Museum of Art',
        license: 'CC0',
        pageUrl: a.url || `https://www.clevelandart.org/art/${a.id}`,
        imageUrl: img.url!,
        width: Number(img.width ?? 0),
        height: Number(img.height ?? 0),
      };
    });
}

/** Met：公有领域 + 有图（限亚洲艺术部 departmentId=6） */
async function queryMet(q: string, cap = 25): Promise<Artwork[]> {
  const search = (await getJson(
    `${MET_SEARCH}?q=${encodeURIComponent(q + ' chinese')}&hasImages=true&departmentId=6`,
  )) as { objectIDs?: number[] } | null;
  const ids = (search?.objectIDs ?? []).slice(0, cap);
  const out: Artwork[] = [];
  for (const id of ids) {
    await sleep(60);
    const obj = (await getJson(`${MET_OBJECT}${id}`)) as {
      isPublicDomain?: boolean; primaryImageSmall?: string; title?: string;
      artistDisplayName?: string; objectURL?: string;
    } | null;
    if (obj?.isPublicDomain && obj.primaryImageSmall) {
      out.push({
        key: `met-${id}`,
        title: obj.title || `Object ${id}`,
        creator: obj.artistDisplayName || '佚名',
        museum: 'The Metropolitan Museum of Art',
        license: 'Public Domain (Open Access)',
        pageUrl: obj.objectURL || `https://www.metmuseum.org/art/collection/search/${id}`,
        imageUrl: obj.primaryImageSmall,
        width: 0,
        height: 0,
      });
    }
  }
  return out;
}

/** 统一做旧 LUT：降饱和、暖纸色、轻暗角（§14.1 统一调色） */
const AGING_FILTER =
  'eq=saturation=0.74:contrast=0.98:brightness=0.03,' +
  'colorbalance=rm=0.04:gm=0.01:bm=-0.05,' +
  'vignette=PI/9:mode=forward';

function processImage(src: string, dest: string, w: number, h: number, xShift = 0.5, insetPct = 0) {
  // 可选先裁掉四周装裱边，再覆盖裁切到 w:h，最后做旧
  const inset = insetPct > 0
    ? `crop=iw*${(1 - insetPct * 2).toFixed(2)}:ih*${(1 - insetPct * 2).toFixed(2)},`
    : '';
  const vf =
    inset +
    `scale=${w}:${h}:force_original_aspect_ratio=increase,` +
    `crop=${w}:${h}:(iw-${w})*${xShift}:(ih-${h})*0.28,` +
    AGING_FILTER;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', vf, '-quality', '80', dest]);
}

async function download(url: string, dest: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
        return true;
      }
    } catch {
      /* 重试 */
    }
    await sleep(600);
  }
  return false;
}

async function main() {
  mkdirSync('public/assets/cardart', { recursive: true });
  mkdirSync('/tmp/museum_raw', { recursive: true });

  const usedKeys = new Set<string>();
  const artMap: Record<string, { file: string; title: string; creator: string; museum: string; license: string; url: string }> = {};
  const credits: Artwork[] = [];

  // ---- 逐元素建候选池并分配 ----
  for (const [element, queries] of Object.entries(ELEMENT_QUERIES)) {
    const cards = Object.values(CARDS).filter((c) =>
      element === 'curse' ? c.type === 'curse' : c.type !== 'curse' && c.element === element,
    );
    console.log(`\n[${element}] 需要 ${cards.length} 张，检索中…`);

    const pool: Artwork[] = [];
    for (const q of queries) {
      if (pool.length >= cards.length * 2) break;
      const cma = await queryCma(q);
      for (const a of cma) if (!usedKeys.has(a.key) && !pool.some((p) => p.key === a.key)) pool.push(a);
      await sleep(150);
    }
    // 克利夫兰不够时用 Met 补
    if (pool.length < cards.length) {
      for (const q of queries.slice(0, 3)) {
        const met = await queryMet(q, 15);
        for (const a of met) if (!usedKeys.has(a.key) && !pool.some((p) => p.key === a.key)) pool.push(a);
        if (pool.length >= cards.length) break;
      }
    }
    console.log(`[${element}] 候选 ${pool.length} 件`);

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const art = pool[i % Math.max(1, pool.length)];
      if (!art) {
        console.warn(`  ! ${card.id} 无候选，保留生成图兜底`);
        continue;
      }
      const raw = `/tmp/museum_raw/${art.key}-hi.img`;
      if (!existsSync(raw) && !(await download(art.imageUrl, raw))) {
        console.warn(`  ! ${card.id} 下载失败：${art.imageUrl}`);
        continue;
      }
      // 复用同画时用不同横向裁切位，画面不重样
      const reuseRound = Math.floor(i / Math.max(1, pool.length));
      const xShift = [0.5, 0.15, 0.85, 0.3, 0.7][reuseRound % 5];
      const dest = `public/assets/cardart/${card.id}.webp`;
      try {
        processImage(raw, dest, 512, 640, xShift);
      } catch {
        console.warn(`  ! ${card.id} 图像处理失败`);
        continue;
      }
      usedKeys.add(art.key);
      artMap[card.id] = {
        file: `/assets/cardart/${card.id}.webp`,
        title: art.title, creator: art.creator, museum: art.museum,
        license: art.license, url: art.pageUrl,
      };
      if (!credits.some((c) => c.key === art.key)) credits.push(art);
      console.log(`  ✓ ${card.name} ← ${art.title.slice(0, 40)}`);
    }
  }

  // ---- 背景（主界面 + 三幕）：只取立轴（竖幅）高清作品，避免横卷放大糊图 ----
  const bgPool: Artwork[] = [];
  for (const q of BG_QUERIES) {
    const cma = await queryCma(q, 40);
    for (const a of cma) {
      const portrait = a.height > 0 && a.height >= a.width * 1.25 && a.height >= 1600;
      if (portrait && !usedKeys.has(a.key) && !bgPool.some((p) => p.key === a.key)) bgPool.push(a);
    }
    if (bgPool.length >= 8) break;
  }
  const bgTargets = ['bg_menu', 'bg_act1', 'bg_act2', 'bg_act3'];
  for (let i = 0; i < bgTargets.length && i < bgPool.length; i++) {
    const art = bgPool[i];
    const raw = `/tmp/museum_raw/${art.key}-hi.img`;
    if (!existsSync(raw) && !(await download(art.imageUrl, raw))) continue;
    try {
      processImage(raw, `public/assets/${bgTargets[i]}.webp`, 768, 1365, 0.5, 0.13);
      usedKeys.add(art.key);
      credits.push(art);
      console.log(`✓ ${bgTargets[i]} ← ${art.title.slice(0, 40)}`);
    } catch {
      console.warn(`! ${bgTargets[i]} 处理失败`);
    }
  }

  // ---- 写映射与授权台账 ----
  writeFileSync('src/data/cardArtMap.json', JSON.stringify(artMap, null, 1));
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    '# 素材授权台账（CREDITS）',
    '',
    `> 取用日期：${today}。以下博物馆藏品均为公有领域（CC0 / Open Access），来源与协议逐项核对。`,
    '> 敌人立绘、劫战雷云背景、宣纸纹理为本项目原创生成素材。音效为 Web Audio 代码合成。',
    '',
    '| 藏品 | 作者 | 馆方 | 协议 | 链接 |',
    '|---|---|---|---|---|',
    ...credits.map((c) => `| ${c.title.replace(/\|/g, '/')} | ${c.creator.replace(/\|/g, '/')} | ${c.museum} | ${c.license} | ${c.pageUrl} |`),
  ];
  writeFileSync('public/assets/CREDITS.md', lines.join('\n'));
  console.log(`\n完成：卡面 ${Object.keys(artMap).length} 张，台账 ${credits.length} 条`);
}

main();
