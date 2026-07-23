/** 战斗界面（策划案 §13.2 #3 / §13.3 手牌交互：点选 + 拖拽双通道） */
import { useEffect, useRef, useState } from 'preact/hooks';
import { BossDialogue, bossDialogue } from './Narrative';
import type { Action, EnemyState, RunState } from '../core/types';
import { cardCost, canPlay, intentDamage, aliveEnemies } from '../core/combat';
import { getCard } from '../data/cards';
import { getPotion } from '../data/potions';
import { generates, SHENG, ELEMENT_NAME, ELEMENTS, type Element } from '../core/wuxing';
import { CardView, ElBadge, PotionBar, DeckModal } from './components';
import { enemyArt, actBg } from './art';

const STATUS_NAME: Record<string, string> = {
  gangqi: '罡气', guben: '固本', huichun: '回春', zhuoshao: '灼烧', zhangdu: '瘴毒',
  chanfu: '缠缚', pojia: '破甲', xuruo: '虚弱', yishang: '易伤', fanci: '反刺',
  fanshao: '反烧', tengou: '藤偶', niepan: '涅槃', yinguo: '因果', retainBlock: '蓄水',
  nextTurnDraw: '蓄牌', nextTurnEnergy: '蓄灵', nextTurnBlock: '蓄土', drawDown: '滞识',
  energyDown: '滞灵', handCapDown: '缚手', blockHalf: '剑域', guishaDan: '龟息',
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

function intentText(run: RunState, e: EnemyState): string {
  const it = e.intent;
  if (!it) return '…';
  const hideNumbers = run.flags['dailyTianjiluan'] && !run.battle?.tianjiActive;
  switch (it.kind) {
    case 'attack': {
      const dmg = intentDamage(run.battle!, e);
      const times = it.times && it.times > 1 ? `×${it.times}` : '';
      return hideNumbers ? `🗡 ?${times}` : `🗡 ${dmg}${times}`;
    }
    case 'defend': return '🛡 防御';
    case 'buff': return '↑ 强化';
    case 'debuff': return '↓ 削弱';
    case 'charge': return '🌩 蓄力';
    default: return '❓ 未知';
  }
}

/** 新手引导四步（策划案 §13.5，本地进度存 localStorage） */
const GUIDE_STEPS = [
  '出牌方法：点选手牌后点敌人（或再点一次）打出；也可以按住卡牌向上拖，拖过中线松手打出，攻击牌直接拖到敌人身上。',
  '敌人头顶显示下回合意图：🗡 数字是来袭伤害，打出防御牌获得护体可以抵挡。',
  '五行相生连招：带金边高亮的牌与当前行位相生，打出触发【行云流水】，效果 +25% 并返还灵气。',
  '五行相克：用克制敌人属性的攻击牌伤害 ×1.5 并附加异常。随时点左上『☯五行』查看口诀。',
];

function loadGuideStep(): number {
  try {
    return Number(localStorage.getItem('wcs_guide') ?? '0');
  } catch {
    return 99;
  }
}

export function BattleScreen(props: { run: RunState; dispatch: (a: Action) => void }) {
  const { run, dispatch } = props;
  const b = run.battle!;
  const [selected, setSelected] = useState<number | null>(null);
  const [viewPile, setViewPile] = useState<'draw' | 'discard' | 'exhaust' | null>(null);
  const [pickedUids, setPickedUids] = useState<number[]>([]);
  const [potionTarget, setPotionTarget] = useState<string | null>(null);
  const [showWuxing, setShowWuxing] = useState(false);
  const [guideStep, setGuideStep] = useState<number>(() => loadGuideStep());

  // Boss 战前对白（§3.3）：仅开场时展示一次
  const [showDialogue, setShowDialogue] = useState<boolean>(
    () => b.battleType === 'boss' && b.turn === 1 && b.cardsPlayed === 0 && b.turnsTotal <= 1,
  );

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
    if (b.pendingChoice) return;
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
        setSelected(overUid);
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
        dispatch({ t: 'PLAY_CARD', uid: d.uid, target });
        setSelected(null);
      } else if (d.overLine) {
        setSelected(d.uid); // 拖过线但没落在敌人上：保持选中等待点目标
      }
      return;
    }
    if (d.overLine) {
      dispatch({ t: 'PLAY_CARD', uid: d.uid });
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
    return (def.type === 'attack' && !(def.upText && false)) || !!def.targetEnemy;
  }

  function tapCard(uid: number) {
    const inst = b.hand.find((c) => c.uid === uid);
    if (!inst) return;
    if (selected === uid) {
      // 二次点击：非指向牌直接打出（§13.3 二次确认）
      const def = getCard(inst.cardId);
      const aoeOrNoTarget = !needsTarget(inst.cardId) || def.base.aoe;
      if (aoeOrNoTarget && canPlay(run, b, inst)) {
        dispatch({ t: 'PLAY_CARD', uid });
        setSelected(null);
      } else {
        setSelected(null);
      }
      return;
    }
    setSelected(uid);
  }

  function tapEnemy(e: EnemyState) {
    if (potionTarget) {
      dispatch({ t: 'USE_POTION', potion: potionTarget, target: e.uid });
      setPotionTarget(null);
      return;
    }
    if (!selectedCard) return;
    if (!canPlay(run, b, selectedCard)) return;
    dispatch({ t: 'PLAY_CARD', uid: selectedCard.uid, target: e.uid });
    setSelected(null);
  }

  function usePotion(id: string) {
    const p = getPotion(id);
    if (p.targetEnemy) {
      setPotionTarget(id);
      return;
    }
    dispatch({ t: 'USE_POTION', potion: id });
  }

  // 行云流水提示：手牌中被当前行位所生的牌加金边（§18 对策：自动高亮）
  function glows(cardId: string): boolean {
    const def = getCard(cardId);
    if (def.element === 'none' || !b.xingwei) return false;
    return generates(b.xingwei, def.element);
  }

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
    potionTarget !== null || dragTargeting;
  // 已选中的非指向牌：再点一次打出
  const awaitingConfirm =
    selectedCard && !awaitingTarget && canPlay(run, b, selectedCard);

  return (
    <div
      class={`battle fade-in ${isJie ? 'jie-bg' : ''}`}
      style={isJie ? undefined : { backgroundImage: `linear-gradient(rgba(244,239,230,0.55), rgba(244,239,230,0.4) 40%, rgba(244,239,230,0.88) 62%), url(${actBg(run.act)})`, backgroundSize: 'cover', backgroundPosition: 'center top' }}
    >
      <div class="enemy-zone">
        {b.enemies.map((e) => (
          <div
            key={e.uid}
            data-euid={e.uid}
            class={`enemy ${e.hp <= 0 ? 'dead' : ''} ${isJie || e.maxHp >= 130 ? 'boss' : e.maxHp >= 90 ? 'elite' : ''} ${awaitingTarget && e.hp > 0 ? 'targetable' : ''} ${drag?.hoverEnemy === e.uid && dragTargeting ? 'drag-hover' : ''}`}
            onClick={() => e.hp > 0 && tapEnemy(e)}
          >
            <div class="enemy-intent">{intentText(run, e)}</div>
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
        <div class="xingwei-ring" title="行位：最后打出的有属性牌之五行。打出被其所生的牌触发行云流水。">
          行位
          {ELEMENTS.map((el) => (
            <span
              key={el}
              class={`el-dot ${b.xingwei === el ? 'active' : ''}`}
              style={{ background: `var(--el-${el})` }}
            >
              {ELEMENT_NAME[el as Element]}
            </span>
          ))}
          {b.xingwei && <span style={{ color: 'var(--liujin)' }}>→ 接{ELEMENT_NAME[SHENG[b.xingwei]]}</span>}
        </div>
        <StatusChips statuses={b.player.statuses} />
        <div class="pile-info">
          <span onClick={() => setViewPile('draw')}>抽牌 {b.drawPile.length}</span>
          <span onClick={() => setViewPile('discard')}>弃牌 {b.discardPile.length}</span>
          <span onClick={() => setViewPile('exhaust')}>放逐 {b.exhaustPile.length}</span>
          <span>回合 {b.turn}</span>
        </div>
      </div>

      <div class="hand-zone">
        {b.player.block > 0 && (
          <div style={{ textAlign: 'center', fontSize: '14px', color: 'var(--dailan)' }}>🛡 护体 {b.player.block}</div>
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
                <CardView
                  card={c}
                  cost={getCard(c.cardId).cost === 'X' ? 'X' : cardCost(run, b, c)}
                  selected={isSel}
                  unplayable={!canPlay(run, b, c)}
                  liushuiGlow={glows(c.cardId)}
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
        {(awaitingTarget || awaitingConfirm || (!anyPlayable && !choice)) && (
          <div class={`action-hint ${awaitingTarget ? 'hint-target' : ''}`}>
            {potionTarget
              ? '⬆ 点选丹药目标'
              : awaitingTarget
                ? `⬆ 点选上方敌人，释放【${getCard(selectedCard!.cardId).name}】`
                : awaitingConfirm
                  ? `再点一次【${getCard(selectedCard!.cardId).name}】打出`
                  : '灵气不足或无可出之牌，点右下【结束回合】'}
          </div>
        )}
        <div class="battle-bottom">
          <div class="energy-orb" title="灵气">{b.player.energy}/{run.energyMax}</div>
          <PotionBar run={run} onUse={usePotion} />
          <button
            class={`endturn ${!anyPlayable && !choice ? 'attention' : ''}`}
            onClick={() => { setSelected(null); dispatch({ t: 'END_TURN' }); }}
          >
            结束回合
          </button>
        </div>
      </div>

      {banner && <div class="turn-banner" key={banner}>{banner}</div>}

      {showDialogue && (
        <BossDialogue
          lines={bossDialogue(run, isJie ? 'jiuchong' : b.enemies[0]?.enemyId ?? '')}
          onDone={() => setShowDialogue(false)}
        />
      )}

      {guideStep < GUIDE_STEPS.length && !choice && !showDialogue && (
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
              <p><b>相生（连招顺序）</b>：木 → 火 → 土 → 金 → 水 → 木</p>
              <p>按顺序打出相生的牌触发【行云流水】：本牌效果 +25%，返还 1 灵气（每回合上限 2）。连续触发 4 次为【五行周天】：抽 2 张，下一张牌 0 费。无属性牌不打断连招。</p>
              <p><b>相克（打克制属性的敌人，伤害 ×1.5 并附加异常）</b></p>
              <p>金克木 → 破甲（敌人无法获得护体）<br />木克土 → 缠缚（敌人下次攻击减伤）<br />土克水 → 滞涩（敌人行动延迟 1 回合）<br />水克火 → 熄灭（移除敌人 1 层增益）<br />火克金 → 熔穿（附加 3 层灼烧）</p>
              <p><b>操作</b>：点选手牌后，攻击牌点敌人释放；其他牌再点一次打出。敌人头顶为下回合意图，🗡 数字可用护体抵挡。</p>
            </div>
            <div style={{ textAlign: 'center' }}><button onClick={() => setShowWuxing(false)}>关闭</button></div>
          </div>
        </div>
      )}

      {b.log.length > 0 && <div class="battle-log">{b.log[b.log.length - 1]}</div>}

      {viewPile && (
        <DeckModal
          title={viewPile === 'draw' ? '抽牌堆（不按顺序）' : viewPile === 'discard' ? '弃牌堆' : '放逐牌'}
          cards={viewPile === 'draw' ? [...b.drawPile].sort((a, b2) => a.cardId.localeCompare(b2.cardId)) : viewPile === 'discard' ? b.discardPile : b.exhaustPile}
          onClose={() => setViewPile(null)}
        />
      )}

      {choice && choice.kind === 'dilemma' && (
        <div class="overlay">
          <div class="panel">
            <h3>{choice.prompt}</h3>
            <div class="dilemma-options">
              {choice.options?.map((opt, i) => (
                <button key={i} onClick={() => dispatch({ t: 'RESOLVE_CHOICE', picks: [i] })}>{opt}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {choice && choice.kind !== 'dilemma' && (
        <DeckModal
          title={choice.prompt}
          cards={choice.cards ?? []}
          pickedUids={pickedUids}
          onPick={(uid) => {
            if (choice.kind === 'pickHand' || choice.kind === 'pickDiscard') {
              dispatch({ t: 'RESOLVE_CHOICE', picks: [uid] });
              setPickedUids([]);
              return;
            }
            setPickedUids((prev) =>
              prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid],
            );
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
