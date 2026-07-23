/** 局外界面：主界面 / 藏经阁 / 转世 / 设置 / 每日天机（策划案 §11 / §13.2） */
import { useState } from 'preact/hooks';
import type { Profile } from '../core/types';
import { CARDS } from '../data/cards';
import { RELICS, RELIC_GRADE_NAME } from '../data/relics';
import { ENEMIES } from '../data/enemies';
import { UNLOCKS, CHARACTERS } from '../data/unlocks';
import { ACHIEVEMENTS } from '../data/achievements';
import { dailyMutation, todayKey } from '../data/daily';
import { buyUnlock } from '../save/profileLogic';
import { sfx, setSfxVolume } from '../audio/sfx';
import { enemyArt, cardArtSource } from './art';

// ---------- 主界面 ----------

export function HomeScreen(props: {
  profile: Profile;
  hasSave: boolean;
  onStart: (ascension: number, character: string, daily?: boolean) => void;
  onContinue: () => void;
  onNav: (page: 'codex' | 'zhuanshi' | 'settings' | 'achievements') => void;
}) {
  const { profile } = props;
  const [showStart, setShowStart] = useState(false);
  const [ascension, setAscension] = useState(0);
  const [character, setCharacter] = useState('jianxiu');
  const maxAsc = Math.min(9, profile.maxAscensionCleared + 1 >= 0 && profile.unlocked.includes('yichongtian') ? profile.maxAscensionCleared + 2 : 0);
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
          disabled={!profile.unlocked.includes('meiritianji')}
          title={profile.unlocked.includes('meiritianji') ? '' : '需在转世中解锁（60 道行）'}
          onClick={() => props.onStart(0, 'jianxiu', true)}
        >
          每日天机{profile.unlocked.includes('meiritianji') ? '' : ' 🔒'}
        </button>
        <button onClick={() => props.onNav('codex')}>藏 经 阁</button>
        <button onClick={() => props.onNav('zhuanshi')}>转 世（道行 {profile.daowei}）</button>
      </div>
      <div class="home-footer">
        <span onClick={() => props.onNav('settings')}>设置</span>
        <span onClick={() => props.onNav('achievements')}>成就 {profile.achievements.length}/20</span>
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
                    const locked = c.unlock && !profile.unlocked.includes(c.unlock);
                    return (
                      <button
                        key={id}
                        class={character === id ? 'primary' : ''}
                        disabled={!!locked}
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
              <button class="primary" onClick={() => props.onStart(ascension, character)}>踏 上 仙 途</button>
            </div>
          </div>
        </div>
      )}
      {profile.unlocked.includes('meiritianji') && (
        <div style={{ position: 'absolute', bottom: '4px', fontSize: '11px', color: 'var(--dailan)' }}>
          今日天机（{todayKey()}）：{daily.name} —— {daily.text}
        </div>
      )}
    </div>
  );
}

// ---------- 藏经阁（图鉴） ----------

