/**
 * 局外界面（v3）：主界面 / 藏经阁（四册）/ 轮回殿 / 成就 / 设置 / 每日天机
 * （策划案 §11 / §13.2 #1 #9 #10）
 * v3 变更：解锁树删除——道行只涨不花，里程碑自动解锁（data/milestones.ts）；
 * 转世 → 轮回殿：展示里程碑进度、当前宿慧（本命牌/残魂器/业力预览）、道号谱。
 */
import { useState } from 'preact/hooks';
import type { Profile } from '../core/types';
import { CARDS, getCard } from '../data/cards';
import { RELICS, RELIC_GRADE_NAME, getRelic } from '../data/relics';
import { ENEMIES } from '../data/enemies';
import { MILESTONES, computeUnlocked, CHARACTERS } from '../data/milestones';
import { ACHIEVEMENTS } from '../data/achievements';
import { RECIPES, MATERIAL_NAME } from '../data/alchemy';
import { dailyMutation, todayKey } from '../data/daily';
import { sfx, setSfxVolume } from '../audio/sfx';
import { setBgmVolume } from '../audio/bgm';
import { enemyArt, cardArtSource } from './art';
import './meta.css';

export type MetaPage = 'codex' | 'lunhui' | 'settings' | 'achievements';

// ---------- 主界面（§13.2 #1） ----------

