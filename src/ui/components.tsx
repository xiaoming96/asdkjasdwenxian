/**
 * 通用 UI 组件（v3）
 * - CardFace：两行卡面（基础段常亮 + 得气段灰墨/鎏金点亮；双行牌 textA/textB 两栏）
 * - TopBar：气血 / 灵石 / 寿元漏刻 / 心魔珠 / 丹毒鼎 / 丹盒
 * - ElixirBar：丹盒（run.elixirs；旧导出名 PotionBar 保留为别名）
 */
import type { ComponentChildren } from 'preact';
import type { CardInstance, RunState } from '../core/types';
import { getCard } from '../data/cards';
import { getRecipe } from '../data/alchemy';
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

/**
 * 两行卡面（v3 核心 UI，§13.2 界面 3）：
 * - text 基础段常亮；shengText 得气段第二行默认灰墨（opacity 0.55）
 * - deqiGlow：打出将得气 → 得气段鎏金点亮（140ms 扫光）+ 卡缘泛金
 * - 双行牌（dual）：textA/textB 两栏；deqiSide 标记哪一侧顺生（'both' = 天人合一等两侧皆亮）
 */
export function CardFace(props: {
  card: CardInstance;
  cost?: number | string;
  selected?: boolean;
  unplayable?: boolean;
  deqiGlow?: boolean;
  deqiSide?: 'a' | 'b' | 'both' | null;
  /** 旧 prop 名兼容（v2 行云流水金边） */
  liushuiGlow?: boolean;
  picked?: boolean;
  onClick?: (e: MouseEvent) => void;
}) {
  const def = getCard(props.card.cardId);
  const up = props.card.upgraded;
  const text = up && def.upText ? def.upText : def.text;
  const shengText = up ? (def.upShengText ?? def.shengText) : def.shengText;
  const cost = props.cost ?? (def.cost === 'X' ? 'X' : def.cost);
  const glow = props.deqiGlow || props.liushuiGlow;
  const cls = [
    'wcard',
    `rare-${def.rarity}`,
    up ? 'upgraded' : '',
    props.selected ? 'selected' : '',
    props.unplayable ? 'unplayable' : '',
    glow ? 'deqi-glow liushui-glow' : '',
    props.picked ? 'picked' : '',
  ].join(' ');
  return (
    <div class={cls} onClick={props.onClick}>
      <div class="c-art-full" style={{ backgroundImage: `url(${cardArt(def.id, def.element, def.type === 'curse')})` }} />
      <span class="c-cost">{cost}</span>
      <span class="c-el"><ElBadge el={def.element} /></span>
      <div class="c-plate">
        <div class="c-plate-head">
          <span class="c-name">{def.name}{up ? '+' : ''}</span>
          <span class="c-typechip" title={RARITY_NAME[def.rarity]}>{TYPE_NAME[def.type]}</span>
        </div>
        {def.dual ? (
          <div class="c-dual">
            <div class={`c-dual-side ${glow && (props.deqiSide === 'a' || props.deqiSide === 'both') ? 'lit' : ''}`}>
              <span class="c-dual-el" style={{ background: EL_COLOR[def.dual.elements[0]] }}>{ELEMENT_NAME[def.dual.elements[0]]}</span>
              <span class="c-dual-text">{def.dual.textA}</span>
            </div>
            <div class={`c-dual-side ${glow && (props.deqiSide === 'b' || props.deqiSide === 'both') ? 'lit' : ''}`}>
              <span class="c-dual-el" style={{ background: EL_COLOR[def.dual.elements[1]] }}>{ELEMENT_NAME[def.dual.elements[1]]}</span>
              <span class="c-dual-text">{def.dual.textB}</span>
            </div>
          </div>
        ) : (
          <>
            {text && <div class="c-text">{text}</div>}
            {shengText && (
              <div class={`c-sheng ${glow ? 'lit' : ''}`}>
                <span class="c-sheng-tag">得气</span>
                {shengText}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** 旧导出名兼容（Adventure/Meta 等他人文件仍引用 CardView） */
export const CardView = CardFace;

const ELIXIR_ICON: Record<string, string> = {
  huiyuandan: '🔴', julingdan: '💠', xuanwudan: '🐢', kaiqiaodan: '📜',
  qingxindan: '🌿', wuxingdan: '☯', longhudan: '🐯', guixidan: '🛡',
  huashadan: '💥', dahuandan: '✨', wudaodan: '📖', tianjidan: '👁',
};

/**
 * 丹盒（§7）：run.elixirs 显示丹名；战斗内点击 onUse → USE_ELIXIR（由调用方 dispatch）。
 */
export function ElixirBar(props: { run: RunState; onUse?: (id: string) => void; compact?: boolean }) {
  const { run } = props;
  const slots: string[] = [...run.elixirs];
  while (slots.length < run.elixirCap) slots.push('');
  return (
    <div class={`potion-bar elixir-bar ${props.compact ? 'compact' : ''}`}>
      {slots.map((id, i) =>
        id ? (
          <div
            key={i}
            class="potion elixir"
            title={`${getRecipe(id).name}：${getRecipe(id).text}`}
            onClick={() => props.onUse?.(id)}
          >
            <span class="elixir-icon">{ELIXIR_ICON[id] ?? '💊'}</span>
            {!props.compact && <span class="elixir-name">{getRecipe(id).name}</span>}
          </div>
        ) : (
          <div key={i} class="potion elixir empty" />
        ),
      )}
    </div>
  );
}

/** 旧导出名兼容（App 等他人文件仍引用 PotionBar） */
export const PotionBar = ElixirBar;

/**
 * 顶栏（v3 重做，§13.2 界面 2/3 顶部信息）：
 * 气血 / 灵石 / 寿元漏刻（⏳ 余寿 X 载，≤15 描红）/ 心魔珠（0–9）/ 丹毒鼎（0–12 三档）/ 牌组入口。
 * onUseElixir 可选：提供时丹盒可点击（战斗内 App 可传 USE_ELIXIR 派发）。
 */
export function TopBar(props: { run: RunState; onDeck: () => void; onUseElixir?: (id: string) => void }) {
  const { run } = props;
  const stageNames = ['炼气 → 筑基', '筑基 → 金丹', '金丹 → 飞升'];
  const toxinTier = run.toxin >= 12 ? 't3' : run.toxin >= 8 ? 't2' : run.toxin >= 4 ? 't1' : 't0';
  return (
    <div class="topbar">
      <div class="topbar-main">
        <span class="hp" title="气血">❤ {run.hp}/{run.maxHp}</span>
        <span class="gold" title="灵石">◉ {run.gold}</span>
        <span
          class={`lifespan ${run.lifespan <= 15 ? 'low' : ''}`}
          title={`寿元漏刻：余寿 ${run.lifespan} 载。移动/洞府/御空/事件皆耗寿，归零坐化。`}
        >
          ⏳ 余寿 {run.lifespan} 载
        </span>
        <button class="deckbtn ghost" onClick={props.onDeck}>牌组 {run.deck.length}</button>
        <span class="stage">第{['一', '二', '三'][run.act - 1]}幕 · {stageNames[run.act - 1]}{run.ascension > 0 ? ` · ${'一二三四五六七八九'[run.ascension - 1]}重天` : ''}</span>
      </div>
      <div class="topbar-sub">
        <span class="demon-beads" title={`心魔 ${run.demon}/9：3 尘缘 / 5 业障 / 7 贪嗔 / 9 心魔投影入战`}>
          <span class="meter-label">魔</span>
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} class={`bead ${i < run.demon ? 'on' : ''} ${i === 2 || i === 4 || i === 6 || i === 8 ? 'mark' : ''}`} />
          ))}
        </span>
        <span class={`toxin-dings ${toxinTier}`} title={`丹毒 ${run.toxin}/12：≥4 战斗开局 2 真伤 / ≥8 上限 −10 / =12 入节点 −3 血`}>
          <span class="meter-label">毒</span>
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} class={`ding ${i < run.toxin ? 'on' : ''} ${i === 3 || i === 7 || i === 11 ? 'mark' : ''}`} />
          ))}
        </span>
        {run.elixirs.length > 0 && (
          <span class="topbar-elixirs">
            <ElixirBar run={run} compact onUse={props.onUseElixir} />
          </span>
        )}
      </div>
    </div>
  );
}

export function DeckModal(props: {
  title: string;
  cards: CardInstance[];
  onClose: () => void;
  onPick?: (uid: number) => void;
  pickedUids?: number[];
  /** 手牌中"打出将得气"的判断（战斗内弹层沿用两行卡面点亮） */
  deqiUids?: number[];
  footer?: ComponentChildren;
  sub?: string;
}) {
  return (
    <div class="overlay" onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div class="panel">
        <h3>{props.title}</h3>
        {props.sub && <div class="sub" style={{ textAlign: 'center', marginBottom: '8px' }}>{props.sub}</div>}
        <div class="card-grid">
          {props.cards.length === 0 && <div class="sub">（空）</div>}
          {props.cards.map((c) => (
            <CardFace
              key={c.uid}
              card={c}
              picked={props.pickedUids?.includes(c.uid)}
              deqiGlow={props.deqiUids?.includes(c.uid)}
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
