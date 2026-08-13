/**
 * v3 三张起始卡卡面拉取（策划案 §14.2 语义绑定，AGENTS.md 素材来源规则）
 *
 * 与 scripts/fetch-museum-art.ts 同一管线：克利夫兰 CC0 优先、Met 公有领域兜底，
 * 512×640 覆盖裁切 + 卡面提亮 LUT，产物与做旧处理完全一致。
 *
 * 语义绑定（§14.2）：
 *  - shouzhong 守中（土系防御）→ 山石/岩壁/磐石
 *  - runfeng   润锋（水金双行）→ 溪流/瀑布/水石相激
 *  - canjuan   问长生·残卷（本命牌）→ 书卷/经卷/书法
 *
 * 产物：
 *  - public/assets/cardart/{shouzhong,runfeng,canjuan}.webp
 *  - src/data/cardArtMap.json   合并三条新映射（不动已有条目）
 *  - public/assets/CREDITS.md   追加 v3 台账小节（取用日期以运行当日为准）
 *
 * 用法：npx tsx scripts/fetch-v3-art.ts
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const CMA_API = 'https://openaccess-api.clevelandart.org/api/artworks/';
const MET_SEARCH = 'https://collectionapi.metmuseum.org/public/collection/v1/search';
const MET_OBJECT = 'https://collectionapi.metmuseum.org/public/collection/v1/objects/';

interface Artwork {
  key: string;
  title: string;
  creator: string;
  museum: string;
  license: string;
  pageUrl: string;
  imageUrl: string;
  width: number;
  height: number;
}

/**
 * 三张卡的语义检索词与卡面意象过滤（标题必须可解释地对应卡牌机制/命名）。
 * avoid：标题命中则降权（如"菊石图"虽含 rock 但花卉主导，不贴"磐石"意象）。
 */
const TARGETS: { id: string; name: string; queries: string[]; prefer: RegExp; avoid?: RegExp }[] = [
  {
    id: 'shouzhong',
    name: '守中',
    queries: ['cliff', 'rock', 'mountain rock', 'stone'],
    prefer: /rock|cliff|crag|boulder|stone|mount/i,
    // 花鸟/人物/建筑/战役主导的标题不贴"磐石"意象；Taihu Garden Stone 为现代庭院照片，亦后置
    avoid: /chrysanthemum|orchid|flower|blossom|narcissus|lotus|bamboo|fish|bird|insect|jar|vase|buddha|bodhidharma|monastery|pagoda|battle|garden stone/i,
  },
  {
    id: 'runfeng',
    name: '润锋',
    queries: ['waterfall', 'stream', 'spring water', 'rapids'],
    prefer: /waterfall|stream|cascade|spring|rapid|torrent|cataract/i,
  },
  {
    id: 'canjuan',
    name: '问长生·残卷',
    queries: ['sutra', 'scroll calligraphy', 'manuscript', 'calligraphy'],
    prefer: /s[uū]tra|scroll|calligraph|script|manuscript|poem|classic/i,
  },
];

/**
 * 分辨率门槛：512×640 覆盖裁切要求原图有足够竖向像素。
 * 手卷全卷图常为 3400×90 之类的横长条，放大必糊，须排除；Met 未报尺寸的按通过处理。
 */
function sizeOk(a: Artwork): boolean {
  if (a.width === 0 && a.height === 0) return true;
  return a.height >= 1000 && a.width >= 600 && a.width <= a.height * 3;
}

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

/** 克利夫兰：CC0 + 有图 + 中国艺术部门（同 fetch-museum-art.ts） */
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

/** Met：公有领域 + 有图（限亚洲艺术部 departmentId=6，克利夫兰不够时兜底） */
async function queryMet(q: string, cap = 20): Promise<Artwork[]> {
  const search = (await getJson(
    `${MET_SEARCH}?q=${encodeURIComponent(q + ' chinese')}&hasImages=true&departmentId=6`,
  )) as { objectIDs?: number[] } | null;
  const ids = (search?.objectIDs ?? []).slice(0, cap);
  const out: Artwork[] = [];
  for (const id of ids) {
    await sleep(60);
    const obj = (await getJson(`${MET_OBJECT}${id}`)) as {
      isPublicDomain?: boolean; primaryImage?: string; primaryImageSmall?: string;
      title?: string; artistDisplayName?: string; objectURL?: string;
    } | null;
    if (obj?.isPublicDomain && (obj.primaryImage || obj.primaryImageSmall)) {
      out.push({
        key: `met-${id}`,
        title: obj.title || `Object ${id}`,
        creator: obj.artistDisplayName || '佚名',
        museum: 'The Metropolitan Museum of Art',
        license: 'Public Domain (Open Access)',
        pageUrl: obj.objectURL || `https://www.metmuseum.org/art/collection/search/${id}`,
        imageUrl: obj.primaryImage || obj.primaryImageSmall!,
        width: 0,
        height: 0,
      });
    }
  }
  return out;
}

/** 卡面 LUT（同 fetch-museum-art.ts）：提亮提对比、不加暗角，100px 宽下仍清晰 */
const CARD_FILTER =
  'eq=saturation=0.92:contrast=1.08:brightness=0.04,' +
  'colorbalance=rm=0.03:gm=0.0:bm=-0.04';