export function HomeScreen(props: {
  profile: Profile;
  hasSave: boolean;
  onStart: (ascension: number, character: string, daily?: boolean) => void;
  onContinue: () => void;
  onNav: (page: MetaPage) => void;
}) {
  const { profile } = props;
  const [showStart, setShowStart] = useState(false);
  const [showDaily, setShowDaily] = useState(false);
  const [ascension, setAscension] = useState(0);
  const [character, setCharacter] = useState('jianxiu');
  const unlocked = computeUnlocked(profile);
  const dailyOpen = unlocked.includes('meiritianji');
  // 九重天：通关后解锁，逐重推进（§11.2）
  const maxAsc = profile.wins > 0 ? Math.min(9, profile.maxAscensionCleared + 1) : 0;
  const solarTerms = ['立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至', '小寒', '大寒'];
  const term = solarTerms[Math.floor(((Date.now() / 86400000) % 360) / 15)];
  const daily = dailyMutation();

  return (
    <div class="home fade-in">
      <div class="home-title">问长生</div>
      <div class="home-seal">以身问之</div>
      <div class="spacer" />
      <div class="home-menu">
        {props.hasSave && (
          <button class="primary" onClick={props.onContinue}>续 前 缘</button>
        )}
        <button class={props.hasSave ? '' : 'primary'} onClick={() => { sfx.click(); setShowStart(true); }}>启 程</button>
        <button
          disabled={!dailyOpen}
          title={dailyOpen ? '' : '道行至 50，里程碑「每日天机」自开'}
          onClick={() => { sfx.click(); setShowDaily(true); }}
        >
          每日天机{dailyOpen ? '' : ' 🔒'}
        </button>
        <button onClick={() => props.onNav('codex')}>藏 经 阁</button>
        <button onClick={() => props.onNav('lunhui')}>轮 回 殿（道行 {profile.daowei}）</button>
      </div>
      <div class="home-footer">
        <span onClick={() => props.onNav('settings')}>设置</span>
        <span onClick={() => props.onNav('achievements')}>成就 {profile.achievements.length}/{ACHIEVEMENTS.length}</span>
        <span>今日 · {term}</span>
      </div>

      {showStart && (
        <div class="overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowStart(false); }}>
          <div class="panel">
            <h3>启程 · 择道</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '14px', marginBottom: '6px' }}>角色</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {Object.entries(CHARACTERS).map(([id, c]) => {
                    const locked = c.unlock !== null && !unlocked.includes(c.unlock);
                    const unlockDef = c.unlock ? MILESTONES.find((m) => m.id === c.unlock) : null;
                    return (
                      <button
                        key={id}
                        class={character === id ? 'primary' : ''}
                        disabled={locked}
                        title={locked && unlockDef ? `道行至 ${unlockDef.daowei} 自开` : ''}
                        onClick={() => setCharacter(id)}
                      >
                        {c.name}{locked ? ' 🔒' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '14px', marginBottom: '6px' }}>
                  难度（九重天）{maxAsc <= 0 ? ' · 通关后解锁' : ''}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {Array.from({ length: 10 }, (_, i) => (
                    <button
                      key={i}
                      class={ascension === i ? 'primary' : ''}
                      style={{ minHeight: '36px', padding: '4px 10px', fontSize: '14px' }}
                      disabled={i > maxAsc}
                      onClick={() => setAscension(i)}
                    >
                      {i === 0 ? '凡' : '一二三四五六七八九'[i - 1]}
                    </button>
                  ))}
                </div>
              </div>
              {profile.legacy.kind !== null && (
                <div class="legacy-hint">
                  宿慧随身：{legacyLabel(profile)} · 业力 {profile.legacy.karma}（开局心魔 {profile.legacy.karma}）
                </div>
              )}
              <button class="primary" onClick={() => props.onStart(ascension, character)}>踏 上 仙 途</button>
            </div>
          </div>
        </div>
      )}

      {showDaily && (
        <div class="overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowDaily(false); }}>
          <div class="panel">
            <h3>每日天机 · {todayKey()}</h3>
            <div class="daily-mut">
              <b>{daily.name}</b> —— {daily.text}
            </div>
            <div class="daily-rules">
              天机不问出身，今日修士同题共答：全卡池 · 剑修出战 · 无本命牌与残魂器 · 业力归零 · 难度固定三重天。
            </div>
            <button class="primary" onClick={() => { setShowDaily(false); props.onStart(3, 'jianxiu', true); }}>
              入 局 问 天
            </button>
          </div>
        </div>
      )}

      {dailyOpen && (
        <div style={{ position: 'absolute', bottom: '4px', fontSize: '11px', color: 'var(--dailan)' }}>
          今日天机（{todayKey()}）：{daily.name} —— {daily.text}
        </div>
      )}
    </div>
  );
}

/** 宿慧内容一句话描述（轮回殿与启程弹窗共用） */
function legacyLabel(profile: Profile): string {
  const l = profile.legacy;
  if (l.kind === 'card' && l.cardId) {
    const def = CARDS[l.cardId];
    return `本命牌「${def ? def.name : l.cardId}${l.upgraded ? '·参悟' : ''}」`;
  }
  if (l.kind === 'relic' && l.relicId) {
    const def = RELICS[l.relicId];
    return `残魂器「${def ? def.name : l.relicId}」`;
  }
  if (l.kind === 'daoxing') return '纯粹修为（道行 +15 已入账）';
  return '无';
}

// ---------- 轮回殿（§13.2 #9，替代 v2 转世解锁树） ----------

export function LunhuiScreen(props: { profile: Profile; onBack: () => void }) {
  const { profile } = props;
  const unlocked = computeUnlocked(profile);
  const l = profile.legacy;
  const karma = l.karma;
  const debts = Math.floor(karma / 2);
  return (
    <div class="screen-page fade-in">
      <h2>轮 回 殿</h2>
      <div class="sub">
        当前道行：<b style={{ color: 'var(--liujin)' }}>{profile.daowei}</b>
        　·　道行即修为，水到渠成
      </div>

      {/* 当前宿慧与业力预览（§11.1：来世开局生效，用完即清） */}
      <div class="legacy-panel">
        <div class="lp-title">当 前 宿 慧</div>
        {l.kind === null ? (
          <div class="lp-none">来世空手而行，不带因果。结算时可三选一带走宿慧。</div>
        ) : (
          <>
            <div class="lp-item">
              {l.kind === 'card' ? '🀄' : l.kind === 'relic' ? '🏺' : '☯'} {legacyLabel(profile)}
              {l.kind === 'card' && l.cardId && CARDS[l.cardId] && (
                <div class="lp-text">{getCard(l.cardId).text}</div>
              )}
              {l.kind === 'relic' && l.relicId && RELICS[l.relicId] && (
                <div class="lp-text">{getRelic(l.relicId).text}（{RELIC_GRADE_NAME[getRelic(l.relicId).grade]}）</div>
              )}
            </div>
            <div class="karma-row">
              <span>业力</span>
              <span class="karma-beads">
                {Array.from({ length: Math.max(karma, 1) }, (_, i) => (
                  <i key={i} class={i < karma ? 'on' : ''} />
                ))}
              </span>
              <b>{karma}</b>
            </div>
            <ul class="karma-preview">
              <li>来世开局心魔 = {karma}</li>
              <li>因果债 {debts} 张永久入起始牌库（每 2 业力 1 张）</li>
              <li class={karma >= 4 ? 'warn' : ''}>
                {karma >= 4 ? '⚠ 业力 ≥4：第九道"道雷"追加强化形态' : '业力不足 4：道雷如常'}
              </li>
            </ul>
          </>
        )}
      </div>

      {/* 里程碑卷轴（§11.1：按道行阈值自动解锁，无购买） */}
      <div class="ms-scroll">
        <div class="lp-title">里 程 碑</div>
        {MILESTONES.map((m) => {
          const reached = unlocked.includes(m.id);
          const pct = m.daowei <= 0 ? 100 : Math.min(100, Math.floor((profile.daowei / m.daowei) * 100));
          return (
            <div key={m.id} class={`ms-item ${reached ? 'reached' : ''}`}>
              <div class="ms-head">
                <b>{m.name}</b>
                <span class="ms-th">{m.daowei} 道行</span>
                {reached && <span class="ms-seal">已达</span>}
              </div>
              <div class="ms-text">{m.text}</div>
              {!reached && (
                <div class="ms-bar"><div style={{ width: `${pct}%` }} /></div>
              )}
            </div>
          );
        })}
      </div>

      {/* 道号谱（里程碑 30 道行） */}
      {unlocked.includes('daohaopu') && (
        <div class="legacy-panel">
          <div class="lp-title">道 号 谱</div>
          <div class="lp-text" style={{ letterSpacing: '2px' }}>
            {profile.daohaoList.length > 0 ? profile.daohaoList.join('、') : '尚无道号，通关可得'}
          </div>
        </div>
      )}
      <button onClick={props.onBack}>返回</button>
    </div>
  );
}

/** 兼容别名：v2 命名（转世）→ v3 轮回殿 */
export const ZhuanshiScreen = LunhuiScreen;

// ---------- 藏经阁（图鉴，§11.4：功法/法宝/妖怪/丹方 四册） ----------

export function CodexScreen(props: { profile: Profile; onBack: () => void }) {
  const { profile } = props;
  const [tab, setTab] = useState<'cards' | 'relics' | 'enemies' | 'recipes'>('cards');
  const cardList = Object.values(CARDS).filter((c) => c.rarity !== 'curse');
  const recipeList = Object.values(RECIPES);
  const enemyNotes: Record<string, string> = {
    shanxiao: '《山海经》一足之怪，畏爆竹声',
    yehu: '狐五十岁能化妇人，善魅',
    denglonggui: '灯笼近看无人提',
    shuigui: '溺亡者寻替身方得转生',
    nuomiangui: '傩戏面具，驱疫逐鬼所用',
    jiao: '蛟千年化龙，兴风作浪',
    tiaoshi: '尸变者，僵而能跳，畏糯米',
    huapi: '《聊斋》名篇，画皮之下非人面',
    heiwuchang: '勾魂使者，铁链锁魂',
    tongjiashi: '铜甲护尸，毒随爪出',
    zhizhujing: '结网缚人袖，丝不可断',
    wangchuandugui: '忘川无桥，渡资是命',
    shuihouzi: '水中猢狲，专偷修士灵气',
  };
  return (
    <div class="screen-page fade-in">
      <h2>藏 经 阁</h2>
      <div class="codex-tabs" style={{ width: '100%' }}>
        <button class={tab === 'cards' ? 'active' : ''} onClick={() => setTab('cards')}>功法 {profile.seenCards.length}/{cardList.length}</button>
        <button class={tab === 'relics' ? 'active' : ''} onClick={() => setTab('relics')}>法宝 {profile.seenRelics.length}/{Object.keys(RELICS).length}</button>
        <button class={tab === 'enemies' ? 'active' : ''} onClick={() => setTab('enemies')}>妖怪</button>
        <button class={tab === 'recipes' ? 'active' : ''} onClick={() => setTab('recipes')}>丹方</button>
      </div>
      <div class="codex-list">
        {tab === 'cards' && cardList.map((c) => {
          const seen = profile.seenCards.includes(c.id);
          const src = seen ? cardArtSource(c.id) : null;
          return (
            <div key={c.id} class={`codex-item ${seen ? '' : 'lockedx'}`}>
              <div>
                <div class="ci-name">{seen ? c.name : '？？？'}</div>
                {/* 两段式卡文本（§5.1）：基础段常亮 + 得气段 */}
                <div class="ci-text">{seen ? c.text : '尚未参悟此功法'}</div>
                {seen && c.shengText && <div class="ci-sheng">得气：{c.shengText}</div>}
                {src && <div class="ci-text" style={{ opacity: 0.75 }}>卡面：《{src.title}》· {src.museum}</div>}
              </div>
            </div>
          );
        })}
        {tab === 'relics' && Object.values(RELICS).map((r) => {
          const seen = profile.seenRelics.includes(r.id);
          return (
            <div key={r.id} class={`codex-item ${seen ? '' : 'lockedx'}`}>
              <span class="ci-name">{seen ? `${r.name}（${RELIC_GRADE_NAME[r.grade]}）` : '？？？'}</span>
              <span class="ci-text">{seen ? r.text : '尚未寻得此宝'}</span>
            </div>
          );
        })}
        {tab === 'enemies' && Object.values(ENEMIES).filter((e) => e.id !== 'baiwuchang').map((e) => {
          const seen = profile.seenEnemies.includes(e.id);
          const hint = e.tier === 'boss' ? `第${['一', '二', '三'][e.act - 1]}幕天劫` : e.tier === 'elite' ? `第${['一', '二', '三'][e.act - 1]}幕精英` : `第${['一', '二', '三'][e.act - 1]}幕出没`;
          const note = enemyNotes[e.id] ?? e.note;
          return (
            <div key={e.id} class={`codex-item ${seen ? '' : 'lockedx'}`}>
              {enemyArt(e.id) && (
                <img
                  class="ci-portrait"
                  src={enemyArt(e.id)!}
                  alt={seen ? e.name : '未知妖怪'}
                  loading="lazy"
                  style={seen ? undefined : { filter: 'brightness(0.15) contrast(0.8)', opacity: 0.5 }}
                />
              )}
              <div>
                <div class="ci-name">{seen ? e.name : '？？？'}</div>
                <div class="ci-text">
                  {seen
                    ? `${e.tier === 'boss' ? '天劫' : e.tier === 'elite' ? '精英' : `第${['一', '二', '三'][e.act - 1]}幕`} · 气血 ${e.hp}${note ? ` · ${note}` : ''}`
                    : `尚未遭遇 · ${hint}`}
                </div>
              </div>
            </div>
          );
        })}
        {tab === 'recipes' && (
          <>
            {/* 已见丹方 profile 内不追踪：丹方全录于册（丹道无私，方不藏拙），故此册不设剪影 */}
            <div class="recipe-note">丹道无私，凡方皆录。⊙ 者地图可服；稀方须于奇遇或坊市得之。</div>
            {recipeList.map((r) => (
              <div key={r.id} class="codex-item">
                <div>
                  <div class="ci-name">
                    {r.name}
                    {r.mapUsable ? ' ⊙' : ''}
                    {r.rare && <span class="recipe-rare">稀方</span>}
                  </div>
                  <div class="ci-text">{r.text}</div>
                  <div class="recipe-cost">
                    {Object.entries(r.cost).map(([m, n]) => `${MATERIAL_NAME[m as keyof typeof MATERIAL_NAME]}×${n}`).join(' + ')}
                    　·　{r.toxin >= 0 ? `丹毒 +${r.toxin}` : `净清丹毒 ${-r.toxin}`}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      <button onClick={props.onBack}>返回</button>
    </div>
  );
}

// ---------- 成就（§11.5，20 项） ----------

export function AchievementScreen(props: { profile: Profile; onBack: () => void }) {
  return (
    <div class="screen-page fade-in">
      <h2>成 就</h2>
      <div class="sub">{props.profile.achievements.length}/{ACHIEVEMENTS.length}</div>
      <div class="codex-list">
        {ACHIEVEMENTS.map((a) => {
          const got = props.profile.achievements.includes(a.id);
          return (
            <div key={a.id} class={`codex-item ${got ? '' : 'lockedx'}`}>
              <span class="ci-name">{got ? '🀄' : '⬜'} {a.name}</span>
              <span class="ci-text">{a.text}</span>
            </div>
          );
        })}
      </div>
      <button onClick={props.onBack}>返回</button>
    </div>
  );
}

// ---------- 设置 ----------

export function SettingsScreen(props: { profile: Profile; setProfile: (p: Profile) => void; onBack: () => void }) {
  const { profile } = props;
  const [credits, setCredits] = useState<string | null>(null);
  function update(k: 'music' | 'sfx', v: number) {
    const p2: Profile = { ...profile, settings: { ...profile.settings, [k]: v } };
    if (k === 'sfx') setSfxVolume(v);
    if (k === 'music') setBgmVolume(v);
    props.setProfile(p2);
  }
  async function openCredits() {
    try {
      const text = await (await fetch('/assets/CREDITS.md')).text();
      setCredits(text);
    } catch {
      setCredits('台账加载失败');
    }
  }
  return (
    <div class="screen-page fade-in">
      <h2>设 置</h2>
      <div class="settings-row">
        <span>音效</span>
        <input
          type="range" min="0" max="1" step="0.1"
          value={profile.settings.sfx}
          onInput={(e) => update('sfx', Number((e.target as HTMLInputElement).value))}
        />
        <button style={{ minHeight: '32px', padding: '2px 10px' }} onClick={() => sfx.deqi('metal')}>试听</button>
      </div>
      <div class="settings-row">
        <span>音乐</span>
        <input
          type="range" min="0" max="1" step="0.1"
          value={profile.settings.music}
          onInput={(e) => update('music', Number((e.target as HTMLInputElement).value))}
        />
        <span style={{ fontSize: '12px', color: 'var(--dailan)' }}>（程序化古琴风）</span>
      </div>
      <div class="sub" style={{ marginTop: '20px', lineHeight: 1.9 }}>
        《问长生》 v3 · 修仙题材单机肉鸽卡牌<br />
        五行速查：相生 木→火→土→金→水；相克 木克土 土克水 水克火 火克金 金克木<br />
        卡面与背景采用博物馆公有领域古画（CC0 / Open Access），敌人立绘为原创生成素材，音效为代码合成。
      </div>
      <button class="ghost" onClick={openCredits}>素材署名（Credits）</button>
      <button onClick={props.onBack}>返回</button>
      {credits !== null && (
        <div class="overlay" onClick={(e) => { if (e.target === e.currentTarget) setCredits(null); }}>
          <div class="panel">
            <h3>素材授权台账</h3>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: '10.5px', lineHeight: 1.6, fontFamily: 'inherit' }}>{credits}</pre>
            <div style={{ textAlign: 'center' }}><button onClick={() => setCredits(null)}>关闭</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
