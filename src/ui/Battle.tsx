/**
 * 战斗界面 v3（策划案 §13.2 界面3 / §13.3 / §13.4 / §4.4）
 * - 两行卡面：基础段常亮 + 得气段灰墨，"打出将得气"时鎏金点亮（核心教学 UI）
 * - 行位罗盘：五行环 + 周天进度；滞气墨浊 / 天人合一金环
 * - 袖藏两步结束回合：END_TURN { sleeveUids }
 * - 护体属性条 + 敌意图五行染色 + 克伐提示
 * 交互沿用仓库约定：攻击牌先点卡再点敌；非指向牌点两次确认；扇形手牌 + 拖拽双通道。
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { BossDialogue, bossDialogue } from './Narrative';
import type { Action, BattleState, CardInstance, EnemyState, RunState } from '../core/types';
import { cardCost, canPlay, intentDamage, aliveEnemies } from '../core/combat';
import { getCard } from '../data/cards';
import {
  SHENG, KE, ELEMENT_NAME, ELEMENTS, KEFA_VERB, KEFA_NAME,
  type Element, type CardElement,
} from '../core/wuxing';
import { CardFace, ElBadge, ElixirBar, DeckModal, EL_COLOR, elName } from './components';
import { enemyArt, actBg } from './art';
import { inkSplash, deqiFlash, zhiqiInk } from '../fx/ink';
import { sfx } from '../audio/sfx';

// ---- 音效新 API 代理（audio 由他人并行改写：新名可用则用，暂缺时回退旧名，皆为可选调用）----
interface SfxV3 {
  deqi?: (el: Element) => void;
  zhiqi?: () => void;
  kefa?: () => void;
  sleeve?: () => void;
  zhoutian?: () => void;
  liushui?: (el: Element) => void;
  keZhi?: () => void;
}
const sfxV3 = sfx as unknown as SfxV3;
const sfxDeqi = (el: Element) => (sfxV3.deqi ?? sfxV3.liushui)?.(el);
const sfxZhiqi = () => sfxV3.zhiqi?.();
const sfxKefa = () => (sfxV3.kefa ?? sfxV3.keZhi)?.();
const sfxSleeve = () => sfxV3.sleeve?.();
const sfxZhoutian = () => sfxV3.zhoutian?.();

const STATUS_NAME: Record<string, string> = {
  gangqi: '罡气', guben: '固本', huichun: '回春', zhuoshao: '灼烧', zhangdu: '瘴毒',
  qizhi: '气滞', pozhan: '破绽', ruanhua: '软化', fanci: '反刺', fanshao: '反烧',
  tengou: '藤偶', niepan: '涅槃', yinguo: '因果',
  nextTurnDraw: '蓄牌', nextTurnBlock: '蓄土', retainBlock: '蓄护',
  drawDown: '滞识', tunaDown: '滞纳', sleeveBan: '封袖', blockHalf: '剑域', guixiDan: '龟息',
};

function StatusChips({ statuses }: { statuses: Partial<Record<string, number>> }) {
  return (
    <div class="status-row">
      {Object.entries(statuses)
        .filter(([k, v]) => (v ?? 0) !== 0 && !k.startsWith('_'))
        .map(([k, v]) => (
          <span key={k} class="status-chip">{STATUS_NAME[k] ?? k} {v}</span>
        ))}
    </div>
  );
}

const ENEMY_ICON: Record<string, string> = {
  zhiren: '🧻', yehu: '🦊', denglonggui: '🏮', yinfeng: '🌬', shuigui: '🌊', sheyao: '🐍',
  tiaoshi: '🧟', shanxiao: '🦍', huoya: '🐦', shijing: '🗿',
  heiwuchang: '🖤', baiwuchang: '🤍', tongjiashi: '🥉', leiling_kuilei: '⚡',
  huapi: '🎭', zhizhujing: '🕷', shuihouzi: '🐒', nuomiangui: '👺', gunv: '💀',
  panguanbiling: '🖌', yecha: '👹', shiqun: '🧟', zheng: '🐆', jinjiakuilei: '🤖',
  huyaojiangjun: '🐯', tengyao: '🌿', xinmo: '🌑', zhinian: '👤',
  yinbing: '⚔', jianzhongyiling: '🗡', leishou: '🦁', wangchuandugui: '🛶',
  jiuweihusi: '🦊', dinglukuilei: '🔥', shiyuetiangou: '🐕', shanshencanxiang: '⛰',
  jiao: '🐉', jianzhongzhizhu: '⚔',
  jingzhelei: '⚡', yinshalei: '⚡', zixiaolei: '⚡', benlei: '⚡', xuanlei: '⚡',
  xianlei: '⚡', falei: '⚡', mielei: '⚡', daolei: '☯',
};

/** 敌方意图（§4.6）：攻击图标染敌五行色；dailyWenluan 隐藏数值，天机丹全显 */
function IntentChip({ run, b, e }: { run: RunState; b: BattleState; e: EnemyState }) {
  const it = e.intent;
  if (!it) return <div class="enemy-intent">…</div>;
  const hideNumbers = !!run.flags['dailyWenluan'] && !b.tianjiActive;
  const tint = { borderLeftColor: EL_COLOR[e.element] };
  switch (it.kind) {
    case 'attack': {
      const dmg = intentDamage(b, e);
      const times = it.times && it.times > 1 ? `×${it.times}` : '';
      return (
        <div class="enemy-intent" style={tint}>
          <span class="intent-atk" style={{ color: EL_COLOR[e.element] }}>⚔︎</span>
          {' '}{hideNumbers ? '?' : dmg}{times}
        </div>
      );
    }
    case 'defend': return <div class="enemy-intent" style={tint}>🛡 防御</div>;
    case 'buff': return <div class="enemy-intent" style={tint}>↑ 强化</div>;
    case 'debuff': return <div class="enemy-intent" style={tint}>↓ 削弱</div>;
    case 'charge': return <div class="enemy-intent" style={tint}>🌩 蓄力</div>;
    default: return <div class="enemy-intent" style={tint}>❓ 未知</div>;
  }
}

