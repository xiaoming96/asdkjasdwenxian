/** 冒险层界面：奖励 / 坊市 / 事件 / 洞府 / 选牌 / 突破 / 结算（策划案 §13.2） */
import { useState } from 'preact/hooks';
import type { Action, Profile, RunState } from '../core/types';
import { getCard } from '../data/cards';
import { getRelic, RELIC_GRADE_NAME } from '../data/relics';
import { getPotion } from '../data/potions';
import { getEvent } from '../data/events';
import { BREAKTHROUGHS } from '../data/breakthroughs';
import { CardView, DeckModal } from './components';
import { makeCard } from '../core/combat';

// ---------- 奖励 ----------

export function RewardView(props: { run: RunState; dispatch: (a: Action) => void }) {
  const { run, dispatch } = props;
  const s = run.screen;
  if (s.kind !== 'reward') return null;
  return (
    <div class="screen-page fade-in">
      <h2>战 利</h2>
      {!s.goldTaken && (
        <button class="gold" onClick={() => dispatch({ t: 'TAKE_REWARD_GOLD' })}>拾取灵石 ◉ {s.gold}</button>
      )}
      {s.relic && (
        <button onClick={() => dispatch({ t: 'TAKE_REWARD_RELIC' })}>
          拾取法宝【{getRelic(s.relic).name}】（{RELIC_GRADE_NAME[getRelic(s.relic).grade]}）
        </button>
      )}
      {s.potion && (
        <button
          disabled={run.potions.length >= run.potionCap}
          onClick={() => dispatch({ t: 'TAKE_REWARD_POTION' })}
        >
          拾取丹药【{getPotion(s.potion).name}】{run.potions.length >= run.potionCap ? '（已满）' : ''}
        </button>
      )}
      {s.cards && (
        <>
          <div class="sub">参悟一门功法（三选一）</div>
          <div class="reward-cards">
            {s.cards.map((c, i) => (
              <CardView
                key={i}
                card={{ uid: i, cardId: c.cardId, upgraded: c.upgraded }}
                onClick={() => dispatch({ t: 'PICK_REWARD_CARD', index: i })}
              />
            ))}
          </div>
          <button class="ghost" onClick={() => dispatch({ t: 'PICK_REWARD_CARD', index: -1 })}>
            跳过{run.relics.includes('zhujian') ? '（竹简：+8 灵石）' : ''}
          </button>
        </>
      )}
      <div class="spacer" style={{ flex: 1 }} />
      <button class="primary" onClick={() => dispatch({ t: 'LEAVE_REWARD' })}>启程</button>
    </div>
  );
}

// ---------- 坊市 ----------

export function ShopView(props: { run: RunState; dispatch: (a: Action) => void }) {
  const { run, dispatch } = props;
  const s = run.screen;
  const [removing, setRemoving] = useState(false);
  if (s.kind !== 'shop') return null;
  return (
    <div class="screen-page fade-in">
      <h2>坊 市</h2>
      <div class="sub">灵石 ◉ {run.gold}{s.discount !== 1 ? ` · 折扣 ${Math.round(s.discount * 100)}%` : ''}</div>
      <div class="shop-list">
        {s.items.map((item, i) => {
          const price = Math.floor(item.price * s.discount);
          let name = '', desc = '';
          if (item.kind === 'card') { const d = getCard(item.id); name = `功法·${d.name}`; desc = d.text; }
          if (item.kind === 'relic') { const d = getRelic(item.id); name = `法宝·${d.name}（${RELIC_GRADE_NAME[d.grade]}）`; desc = d.text; }
          if (item.kind === 'potion') { const d = getPotion(item.id); name = `丹药·${d.name}`; desc = d.text; }
          return (
            <div key={i} class={`shop-item ${item.sold ? 'sold' : ''}`}>
              <div>
                <div>{name}</div>
                <div class="desc">{desc}</div>
              </div>
              <span class="price">◉ {price}</span>
              <button
                disabled={item.sold || run.gold < price || (item.kind === 'potion' && run.potions.length >= run.potionCap)}
                onClick={() => dispatch({ t: 'BUY_ITEM', index: i })}
              >
                {item.sold ? '已售' : '购买'}
              </button>
            </div>
          );
        })}
        {!s.removeUsed && (
          <div class="shop-item">
            <div>
              <div>斩尘缘（删 1 张牌）</div>
              <div class="desc">铁匠铺炉火中，斩去一缕尘缘。</div>
            </div>
            <span class="price">◉ {s.removePrice}</span>
            <button disabled={run.gold < s.removePrice} onClick={() => setRemoving(true)}>删牌</button>
          </div>
        )}
      </div>
      <button class="primary" onClick={() => dispatch({ t: 'LEAVE_SHOP' })}>离开坊市</button>
      {removing && (
        <DeckModal
          title="选择要斩去的牌"
          cards={run.deck}
          onClose={() => setRemoving(false)}
          onPick={(uid) => {
            dispatch({ t: 'SHOP_REMOVE_CARD', uid });
            setRemoving(false);
          }}
        />
      )}
    </div>
  );
}

