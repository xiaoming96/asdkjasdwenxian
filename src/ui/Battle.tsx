/** 战斗界面（策划案 §13.2 #3 / §13.3） */
import { useState } from 'preact/hooks';
import type { Action, EnemyState, RunState } from '../core/types';
import { cardCost, canPlay, intentDamage, aliveEnemies } from '../core/combat';
import { getCard } from '../data/cards';
import { getPotion } from '../data/potions';
import { generates, SHENG, ELEMENT_NAME, ELEMENTS, type Element } from '../core/wuxing';
import { CardView, ElBadge, PotionBar, DeckModal } from './components';

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

export function BattleScreen(props: { run: RunState; dispatch: (a: Action) => void }) {
  const { run, dispatch } = props;
  const b = run.battle!;
  const [selected, setSelected] = useState<number | null>(null);
  const [viewPile, setViewPile] = useState<'draw' | 'discard' | 'exhaust' | null>(null);
  const [pickedUids, setPickedUids] = useState<number[]>([]);
  const [potionTarget, setPotionTarget] = useState<string | null>(null);

  const selectedCard = b.hand.find((c) => c.uid === selected) ?? null;
  const isJie = b.waveIndex >= 0;

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

  return (
    <div class={`battle fade-in ${isJie ? 'jie-bg' : ''}`}>
      <div class="enemy-zone">
        {b.enemies.map((e) => (
          <div
            key={e.uid}
            class={`enemy ${e.hp <= 0 ? 'dead' : ''} ${selectedCard || potionTarget ? 'targeted-hint' : ''}`}
            onClick={() => e.hp > 0 && tapEnemy(e)}
          >
            <div class="enemy-intent">{intentText(run, e)}</div>
            <div class="enemy-figure">{ENEMY_ICON[e.enemyId] ?? '👾'}</div>
            <div class="enemy-name"><ElBadge el={e.element} /> {e.name}</div>
            <div class="hpbar"><div style={{ width: `${(e.hp / e.maxHp) * 100}%` }} /></div>
            <div class="enemy-hp-num">{e.hp}/{e.maxHp}{e.block > 0 ? ` 🛡${e.block}` : ''}</div>
            <StatusChips statuses={e.statuses} />
          </div>
        ))}
      </div>

      <div class="mid-zone">
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
          {b.hand.map((c) => (
            <CardView
              key={c.uid}
              card={c}
              cost={getCard(c.cardId).cost === 'X' ? 'X' : cardCost(run, b, c)}
              selected={selected === c.uid}
              unplayable={!canPlay(run, b, c)}
              liushuiGlow={glows(c.cardId)}
              onClick={() => tapCard(c.uid)}
            />
          ))}
        </div>
        <div class="battle-bottom">
          <div class="energy-orb" title="灵气">{b.player.energy}/{run.energyMax}</div>
          <PotionBar run={run} onUse={usePotion} />
          <button class="endturn" onClick={() => { setSelected(null); dispatch({ t: 'END_TURN' }); }}>结束回合</button>
        </div>
        {selectedCard && needsTarget(selectedCard.cardId) && !getCard(selectedCard.cardId).base.aoe && (
          <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--zhusha)' }}>点选目标敌人</div>
        )}
        {potionTarget && (
          <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--zhusha)' }}>选择丹药目标</div>
        )}
      </div>

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
