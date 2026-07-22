/** 顶层应用：状态机 + 存档 + 音效/特效钩子 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Action, Profile, RunState } from '../core/types';
import { newRun, reduce } from '../core/run';
import { generateRunSeed } from '../core/rng';
import {
  loadProfile, saveProfile, loadRun, saveRunThrottled, saveRunNow, clearRun,
} from '../save/storage';
import { settleRun } from '../save/profileLogic';
import { dailySeed, dailyMutation } from '../data/daily';
import { sfx, setSfxVolume } from '../audio/sfx';
import { initFx, stopFx, thunderFlash, inkSplash, goldRipple } from '../fx/ink';
import { HomeScreen, CodexScreen, ZhuanshiScreen, SettingsScreen, AchievementScreen } from './Meta';
import { MapScreen } from './MapScreen';
import { BattleScreen } from './Battle';
import {
  RewardView, ShopView, EventView, CaveView, CardPickView, BreakthroughView, EndView,
} from './Adventure';
import { TopBar, DeckModal, PotionBar } from './components';
import { getPotion } from '../data/potions';

type Page = 'home' | 'run' | 'codex' | 'zhuanshi' | 'settings' | 'achievements';

export function App() {
  const [profile, setProfileState] = useState<Profile>(() => loadProfile());
  const [run, setRun] = useState<RunState | null>(() => loadRun());
  const [page, setPage] = useState<Page>('home');
  const [showDeck, setShowDeck] = useState(false);
  const settledRef = useRef(false);
  const fxRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setSfxVolume(profile.settings.sfx);
  }, [profile.settings.sfx]);

  useEffect(() => {
    if (fxRef.current) initFx(fxRef.current);
    return () => stopFx();
  }, []);

  function setProfile(p: Profile) {
    setProfileState(p);
    saveProfile(p);
  }

  const unlocked = profile.unlocked;

  function dispatch(action: Action) {
    if (!run) return;
    const prev = run;
    const next = reduce(prev, action, unlocked);
    if (next === prev) return;

    // ---- 音效 / 特效钩子（对比前后状态） ----
    try {
      const pb = prev.battle, nb = next.battle;
      if (action.t === 'PLAY_CARD') sfx.playCard();
      if (action.t === 'USE_POTION') sfx.potion();
      if (action.t === 'END_TURN') sfx.turnStart();
      if (pb && nb) {
        if (nb.liushuiCount > pb.liushuiCount && nb.xingwei) {
          sfx.liushui(nb.xingwei);
          goldRipple(window.innerWidth / 2, window.innerHeight * 0.55);
        }
        if (nb.zhoutianTotal > pb.zhoutianTotal) sfx.zhoutian();
        const prevHp = pb.enemies.reduce((s, e) => s + Math.max(0, e.hp), 0);
        const nextHp = nb.enemies.reduce((s, e) => s + Math.max(0, e.hp), 0);
        if (nextHp < prevHp && action.t === 'PLAY_CARD') {
          sfx.hit();
          inkSplash(window.innerWidth / 2, window.innerHeight * 0.22);
        }
        const prevAlive = pb.enemies.filter((e) => e.hp > 0).length;
        const nextAlive = nb.enemies.filter((e) => e.hp > 0).length;
        if (nextAlive < prevAlive) sfx.enemyDie();
        if (next.hp < prev.hp && action.t === 'END_TURN') sfx.hit();
        // 劫雷特效：九重天劫波次推进或雷灵傀儡劫雷
        if (nb.waveIndex > pb.waveIndex) { sfx.thunder(); thunderFlash(); }
        if (action.t === 'END_TURN' && pb.enemies.some((e) => e.intent?.special === 'jielei')) {
          sfx.thunder(); thunderFlash();
        }
      }
      if (pb && !nb) {
        if (next.screen.kind === 'reward' || next.screen.kind === 'breakthrough') sfx.victory();
        if (next.screen.kind === 'breakthrough') sfx.breakthrough();
        if (next.screen.kind === 'end' && !(next.screen as { victory?: boolean }).victory) sfx.defeat();
        if (next.screen.kind === 'end' && (next.screen as { victory?: boolean }).victory) sfx.victory();
      }
      if (action.t === 'TAKE_REWARD_GOLD' || action.t === 'BUY_ITEM') sfx.gold();
    } catch { /* 音效失败不影响游戏 */ }

    setRun(next);
    saveRunThrottled(next);

    // 局结束：结算入 profile（只结算一次）
    if (next.over && !settledRef.current) {
      settledRef.current = true;
      const victory = next.screen.kind === 'end' && next.screen.victory;
      const p2 = settleRun(profile, next, victory);
      setProfile(p2);
      clearRun();
    }
  }

  function startRun(ascension: number, character: string, daily = false) {
    settledRef.current = false;
    const seed = daily ? dailySeed() : generateRunSeed();
    const dailyFlag = daily ? dailyMutation().flag : undefined;
    const r = newRun(profile, seed, ascension, character, dailyFlag);
    setRun(r);
    saveRunNow(r);
    setPage('run');
    sfx.breakthrough();
  }

  function backHome() {
    setPage('home');
  }

  const hasSave = useMemo(() => run !== null && !run.over, [run]);

  // ---------- 渲染 ----------

  let content;
  if (page === 'home') {
    content = (
      <HomeScreen
        profile={profile}
        hasSave={hasSave}
        onStart={startRun}
        onContinue={() => setPage('run')}
        onNav={(p) => setPage(p)}
      />
    );
  } else if (page === 'codex') {
    content = <CodexScreen profile={profile} onBack={backHome} />;
  } else if (page === 'zhuanshi') {
    content = <ZhuanshiScreen profile={profile} setProfile={setProfile} onBack={backHome} />;
  } else if (page === 'settings') {
    content = <SettingsScreen profile={profile} setProfile={setProfile} onBack={backHome} />;
  } else if (page === 'achievements') {
    content = <AchievementScreen profile={profile} onBack={backHome} />;
  } else if (page === 'run' && run) {
    const s = run.screen;
    const inBattle = run.battle !== null;
    content = (
      <>
        {!inBattle && s.kind !== 'end' && <TopBar run={run} onDeck={() => setShowDeck(true)} />}
        {inBattle && <TopBar run={run} onDeck={() => setShowDeck(true)} />}
        {inBattle ? (
          <BattleScreen run={run} dispatch={dispatch} />
        ) : s.kind === 'map' ? (
          <>
            <MapScreen run={run} dispatch={dispatch} />
            <div style={{ padding: '6px 12px', display: 'flex', justifyContent: 'center' }}>
              <PotionBar
                run={run}
                onUse={(id) => {
                  if (getPotion(id).mapUsable) dispatch({ t: 'USE_POTION', potion: id });
                }}
              />
            </div>
          </>
        ) : s.kind === 'reward' ? (
          <RewardView run={run} dispatch={dispatch} />
        ) : s.kind === 'shop' ? (
          <ShopView run={run} dispatch={dispatch} />
        ) : s.kind === 'event' ? (
          <EventView run={run} dispatch={dispatch} />
        ) : s.kind === 'cave' ? (
          <CaveView run={run} dispatch={dispatch} unlocked={unlocked} />
        ) : s.kind === 'cardPick' ? (
          <CardPickView run={run} dispatch={dispatch} />
        ) : s.kind === 'breakthrough' ? (
          <BreakthroughView run={run} dispatch={dispatch} />
        ) : s.kind === 'end' ? (
          <EndView
            run={run}
            profile={profile}
            onRestart={() => startRun(run.ascension, 'jianxiu')}
            onHome={() => { setRun(null); clearRun(); backHome(); }}
          />
        ) : null}
        {showDeck && <DeckModal title={`牌组（${run.deck.length}）`} cards={run.deck} onClose={() => setShowDeck(false)} />}
      </>
    );
  } else {
    content = <HomeScreen profile={profile} hasSave={false} onStart={startRun} onContinue={backHome} onNav={(p) => setPage(p)} />;
  }

  return (
    <div class="frame">
      {content}
      <canvas ref={fxRef} class="fx-canvas" />
    </div>
  );
}