export function CodexScreen(props: { profile: Profile; onBack: () => void }) {
  const { profile } = props;
  const [tab, setTab] = useState<'cards' | 'relics' | 'enemies'>('cards');
  const cardList = Object.values(CARDS).filter((c) => c.rarity !== 'curse');
  const enemyNotes: Record<string, string> = {
    shanxiao: '《山海经》一足之怪，畏爆竹声',
    yehu: '狐五十岁能化妇人，善魅',
    denglonggui: '灯笼近看无人提',
    shuigui: '溺亡者寻替身方得转生',
    nuomiangui: '傩戏面具，驱疫逐鬼所用',
    jiao: '蛟千年化龙，兴风作浪',
    tiaoshi: '尸变者，僵而能跳，畏糯米',
    huapi: '《聊斋》名篇，画皮之下非人面',
  };
  return (
    <div class="screen-page fade-in">
      <h2>藏 经 阁</h2>
      <div class="codex-tabs" style={{ width: '100%' }}>
        <button class={tab === 'cards' ? 'active' : ''} onClick={() => setTab('cards')}>功法 {profile.seenCards.length}/{cardList.length}</button>
        <button class={tab === 'relics' ? 'active' : ''} onClick={() => setTab('relics')}>法宝 {profile.seenRelics.length}/{Object.keys(RELICS).length}</button>
        <button class={tab === 'enemies' ? 'active' : ''} onClick={() => setTab('enemies')}>妖怪</button>
      </div>
      <div class="codex-list">
        {tab === 'cards' && cardList.map((c) => {
          const seen = profile.seenCards.includes(c.id);
          const src = seen ? cardArtSource(c.id) : null;
          return (
            <div key={c.id} class={`codex-item ${seen ? '' : 'lockedx'}`}>
              <div>
                <div class="ci-name">{seen ? c.name : '？？？'}</div>
                <div class="ci-text">{seen ? c.text : '尚未参悟此功法'}</div>
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
        {tab === 'enemies' && Object.values(ENEMIES).filter((e) => e.id !== 'baiwuchang').map((e) => (
          <div key={e.id} class="codex-item">
            {enemyArt(e.id) && <img class="ci-portrait" src={enemyArt(e.id)!} alt={e.name} loading="lazy" />}
            <div>
              <div class="ci-name">{e.name}</div>
              <div class="ci-text">
                {e.tier === 'boss' ? '天劫' : e.tier === 'elite' ? '精英' : `第${['一', '二', '三'][e.act - 1]}幕`} · 气血 {e.hp}
                {enemyNotes[e.id] ? ` · ${enemyNotes[e.id]}` : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
      <button onClick={props.onBack}>返回</button>
    </div>
  );
}

// ---------- 转世（解锁树） ----------

export function ZhuanshiScreen(props: { profile: Profile; setProfile: (p: Profile) => void; onBack: () => void }) {
  const { profile } = props;
  return (
    <div class="screen-page fade-in">
      <h2>转 世</h2>
      <div class="sub">道行不灭，来世重修。当前道行：<b style={{ color: 'var(--liujin)' }}>{profile.daowei}</b></div>
      {Object.values(UNLOCKS).map((u) => {
        const owned = profile.unlocked.includes(u.id);
        return (
          <div key={u.id} class={`unlock-item ${owned ? 'owned' : ''}`}>
            <div>
              <div><b>{u.name}</b>{u.auto ? '（通关自动）' : ''}</div>
              <div style={{ fontSize: '12.5px', color: 'var(--dailan)' }}>{u.text}</div>
            </div>
            <span class="u-cost">{owned ? '已得' : `${u.cost} 道行`}</span>
            {!owned && !u.auto && (
              <button
                disabled={profile.daowei < u.cost}
                onClick={() => {
                  const p2 = buyUnlock(profile, u.id);
                  if (p2) { sfx.breakthrough(); props.setProfile(p2); }
                }}
              >
                解锁
              </button>
            )}
          </div>
        );
      })}
      {profile.unlocked.includes('daohaopu') && (
        <div class="unlock-item">
          <div>
            <div><b>道号谱</b></div>
            <div style={{ fontSize: '12.5px', color: 'var(--dailan)' }}>
              {profile.daohaoList.length > 0 ? profile.daohaoList.join('、') : '尚无道号，通关可得'}
            </div>
          </div>
        </div>
      )}
      <button onClick={props.onBack}>返回</button>
    </div>
  );
}

// ---------- 成就 ----------

export function AchievementScreen(props: { profile: Profile; onBack: () => void }) {
  return (
    <div class="screen-page fade-in">
      <h2>成 就</h2>
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
        <button style={{ minHeight: '32px', padding: '2px 10px' }} onClick={() => sfx.liushui('metal')}>试听</button>
      </div>
      <div class="settings-row">
        <span>音乐</span>
        <input
          type="range" min="0" max="1" step="0.1"
          value={profile.settings.music}
          onInput={(e) => update('music', Number((e.target as HTMLInputElement).value))}
        />
        <span style={{ fontSize: '12px', color: 'var(--dailan)' }}>（BGM 素材 P1 接入）</span>
      </div>
      <div class="sub" style={{ marginTop: '20px', lineHeight: 1.9 }}>
        《问长生》 v0.1 · 修仙题材单机肉鸽卡牌<br />
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
