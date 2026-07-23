/** 通用 UI 组件 */
import type { ComponentChildren } from 'preact';
import type { CardInstance, RunState } from '../core/types';
import { getCard } from '../data/cards';
import { getPotion } from '../data/potions';
import { ELEMENT_NAME, type CardElement } from '../core/wuxing';
import { cardArt } from './art';

export const EL_COLOR: Record<CardElement, string> = {
  metal: 'var(--el-metal)',
  wood: 'var(--el-wood)',
  water: 'var(--el-water)',
  fire: 'var(--el-fire)',
  earth: 'var(--el-earth)',
  none: 'var(--el-none)',
};

export function elName(el: CardElement): string {
  return el === 'none' ? '无' : ELEMENT_NAME[el];
}

export function ElBadge({ el }: { el: CardElement }) {
  return <span class="el-badge" style={{ background: EL_COLOR[el] }}>{elName(el)}</span>;
}

const TYPE_NAME: Record<string, string> = {
  attack: '攻击', defense: '防御', skill: '技能', power: '心法', curse: '诅咒',
};
const RARITY_NAME: Record<string, string> = {
  starter: '起始', common: '普通', rare: '稀有', epic: '史诗', legendary: '传说', curse: '诅咒',
};

export function CardView(props: {
  card: CardInstance;
  cost?: number | string;
  selected?: boolean;
  unplayable?: boolean;
  liushuiGlow?: boolean;
  picked?: boolean;
  onClick?: (e: MouseEvent) => void;
}) {
  const def = getCard(props.card.cardId);
  const text = props.card.upgraded && def.upText ? def.upText : def.text;
  const cost = props.cost ?? (def.cost === 'X' ? 'X' : def.cost);
  const cls = [
    'wcard',
    `rare-${def.rarity}`,
    props.card.upgraded ? 'upgraded' : '',
    props.selected ? 'selected' : '',
    props.unplayable ? 'unplayable' : '',
    props.liushuiGlow ? 'liushui-glow' : '',
    props.picked ? 'picked' : '',
  ].join(' ');
  return (
    <div class={cls} onClick={props.onClick}>
      <div class="c-art" style={{ backgroundImage: `url(${cardArt(def.id, def.element, def.type === 'curse')})` }}>
        <span class="c-cost">{cost}</span>
        <span class="c-namestrip">{def.name}{props.card.upgraded ? '+' : ''}</span>
        <span class="c-el"><ElBadge el={def.element} /></span>
      </div>
      <div class="c-divider"><span class="c-type-tag">{TYPE_NAME[def.type]} · {RARITY_NAME[def.rarity]}</span></div>
      <div class="c-text">{text}</div>
    </div>
  );
}

const POTION_ICON: Record<string, string> = {
  huixuedan: '🔴', lingqisan: '💠', jingangwan: '🛡', yunlingdan: '📜',
  qingxindan: '🌿', wuxingdan: '☯', longhudan: '🐯', guixidan: '🐢',
  huashadan: '💥', niepansan: '🔥', wudaodan: '✨', tianjiwan: '👁',
};

export function PotionBar(props: { run: RunState; onUse?: (id: string) => void }) {
  const { run } = props;
  const slots = [...run.potions];
  while (slots.length < run.potionCap) slots.push('');
  return (
    <div class="potion-bar">
      {slots.map((id, i) =>
        id ? (
          <div
            key={i}
            class="potion"
            title={`${getPotion(id).name}：${getPotion(id).text}`}
            onClick={() => props.onUse?.(id)}
          >
            {POTION_ICON[id] ?? '💊'}
          </div>
        ) : (
          <div key={i} class="potion empty" />
        ),
      )}
    </div>
  );
}

export function TopBar(props: { run: RunState; onDeck: () => void }) {
  const { run } = props;
  const stageNames = ['炼气 → 筑基', '筑基 → 金丹', '金丹 → 飞升'];
  return (
    <div class="topbar">
      <span class="hp">❤ {run.hp}/{run.maxHp}</span>
      <span class="gold">◉ {run.gold}</span>
      <button class="deckbtn ghost" onClick={props.onDeck}>牌组 {run.deck.length}</button>
      <span class="stage">第{['一', '二', '三'][run.act - 1]}幕 · {stageNames[run.act - 1]}{run.ascension > 0 ? ` · ${'一二三四五六七八九'[run.ascension - 1]}重天` : ''}</span>
    </div>
  );
}

export function DeckModal(props: {
  title: string;
  cards: CardInstance[];
  onClose: () => void;
  onPick?: (uid: number) => void;
  pickedUids?: number[];
  footer?: ComponentChildren;
}) {
  return (
    <div class="overlay" onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div class="panel">
        <h3>{props.title}</h3>
        <div class="card-grid">
          {props.cards.length === 0 && <div class="sub">（空）</div>}
          {props.cards.map((c) => (
            <CardView
              key={c.uid}
              card={c}
              picked={props.pickedUids?.includes(c.uid)}
              onClick={() => props.onPick?.(c.uid)}
            />
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: '12px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
          {props.footer ?? <button onClick={props.onClose}>关闭</button>}
        </div>
      </div>
    </div>
  );
}