/** 同 fetch-museum-art.ts：先裁 8% 装裱边，再覆盖裁切到 512×640，最后统一调色 */
function processCardImage(src: string, dest: string, xShift = 0.5) {
  const insetPct = 0.08;
  const vf =
    `crop=iw*${(1 - insetPct * 2).toFixed(2)}:ih*${(1 - insetPct * 2).toFixed(2)},` +
    `scale=512:640:force_original_aspect_ratio=increase,` +
    `crop=512:640:(iw-512)*${xShift}:(ih-640)*0.28,` +
    CARD_FILTER;
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

/** 归一化链接（去协议/www/末尾斜杠），用于排除全库已入账画作 */
function normUrl(u: string): string {
  return u.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
}

async function main() {
  mkdirSync('public/assets/cardart', { recursive: true });
  mkdirSync('/tmp/museum_raw', { recursive: true });

  // 已用画作 = cardArtMap 全部条目 + CREDITS 台账全部链接（背景图等），避免复用；
  // 本脚本自己上一轮产出的三条不算"已用"，保证可重跑
  const artMap = JSON.parse(readFileSync('src/data/cardArtMap.json', 'utf8')) as Record<
    string,
    { file: string; title: string; creator: string; museum: string; license: string; url: string }
  >;
  const ownIds = new Set(TARGETS.map((t) => t.id));
  const usedUrls = new Set<string>(
    Object.entries(artMap).filter(([id]) => !ownIds.has(id)).map(([, a]) => normUrl(a.url)),
  );
  const creditsMd = readFileSync('public/assets/CREDITS.md', 'utf8');
  const creditsBase = creditsMd.replace(/\n+## v3 新增起始卡卡面[\s\S]*$/, '');
  for (const m of creditsBase.matchAll(/https?:\/\/\S+/g)) usedUrls.add(normUrl(m[0]));

  const picked: { id: string; art: Artwork }[] = [];

  for (const target of TARGETS) {
    console.log(`\n[${target.id}] ${target.name} 检索中…`);
    const pool: Artwork[] = [];
    for (const q of target.queries) {
      const cma = await queryCma(q);
      for (const a of cma) if (!pool.some((p) => p.key === a.key)) pool.push(a);
      await sleep(150);
    }
    const usable = (a: Artwork) =>
      !usedUrls.has(normUrl(a.pageUrl)) && !picked.some((p) => p.art.key === a.key) &&
      target.prefer.test(a.title) && sizeOk(a);
    // avoid 命中的候选整体后置，保证意象纯度（如守中先取纯山石而非花卉配石）
    const rank = (list: Artwork[]) => [
      ...list.filter((a) => !target.avoid?.test(a.title)),
      ...list.filter((a) => target.avoid?.test(a.title)),
    ];
    let candidates = rank(pool.filter(usable));
    // 克利夫兰没有语义匹配时用 Met 兜底
    if (candidates.length === 0) {
      for (const q of target.queries.slice(0, 2)) {
        const met = await queryMet(q);
        candidates = rank(met.filter(usable));
        if (candidates.length > 0) break;
      }
    }
    if (candidates.length === 0) {
      console.error(`  ! ${target.id} 检索多个关键词后仍无合适意象，需退用已入库素材重构（见任务说明 2）`);
      continue;
    }
    const art = candidates[0];
    console.log(`  候选 ${candidates.length} 件，选定：${art.title}（${art.museum}）`);

    const raw = `/tmp/museum_raw/${art.key}-hi.img`;
    if (!existsSync(raw) && !(await download(art.imageUrl, raw))) {
      console.error(`  ! 下载失败：${art.imageUrl}`);
      continue;
    }
    const dest = `public/assets/cardart/${target.id}.webp`;
    processCardImage(raw, dest);
    picked.push({ id: target.id, art });

    artMap[target.id] = {
      file: `/assets/cardart/${target.id}.webp`,
      title: art.title,
      creator: art.creator,
      museum: art.museum,
      license: art.license,
      url: art.pageUrl,
    };
    console.log(`  ✓ ${target.name} ← ${art.title}`);
  }

  if (picked.length === 0) {
    console.error('\n未产出任何卡面，映射与台账保持不变');
    return;
  }

  // ---- 合并映射（保持与既有文件相同的缩进格式）----
  writeFileSync('src/data/cardArtMap.json', JSON.stringify(artMap, null, 1));

  // ---- 追加台账小节（不改动既有条目；日期为运行当日；重跑时先剥离旧小节保持幂等）----
  const today = new Date().toISOString().slice(0, 10);
  const section = [
    '',
    `## v3 新增起始卡卡面（取用日期：${today}）`,
    '',
    '| 藏品 | 作者 | 馆方 | 协议 | 链接 |',
    '|---|---|---|---|---|',
    ...picked.map(
      ({ art }) =>
        `| ${art.title.replace(/\|/g, '/')} | ${art.creator.replace(/\|/g, '/')} | ${art.museum} | ${art.license} | ${art.pageUrl} |`,
    ),
  ].join('\n');
  writeFileSync('public/assets/CREDITS.md', creditsBase.trimEnd() + '\n' + section + '\n');

  console.log(`\n完成：新增卡面 ${picked.length} 张，映射与台账已更新`);
}

main();
