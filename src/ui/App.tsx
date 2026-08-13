/** 顶层应用（v3）：状态机 + 存档 + 宿慧流转 + 音效/特效/埋点钩子 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Action, Profile, RunState } from '../core/types';
import { newRun, reduce } from '../core/run';
import { generateRunSeed } from '../core/rng';
import {
  loadProfile, saveProfile, loadRun, saveRunThrottled, saveRunNow, clearRun,
} from '../save/storage';
import { settleRun, pickLegacy, consumeLegacy, type LegacyPick } from '../save/profileLogic';
import { computeUnlocked } from '../data/milestones';
import { dailySeed, dailyMutation } from '../data/daily';
import { getRecipe } from '../data/alchemy';
import { sfx, setSfxVolume } from '../audio/sfx';
import { setBgmScene, setBgmVolume, unlockBgm, type BgmScene } from '../audio/bgm';
import { initFx, stopFx, thunderFlash, goldRipple, setAmbientClouds } from '../fx/ink';
import { track } from '../save/analytics';
import {
  HomeScreen, CodexScreen, LunhuiScreen, SettingsScreen, AchievementScreen, type MetaPage,
} from './Meta';
import { IntroScroll, ActTitle } from './Narrative';
import { MapScreen } from './MapScreen';
import { BattleScreen } from './Battle';
import {
  RewardView, ShopView, EventView, CaveView, CardPickView, DaoguoView, EndView,
} from './Adventure';
import { TopBar, DeckModal, ElixirBar } from './components';

type Page = 'home' | 'run' | MetaPage;

/** 克伐五动词（§4.4）：战斗日志包含任一即触发克伐音效 */
const KEFA_WORDS = ['剪伐', '破土', '滞涩', '浇熄', '熔锻'];

