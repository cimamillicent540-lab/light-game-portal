import { useEffect, useMemo, useState } from 'react';
import { GameCard } from './components/GameCard';
import { SiteHeader } from './components/SiteHeader';
import { games, getGameById } from './data/games';

const readInitialGame = () => {
  const hash = window.location.hash.replace('#', '');
  if (hash === 'games') {
    return 'games';
  }

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
    () => (activeView === 'home' || activeView === 'games' ? undefined : getGameById(activeView)),
    [activeView],
  );

  const navigate = (view: string) => {
    setActiveView(view);
    window.location.hash = view === 'home' ? '' : view;
  };

  const ActiveGameComponent = activeGame?.component;

  return (
    <div className="app-shell">
      <SiteHeader onHome={() => navigate('home')} onGames={() => navigate('games')} />

      <main>
        {activeGame && ActiveGameComponent ? (
          <section className="game-page" aria-label={activeGame.title}>
            <button className="ghost-button" type="button" onClick={() => navigate('home')}>
              返回首页
            </button>
            <ActiveGameComponent />
          </section>
        ) : activeView === 'games' ? (
          <section className="library-page">
            <div className="page-heading">
              <p className="eyebrow">游戏目录</p>
              <h1>全部小游戏</h1>
              <p>当前收录 {games.length} 个小游戏，后续可以按分类、难度、热度继续扩展。</p>
            </div>

            <div className="library-grid">
              {games.map((game) => (
                <GameCard key={game.id} game={game} onPlay={() => navigate(game.id)} />
              ))}
            </div>
          </section>
        ) : (
          <section className="home-page">
            <div className="hero-panel">
              <div>
                <p className="eyebrow">轻量小游戏门户</p>
                <h1>轻量游戏厅</h1>
                <p className="hero-copy">
                  选一个小游戏，马上开局。短局、明亮、持续更新。
                </p>
                <div className="hero-actions">
                  <button className="hero-button" type="button" onClick={() => navigate('games')}>
                    浏览全部游戏
                  </button>
                  <button className="hero-button secondary" type="button" onClick={() => navigate('2048')}>
                    试玩 2048
                  </button>
                </div>
              </div>
              <div className="hero-orbit" aria-hidden="true">
                <img src="/portal-symbol.svg" alt="" />
                <span className="orbit-dot dot-one" />
                <span className="orbit-dot dot-two" />
                <span className="orbit-dot dot-three" />
              </div>
            </div>

            <div className="section-heading">
              <h2>精选游戏</h2>
              <button className="text-button" type="button" onClick={() => navigate('games')}>
                查看全部
              </button>
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
