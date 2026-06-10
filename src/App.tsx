import { useEffect, useMemo, useState } from 'react';
import { GameCard } from './components/GameCard';
import { SiteHeader } from './components/SiteHeader';
import { games, getGameById } from './data/games';

const readInitialGame = () => {
  const hash = window.location.hash.replace('#', '');
  return getGameById(hash)?.id ?? 'home';
};

export function App() {
  const [activeView, setActiveView] = useState(readInitialGame);

  useEffect(() => {
    const handleHashChange = () => {
      setActiveView(readInitialGame());
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const activeGame = useMemo(
    () => (activeView === 'home' ? undefined : getGameById(activeView)),
    [activeView],
  );

  const navigate = (view: string) => {
    setActiveView(view);
    window.location.hash = view === 'home' ? '' : view;
  };

  const ActiveGameComponent = activeGame?.component;

  return (
    <div className="app-shell">
      <SiteHeader onHome={() => navigate('home')} />

      <main>
        {activeGame && ActiveGameComponent ? (
          <section className="game-page" aria-label={activeGame.title}>
            <button className="ghost-button" type="button" onClick={() => navigate('home')}>
              返回首页
            </button>
            <ActiveGameComponent />
          </section>
        ) : (
          <section className="home-page">
            <div className="hero-panel">
              <div>
                <p className="eyebrow">轻量小游戏门户</p>
                <h1>轻量游戏厅</h1>
                <p className="hero-copy">
                  选一个小游戏，马上开局。短局、明亮、适合碎片时间。
                </p>
              </div>
              <div className="hero-orbit" aria-hidden="true">
                <img src="/portal-symbol.svg" alt="" />
                <span className="orbit-dot dot-one" />
                <span className="orbit-dot dot-two" />
                <span className="orbit-dot dot-three" />
              </div>
            </div>

            <div className="section-heading">
              <h2>游戏列表</h2>
              <span>{games.length} 个游戏</span>
            </div>

            <div className="game-grid">
              {games.map((game) => (
                <GameCard key={game.id} game={game} onPlay={() => navigate(game.id)} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