/** 行位罗盘（§13.2 界面3）：五行环 + 周天进度；murk=滞气墨浊，tianren=金环旋转 */
function StanceCompass(props: { b: BattleState; goal: number; murk: boolean }) {
  const { b } = props;
  const R = 22;
  return (
    <div
      class={`stance-compass ${props.murk || b.shengBlocked ? 'murk' : ''} ${b.tianren ? 'tianren' : ''}`}
      title={
        b.tianren
          ? '天人合一待发：下一张有得气段的牌双段齐发（无视行位）'
          : b.shengBlocked
            ? '滞气：你的下一张有属性牌无法得气'
            : `行位：${b.stance ? ELEMENT_NAME[b.stance] : '无'}。打出被行位所生之行的牌可【得气】。周天进度 ${b.chain.length}/${props.goal}。`
      }
    >
      {ELEMENTS.map((el, i) => {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const active = b.stance === el;
        const next = !b.shengBlocked && b.stance != null && SHENG[b.stance] === el;
        return (
          <span
            key={el}
            class={`compass-dot ${active ? 'active' : ''} ${next ? 'next' : ''}`}
            style={{
              background: EL_COLOR[el],
              transform: `translate(${(Math.cos(a) * R).toFixed(1)}px, ${(Math.sin(a) * R).toFixed(1)}px)${active ? ' scale(1.18)' : ''}`,
            }}
          >
            {ELEMENT_NAME[el]}
          </span>
        );
      })}
      <div class="compass-center">
        <span>{b.tianren ? '合一' : b.shengBlocked ? '滞气' : b.stance ? ELEMENT_NAME[b.stance] : '行位'}</span>
        <div class="chain-dots">
          {Array.from({ length: props.goal }, (_, i) => (
            <span
              key={i}
              class={`chain-dot ${i < b.chain.length ? 'on' : ''}`}
              style={i < b.chain.length ? { background: EL_COLOR[b.chain[i]] } : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** 新手引导四步（策划案 §13.5，本地进度存 localStorage） */
const GUIDE_STEPS = [
  '出牌方法：点选手牌后点敌人（或再点一次）打出；也可以按住卡牌向上拖，拖过中线松手打出，攻击牌直接拖到敌人身上。',
  '敌人头顶是下回合意图，⚔︎ 图标染其五行色。护体也有五行：敌攻克你的护体挡半（▼红箭头），你的护体克敌攻倍挡（▲金箭头）。',
  '得气：卡面第二行平时灰墨。当行位（罗盘高亮）所生之行与手牌相合时，那张牌的得气段鎏金点亮——打出即双段齐发。',
  '克伐：用克制敌人属性的攻击牌触发专属动词（剪伐/破土/滞涩/浇熄/熔锻）。点敌人可查看其属性与克伐提示；随时点左上『☯五行』看口诀。',
];

function loadGuideStep(): number {
  try {
    return Number(localStorage.getItem('wcs_guide') ?? '0');
  } catch {
    return 99;
  }
}

/** 攻击目标元素 ee 的克伐动词提示：找到克 ee 的行 */
function counterElement(ee: Element): Element {
  return ELEMENTS.find((k) => KE[k] === ee)!;
}

export function BattleScreen(props: { run: RunState; dispatch: (a: Action) => void }) {
  const { run, dispatch } = props;
  const b = run.battle!;
  const [selected, setSelected] = useState<number | null>(null);
  const [dualPick, setDualPick] = useState<'a' | 'b'>('a');
  const [viewPile, setViewPile] = useState<'draw' | 'discard' | 'exhaust' | 'sleeved' | null>(null);
  const [pickedUids, setPickedUids] = useState<number[]>([]);
  const [showWuxing, setShowWuxing] = useState(false);
  const [guideStep, setGuideStep] = useState<number>(() => loadGuideStep());
  const [enemyDetail, setEnemyDetail] = useState<number | null>(null); // 敌人 uid
  // 袖藏浮层（结束回合两步）
  const [sleeveOpen, setSleeveOpen] = useState(false);
  const [sleevePicks, setSleevePicks] = useState<number[]>([]);
  // 罗盘滞气墨浊（180ms）与周天五色环（900ms）
  const [compassMurk, setCompassMurk] = useState(false);
  const [zhoutianFx, setZhoutianFx] = useState(false);

  // Boss 战前对白（§3.3）：仅开场时展示一次
  const [showDialogue, setShowDialogue] = useState<boolean>(
    () => b.battleType === 'boss' && b.turn === 1 && b.cardsPlayed === 0 && b.turnsTotal <= 1,
  );

  // ---- 得气预判（契约 §types.ts 行位判定）：打出将得气 → 得气段鎏金点亮 ----
  function willDeqi(c: CardInstance): { deqi: boolean; side: 'a' | 'b' | 'both' | null } {
    const def = getCard(c.cardId);
    const hasSheng = !!def.sheng || !!def.dual;
    if (!hasSheng || b.shengBlocked) return { deqi: false, side: null };
    const check = (el: CardElement) =>
      el !== 'none' && (b.tianren || b.wuxingDanNext || (b.stance != null && SHENG[b.stance] === el));
    if (def.dual) {
      const a = check(def.dual.elements[0]);
      const bb = check(def.dual.elements[1]);
      return { deqi: a || bb, side: a && bb ? 'both' : a ? 'a' : bb ? 'b' : null };
    }
    return { deqi: check(def.element), side: null };
  }

  // ---- 袖藏上限（契约 sleeveCapBonus 注释）：1 + 洛书 + 冥想加成；北冥吞天无上限；sleeveBan 封 ----
  const sleeveBanned = (b.player.statuses.sleeveBan ?? 0) > 0;
  const sleeveUnlimited = b.powers.some((p) => p.cardId === 'beimingtuntian');
  const sleeveCap = sleeveBanned ? 0 : 1 + (run.relics.includes('luoshu') ? 1 : 0) + b.sleeveCapBonus;

  // ---- 战斗反馈层（§13.4）：飘字 / 卡牌飞行残影 / 受击白闪 ----
  interface FloatNum { id: number; x: number; y: number; text: string; cls: string }
  interface Ghost { id: number; x: number; y: number; dx: number; dy: number; name: string; color: string }
  const [floats, setFloats] = useState<FloatNum[]>([]);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [hitUids, setHitUids] = useState<number[]>([]);
  const fxId = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevRef = useRef<{ hp: number; b: BattleState } | null>(null);
  const pendingPlay = useRef<{
    uid: number; x: number; y: number; clientX: number; clientY: number;
    target?: number; name: string; color: string; el: CardElement;
  } | null>(null);

  function relPos(clientX: number, clientY: number) {
    const r = containerRef.current?.getBoundingClientRect();
    return r ? { x: clientX - r.left, y: clientY - r.top } : { x: clientX, y: clientY };
  }

  function enemyAnchor(uid: number): { x: number; y: number; clientX: number; clientY: number } | null {
    const el = document.querySelector(`[data-euid="${uid}"] .enemy-figure`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const p = relPos(r.left + r.width / 2, r.top + r.height / 2);
    return { ...p, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
  }

  function spawnFloat(x: number, y: number, text: string, cls: string, delay = 0) {
    fxId.current += 1;
    const id = fxId.current;
    setTimeout(() => {
      setFloats((f) => [...f, { id, x, y, text, cls }]);
      setTimeout(() => setFloats((f) => f.filter((o) => o.id !== id)), 1700);
    }, delay);
  }

  /** 出牌统一入口：记录卡牌起点用于飞行残影 / 得气涟漪；双行牌带 dualPick */
  function playAction(uid: number, target?: number) {
    const inst = b.hand.find((c) => c.uid === uid);
    if (!inst) return;
    const def = getCard(inst.cardId);
    const el = document.querySelector(`[data-cuid="${uid}"]`);
    let dp: 'a' | 'b' | undefined;
    if (def.dual) {
      dp = uid === selected ? dualPick : (willDeqi(inst).side === 'b' ? 'b' : 'a');
    }
    if (el) {
      const r = el.getBoundingClientRect();
      const cx0 = r.left + r.width / 2;
      const cy0 = r.top + r.height / 2;
      const p = relPos(cx0, cy0);
      const elem: CardElement = def.dual ? def.dual.elements[dp === 'b' ? 1 : 0] : def.element;
      pendingPlay.current = {
        uid, ...p, clientX: cx0, clientY: cy0, target,
        name: def.name, color: EL_COLOR[def.element], el: elem,
      };
    }
    dispatch({ t: 'PLAY_CARD', uid, target, dualPick: dp });
  }

  // 状态差分 → 战斗反馈
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { hp: run.hp, b };
    if (!prev || prev.b === b) return;
    const pb = prev.b;
    const box = containerRef.current?.getBoundingClientRect();
    const cw = box?.width ?? 470;
    const ch = box?.height ?? 800;
    const px = cw / 2;
    const py = ch - 248; // 手牌区上方

    // 卡牌飞行残影（出牌 → 目标/场中央）
    const pp = pendingPlay.current;
    if (pp && pb.hand.some((c) => c.uid === pp.uid) && !b.hand.some((c) => c.uid === pp.uid)) {
      const to = (pp.target != null ? enemyAnchor(pp.target) : null) ?? { x: px, y: ch * 0.32 };
      fxId.current += 1;
      const id = fxId.current;
      setGhosts((g) => [...g, { id, x: pp.x, y: pp.y, dx: to.x - pp.x, dy: to.y - pp.y, name: pp.name, color: pp.color }]);
      setTimeout(() => setGhosts((g) => g.filter((o) => o.id !== id)), 420);
    }

    // 敌人差分：掉血飘字 + 受击白闪 + 墨溅；护体增长
    const newHits: number[] = [];
    b.enemies.forEach((e, idx) => {
      const pe = pb.enemies.find((x) => x.uid === e.uid);
      if (!pe) return;
      const pos = enemyAnchor(e.uid);
      if (!pos) return;
      const dmg = pe.hp - Math.max(0, e.hp);
      if (dmg > 0) {
        spawnFloat(pos.x, pos.y - 22, `-${dmg}`, 'f-dmg', idx * 90);
        newHits.push(e.uid);
        inkSplash(pos.clientX, pos.clientY);
      }
      const bg = e.block - pe.block;
      if (bg > 0) spawnFloat(pos.x, pos.y + 14, `护体+${bg}`, 'f-block', idx * 90);
      else if (bg < 0 && dmg === 0) {
        // 攻击被敌方护体完全吸收：也要有反馈
        spawnFloat(pos.x, pos.y - 18, `护体挡下 ${-bg}`, 'f-blocked', idx * 90);
        newHits.push(e.uid);
        inkSplash(pos.clientX, pos.clientY);
      }
    });
    if (newHits.length > 0) {
      setHitUids(newHits);
      setTimeout(() => setHitUids([]), 360);
    }

    // 玩家差分：气血 / 护体（含格挡反馈）
    const hpD = run.hp - prev.hp;
    const blkD = b.player.block - pb.player.block;
    const turnChanged = b.turn !== pb.turn;
    if (hpD < 0) spawnFloat(px, py, `${hpD}`, 'f-dmg f-playerhit');
    else if (hpD > 0) spawnFloat(px, py, `+${hpD}`, 'f-heal');
    else if (turnChanged) {
      // 回合结算中敌人有攻击意图但一滴血没掉：护体全部挡下
      const incoming = pb.enemies
        .filter((e) => e.hp > 0)
        .reduce((s, e) => s + (e.intent?.kind === 'attack' ? (intentDamage(pb, e) ?? 0) * (e.intent.times ?? 1) : 0), 0);
      if (incoming > 0) spawnFloat(px, py, `护体挡下 ${Math.min(incoming, pb.player.block)}`, 'f-blocked');
    } else if (blkD < 0) {
      spawnFloat(px, py, `护体挡下 ${-blkD}`, 'f-blocked');
    }
    if (blkD > 0) spawnFloat(px + 84, py, `护体+${blkD}`, 'f-block');

    // 得气（deqiCountTurn 增量）：鎏金涟漪 + 五声单音 + 飘字
    if (b.turn === pb.turn && b.deqiCountTurn > pb.deqiCountTurn) {
      const at = pp ?? { x: px, y: py, clientX: 0, clientY: 0, el: 'none' as CardElement };
      deqiFlash(pp?.clientX ?? window.innerWidth / 2, pp?.clientY ?? window.innerHeight * 0.6);
      if (at.el !== 'none') sfxDeqi(at.el as Element);
      spawnFloat(pp?.x ?? px, (pp?.y ?? py) - 30, '得气', 'f-deqi');
    }

    // 滞气（shengBlocked 上升沿）：全屏角落墨浊 + 罗盘蒙墨 180ms + 浊弦一声
    if (b.shengBlocked && !pb.shengBlocked) {
      zhiqiInk();
      sfxZhiqi();
      setCompassMurk(true);
      setTimeout(() => setCompassMurk(false), 180);
      spawnFloat(px, py - 30, '滞气', 'f-zhiqi');
    }

    // 五行周天 · 天人合一（tianren 上升沿 / 周天计数）：900ms 五色环（非阻塞）
    if ((b.tianren && !pb.tianren) || b.zhoutianTotal > pb.zhoutianTotal) {
      setZhoutianFx(true);
      setTimeout(() => setZhoutianFx(false), 900);
      sfxZhoutian();
      spawnFloat(px, py - 60, '五行周天 · 天人合一', 'f-gold f-bigfx');
    }

    // 触发类提示（来自战斗日志增量）
    const newLogs = b.log.slice(pb.log.length);
    let stack = 0;
    const kefaAt = (pp?.target != null ? enemyAnchor(pp.target) : null) ?? { x: px, y: ch * 0.3 };
    for (const l of newLogs) {
      const verb = Object.values(KEFA_NAME).find((v) => l.includes(v));
      if (verb) {
        // 克伐动词飘字（剪伐/破土/滞涩/浇熄/熔锻，250ms 弹出演出）
        spawnFloat(kefaAt.x, kefaAt.y - 44 - stack * 24, `【${verb}】`, 'f-kefa', stack * 120);
        sfxKefa();
        stack += 1;
      } else if (l.includes('诛心') || l.includes('问道') || l.includes('拷问') || l.includes('贪影') || l.includes('心魔')) {
        // Boss 机制提示沿用 log 飘字
        spawnFloat(px, ch * 0.28 + stack * 26, l, 'f-boss', stack * 140);
        stack += 1;
      } else if (l.includes('袖藏')) {
        spawnFloat(px, py - 30 - stack * 24, l, 'f-gold', stack * 120);
        stack += 1;
      }
    }
    pendingPlay.current = null;
  }, [run]);

  // 回合切换横幅（§13.4）
  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (b.turn <= 1) return;
    setBanner(`回合 ${b.turn} · 你的回合`);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 1050);
    return () => { if (bannerTimer.current) clearTimeout(bannerTimer.current); };
  }, [b.turn]);

  // 回合切换后重置袖藏浮层选择
  useEffect(() => {
    setSleeveOpen(false);
    setSleevePicks([]);
  }, [b.turn]);

  // ---- 手牌拖拽（§13.3：上滑过阈值线打出，拖到敌人释放，拖回取消）----
  interface DragState {
    uid: number;
    startX: number; startY: number;
    dx: number; dy: number;
    moved: boolean;
    overLine: boolean;
    hoverEnemy: number | null;
  }
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  function updateDrag(d: DragState | null) {
    dragRef.current = d;
    setDrag(d);
  }

  function playLineY(): number {
    return window.innerHeight * 0.55; // 阈值线：屏幕 55% 高度（§13.3）
  }

  function onCardPointerDown(ev: PointerEvent, uid: number) {
    if (b.pendingChoice || sleeveOpen) return;
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    updateDrag({
      uid, startX: ev.clientX, startY: ev.clientY,
      dx: 0, dy: 0, moved: false, overLine: false, hoverEnemy: null,
    });
  }

  function onCardPointerMove(ev: PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = ev.clientX - d.startX;
    const dy = ev.clientY - d.startY;
    const moved = d.moved || Math.hypot(dx, dy) > 9;
    const overLine = ev.clientY < playLineY();
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    // 磁吸换选（§13.3）：仍在手牌区横向滑动时，滑到哪张换选哪张
    if (dy > -46) {
      const slotEl = el?.closest?.('[data-cuid]') as HTMLElement | null;
      const overUid = slotEl ? Number(slotEl.dataset['cuid']) : null;
      if (overUid != null && overUid !== d.uid && b.hand.some((c) => c.uid === overUid)) {
        selectCard(overUid);
        updateDrag({ ...d, uid: overUid, dx, dy, moved, overLine: false, hoverEnemy: null });
        return;
      }
    }
    // 悬停敌人检测（拖到敌人身上释放）
    let hoverEnemy: number | null = null;
    const enemyEl = el?.closest?.('[data-euid]') as HTMLElement | null;
    if (enemyEl) hoverEnemy = Number(enemyEl.dataset['euid']);
    updateDrag({ ...d, dx, dy, moved, overLine, hoverEnemy });
  }

  function onCardPointerUp(_ev: PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    updateDrag(null);
    const inst = b.hand.find((c) => c.uid === d.uid);
    if (!inst) return;
    if (!d.moved) {
      tapCard(d.uid); // 原地松手 = 点选
      return;
    }
    if (!canPlay(run, b, inst)) return; // 不可用牌禁上滑（§13.3）
    const def = getCard(inst.cardId);
    const wantsTarget = needsTarget(inst.cardId) && !def.base.aoe;
    if (wantsTarget) {
      const alive = aliveEnemies(b);
      const target = d.hoverEnemy != null && alive.some((e) => e.uid === d.hoverEnemy)
        ? d.hoverEnemy
        : alive.length === 1 && d.overLine ? alive[0].uid : null;
      if (target != null) {
        playAction(d.uid, target);
        setSelected(null);
      } else if (d.overLine) {
        selectCard(d.uid); // 拖过线但没落在敌人上：保持选中等待点目标
      }
      return;
    }
    if (d.overLine) {
      playAction(d.uid);
      setSelected(null);
    }
    // 拖回手牌区：取消，无操作
  }

  function advanceGuide() {
    const next = guideStep + 1;
    setGuideStep(next);
    try { localStorage.setItem('wcs_guide', String(next)); } catch { /* 忽略 */ }
  }

  const selectedCard = b.hand.find((c) => c.uid === selected) ?? null;
  const isJie = b.waveIndex >= 0;
  const anyPlayable = b.hand.some((c) => canPlay(run, b, c));

  function needsTarget(cardId: string): boolean {
    const def = getCard(cardId);
    return def.type === 'attack' || !!def.targetEnemy;
  }

  /** 选中卡：双行牌同时初始化默认定行（顺生侧优先） */
  function selectCard(uid: number) {
    setSelected(uid);
    const inst = b.hand.find((c) => c.uid === uid);
    if (inst && getCard(inst.cardId).dual) {
      setDualPick(willDeqi(inst).side === 'b' ? 'b' : 'a');
    }
  }

  function tapCard(uid: number) {
    const inst = b.hand.find((c) => c.uid === uid);
    if (!inst) return;
    if (selected === uid) {
      // 二次点击：非指向牌直接打出（§13.3 二次确认）
      const def = getCard(inst.cardId);
      const aoeOrNoTarget = !needsTarget(inst.cardId) || def.base.aoe;
      if (aoeOrNoTarget && canPlay(run, b, inst)) {
        playAction(uid);
        setSelected(null);
      } else {
        setSelected(null);
      }
      return;
    }
    selectCard(uid);
  }

  function tapEnemy(e: EnemyState) {
    if (selectedCard && canPlay(run, b, selectedCard) && needsTarget(selectedCard.cardId) && !getCard(selectedCard.cardId).base.aoe) {
      playAction(selectedCard.uid, e.uid);
      setSelected(null);
      return;
    }
    // 非选目标状态：点开敌人详情（属性 + 克伐提示，§4.4④⑤）
    setEnemyDetail(e.uid);
  }

  // ---- 结束回合两步：先弹袖藏浮层，确认后 dispatch END_TURN { sleeveUids } ----
  function onEndTurnClick() {
    setSelected(null);
    if (b.hand.length === 0) {
      dispatch({ t: 'END_TURN', sleeveUids: [] });
      return;
    }
    setSleevePicks([]);
    setSleeveOpen(true);
  }

  function confirmEndTurn(picks: number[]) {
    if (picks.length > 0) sfxSleeve();
    setSleeveOpen(false);
    setSleevePicks([]);
    dispatch({ t: 'END_TURN', sleeveUids: picks });
  }

  function toggleSleevePick(uid: number) {
    if (sleeveBanned) return;
    setSleevePicks((prev) => {
      if (prev.includes(uid)) return prev.filter((x) => x !== uid);
      if (!sleeveUnlimited && prev.length >= sleeveCap) {
        return sleeveCap === 1 ? [uid] : prev; // 上限 1 时点新卡直接换选
      }
      return [...prev, uid];
    });
  }

  // 袖藏浮层快捷键：N / Esc = 不袖藏直接结束；Enter = 按当前选择结束
  useEffect(() => {
    if (!sleeveOpen) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'n' || ev.key === 'N' || ev.key === 'Escape') {
        ev.preventDefault();
        confirmEndTurn([]);
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        confirmEndTurn(sleevePicks);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sleeveOpen, sleevePicks]);

  const choice = b.pendingChoice;

  // 拖拽中的指向牌：拖起后敌人即高亮
  const dragCard = drag?.moved ? b.hand.find((c) => c.uid === drag.uid) ?? null : null;
  const dragTargeting = !!(
    dragCard && canPlay(run, b, dragCard) &&
    needsTarget(dragCard.cardId) && !getCard(dragCard.cardId).base.aoe
  );

  // 目标选择状态：攻击牌/指向技能已选中，等待点敌人
  const awaitingTarget =
    (selectedCard && needsTarget(selectedCard.cardId) && !getCard(selectedCard.cardId).base.aoe && canPlay(run, b, selectedCard)) ||
    dragTargeting;
  // 已选中的非指向牌：再点一次打出
  const awaitingConfirm =
    selectedCard && !awaitingTarget && canPlay(run, b, selectedCard);

  // 护体条生克箭头（§4.4⑤）：敌攻克你护体 = ▼红；你护体克敌攻 = ▲金
  const blockEl = b.player.blockElement;
  const incomingAtkEls = aliveEnemies(b)
    .filter((e) => e.intent?.kind === 'attack' || e.intent?.kind === 'charge')
    .map((e) => e.element);
  const blkDanger = blockEl !== 'none' && incomingAtkEls.some((el) => el !== 'none' && KE[el as Element] === blockEl);
  const blkStrong = blockEl !== 'none' && incomingAtkEls.some((el) => el !== 'none' && KE[blockEl] === el);

  // 周天目标行数：道果"一气化三清"为 4，其余 5
  const zhoutianGoal = run.fruits.includes('yiqihuasanqing') ? 4 : 5;

  const detailEnemy = enemyDetail != null ? b.enemies.find((e) => e.uid === enemyDetail) ?? null : null;
  const selectedDualDef = selectedCard ? getCard(selectedCard.cardId).dual : undefined;

  return (
    <div
      ref={containerRef}
      class={`battle fade-in ${isJie ? 'jie-bg' : ''}`}
      style={isJie ? undefined : { backgroundImage: `linear-gradient(rgba(244,239,230,0.55), rgba(244,239,230,0.4) 40%, rgba(244,239,230,0.88) 62%), url(${actBg(run.act)})`, backgroundSize: 'cover', backgroundPosition: 'center top' }}
    >
      <div class="enemy-zone">
        {b.enemies.map((e) => (
          <div
            key={e.uid}
            data-euid={e.uid}
            class={`enemy ${e.hp <= 0 ? 'dead' : ''} ${isJie || e.maxHp >= 130 ? 'boss' : e.maxHp >= 90 ? 'elite' : ''} ${awaitingTarget && e.hp > 0 ? 'targetable' : ''} ${drag?.hoverEnemy === e.uid && dragTargeting ? 'drag-hover' : ''} ${hitUids.includes(e.uid) ? 'hitflash' : ''}`}
            onClick={() => e.hp > 0 && tapEnemy(e)}
          >
            <IntentChip run={run} b={b} e={e} />
            <div class="enemy-figure">
              {enemyArt(e.enemyId)
                ? <img src={enemyArt(e.enemyId)!} alt={e.name} draggable={false} />
                : (ENEMY_ICON[e.enemyId] ?? '👾')}
              <div class="enemy-ground" />
            </div>
            <div class="enemy-name"><ElBadge el={e.element} /> {e.name}</div>
            <div class="hpbar"><div style={{ width: `${(e.hp / e.maxHp) * 100}%` }} /></div>
            <div class="enemy-hp-num">{e.hp}/{e.maxHp}{e.block > 0 ? ` 🛡${e.block}` : ''}</div>
            <StatusChips statuses={e.statuses} />
          </div>
        ))}
      </div>

      <div class="mid-zone">
        <button class="wuxing-btn" onClick={() => setShowWuxing(true)} title="五行速查">☯五行</button>
        <StanceCompass b={b} goal={zhoutianGoal} murk={compassMurk} />
        <StatusChips statuses={b.player.statuses} />
        <div class="pile-info">
          <span onClick={() => setViewPile('draw')}>抽牌 {b.drawPile.length}</span>
          <span onClick={() => setViewPile('discard')}>弃牌 {b.discardPile.length}</span>
          <span onClick={() => setViewPile('exhaust')}>放逐 {b.exhaustPile.length}</span>
          <span class="sleeve-count" onClick={() => setViewPile('sleeved')} title="袖藏区：下回合开始先入手">袖 {b.sleeved.length}</span>
          <span>回合 {b.turn}</span>
        </div>
      </div>

      <div class="hand-zone">
        {b.player.block > 0 && (
          <div class={`player-block blk-${blockEl}`} title={`护体属性：${elName(blockEl)}。敌攻克护体挡半，护体克敌攻倍挡，无属性恒 1:1。`}>
            🛡 {elName(blockEl)} · 护体 {b.player.block}
            {blkDanger && <span class="blk-arrow down" title="敌方来袭克制你的护体：每 1 伤耗 2 护体">▼</span>}
            {blkStrong && <span class="blk-arrow up" title="你的护体克制敌方来袭：每 2 伤耗 1 护体">▲</span>}
          </div>
        )}
        {selectedDualDef && selectedCard && (
          <div class="dual-pick-bar">
            定行：
            <button
              class={dualPick === 'a' ? 'on' : ''}
              style={{ borderColor: EL_COLOR[selectedDualDef.elements[0]] }}
              onClick={() => setDualPick('a')}
            >
              {ELEMENT_NAME[selectedDualDef.elements[0]]}
            </button>
            <button
              class={dualPick === 'b' ? 'on' : ''}
              style={{ borderColor: EL_COLOR[selectedDualDef.elements[1]] }}
              onClick={() => setDualPick('b')}
            >
              {ELEMENT_NAME[selectedDualDef.elements[1]]}
            </button>
          </div>
        )}
        <div class="hand-cards">
          {b.hand.map((c, i) => {
            // 扇形排布（§13.3）：卡间角随手牌数收缩，选中/拖拽卡直立
            const n = b.hand.length;
            const mid = (n - 1) / 2;
            const ang = Math.min(6, 34 / Math.max(1, n));
            const isSel = selected === c.uid;
            const isDrag = drag?.uid === c.uid && drag.moved;
            let transform: string;
            if (isDrag) {
              transform = `translate(${drag!.dx}px, ${drag!.dy}px) rotate(0deg) scale(1.08)`;
            } else if (isSel) {
              transform = 'translateY(-26px) scale(1.14) rotate(0deg)';
            } else {
              const off = i - mid;
              transform = `rotate(${(off * ang).toFixed(1)}deg) translateY(${(off * off * 2.2).toFixed(1)}px)`;
            }
            const dq = willDeqi(c);
            return (
              <div
                key={c.uid}
                data-cuid={c.uid}
                class={`hand-slot ${isDrag ? 'dragging' : ''}`}
                style={{ transform, zIndex: isDrag ? 30 : isSel ? 10 : undefined }}
                onPointerDown={(ev) => onCardPointerDown(ev as unknown as PointerEvent, c.uid)}
                onPointerMove={(ev) => onCardPointerMove(ev as unknown as PointerEvent)}
                onPointerUp={(ev) => onCardPointerUp(ev as unknown as PointerEvent)}
                onPointerCancel={() => updateDrag(null)}
              >
                <CardFace
                  card={c}
                  cost={getCard(c.cardId).cost === 'X' ? 'X' : cardCost(run, b, c)}
                  selected={isSel}
                  unplayable={!canPlay(run, b, c)}
                  deqiGlow={dq.deqi}
                  deqiSide={dq.side}
                />
              </div>
            );
          })}
        </div>
        {dragCard && canPlay(run, b, dragCard) && (
          <div class={`play-line ${drag?.overLine || drag?.hoverEnemy != null ? 'armed' : ''}`} style={{ top: '55dvh' }}>
            {dragTargeting ? '拖到敌人身上松手释放' : drag?.overLine ? '松手打出' : '上滑过此线打出'}
          </div>
        )}
        {(awaitingTarget || awaitingConfirm || (!anyPlayable && !choice)) && !sleeveOpen && (
          <div class={`action-hint ${awaitingTarget ? 'hint-target' : ''}`}>
            {awaitingTarget
              ? `⬆ 点选上方敌人，释放【${getCard(selectedCard!.cardId).name}】`
              : awaitingConfirm
                ? `再点一次【${getCard(selectedCard!.cardId).name}】打出`
                : '灵气不足或无可出之牌，点右下【结束回合】'}
          </div>
        )}
        <div class="battle-bottom">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div class="energy-orb" title={run.realm === 'lianqi' ? '灵气（炼气期每回合 4，不储存）' : `气海存灵 ${b.player.energy}/${run.poolCap}（跨回合保留）`}>
              {b.player.energy}
            </div>
            {run.realm !== 'lianqi' && (
              <div class="pool-gauge" title={`气海：存灵 ${b.player.energy}/${run.poolCap}`}>
                <div class="pool-ticks">
                  {Array.from({ length: run.poolCap }, (_, i) => (
                    <span key={i} class={`pool-tick ${i < Math.min(b.player.energy, run.poolCap) ? 'on' : ''}`} />
                  ))}
                </div>
                <span>存灵 {b.player.energy}/{run.poolCap}</span>
              </div>
            )}
          </div>
          <ElixirBar run={run} onUse={(id) => dispatch({ t: 'USE_ELIXIR', elixir: id })} />
          <button
            class={`endturn ${!anyPlayable && !choice ? 'attention' : ''}`}
            onClick={onEndTurnClick}
          >
            结束回合
          </button>
        </div>
      </div>

      {/* 战斗反馈层：飘字与卡牌飞行残影 */}
      <div class="float-layer">
        {floats.map((f) => (
          <div key={f.id} class={`fnum ${f.cls}`} style={{ left: `${f.x}px`, top: `${f.y}px` }}>{f.text}</div>
        ))}
        {ghosts.map((g) => (
          <div
            key={g.id}
            class="card-ghost"
            style={{ left: `${g.x}px`, top: `${g.y}px`, '--dx': `${g.dx}px`, '--dy': `${g.dy}px`, borderColor: g.color }}
          >
            {g.name}
          </div>
        ))}
        {zhoutianFx && <div class="zhoutian-ring" />}
      </div>

      {banner && <div class="turn-banner" key={banner}>{banner}</div>}

      {showDialogue && (
        <BossDialogue
          lines={bossDialogue(run, isJie ? 'jiuchong' : b.enemies[0]?.enemyId ?? '')}
          onDone={() => setShowDialogue(false)}
        />
      )}

      {guideStep < GUIDE_STEPS.length && !choice && !showDialogue && !sleeveOpen && (
        <div class="guide-toast">
          <span class="guide-num">{guideStep + 1}/{GUIDE_STEPS.length}</span>
          <span class="guide-text">{GUIDE_STEPS[guideStep]}</span>
          <button class="guide-ok" onClick={advanceGuide}>知道了</button>
        </div>
      )}

      {showWuxing && (
        <div class="overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowWuxing(false); }}>
          <div class="panel">
            <h3>五行速查</h3>
            <div class="wuxing-sheet">
              <p><b>相生（得气顺序）</b>：木 → 火 → 土 → 金 → 水 → 木</p>
              <p>行位 = 最后打出的有属性牌之行（罗盘高亮）。打出被行位<b>所生</b>之行的牌【得气】：卡面第二行（灰墨的得气段）点亮生效。打出<b>克制行位</b>之行的牌【滞气】：下一张有属性牌无法得气。无属性牌不改行位、不断链。</p>
              <p>一回合内沿相生打满五行（{run.fruits.includes('yiqihuasanqing') ? '一气化三清：任意 4 行' : '五行各一次'}）触发【五行周天】：吐纳 +3，且下一张有得气段的牌双段齐发（天人合一，罗盘金环旋转时打出即可）。</p>
              <p><b>相克 ·【克伐】</b>（用克制敌人属性的攻击牌触发，各克向功能不同）</p>
              <p>金克木 →【剪伐】移除目标至多 2 层增益，每层此击 +4 伤<br />木克土 →【破土】目标护体减半，本回合无法再获护体<br />土克水 →【滞涩】目标意图延迟 1 回合<br />水克火 →【浇熄】取消蓄力，否则移除 1 层增益<br />火克金 →【熔锻】此击 50% 伤害无视护体，并【软化】目标</p>
              <p><b>护体属性</b>：防御牌产生同行护体（护体条染色）。敌攻克你护体 = 挡半（▼）；你护体克敌攻 = 倍挡（▲）；无属性恒 1:1。</p>
              <p><b>操作</b>：点选手牌后，攻击牌点敌人释放；其他牌再点一次打出。结束回合时可袖藏手牌至下回合。</p>
            </div>
            <div style={{ textAlign: 'center' }}><button onClick={() => setShowWuxing(false)}>关闭</button></div>
          </div>
        </div>
      )}

      {b.log.length > 0 && <div class="battle-log">{b.log[b.log.length - 1]}</div>}

      {/* 敌人详情：属性 + 克伐提示（§4.4④⑤） */}
      {detailEnemy && (
        <div class="overlay" onClick={(e) => { if (e.target === e.currentTarget) setEnemyDetail(null); }}>
          <div class="panel">
            <h3><ElBadge el={detailEnemy.element} /> {detailEnemy.name}</h3>
            <div class="enemy-detail-rows">
              <div class="ed-row">气血 {detailEnemy.hp}/{detailEnemy.maxHp}{detailEnemy.block > 0 ? ` · 护体 ${detailEnemy.block}` : ''}</div>
              {detailEnemy.element !== 'none' ? (
                <>
                  <div class="ed-row ed-kefa">
                    克伐：以<b>{ELEMENT_NAME[counterElement(detailEnemy.element as Element)]}</b>行攻击牌击之，触发
                    【{KEFA_NAME[KEFA_VERB[counterElement(detailEnemy.element as Element)]]}】。
                    同行护体（{ELEMENT_NAME[counterElement(detailEnemy.element as Element)]}）克其来攻，可倍挡（▲）。
                  </div>
                  <div class="ed-row ed-warn">
                    其攻击带<b>{ELEMENT_NAME[detailEnemy.element as Element]}</b>行：克制
                    {ELEMENT_NAME[KE[detailEnemy.element as Element]]}属护体（挡半 ▼），慎用该行防御。
                  </div>
                </>
              ) : (
                <div class="ed-row">无属性：不受克伐，与护体恒为 1:1 结算。</div>
              )}
              {Object.entries(detailEnemy.statuses).filter(([k, v]) => (v ?? 0) !== 0 && !k.startsWith('_')).length > 0 && (
                <div class="ed-row"><StatusChips statuses={detailEnemy.statuses} /></div>
              )}
            </div>
            <div style={{ textAlign: 'center', marginTop: '12px' }}><button onClick={() => setEnemyDetail(null)}>关闭</button></div>
          </div>
        </div>
      )}

      {/* 袖藏浮层（结束回合两步，§13.3） */}
      {sleeveOpen && (
        <div class="sleeve-sheet">
          <div class="sleeve-head">
            <h4>袖藏</h4>
            <span class={`sleeve-cap ${sleeveBanned ? 'banned' : ''}`}>
              {sleeveBanned
                ? '被封（无法袖藏）'
                : sleeveUnlimited
                  ? '无上限（北冥吞天）'
                  : `选择至多 ${sleeveCap} 张收入袖中，下回合开始先入手`}
            </span>
          </div>
          <div class="sleeve-cards">
            {b.hand.map((c) => (
              <CardFace
                key={c.uid}
                card={c}
                picked={sleevePicks.includes(c.uid)}
                unplayable={sleeveBanned}
                onClick={() => toggleSleevePick(c.uid)}
              />
            ))}
          </div>
          <div class="sleeve-actions">
            <button onClick={() => confirmEndTurn([])}>
              不袖藏<span class="skip-key">（N）</span>
            </button>
            <button class="primary" disabled={sleeveBanned && sleevePicks.length > 0} onClick={() => confirmEndTurn(sleevePicks)}>
              {sleevePicks.length > 0 ? `袖藏 ${sleevePicks.length} 张并结束` : '结束回合'}
            </button>
          </div>
        </div>
      )}

      {viewPile && (
        <DeckModal
          title={viewPile === 'draw' ? '抽牌堆（不按顺序）' : viewPile === 'discard' ? '弃牌堆' : viewPile === 'exhaust' ? '放逐牌' : '袖藏区（下回合先入手）'}
          cards={
            viewPile === 'draw' ? [...b.drawPile].sort((a, b2) => a.cardId.localeCompare(b2.cardId))
              : viewPile === 'discard' ? b.discardPile
                : viewPile === 'exhaust' ? b.exhaustPile
                  : b.sleeved
          }
          onClose={() => setViewPile(null)}
        />
      )}

      {/* pendingChoice：dilemma 竹签按钮（含河图五行选项染色） */}
      {choice && choice.kind === 'dilemma' && (
        <div class="overlay">
          <div class="panel">
            <h3>{choice.prompt}</h3>
            <div class="dilemma-options">
              {choice.options?.map((opt, i) => {
                const el = ELEMENTS.find((e) => opt.includes(ELEMENT_NAME[e]));
                return (
                  <button
                    key={i}
                    class={`zhuqian ${el ? 'el-tinted' : ''}`}
                    style={el ? { '--zhuqian-el': EL_COLOR[el] } : undefined}
                    onClick={() => dispatch({ t: 'RESOLVE_CHOICE', picks: [i] })}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* pendingChoice：卡列表类（scry / pickTop / exhaustHand / discardHand / returnHand），按 maxPick 多选/单选 */}
      {choice && choice.kind !== 'dilemma' && (
        <DeckModal
          title={choice.prompt}
          sub={
            choice.kind === 'scry' ? '点选要弃去的牌（可不选）'
              : choice.kind === 'pickTop' ? `点选入手的牌（至多 ${choice.maxPick ?? 1} 张）`
                : choice.kind === 'exhaustHand' ? '点选要放逐的手牌（任意张）'
                  : choice.kind === 'discardHand' ? '点选要弃去的手牌（任意张）'
                    : '点选要洗回牌库的手牌（任意张）'
          }
          cards={choice.cards ?? []}
          pickedUids={pickedUids}
          onPick={(uid) => {
            const cap = choice.kind === 'pickTop' ? (choice.maxPick ?? 1) : (choice.maxPick ?? Infinity);
            setPickedUids((prev) => {
              if (prev.includes(uid)) return prev.filter((x) => x !== uid);
              if (prev.length >= cap) return cap === 1 ? [uid] : prev; // 上限 1 时点新卡直接换选
              return [...prev, uid];
            });
          }}
          onClose={() => { /* 必须选择 */ }}
          footer={
            <button
              class="primary"
              onClick={() => {
                dispatch({ t: 'RESOLVE_CHOICE', picks: pickedUids });
                setPickedUids([]);
              }}
            >
              确定{pickedUids.length > 0 ? `（${pickedUids.length}）` : '（不选）'}
            </button>
          }
        />
      )}

      {aliveEnemies(b).length === 0 && b.outcome === 'ongoing' && (
        <div class="overlay"><div class="panel"><h3>结算中…</h3></div></div>
      )}
    </div>
  );
}