export function App() {
  const [profile, setProfileState] = useState<Profile>(() => loadProfile());
  const [run, setRun] = useState<RunState | null>(() => loadRun());
  const [page, setPage] = useState<Page>('home');
  const [showDeck, setShowDeck] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [actTitle, setActTitle] = useState<1 | 2 | 3 | null>(null);
  const actShownRef = useRef<string | null>(null);
  const settledRef = useRef(false);
  const fxRef = useRef<HTMLCanvasElement>(null);

  // 幕标题页（§3.3）：每幕出发前展示一次
  useEffect(() => {
    if (page !== 'run' || !run || run.battle || showIntro) return;
    if (run.screen.kind !== 'map' || run.floor >= 0) return;
    const key = `${run.seed}:${run.act}`;
    if (actShownRef.current !== key) setActTitle(run.act);
  }, [page, run, showIntro]);

  useEffect(() => {
    setSfxVolume(profile.settings.sfx);
  }, [profile.settings.sfx]);

  useEffect(() => {
    setBgmVolume(profile.settings.music);
  }, [profile.settings.music]);

  useEffect(() => {
    if (fxRef.current) initFx(fxRef.current);
    // 浏览器自动播放策略：首次交互解锁 BGM
    const unlock = () => unlockBgm();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      stopFx();
      window.removeEventListener('pointerdown', unlock);
    };
  }, []);

  // 场景音乐（§15.1）：主界面空灵 / 地图清雅 / 战斗渐紧 / Boss 鼓点 / 劫战威压
  useEffect(() => {
    let s: BgmScene = 'menu';
    if (page === 'run' && run) {
      if (run.battle) {
        s = run.battle.waveIndex >= 0 ? 'jie' : run.battle.battleType === 'boss' ? 'boss' : 'battle';
      } else if (run.screen.kind === 'end') {
        s = 'menu';
      } else {
        s = 'map';
      }
    }
    setBgmScene(s);
    setAmbientClouds(s === 'menu' || s === 'map'); // 祥云粒子层（§14.1）
  }, [page, run]);

  function setProfile(p: Profile) {
    setProfileState(p);
    saveProfile(p);
  }

  // v3：解锁集由道行里程碑自动推导（data/milestones.ts）；
  // 每日天机局（run.flags 带 daily* 前缀）按 §11.3 统一配置返回全解锁。
  const isDailyRun = !!run && Object.keys(run.flags).some((k) => k.startsWith('daily'));
  const unlocked = useMemo(
    () => computeUnlocked(profile, isDailyRun),
    [profile, isDailyRun],
  );

  function dispatch(action: Action) {
    if (!run) return;
    const prev = run;
    const next = reduce(prev, action, unlocked);
    if (next === prev) return;

    // ---- 音效 / 特效 / 埋点 / 震动钩子（对比前后状态；事件名对齐 §16.8） ----
    const vibrate = (pattern: number | number[]) => {
      try { navigator.vibrate?.(pattern); } catch { /* 不支持则忽略 */ }
    };
    try {
      const pb = prev.battle, nb = next.battle;
      const newLog = pb && nb ? nb.log.slice(pb.log.length) : [];
      if (action.t === 'PLAY_CARD') {
        sfx.playCard();
        vibrate(10);
        const played = pb?.hand.find((c) => c.uid === action.uid);
        if (played) {
          track('card_played', {
            card: played.cardId,
            sheng: !!(pb && nb && nb.deqiCountTurn > pb.deqiCountTurn),
            kefa: newLog.some((l) => KEFA_WORDS.some((w) => l.includes(w))),
          });
        }
      }
      if (action.t === 'CHOOSE_NODE' || action.t === 'FLY_NODE') {
        if (action.t === 'FLY_NODE') sfx.fly(); // 御空（§9.2）
        track('node_enter', {
          node: action.node, floor: next.floor, act: next.act,
          lifespanLeft: next.lifespan, fly: action.t === 'FLY_NODE',
        });
      }
      if (action.t === 'PICK_REWARD_CARD' && prev.screen.kind === 'reward' && prev.screen.cards) {
        track('card_pick', {
          offered: prev.screen.cards.map((c) => c.cardId).join(','),
          picked: action.index >= 0 ? prev.screen.cards[action.index]?.cardId ?? 'skip' : 'skip',
        });
      }
      if (pb && !nb && !next.over) {
        track('battle_end', {
          enemy: pb.enemies[0]?.enemyId ?? '',
          turns: pb.turnsTotal, hp: next.hp, type: pb.battleType,
        });
      }
      // 炼丹与服丹（§7）
      if (action.t === 'CAVE_ACTION' && action.kind === 'brew') {
        sfx.brew();
        track('alchemy', { recipe: action.recipeId ?? '', toxinAfter: next.toxin, mode: 'brew' });
      }
      if (action.t === 'USE_ELIXIR') {
        sfx.elixir();
        track('alchemy', { recipe: action.elixir, toxinAfter: next.toxin, mode: 'use' });
      }
      if (action.t === 'END_TURN') sfx.turnStart();
      if (pb && nb) {
        // 得气（§4.3）：五音随当前行位
        if (nb.deqiCountTurn > pb.deqiCountTurn && nb.stance) {
          sfx.deqi(nb.stance);
          vibrate(16);
          goldRipple(window.innerWidth / 2, window.innerHeight * 0.55);
        }
        if (nb.zhoutianTotal > pb.zhoutianTotal) { sfx.zhoutian(); vibrate([20, 40, 20]); }
        const prevHp = pb.enemies.reduce((s, e) => s + Math.max(0, e.hp), 0);
        const nextHp = nb.enemies.reduce((s, e) => s + Math.max(0, e.hp), 0);
        if (nextHp < prevHp && action.t === 'PLAY_CARD') sfx.hit(); // 墨溅由战斗反馈层按命中点绘制
        // 克伐五动词（§4.4）
        if (newLog.some((l) => KEFA_WORDS.some((w) => l.includes(w)))) sfx.kefa();
        const prevAlive = pb.enemies.filter((e) => e.hp > 0).length;
        const nextAlive = nb.enemies.filter((e) => e.hp > 0).length;
        if (nextAlive < prevAlive) sfx.enemyDie();
        if (next.hp < prev.hp && action.t === 'END_TURN') sfx.hit();
        // 劫雷特效：九重天劫波次推进或筑基劫雷
        if (nb.waveIndex > pb.waveIndex) { sfx.thunder(); thunderFlash(); }
        if (action.t === 'END_TURN' && pb.enemies.some((e) => e.intent?.special === 'jielei')) {
          sfx.thunder(); thunderFlash();
        }
      }
      // 心魔变化（战斗内外皆可发生：事件/心斋/勾魂/纳劫宝……）
      if (next.demon !== prev.demon) {
        if (next.demon > prev.demon) { sfx.demonUp(); vibrate([30, 30, 30]); } // 心魔珠震动
        else sfx.demonDown();
        track('demon_change', { delta: next.demon - prev.demon, source: action.t });
      }
      // 寿元流逝（§9.1 漏刻）
      if (next.lifespan < prev.lifespan) sfx.lifespan();
      if (pb && !nb) {
        if (next.screen.kind === 'reward' || next.screen.kind === 'daoguo') sfx.victory();
        if (next.screen.kind === 'daoguo') sfx.breakthrough(); // 境界突破 → 道果三选一
        if (next.screen.kind === 'end' && !next.screen.victory) sfx.defeat();
        if (next.screen.kind === 'end' && next.screen.victory) sfx.victory();
      }
      // 坐化（寿元耗尽，§9.1）：油尽灯枯专属音
      if (next.screen.kind === 'end' && !next.screen.victory && next.screen.cause.includes('坐化')) {
        sfx.zuohua();
      }
      if (action.t === 'TAKE_REWARD_GOLD' || action.t === 'BUY_ITEM') sfx.gold();
    } catch { /* 音效失败不影响游戏 */ }

    setRun(next);
    saveRunThrottled(next);

    // 局结束：结算入 profile（只结算一次）
    if (next.over && !settledRef.current) {
      settledRef.current = true;
      const victory = next.screen.kind === 'end' && next.screen.victory;
      track('run_end', {
        result: victory ? 'win' : 'lose',
        cause: next.screen.kind === 'end' ? next.screen.cause : '',
        floor: next.floor,
        act: next.act,
        score: next.screen.kind === 'end' ? next.screen.score : 0,
        deckSize: next.deck.length,
        lifespanLeft: next.lifespan,
        demonFinal: next.demon,
      });
      const before = computeUnlocked(profile);
      const p2 = settleRun(profile, next, victory);
      for (const id of computeUnlocked(p2)) {
        if (!before.includes(id)) track('meta_milestone', { id });
      }
      setProfile(p2);
      clearRun();
    }
  }

  function startRun(ascension: number, character: string, daily = false) {
    settledRef.current = false;
    // 每日天机（§11.3 公平性强制）：统一种子、固定三重天、剑修出战、无宿慧
    const asc = daily ? 3 : ascension;
    const chr = daily ? 'jianxiu' : character;
    const seed = daily ? dailySeed() : generateRunSeed();
    const dailyFlag = daily ? dailyMutation().flag : undefined;
    const startProfile = daily ? consumeLegacy(profile) : profile; // daily 不带本命牌/残魂器/业力
    const r = newRun(startProfile, seed, asc, chr, dailyFlag);
    setRun(r);
    saveRunNow(r);
    setPage('run');
    setShowIntro(true); // 开局卷轴叙事（§3.3）
    // 宿慧用完即清（§11.1）：newRun 已读取 profile.legacy，随即清空入档
    if (!daily) setProfile(consumeLegacy(profile));
    track('run_start', {
      seed, tier: asc, karma: daily ? 0 : profile.legacy.karma, character: chr, daily,
    });
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
  } else if (page === 'lunhui') {
    content = <LunhuiScreen profile={profile} onBack={backHome} />;
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
              <ElixirBar
                run={run}
                onUse={(id: string) => {
                  // 地图上仅 ⊙ 丹可服（§7.3 mapUsable）
                  if (getRecipe(id).mapUsable) dispatch({ t: 'USE_ELIXIR', elixir: id });
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
          <CaveView run={run} dispatch={dispatch} />
        ) : s.kind === 'cardPick' ? (
          <CardPickView run={run} dispatch={dispatch} />
        ) : s.kind === 'daoguo' ? (
          <DaoguoView run={run} dispatch={dispatch} />
        ) : s.kind === 'end' ? (
          <EndView
            run={run}
            profile={profile}
            onLegacy={(pick: LegacyPick) => {
              // 宿慧三选一（§11.1）：写入 profile.legacy，下一世 newRun 读取
              const p2 = pickLegacy(profile, run, pick);
              track('legacy_pick', { kind: pick.kind, karma: p2.legacy.karma });
              setProfile(p2);
            }}
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
      {showIntro && page === 'run' && <IntroScroll onDone={() => setShowIntro(false)} />}
      {!showIntro && actTitle !== null && run && (
        <ActTitle
          act={actTitle}
          onDone={() => {
            actShownRef.current = `${run.seed}:${run.act}`;
            setActTitle(null);
          }}
        />
      )}
      <canvas ref={fxRef} class="fx-canvas" />
    </div>
  );
}
