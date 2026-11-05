import { useEffect, useMemo, useRef, useState } from 'react';
import { haptic, shareText } from './bridge';
import { makeMenu, roundLabel, shuffle, type Menu } from './menus';
import {
  loadMenus,
  loadStats,
  recordChampion,
  recordMatch,
  saveMenus,
  saveStats,
  type Stats,
} from './store';

type Screen = 'home' | 'play' | 'result' | 'ranking' | 'edit';

interface Game {
  bracket: Menu[];
  index: number; // 현재 대결의 왼쪽 메뉴 위치 (짝수)
  winners: Menu[];
  size: number; // 처음 대진 크기
  champion?: Menu;
  runnerUp?: Menu;
}

const SIZES = [4, 8, 16, 32];

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [menus, setMenus] = useState<Menu[] | null>(null);
  const [stats, setStats] = useState<Stats>({});
  const [game, setGame] = useState<Game | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadMenus(), loadStats()]).then(([m, s]) => {
      setMenus(m);
      setStats(s);
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  if (!menus) return <div className="loading">짬밥 준비 중…</div>;

  const updateStats = (next: Stats) => {
    setStats(next);
    void saveStats(next);
  };

  const start = (size: number) => {
    haptic('tap');
    setGame({ bracket: shuffle(menus).slice(0, size), index: 0, winners: [], size });
    setScreen('play');
  };

  const pick = (winner: Menu, loser: Menu) => {
    if (!game) return;
    let next = recordMatch(stats, winner.id, loser.id);
    const winners = [...game.winners, winner];
    const roundDone = game.index + 2 >= game.bracket.length;

    if (roundDone && winners.length === 1) {
      next = recordChampion(next, winner.id);
      updateStats(next);
      haptic('confetti');
      setGame({ ...game, winners, champion: winner, runnerUp: loser });
      setScreen('result');
      return;
    }
    updateStats(next);
    setGame(
      roundDone
        ? { ...game, bracket: winners, index: 0, winners: [] }
        : { ...game, index: game.index + 2, winners },
    );
  };

  return (
    <div className="app">
      {screen === 'home' && (
        <Home
          menus={menus}
          stats={stats}
          onStart={start}
          onRanking={() => setScreen('ranking')}
          onEdit={() => setScreen('edit')}
        />
      )}
      {screen === 'play' && game && (
        <Play game={game} onPick={pick} onQuit={() => setScreen('home')} />
      )}
      {screen === 'result' && game?.champion && (
        <Result
          champion={game.champion}
          runnerUp={game.runnerUp}
          size={game.size}
          stats={stats}
          onShare={async () => {
            const msg = `🏆 오늘의 짬밥 월드컵 우승: ${game.champion!.emoji} ${game.champion!.name}!\n결승 상대는 ${game.runnerUp?.name ?? ''}. 너의 최애 짬밥은?`;
            const r = await shareText(msg);
            if (r === 'copied') setToast('결과를 복사했어요');
            if (r === 'failed') setToast('공유하지 못했어요');
          }}
          onRetry={() => start(game.size)}
          onHome={() => setScreen('home')}
          onRanking={() => setScreen('ranking')}
        />
      )}
      {screen === 'ranking' && (
        <Ranking
          menus={menus}
          stats={stats}
          onBack={() => setScreen('home')}
          onReset={() => {
            updateStats({});
            setToast('기록을 초기화했어요');
          }}
        />
      )}
      {screen === 'edit' && (
        <Edit
          menus={menus}
          onSave={(m) => {
            setMenus(m);
            void saveMenus(m);
            setToast('식단을 저장했어요');
            setScreen('home');
          }}
          onBack={() => setScreen('home')}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ───────────── 홈 ───────────── */

function Home(props: {
  menus: Menu[];
  stats: Stats;
  onStart: (size: number) => void;
  onRanking: () => void;
  onEdit: () => void;
}) {
  const { menus, stats } = props;
  const sizes = SIZES.filter((s) => s <= menus.length);
  const [size, setSize] = useState(sizes.includes(16) ? 16 : sizes[sizes.length - 1]);
  const king = useMemo(() => topMenu(menus, stats), [menus, stats]);

  return (
    <main className="page">
      <header className="hero">
        <div className="hero-emoji">🍚</div>
        <h1>오늘의 짬밥 월드컵</h1>
        <p>둘 중 더 먹고 싶은 메뉴를 골라 주세요.<br />최후의 1개가 오늘의 최애 짬밥이에요.</p>
      </header>

      {king && (
        <button className="card king" onClick={props.onRanking}>
          <span className="king-label">현재 1위</span>
          <span className="king-name">
            {king.emoji} {king.name}
          </span>
          <span className="king-sub">우승 {stats[king.id]?.wins ?? 0}회 ›</span>
        </button>
      )}

      <section className="card">
        <h2>대진 크기</h2>
        <div className="seg">
          {sizes.map((s) => (
            <button
              key={s}
              className={s === size ? 'seg-item on' : 'seg-item'}
              onClick={() => setSize(s)}
            >
              {roundLabel(s)}
            </button>
          ))}
        </div>
        <p className="hint">이번 주 식단 {menus.length}개 중 {size}개를 무작위로 뽑아요.</p>
      </section>

      <section className="card list-card">
        <div className="row-between">
          <h2>이번 주 식단</h2>
          <button className="text-btn" onClick={props.onEdit}>
            편집
          </button>
        </div>
        <div className="chips">
          {menus.map((m) => (
            <span key={m.id} className="chip">
              {m.emoji} {m.name}
            </span>
          ))}
        </div>
      </section>

      <div className="bottom">
        <button className="btn secondary" onClick={props.onRanking}>
          🏅 랭킹
        </button>
        <button
          className="btn primary"
          onClick={() => {
            props.onStart(size);
          }}
        >
          {roundLabel(size)} 시작하기
        </button>
      </div>
    </main>
  );
}

/* ───────────── 대결 ───────────── */

function Play(props: { game: Game; onPick: (w: Menu, l: Menu) => void; onQuit: () => void }) {
  const { bracket, index } = props.game;
  const left = bracket[index];
  const right = bracket[index + 1];
  const [chosen, setChosen] = useState<'L' | 'R' | null>(null);
  const lock = useRef(false);

  useEffect(() => {
    setChosen(null);
    lock.current = false;
  }, [bracket, index]);

  const choose = (side: 'L' | 'R') => {
    if (lock.current) return;
    lock.current = true;
    haptic('tap');
    setChosen(side);
    setTimeout(() => {
      side === 'L' ? props.onPick(left, right) : props.onPick(right, left);
    }, 420);
  };

  const total = bracket.length / 2;
  const current = index / 2 + 1;

  return (
    <main className="page play">
      <div className="play-top">
        <button className="text-btn" onClick={props.onQuit}>
          그만하기
        </button>
        <span className="round">
          {roundLabel(bracket.length)}
          {bracket.length > 2 && (
            <em>
              {' '}
              {current}/{total}
            </em>
          )}
        </span>
        <span style={{ width: 56 }} />
      </div>
      <div className="progress">
        <div style={{ width: `${((current - 1) / total) * 100}%` }} />
      </div>

      <p className="question">더 먹고 싶은 메뉴는?</p>

      <div className="versus">
        <MenuCard menu={left} state={chosen === null ? '' : chosen === 'L' ? 'win' : 'lose'} onClick={() => choose('L')} />
        <div className="vs">VS</div>
        <MenuCard menu={right} state={chosen === null ? '' : chosen === 'R' ? 'win' : 'lose'} onClick={() => choose('R')} />
      </div>
    </main>
  );
}

function MenuCard(props: { menu: Menu; state: '' | 'win' | 'lose'; onClick: () => void }) {
  return (
    <button className={`menu-card ${props.state}`} onClick={props.onClick}>
      <span className="menu-emoji">{props.menu.emoji}</span>
      <span className="menu-name">{props.menu.name}</span>
    </button>
  );
}

/* ───────────── 결과 ───────────── */

function Result(props: {
  champion: Menu;
  runnerUp?: Menu;
  size: number;
  stats: Stats;
  onShare: () => void;
  onRetry: () => void;
  onHome: () => void;
  onRanking: () => void;
}) {
  const { champion, runnerUp, stats } = props;
  const wins = stats[champion.id]?.wins ?? 1;
  return (
    <main className="page result">
      <div className="confetti" aria-hidden>
        {Array.from({ length: 18 }).map((_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 6) * 0.15}s` }} />
        ))}
      </div>
      <p className="result-label">🏆 오늘의 최애 짬밥</p>
      <div className="trophy-emoji">{champion.emoji}</div>
      <h1 className="champion">{champion.name}</h1>
      <p className="result-sub">
        {runnerUp && <>결승에서 {runnerUp.name}을(를) 이겼어요<br /></>}
        지금까지 총 <b>{wins}번</b> 우승했어요
      </p>

      <div className="result-actions">
        <button className="btn primary" onClick={props.onShare}>
          전우에게 공유하기
        </button>
        <button className="btn secondary" onClick={props.onRanking}>
          전체 랭킹 보기
        </button>
        <div className="row-between">
          <button className="text-btn" onClick={props.onHome}>
            처음으로
          </button>
          <button className="text-btn" onClick={props.onRetry}>
            한 판 더 ›
          </button>
        </div>
      </div>
    </main>
  );
}

/* ───────────── 랭킹 ───────────── */

function topMenu(menus: Menu[], stats: Stats) {
  const ranked = rank(menus, stats);
  return ranked[0] && (stats[ranked[0].id]?.wins ?? 0) > 0 ? ranked[0] : null;
}

function rank(menus: Menu[], stats: Stats) {
  const rate = (id: string) => {
    const s = stats[id];
    return s && s.matches ? s.picks / s.matches : 0;
  };
  return [...menus].sort(
    (a, b) =>
      (stats[b.id]?.wins ?? 0) - (stats[a.id]?.wins ?? 0) || rate(b.id) - rate(a.id),
  );
}

function Ranking(props: { menus: Menu[]; stats: Stats; onBack: () => void; onReset: () => void }) {
  const { menus, stats } = props;
  const ranked = rank(menus, stats).filter((m) => (stats[m.id]?.matches ?? 0) > 0);
  const played = Object.values(stats).some((s) => s.matches > 0);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  return (
    <main className="page">
      <div className="row-between top-bar">
        <button className="text-btn" onClick={props.onBack}>
          ‹ 뒤로
        </button>
        <h2>짬밥 명예의 전당</h2>
        <button
          className="text-btn danger"
          disabled={!played}
          onClick={() => {
            if (confirming) {
              setConfirming(false);
              props.onReset();
            } else {
              setConfirming(true);
            }
          }}
        >
          {confirming ? '한 번 더 누르면 삭제' : '초기화'}
        </button>
      </div>

      {!played ? (
        <div className="empty">
          <div>🥄</div>
          <p>아직 기록이 없어요.<br />월드컵을 한 판 해보세요!</p>
        </div>
      ) : (
        <ol className="rank-list">
          {ranked.map((m, i) => {
            const s = stats[m.id] ?? { wins: 0, picks: 0, matches: 0 };
            const pct = s.matches ? Math.round((s.picks / s.matches) * 100) : 0;
            return (
              <li key={m.id} className="rank-item">
                <span className={`rank-no r${i + 1}`}>{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
                <span className="rank-emoji">{m.emoji}</span>
                <div className="rank-body">
                  <div className="rank-name">{m.name}</div>
                  <div className="bar">
                    <div style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="rank-meta">
                  <b>{s.wins}회 우승</b>
                  <span>승률 {pct}%</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}

/* ───────────── 식단 편집 ───────────── */

function Edit(props: { menus: Menu[]; onSave: (m: Menu[]) => void; onBack: () => void }) {
  const [list, setList] = useState(props.menus);
  const [name, setName] = useState('');

  const add = () => {
    const n = name.trim();
    if (!n || n.length > 12 || list.some((m) => m.name === n)) return;
    setList([...list, makeMenu(n)]);
    setName('');
  };

  return (
    <main className="page">
      <div className="row-between top-bar">
        <button className="text-btn" onClick={props.onBack}>
          ‹ 취소
        </button>
        <h2>이번 주 식단 편집</h2>
        <span style={{ width: 40 }} />
      </div>

      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={name}
          maxLength={12}
          placeholder="메뉴 이름 (예: 마파두부)"
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn primary small" type="submit" disabled={!name.trim()}>
          추가
        </button>
      </form>

      <ul className="edit-list">
        {list.map((m) => (
          <li key={m.id}>
            <span>
              {m.emoji} {m.name}
            </span>
            <button
              className="text-btn danger"
              disabled={list.length <= 4}
              onClick={() => setList(list.filter((x) => x.id !== m.id))}
            >
              삭제
            </button>
          </li>
        ))}
      </ul>
      <p className="hint center">메뉴는 4개 이상 있어야 해요.</p>

      <div className="bottom">
        <button className="btn primary" onClick={() => props.onSave(list)}>
          저장하기
        </button>
      </div>
    </main>
  );
}
