/**
 * 冒险层界面 v3：战利 / 坊市 / 奇遇 / 洞府 / 道果 / 选牌 / 生平结算
 * （策划案 §7 炼丹、§9.4 坊市与洞府、§9.5 突破与道果、§10 奇遇、§11.1 宿慧与业力）
 * 契约：src/core/types.ts 的 Screen / Action，不得改动；新样式全部在 ./adventure.css。
 */
import './adventure.css';
import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type {
  Action, CardInstance, EventDef, MaterialId, Profile, Rarity, RunState, ShopItem,
} from '../core/types';
import { getCard } from '../data/cards';
import { getRelic, RELIC_GRADE_NAME, type RelicGrade } from '../data/relics';
import { getRecipe, MATERIAL_NAME } from '../data/alchemy';
import { DAOGUO } from '../data/daoguo';
import { getEvent } from '../data/events';
import { CardFace, ElixirBar } from './components';
import { makeShareImage } from './shareCard';

type Dispatch = (a: Action) => void;

function signed(n: number): string {
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/**
 * 卡牌选取包装：点击落在外层 div（不依赖 CardFace 是否接受 onClick）。
 * locked：灰显 + 锁语（本命牌不可斩等）；sel：朱砂描边。
 */
function CardPick(props: {
  card: CardInstance;
  onClick?: () => void;
  selected?: boolean;
  locked?: boolean;
  lockText?: string;
  note?: ComponentChildren;
}) {
  const cls = [
    'adv-cardwrap',
    props.selected ? 'sel' : '',
    props.locked ? 'locked' : '',
  ].filter(Boolean).join(' ');
  return (
    <div class={cls} onClick={props.locked ? undefined : props.onClick}>
      <CardFace card={props.card} />
      {props.locked && props.lockText && <span class="adv-cardlock">{props.lockText}</span>}
      {props.note}
    </div>
  );
}

// ============================================================
// 战利（RewardView）：灵石 / 灵材 / 法宝 / 卡三选一（可跳过）
// ============================================================

export function RewardView(props: { run: RunState; dispatch: Dispatch }) {
  const { run, dispatch } = props;
  const s = run.screen;
  if (s.kind !== 'reward') return null;
  const hasZhujian = run.relics.includes('zhujian');
  const mats = s.materials
    ? (Object.entries(s.materials) as [MaterialId, number][]).filter(([, n]) => n > 0)
    : [];
  return (
    <div class="screen-page fade-in">
      <h2>战 利</h2>
      {!s.goldTaken && s.gold > 0 && (
        <button class="gold adv-reward-line" onClick={() => dispatch({ t: 'TAKE_REWARD_GOLD' })}>
          拾取灵石 ◉ {s.gold}
        </button>
      )}
      {mats.length > 0 && (
        <button class="adv-reward-line adv-reward-mats" onClick={() => dispatch({ t: 'TAKE_REWARD_MATERIALS' })}>
          <span class="yaodeng" title="药戥称量">⚖</span>
          <span>收取灵材</span>
          {mats.map(([id, n]) => (
            <span key={id} class="mat-chip">{MATERIAL_NAME[id]} ×{n}</span>
          ))}
        </button>
      )}
      {s.relic && (
        <button class="adv-reward-line" onClick={() => dispatch({ t: 'TAKE_REWARD_RELIC' })}>
          拾取法宝【{getRelic(s.relic).name}】（{RELIC_GRADE_NAME[getRelic(s.relic).grade]}）
        </button>
      )}
      {s.cards && (
        <>
          <div class="sub">参悟一门功法（{s.cards.length} 选一）</div>
          <div class="adv-reward-cards">
            {s.cards.map((c, i) => (
              <CardPick
                key={i}
                card={{ uid: -1 - i, cardId: c.cardId, upgraded: c.upgraded }}
                onClick={() => dispatch({ t: 'PICK_REWARD_CARD', index: i })}
                note={getCard(c.cardId).rarity === 'legendary'
                  ? <span class="legend-warn">纳传说 · 心魔 +1</span>
                  : undefined}
              />
            ))}
          </div>
          <button class="ghost" onClick={() => dispatch({ t: 'PICK_REWARD_CARD', index: -1 })}>
            跳过{hasZhujian ? '（竹简：转录拓片，得灵材 ×2）' : ''}
          </button>
        </>
      )}
      <div class="adv-spacer" />
      <button class="primary adv-go" onClick={() => dispatch({ t: 'LEAVE_REWARD' })}>启 程</button>
    </div>
  );
}

// ============================================================
// 坊市（ShopView）：四类货架 + 斩尘缘蒲团位 + 心斋木鱼位
// ============================================================

function ShopRow(props: {
  name: ComponentChildren;
  desc?: ComponentChildren;
  meta?: ComponentChildren;
  priceOld?: number;
  price: number;
  sold: boolean;
  can: boolean;
  onBuy: () => void;
}) {
  return (
    <div class={`shop-item ${props.sold ? 'sold' : ''}`}>
      <div class="shop-row-main">
        <div>{props.name}</div>
        {props.desc && <div class="desc">{props.desc}</div>}
        {props.meta && <div class="shop-row-meta">{props.meta}</div>}
      </div>
      <span class="price">
        {props.priceOld !== undefined && <s class="price-old">◉{props.priceOld}</s>}
        ◉ {props.price}
      </span>
      <button disabled={props.sold || !props.can} onClick={props.onBuy}>
        {props.sold ? '已售' : '购入'}
      </button>
    </div>
  );
}

export function ShopView(props: { run: RunState; dispatch: Dispatch }) {
  const { run, dispatch } = props;
  const s = run.screen;
  const [removing, setRemoving] = useState(false);
  const [muyuHit, setMuyuHit] = useState(-1); // 刚敲灭的心魔珠序号（动画）
  if (s.kind !== 'shop') return null;
  const mirage = s.discount !== 1;
  const price = (p: number) => Math.floor(p * s.discount);
  const byKind = (k: ShopItem['kind']) =>
    s.items.map((it, i) => ({ it, i })).filter((x) => x.it.kind === k);

  const onXinzhai = () => {
    if (s.xinzhaiUsed || run.gold < s.xinzhaiPrice || run.demon <= 0) return;
    setMuyuHit(run.demon - 1);
    dispatch({ t: 'SHOP_XINZHAI' });
  };

  return (
    <div class="screen-page fade-in">
      <h2>坊 市</h2>
      <div class="sub">灵石 ◉ {run.gold}</div>
      {mirage && <div class="mirage-tag">蜃楼幻市 · 全场八折</div>}

      {/* 功法货架：横向卡面 */}
      {byKind('card').length > 0 && (
        <div class="shop-shelf">
          <div class="shelf-title">功 法</div>
          <div class="shelf-cards">
            {byKind('card').map(({ it, i }) => (
              <div key={i} class={`shelf-cardwrap${it.sold ? ' sold' : ''}`}>
                <CardFace card={{ uid: -100 - i, cardId: it.id, upgraded: !!it.upgraded }} />
                <button
                  class="buy-btn"
                  disabled={it.sold || run.gold < price(it.price)}
                  onClick={() => dispatch({ t: 'BUY_ITEM', index: i })}
                >
                  {it.sold ? '已售' : (
                    <>
                      {mirage && <s class="price-old">◉{it.price}</s>}
                      ◉ {price(it.price)}
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 法宝货架 */}
      {byKind('relic').length > 0 && (
        <div class="shop-shelf">
          <div class="shelf-title">法 宝</div>
          <div class="shop-list">
            {byKind('relic').map(({ it, i }) => {
              const d = getRelic(it.id);
              return (
                <ShopRow
                  key={i}
                  name={<>{d.name} <span class="grade-tag">{RELIC_GRADE_NAME[d.grade]}</span></>}
                  desc={d.text}
                  priceOld={mirage ? it.price : undefined}
                  price={price(it.price)}
                  sold={it.sold}
                  can={run.gold >= price(it.price)}
                  onBuy={() => dispatch({ t: 'BUY_ITEM', index: i })}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* 丹方货架：显示配方与丹毒 */}
      {byKind('recipe').length > 0 && (
        <div class="shop-shelf">
          <div class="shelf-title">丹 方</div>
          <div class="shop-list">
            {byKind('recipe').map(({ it, i }) => {
              const d = getRecipe(it.id);
              const owned = run.recipes.includes(it.id);
              return (
                <ShopRow
                  key={i}
                  name={<>丹方·{d.name}{d.rare && <span class="rare-tag">稀方</span>}{owned && <span class="owned-tag">已有</span>}</>}
                  desc={d.text}
                  meta={
                    <>
                      {(Object.entries(d.cost) as [MaterialId, number][]).map(([m, n]) => (
                        <span key={m} class="mat-chip">{MATERIAL_NAME[m]} ×{n}</span>
                      ))}
                      <span class={`toxin-chip${d.toxin < 0 ? ' good' : ''}`}>⚗ 毒 {signed(d.toxin)}</span>
                    </>
                  }
                  priceOld={mirage ? it.price : undefined}
                  price={price(it.price)}
                  sold={it.sold}
                  can={run.gold >= price(it.price)}
                  onBuy={() => dispatch({ t: 'BUY_ITEM', index: i })}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* 灵材包货架：显示内容 */}
      {byKind('materials').length > 0 && (
        <div class="shop-shelf">
          <div class="shelf-title">灵 材</div>
          <div class="shop-list">
            {byKind('materials').map(({ it, i }) => {
              const m = it.id as MaterialId;
              const n = it.count ?? 3;
              return (
                <ShopRow
                  key={i}
                  name={<>灵材包·{MATERIAL_NAME[m]}</>}
                  desc={<>开包得 <span class="mat-chip">{MATERIAL_NAME[m]} ×{n}</span>（现持 {run.materials[m]}）</>}
                  priceOld={mirage ? it.price : undefined}
                  price={price(it.price)}
                  sold={it.sold}
                  can={run.gold >= price(it.price)}
                  onBuy={() => dispatch({ t: 'BUY_ITEM', index: i })}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* 蒲团位：斩尘缘（88，每店一次，不吃折扣） */}
      <div class="shop-shelf">
        <div class="shelf-title">静 室</div>
        <div class={`zen-seat${s.removeUsed ? ' used' : ''}`}>
          <span class="zen-icon putuan-icon" />
          <div class="zen-body">
            <div class="zen-name">斩尘缘 <span class="zen-sub">蒲团位 · 每店一次</span></div>
            <div class="desc">就座蒲团，斩去一张牌。本命牌不可斩。</div>
          </div>
          <span class="price">◉ {s.removePrice}</span>
          <button
            disabled={s.removeUsed || run.gold < s.removePrice}
            onClick={() => setRemoving(true)}
          >
            {s.removeUsed ? '已斩' : '就座'}
          </button>
        </div>

        {/* 木鱼位：心斋（66，心魔 −1，每店一次） */}
        <div class={`zen-seat${s.xinzhaiUsed ? ' used' : ''}`}>
          <span class={`zen-icon muyu-icon${muyuHit >= 0 ? ' knock' : ''}`} />
          <div class="zen-body">
            <div class="zen-name">心斋 <span class="zen-sub">木鱼位 · 每店一次</span></div>
            <div class="desc">敲一声木鱼，心魔 −1。</div>
            <div class="demon-beads">
              {Array.from({ length: 9 }, (_, i) => (
                <span
                  key={i}
                  class={`demon-bead${i < run.demon ? ' lit' : ''}${i === muyuHit ? ' dimming' : ''}`}
                />
              ))}
            </div>
          </div>
          <span class="price">◉ {s.xinzhaiPrice}</span>
          <button
            disabled={s.xinzhaiUsed || run.gold < s.xinzhaiPrice || run.demon <= 0}
            onClick={onXinzhai}
          >
            {s.xinzhaiUsed ? '已静心' : run.demon <= 0 ? '心无尘' : '敲木鱼'}
          </button>
        </div>
      </div>

      <div class="adv-spacer" />
      <button class="primary adv-go" onClick={() => dispatch({ t: 'LEAVE_SHOP' })}>离开坊市</button>

      {removing && (
        <div class="overlay" onClick={(e) => { if (e.target === e.currentTarget) setRemoving(false); }}>
          <div class="panel">
            <h3>斩 尘 缘</h3>
            <div class="sub">择一牌斩去（◉ {s.removePrice}）</div>
            <div class="adv-cardgrid">
              {run.deck.map((c) => (
                <CardPick
                  key={c.uid}
                  card={c}
                  locked={!!getCard(c.cardId).bonded}
                  lockText="本命不可斩"
                  onClick={() => {
                    dispatch({ t: 'SHOP_REMOVE_CARD', uid: c.uid });
                    setRemoving(false);
                  }}
                />
              ))}
            </div>
            <div class="adv-panel-foot">
              <button class="ghost" onClick={() => setRemoving(false)}>罢了</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 奇遇（EventView）：选项代价/收益徽章 + 结果卷轴
// ============================================================

/** 从事件定义读取代价/收益徽章：单结果读 outcomes[0]，多结果标 ⚠ */
function OptionBadges({ opt }: { opt: EventDef['options'][number] }) {
  if (opt.outcomes.length > 1) {
    return <span class="evt-badges"><span class="evt-badge multi">⚠ 祸福未卜</span></span>;
  }
  const o = opt.outcomes[0];
  const chips: ComponentChildren[] = [];
  if (o.lifespan) {
    chips.push(<span key="l" class={`evt-badge lifespan${o.lifespan < 0 ? ' bad' : ' good'}`}>⏳ {signed(o.lifespan)} 年</span>);
  }
  if (o.demon) {
    chips.push(
      <span key="d" class={`evt-badge demon${o.demon > 0 ? ' bad' : ' good'}`}>
        <i class="bead" /> {signed(o.demon)}
      </span>,
    );
  }
  if (o.toxin) {
    chips.push(<span key="t" class={`evt-badge toxin${o.toxin > 0 ? ' bad' : ' good'}`}>⚗ {signed(o.toxin)}</span>);
  }
  if (o.gold) {
    chips.push(<span key="g" class="evt-badge gold">◉ {signed(o.gold)}</span>);
  }
  if (chips.length === 0) return null;
  return <span class="evt-badges">{chips}</span>;
}

export function EventView(props: { run: RunState; dispatch: Dispatch }) {
  const { run, dispatch } = props;
  const s = run.screen;
  if (s.kind !== 'event') return null;
  const ev = getEvent(s.eventId);
  return (
    <div class="screen-page fade-in">
      <div class="event-page">
        <div class="event-title">{ev.name}</div>
        <div class="event-scene">{ev.scene}</div>
        {(!s.resultText || (s.eventId === 'fangshidushi' && s.stage > 0)) && (
          <div class="event-options">
            {ev.options.map((opt, i) => {
              const cantGold = opt.requireGold !== undefined && run.gold < opt.requireGold;
              const cantLife = opt.requireLifespan !== undefined && run.lifespan < opt.requireLifespan;
              const cantRelic = !!opt.requireRelic && run.relics.length === 0;
              const off = s.disabled.includes(i);
              return (
                <button
                  key={i}
                  disabled={cantGold || cantLife || cantRelic || off}
                  onClick={() => dispatch({ t: 'EVENT_OPTION', option: i })}
                >
                  <span class="evt-label">{opt.label}</span>
                  <OptionBadges opt={opt} />
                  {cantGold && <span class="evt-lack">（需 ◉{opt.requireGold}）</span>}
                  {cantLife && <span class="evt-lack">（寿元不足 {opt.requireLifespan} 年）</span>}
                  {cantRelic && <span class="evt-lack">（需法宝）</span>}
                </button>
              );
            })}
          </div>
        )}
        {s.resultText && (
          <>
            <div class="event-result">{s.resultText}</div>
            <div class="evt-continue">
              <button class="primary" onClick={() => dispatch({ t: 'LEAVE_EVENT' })}>
                {s.eventId === 'fangshidushi' && s.stage > 0 ? '收手离开' : '继续赶路'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 洞府（CaveView）：四选二 + 炼丹子面板
// ============================================================

const CAVE_ACTS: {
  kind: 'rest' | 'smith' | 'brew' | 'fast';
  icon: string;
  name: string;
  base: number;
  effect: string;
}[] = [
  { kind: 'rest', icon: '🧘', name: '闭关', base: 3, effect: '回 36 点气血' },
  { kind: 'smith', icon: '📖', name: '参悟', base: 2, effect: '升级 1 张牌' },
  { kind: 'brew', icon: '⚗', name: '炼丹', base: 2, effect: '依丹方消耗灵材，炼丹 1 枚' },
  { kind: 'fast', icon: '🍃', name: '辟谷', base: 2, effect: '清 4 点丹毒' },
];
const CAVE_ACT_NAME: Record<string, string> = { rest: '闭关', smith: '参悟', brew: '炼丹', fast: '辟谷' };

function BrewPanel(props: { run: RunState; dispatch: Dispatch; onClose: () => void }) {
  const { run, dispatch } = props;
  const boxFull = run.elixirs.length >= run.elixirCap;
  return (
    <div class="overlay" onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div class="panel brew-panel">
        <h3>起 炉 炼 丹</h3>
        <div class="brew-box">
          <span class="sub">丹盒 {run.elixirs.length}/{run.elixirCap}</span>
          <ElixirBar
            run={run}
            onUse={(id: string) => {
              if (getRecipe(id).mapUsable) dispatch({ t: 'USE_ELIXIR', elixir: id });
            }}
          />
        </div>
        {run.recipes.length === 0 && <div class="sub">（未持有丹方——坊市与奇遇中或可寻得）</div>}
        <div class="brew-list">
          {run.recipes.map((rid) => {
            const d = getRecipe(rid);
            const mats = Object.entries(d.cost) as [MaterialId, number][];
            const enough = mats.every(([m, n]) => run.materials[m] >= n);
            const after = Math.max(0, Math.min(12, run.toxin + d.toxin));
            const can = enough && !boxFull;
            return (
              <div key={rid} class={`brew-item${can ? '' : ' off'}`}>
                <div class="brew-main">
                  <div class="brew-name">{d.name}{d.rare && <span class="rare-tag">稀方</span>}</div>
                  <div class="brew-text">{d.text}</div>
                  <div class="brew-mats">
                    {mats.map(([m, n]) => (
                      <span key={m} class={`mat-req${run.materials[m] < n ? ' lack' : ''}`}>
                        {MATERIAL_NAME[m]} {run.materials[m]}/{n}
                      </span>
                    ))}
                    <span class={`toxin-chip${d.toxin < 0 ? ' good' : ''}`}>⚗ 丹毒 {run.toxin} → {after}</span>
                  </div>
                </div>
                <button
                  class="brew-btn"
                  disabled={!can}
                  onClick={() => {
                    dispatch({ t: 'CAVE_ACTION', kind: 'brew', recipeId: rid });
                    props.onClose();
                  }}
                >
                  起炉
                </button>
              </div>
            );
          })}
        </div>
        {boxFull && <div class="sub brew-warn">丹盒已满——先服下或弃去一枚，方能再炼。</div>}
        <div class="adv-panel-foot">
          <button class="ghost" onClick={props.onClose}>掩炉而出</button>
        </div>
      </div>
    </div>
  );
}

export function CaveView(props: { run: RunState; dispatch: Dispatch }) {
  const { run, dispatch } = props;
  const s = run.screen;
  const [brewing, setBrewing] = useState(false);
  if (s.kind !== 'cave') return null;
  const putuan = run.relics.includes('putuan');
  const asc5 = run.ascension >= 5; // 五重天「光阴如刀」：洞府行动 +1 年
  const cost = (base: number) => Math.max(1, base + (asc5 ? 1 : 0) - (putuan ? 1 : 0));
  return (
    <div class="screen-page fade-in">
      <h2>洞 府</h2>
      {s.free
        ? <div class="free-banner">阵法尚存 · 此行不耗寿元</div>
        : <div class="sub">寻一处灵穴，度几载春秋。寿元 {run.lifespan} 年。</div>}
      <div class="cave-remain">
        可行 <b>{s.remaining}</b> 项
        {s.used.length > 0 && <span class="cave-used"> · 已行：{s.used.map((k) => CAVE_ACT_NAME[k] ?? k).join('、')}</span>}
      </div>
      <div class="cave-actions">
        {CAVE_ACTS.map((a) => {
          const used = s.used.includes(a.kind);
          const fastLock = a.kind === 'fast' && run.toxin <= 0;
          const disabled = used || s.remaining <= 0 || fastLock;
          return (
            <div
              key={a.kind}
              class={`cave-act${disabled ? ' off' : ''}${used ? ' done' : ''}`}
              onClick={() => {
                if (disabled) return;
                if (a.kind === 'brew') setBrewing(true);
                else dispatch({ t: 'CAVE_ACTION', kind: a.kind });
              }}
            >
              <span class="cave-icon">{a.icon}</span>
              <div class="cave-body">
                <div class="cave-name">
                  {a.name}
                  {used && <span class="cave-done-tag">已行</span>}
                  {fastLock && !used && <span class="cave-lock-tag">丹毒已清</span>}
                </div>
                <div class="cave-effect">{a.effect}</div>
              </div>
              <span class={`cave-price${s.free ? ' free' : ''}${putuan && !s.free ? ' cut' : ''}`}>
                {s.free ? '免' : <>⏳ {cost(a.base)} 年</>}
              </span>
            </div>
          );
        })}
      </div>
      {!s.free && (putuan || asc5) && (
        <div class="cave-note">
          {putuan && '蒲团：行动寿元 −1 年（下限 1）。'}
          {asc5 && '五重天·光阴如刀：行动寿元 +1 年。'}
        </div>
      )}
      <div class="adv-spacer" />
      <button class="primary adv-go" onClick={() => dispatch({ t: 'CAVE_LEAVE' })}>离 开</button>
      {brewing && <BrewPanel run={run} dispatch={dispatch} onClose={() => setBrewing(false)} />}
    </div>
  );
}

// ============================================================
// 选牌（CardPickView）：斩尘缘 / 参悟 / 点化
// ============================================================

export function CardPickView(props: { run: RunState; dispatch: Dispatch }) {
  const { run, dispatch } = props;
  const s = run.screen;
  if (s.kind !== 'cardPick') return null;
  const title = s.mode === 'remove' ? '斩 尘 缘' : s.mode === 'upgrade' ? '参 悟' : '点 化';
  const cards = s.mode === 'upgrade'
    ? run.deck.filter((c) => !c.upgraded && getCard(c.cardId).type !== 'curse')
    : run.deck;
  return (
    <div class="screen-page fade-in">
      <h2>{title}</h2>
      <div class="sub">{s.reason}（还可选 {s.count} 张）</div>
      <div class="adv-cardgrid">
        {cards.map((c) => (
          <CardPick
            key={c.uid}
            card={c}
            locked={s.mode === 'remove' && !!getCard(c.cardId).bonded}
            lockText="本命不可斩"
            onClick={() => dispatch({ t: 'PICK_CARD_SCREEN', uid: c.uid })}
          />
        ))}
      </div>
      <button class="ghost" onClick={() => dispatch({ t: 'PICK_CARD_SCREEN', uid: -1 })}>不选了</button>
    </div>
  );
}

// ============================================================
// 道果（DaoguoView）：突破规则解锁横幅 + 道果印章三选一
// ============================================================

export function DaoguoView(props: { run: RunState; dispatch: Dispatch }) {
  const { run, dispatch } = props;
  const s = run.screen;
  if (s.kind !== 'daoguo') return null;
  const zhuji = run.act === 1; // 幕一 Boss 后 → 筑基；幕二 Boss 后 → 金丹
  return (
    <div class="screen-page fade-in">
      <div class="daoguo-banner">
        <div class="dg-stage">{zhuji ? '筑 基' : '金 丹'}</div>
        <div class="dg-rules">
          {zhuji ? (
            <>
              <div class="dg-rule"><b>气海成潭</b> —— 灵气可储存不散，跨回合留用</div>
              <div class="dg-rule"><b>御空</b> —— 耗 3 年寿元跃过一层，每幕 2 次</div>
              <div class="dg-rule dim">雷云散尽，寿元 +60 年</div>
            </>
          ) : (
            <>
              <div class="dg-rule"><b>周天自运</b> —— 行位跨回合不散</div>
              <div class="dg-rule"><b>缩地</b> —— 御空改耗 2 年，每幕 3 次</div>
              <div class="dg-rule dim">金丹既成，寿元 +120 年</div>
            </>
          )}
        </div>
      </div>
      <div class="sub">摘一枚道果（{s.options.length} 选一）</div>
      <div class="daoguo-seals">
        {s.options.map((id, i) => {
          const d = DAOGUO[id];
          return (
            <div
              key={id}
              class="daoguo-seal"
              style={{ animationDelay: `${i * 0.12}s` }}
              onClick={() => dispatch({ t: 'PICK_DAOGUO', id })}
            >
              <div class="seal-name">{d?.name ?? id}</div>
              <div class="seal-text">{d?.text ?? ''}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** v2 兼容别名（App 旧接线用；DaoguoScreen 替代 BreakthroughScreen） */
export const BreakthroughView = DaoguoView;

// ============================================================
// 结算（EndView）：生平卷轴 + 宿慧三选一 + 业力秤
// ============================================================

/** 宿慧业力价（§11.1）：卡 普0/稀1/史2/传3；法宝 凡1/灵2/仙3/劫4 */
const CARD_KARMA: Record<Rarity, number> = {
  starter: 0, common: 0, rare: 1, epic: 2, legendary: 3, curse: 0,
};
const RELIC_KARMA: Record<RelicGrade, number> = { fan: 1, ling: 2, xian: 3, jie: 4 };

export function EndView(props: {
  run: RunState;
  profile: Profile;
  onLegacy: (pick: { kind: 'card' | 'relic' | 'daoxing'; uid?: number; relicId?: string }) => void;
  onRestart: () => void;
  onHome: () => void;
}) {
  const { run, profile } = props;
  const s = run.screen;
  const [tab, setTab] = useState<'card' | 'relic' | 'daoxing'>('card');
  const [selUid, setSelUid] = useState<number | null>(null);
  const [selRelic, setSelRelic] = useState<string | null>(null);
  const [inscribed, setInscribed] = useState(false);
  if (s.kind !== 'end') return null;

  const zuohua = !s.victory && (s.cause.includes('坐化') || run.lifespan <= 0);

  let baseKarma = 0;
  let valid = false;
  if (tab === 'card' && selUid !== null) {
    const c = run.deck.find((x) => x.uid === selUid);
    if (c) { baseKarma = CARD_KARMA[getCard(c.cardId).rarity]; valid = true; }
  } else if (tab === 'relic' && selRelic !== null && run.relics.includes(selRelic)) {
    baseKarma = RELIC_KARMA[getRelic(selRelic).grade];
    valid = true;
  } else if (tab === 'daoxing') {
    baseKarma = 0;
    valid = true;
  }
  // 通关转世：天道嘉许，业力 −1（下限 0）
  const karma = Math.max(0, baseKarma - (s.victory ? 1 : 0));
  const debts = Math.floor(karma / 2);

  const confirm = () => {
    if (inscribed || !valid) return;
    props.onLegacy({
      kind: tab,
      uid: tab === 'card' ? selUid ?? undefined : undefined,
      relicId: tab === 'relic' ? selRelic ?? undefined : undefined,
    });
    setInscribed(true);
  };

  return (
    <div class="screen-page fade-in">
      {/* ---- 生平卷轴 ---- */}
      <div class="end-scroll">
        <div class="end-seal">{s.victory ? '飞升' : '道消'}</div>
        <h2>{s.victory ? '白 日 飞 升' : '生 平 卷 轴'}</h2>
        {s.daohao && <div class="daohao">道号 · {s.daohao}</div>}
        {zuohua ? (
          <>
            <div class="zuohua-line">「油尽灯枯」</div>
            <div class="sub">寿数既尽，青山一梦，坐化而去。</div>
          </>
        ) : (
          <div class="sub">{s.cause}</div>
        )}
        {/* 路线缩略：本幕走过的节点描朱砂 */}
        <div class="route-mini">
          {run.map.layers.map((row, li) => (
            <div key={li} class="route-row">
              {row.map((n) => (
                <span key={n.id} class={`route-dot ${run.flags[`visited_${n.id}`] ? 'walked' : ''}`} />
              ))}
            </div>
          ))}
        </div>
        <div class="end-stats">
          <div><span>行至</span><span>第{['一', '二', '三'][run.act - 1]}幕 第 {run.floor + 1} 层</span></div>
          <div><span>斩妖</span><span>{run.flags['kills'] ?? 0}</span></div>
          <div><span>精英斩获</span><span>{run.stats.elitesKilled}</span></div>
          <div><span>天劫渡过</span><span>{run.stats.bossesKilled}</span></div>
          <div><span>服丹 / 炼丹</span><span>{run.stats.elixirsUsed} / {run.stats.brews}</span></div>
          <div><span>寿元余</span><span>{Math.max(0, run.lifespan)} 年</span></div>
          <div><span>分数</span><span>{s.score}</span></div>
          <div><span>道行 +</span><span class="liujin-text">{s.daowei}（累计 {profile.daowei}）</span></div>
          {/* 观星台里程碑（道行 ≥20）：显示种子 */}
          {profile.daowei >= 20 && (
            <div><span>种子</span><span class="seed-text">{run.seed}</span></div>
          )}
        </div>
      </div>

      {/* ---- 宿慧三选一 ---- */}
      <div class="legacy-box">
        <div class="legacy-title">宿 慧</div>
        <div class="sub">带一缕因果入来世（三选一）</div>
        <div class="legacy-tabs">
          <button class={tab === 'card' ? 'active' : ''} onClick={() => !inscribed && setTab('card')}>本命牌</button>
          <button class={tab === 'relic' ? 'active' : ''} onClick={() => !inscribed && setTab('relic')}>残魂器</button>
          <button class={tab === 'daoxing' ? 'active' : ''} onClick={() => !inscribed && setTab('daoxing')}>纯粹道行</button>
        </div>

        {tab === 'card' && (
          <>
            <div class="sub legacy-hint">业力价：普 0 / 稀 1 / 史 2 / 传 3</div>
            <div class="legacy-cards">
              {run.deck.map((c) => (
                <CardPick
                  key={c.uid}
                  card={c}
                  selected={selUid === c.uid}
                  onClick={() => !inscribed && setSelUid(c.uid)}
                  note={<span class="karma-chip">业 {CARD_KARMA[getCard(c.cardId).rarity]}</span>}
                />
              ))}
            </div>
          </>
        )}

        {tab === 'relic' && (
          run.relics.length === 0
            ? <div class="sub">（此生两袖清风，未得法宝）</div>
            : (
              <>
                <div class="sub legacy-hint">业力价：凡 1 / 灵 2 / 仙 3 / 劫 4</div>
                <div class="legacy-relics">
                  {run.relics.map((id) => {
                    const d = getRelic(id);
                    return (
                      <div
                        key={id}
                        class={`legacy-relic${selRelic === id ? ' sel' : ''}`}
                        onClick={() => !inscribed && setSelRelic(id)}
                      >
                        <div class="lr-main">
                          <div class="lr-name">{d.name} <span class="grade-tag">{RELIC_GRADE_NAME[d.grade]}</span></div>
                          <div class="lr-text">{d.text}</div>
                        </div>
                        <span class="karma-chip">业 {RELIC_KARMA[d.grade]}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )
        )}

        {tab === 'daoxing' && (
          <div class="legacy-daoxing">
            <div class="ld-big">道行 +15</div>
            <div class="sub">不带一物，唯道心澄明。业力 0。</div>
          </div>
        )}

        {/* 业力秤：实时显示所选业力与来世效果 */}
        <div class="karma-scale">
          <span class="ks-label">业力秤</span>
          <span class={`ks-value${valid && karma >= 4 ? ' hot' : ''}`}>{valid ? karma : '—'}</span>
          <span class="ks-desc">
            {valid
              ? karma === 0
                ? '无业一身轻，来世清净。'
                : `来世开局心魔 ${karma}${debts > 0 ? ` · 因果债 ×${debts}` : ''}${karma >= 4 ? ' · 道雷强化' : ''}`
              : '择一宿慧，秤上见业。'}
            {s.victory && valid && baseKarma > 0 && <em class="ks-note">（通关：业力 −1）</em>}
          </span>
        </div>
        <button class="primary legacy-confirm" disabled={inscribed || !valid} onClick={confirm}>
          {inscribed ? '已铭刻' : '铭刻宿慧'}
        </button>
      </div>

      <div class="end-actions">
        <button class="gold" onClick={() => makeShareImage(run)}>晒战绩</button>
        <button class="primary" onClick={props.onRestart}>再来一世</button>
        <button class="ghost" onClick={props.onHome}>回首页</button>
      </div>
    </div>
  );
}