// ---------- 事件 ----------

export function EventView(props: { run: RunState; dispatch: (a: Action) => void }) {
  const { run, dispatch } = props;
  const s = run.screen;
  if (s.kind !== 'event') return null;
  const ev = getEvent(s.eventId);
  return (
    <div class="screen-page fade-in">
      <div class="event-page">
        <div class="event-title">{ev.name}</div>
        <div class="event-scene">{ev.scene}</div>
        {!s.resultText && (
          <div class="event-options">
            {ev.options.map((opt, i) => {
              const cantGold = opt.requireGold !== undefined && run.gold < opt.requireGold;
              const cantRelic = opt.requireRelic && run.relics.length === 0;
              return (
                <button
                  key={i}
                  class={opt.risky ? 'risky' : ''}
                  disabled={cantGold || cantRelic}
                  onClick={() => dispatch({ t: 'EVENT_OPTION', option: i })}
                >
                  {opt.label}{cantGold ? `（需 ◉${opt.requireGold}）` : ''}{cantRelic ? '（需法宝）' : ''}
                </button>
              );
            })}
          </div>
        )}
        {s.resultText && (
          <>
            <div class="event-result">{s.resultText}</div>
            <div style={{ textAlign: 'center', marginTop: '14px' }}>
              <button class="primary" onClick={() => dispatch({ t: 'LEAVE_EVENT' })}>继续赶路</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- 洞府 ----------

export function CaveView(props: { run: RunState; dispatch: (a: Action) => void; unlocked: string[] }) {
  const { run, dispatch, unlocked } = props;
  const s = run.screen;
  if (s.kind !== 'cave') return null;
  const restPct = run.ascension >= 5 ? 20 : 30;
  return (
    <div class="screen-page fade-in">
      <h2>洞 府</h2>
      <div class="sub">{s.free ? '前人洞府，阵法尚存，为你所用。' : '寻一处灵穴，打坐调息。'}</div>
      <div class="bt-options">
        <div class="bt-option" onClick={() => dispatch({ t: 'CAVE_OPTION', option: 'rest' })}>
          <div class="bt-name">🧘 休整</div>
          <div class="bt-text">回复 {restPct}% 上限气血{run.relics.includes('pinganfu') ? '（平安符：额外 +8）' : ''}</div>
        </div>
        <div class="bt-option" onClick={() => dispatch({ t: 'CAVE_OPTION', option: 'upgrade' })}>
          <div class="bt-name">📖 参悟</div>
          <div class="bt-text">升级 1 张牌{run.relics.includes('putuan') ? '（蒲团：额外回 6 血）' : ''}</div>
        </div>
        {unlocked.includes('dongfuliandan') && (
          <div class="bt-option" onClick={() => dispatch({ t: 'CAVE_OPTION', option: 'alchemy' })}>
            <div class="bt-name">⚗ 炼丹</div>
            <div class="bt-text">获得 1 枚随机丹药（转世解锁）</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- 选牌（删牌/参悟） ----------

export function CardPickView(props: { run: RunState; dispatch: (a: Action) => void }) {
  const { run, dispatch } = props;
  const s = run.screen;
  if (s.kind !== 'cardPick') return null;
  const cards = s.mode === 'upgrade'
    ? run.deck.filter((c) => !c.upgraded && getCard(c.cardId).type !== 'curse')
    : run.deck;
  return (
    <div class="screen-page fade-in">
      <h2>{s.mode === 'remove' ? '斩 尘 缘' : '参 悟'}</h2>
      <div class="sub">{s.reason}（还可选 {s.count} 张）</div>
      <div class="card-grid">
        {cards.map((c) => (
          <CardView key={c.uid} card={c} onClick={() => dispatch({ t: 'PICK_CARD_SCREEN', uid: c.uid })} />
        ))}
      </div>
      <button class="ghost" onClick={() => dispatch({ t: 'PICK_CARD_SCREEN', uid: -1 })}>不选了</button>
    </div>
  );
}

// ---------- 突破 ----------

export function BreakthroughView(props: { run: RunState; dispatch: (a: Action) => void }) {
  const { run, dispatch } = props;
  const s = run.screen;
  if (s.kind !== 'breakthrough') return null;
  const stage = run.act === 1 ? '筑基' : run.act === 2 ? '金丹' : '飞升';
  return (
    <div class="screen-page fade-in">
      <h2>境 界 突 破</h2>
      <div class="sub">雷云散去，天地灵气灌体。你突破至【{stage}】！择一道途：</div>
      <div class="bt-options">
        {s.options.map((id) => (
          <div key={id} class="bt-option" onClick={() => dispatch({ t: 'PICK_BREAKTHROUGH', id })}>
            <div class="bt-name">🀄 {BREAKTHROUGHS[id].name}</div>
            <div class="bt-text">{BREAKTHROUGHS[id].text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- 结算 ----------

export function EndView(props: {
  run: RunState;
  profile: Profile;
  onRestart: () => void;
  onHome: () => void;
}) {
  const { run, profile } = props;
  const s = run.screen;
  const [showDeck, setShowDeck] = useState(false);
  if (s.kind !== 'end') return null;
  return (
    <div class="screen-page fade-in">
      <div class="end-scroll">
        <h2>{s.victory ? '白 日 飞 升' : '生 平 卷 轴'}</h2>
        {s.daohao && <div class="daohao">道号 · {s.daohao}</div>}
        <div class="sub">{s.cause}</div>
        <div class="end-stats">
          <div><span>行至</span><span>第{['一', '二', '三'][run.act - 1]}幕 第 {run.floor + 1} 层</span></div>
          <div><span>精英斩获</span><span>{run.stats.elitesKilled}</span></div>
          <div><span>天劫渡过</span><span>{run.stats.bossesKilled}</span></div>
          <div><span>周天次数</span><span>{run.flags['zhoutianTotal'] ?? 0}</span></div>
          <div><span>丹药服用</span><span>{run.stats.potionsUsed}</span></div>
          <div><span>分数</span><span>{s.score}</span></div>
          <div><span>道行 +</span><span style={{ color: 'var(--liujin)' }}>{s.daowei}（累计 {profile.daowei}）</span></div>
          {profile.unlocked.includes('guanxingtai') && (
            <div><span>种子</span><span style={{ userSelect: 'all' }}>{run.seed}</span></div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setShowDeck(true)}>最终卡组（{run.deck.length}）</button>
          <button class="primary" onClick={props.onRestart}>再来一世</button>
          <button class="ghost" onClick={props.onHome}>回主界面</button>
        </div>
      </div>
      {showDeck && <DeckModal title="最终卡组" cards={run.deck} onClose={() => setShowDeck(false)} />}
    </div>
  );
}

// makeCard re-export 供 App 使用
export { makeCard };
