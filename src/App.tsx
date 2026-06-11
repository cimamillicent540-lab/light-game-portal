import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import { GameCard } from './components/GameCard';
import { SiteHeader } from './components/SiteHeader';
import { games, getGameById } from './data/games';
import { LoginPage } from './pages/LoginPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { RegisterPage } from './pages/RegisterPage';
import { WorldCupHistoryPage } from './pages/world-cup/WorldCupHistoryPage';
import { WorldCupHomePage } from './pages/world-cup/WorldCupHomePage';
import { WorldCupLeaderboardPage } from './pages/world-cup/WorldCupLeaderboardPage';
import { WorldCupMatchesPage } from './pages/world-cup/WorldCupMatchesPage';
import { WorldCupPredictionsPage } from './pages/world-cup/WorldCupPredictionsPage';
import { WorldCupRulesPage } from './pages/world-cup/WorldCupRulesPage';
import { WorldCupShopPage } from './pages/world-cup/WorldCupShopPage';

type Route =
  | { name: 'home' }
  | { name: 'games' }
  | { name: 'game'; gameId: string }
  | { name: 'leaderboard'; gameId?: string }
  | { name: 'login' }
  | { name: 'register' }
  | { name: 'profile' }
  | { name: 'worldCup' }
  | { name: 'worldCupPredictions'; marketSlug?: string }
  | { name: 'worldCupLeaderboard' }
  | { name: 'worldCupHistory' }
  | { name: 'worldCupMatches' }
  | { name: 'worldCupRules' }
  | { name: 'worldCupShop' };

const routeToPath = (route: Route) => {
  if (route.name === 'home') {
    return '/';
  }

  if (route.name === 'game') {
    return `/games/${route.gameId}`;
  }

  if (route.name === 'leaderboard') {
    return route.gameId ? `/leaderboard?game=${route.gameId}` : '/leaderboard';
  }

  if (route.name === 'worldCup') {
    return '/world-cup';
  }

  if (route.name === 'worldCupPredictions') {
    return route.marketSlug ? `/world-cup/predictions?market=${route.marketSlug}` : '/world-cup/predictions';
  }

  if (route.name === 'worldCupLeaderboard') {
    return '/world-cup/leaderboard';
  }

  if (route.name === 'worldCupHistory') {
    return '/world-cup/history';
  }

  if (route.name === 'worldCupMatches') {
    return '/world-cup/matches';
  }

  if (route.name === 'worldCupRules') {
    return '/world-cup/rules';
  }

  if (route.name === 'worldCupShop') {
    return '/world-cup/shop';
  }

  return `/${route.name}`;
};

const parseRoute = (): Route => {
  const hash = window.location.hash.replace('#', '');
  if (hash === 'games') {
    return { name: 'games' };
  }

  const hashGame = getGameById(hash);
  if (hashGame) {
    return { name: 'game', gameId: hashGame.id };
  }

  const path = window.location.pathname.replace(/\/+$/, '') || '/';

  if (path === '/') {
    return { name: 'home' };
  }

  if (path === '/games') {
    return { name: 'games' };
  }

  if (path === '/leaderboard') {
    const gameId = new URLSearchParams(window.location.search).get('game') ?? undefined;
    return gameId && getGameById(gameId) ? { name: 'leaderboard', gameId } : { name: 'leaderboard' };
  }

  if (path === '/login') {
    return { name: 'login' };
  }

  if (path === '/register') {
    return { name: 'register' };
  }

  if (path === '/profile') {
    return { name: 'profile' };
  }

  if (path === '/world-cup') {
    return { name: 'worldCup' };
  }

  if (path === '/world-cup/predictions') {
    const marketSlug = new URLSearchParams(window.location.search).get('market') ?? undefined;
    return { name: 'worldCupPredictions', marketSlug };
  }

  if (path === '/world-cup/leaderboard') {
    return { name: 'worldCupLeaderboard' };
  }

  if (path === '/world-cup/history') {
    return { name: 'worldCupHistory' };
  }

  if (path === '/world-cup/matches') {
    return { name: 'worldCupMatches' };
  }

  if (path === '/world-cup/rules') {
    return { name: 'worldCupRules' };
  }

  if (path === '/world-cup/shop') {
    return { name: 'worldCupShop' };
  }

  const gameMatch = path.match(/^\/games\/([^/]+)$/);
  if (gameMatch && getGameById(gameMatch[1])) {
    return { name: 'game', gameId: gameMatch[1] };
  }

  return { name: 'home' };
};

export function App() {
  const {
    user,
    session,
    profile,
    wallet,
    referralStats,
    isLoading,
    isAccountLoading,
    accountError,
    refreshAccountData,
    signOut,
  } = useAuth();
  const [route, setRoute] = useState<Route>(parseRoute);

  useEffect(() => {
    const handleLocationChange = () => {
      setRoute(parseRoute());
    };

    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  const navigate = (nextRoute: Route, options?: { replace?: boolean }) => {
    const path = routeToPath(nextRoute);
    setRoute(nextRoute);

    const currentPath = `${window.location.pathname}${window.location.search}`;
    if (currentPath === path && !window.location.hash) {
      return;
    }

    const method = options?.replace ? 'replaceState' : 'pushState';
    window.history[method](null, '', path);
  };

  useEffect(() => {
    if (!isLoading && route.name === 'profile' && !user) {
      navigate({ name: 'login' }, { replace: true });
    }

    if (!isLoading && route.name === 'worldCupHistory' && !user) {
      navigate({ name: 'login' }, { replace: true });
    }
  }, [isLoading, route.name, user]);

  const activeGame = useMemo(
    () => (route.name === 'game' ? getGameById(route.gameId) : undefined),
    [route],
  );

  const ActiveGameComponent = activeGame?.component;

  const handleLogout = async () => {
    await signOut();
    navigate({ name: 'home' });
  };

  return (
    <div className="app-shell">
      <SiteHeader
        userEmail={user?.email}
        onHome={() => navigate({ name: 'home' })}
        onGames={() => navigate({ name: 'games' })}
        onLeaderboard={() => navigate({ name: 'leaderboard' })}
        onLogin={() => navigate({ name: 'login' })}
        onLogout={handleLogout}
        onProfile={() => navigate({ name: 'profile' })}
        onRegister={() => navigate({ name: 'register' })}
        onWorldCup={() => navigate({ name: 'worldCup' })}
      />

      <main>
        {activeGame && ActiveGameComponent ? (
          <section className="game-page" aria-label={activeGame.title}>
            <button className="ghost-button" type="button" onClick={() => navigate({ name: 'games' })}>
              返回游戏列表
            </button>
            <ActiveGameComponent
              onLogin={() => navigate({ name: 'login' })}
              onLeaderboard={(gameId) => navigate({ name: 'leaderboard', gameId: gameId ?? activeGame.id })}
            />
          </section>
        ) : route.name === 'login' ? (
          <LoginPage
            onRegister={() => navigate({ name: 'register' })}
            onSuccess={() => navigate({ name: 'profile' })}
          />
        ) : route.name === 'register' ? (
          <RegisterPage onLogin={() => navigate({ name: 'login' })} />
        ) : route.name === 'profile' ? (
          isLoading ? (
            <section className="auth-page">
              <div className="auth-card">
                <p className="eyebrow">Loading</p>
                <h1>正在加载用户状态</h1>
              </div>
            </section>
          ) : user ? (
            <ProfilePage
              user={user}
              accessToken={session?.access_token ?? null}
              profile={profile}
              wallet={wallet}
              referralStats={referralStats}
              isAccountLoading={isAccountLoading}
              accountError={accountError}
              onRefresh={refreshAccountData}
              onLogout={handleLogout}
            />
          ) : null
        ) : route.name === 'leaderboard' ? (
          <LeaderboardPage
            selectedGameId={route.gameId}
            onSelectGame={(gameId) => navigate({ name: 'leaderboard', gameId })}
            onPlay={(gameId) => navigate({ name: 'game', gameId })}
          />
        ) : route.name === 'worldCup' ? (
          <WorldCupHomePage
            onPredictions={(marketSlug) => navigate({ name: 'worldCupPredictions', marketSlug })}
            onLeaderboard={() => navigate({ name: 'worldCupLeaderboard' })}
            onHistory={() => navigate({ name: 'worldCupHistory' })}
            onMatches={() => navigate({ name: 'worldCupMatches' })}
            onRules={() => navigate({ name: 'worldCupRules' })}
            onShop={() => navigate({ name: 'worldCupShop' })}
          />
        ) : route.name === 'worldCupPredictions' ? (
          <WorldCupPredictionsPage
            initialMarketSlug={route.marketSlug}
            onLogin={() => navigate({ name: 'login' })}
            onLeaderboard={() => navigate({ name: 'worldCupLeaderboard' })}
          />
        ) : route.name === 'worldCupLeaderboard' ? (
          <WorldCupLeaderboardPage />
        ) : route.name === 'worldCupHistory' ? (
          user ? <WorldCupHistoryPage /> : null
        ) : route.name === 'worldCupMatches' ? (
          <WorldCupMatchesPage
            onPredictions={(marketSlug) => navigate({ name: 'worldCupPredictions', marketSlug })}
          />
        ) : route.name === 'worldCupRules' ? (
          <WorldCupRulesPage />
        ) : route.name === 'worldCupShop' ? (
          <WorldCupShopPage onLogin={() => navigate({ name: 'login' })} />
        ) : route.name === 'games' ? (
          <section className="library-page">
            <div className="page-heading">
              <p className="eyebrow">游戏目录</p>
              <h1>全部小游戏</h1>
              <p>当前收录 {games.length} 个小游戏，后续可以按分类、难度、热度继续扩展。</p>
              <button className="text-button page-action" type="button" onClick={() => navigate({ name: 'leaderboard' })}>
                查看排行榜
              </button>
            </div>

            <div className="library-grid">
              {games.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  onPlay={() => navigate({ name: 'game', gameId: game.id })}
                  onLeaderboard={() => navigate({ name: 'leaderboard', gameId: game.id })}
                />
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
                  <button className="hero-button" type="button" onClick={() => navigate({ name: 'games' })}>
                    浏览全部游戏
                  </button>
                  <button
                    className="hero-button secondary"
                    type="button"
                    onClick={() => navigate({ name: 'game', gameId: '2048' })}
                  >
                    试玩 2048
                  </button>
                  <button
                    className="hero-button secondary"
                    type="button"
                    onClick={() => navigate({ name: 'leaderboard' })}
                  >
                    查看排行榜
                  </button>
                  <button
                    className="hero-button secondary"
                    type="button"
                    onClick={() => navigate({ name: 'worldCup' })}
                  >
                    世界杯活动
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
              <button className="text-button" type="button" onClick={() => navigate({ name: 'games' })}>
                查看全部
              </button>
              <button className="text-button" type="button" onClick={() => navigate({ name: 'leaderboard' })}>
                排行榜
              </button>
            </div>

            <div className="game-grid">
              {games.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  onPlay={() => navigate({ name: 'game', gameId: game.id })}
                  onLeaderboard={() => navigate({ name: 'leaderboard', gameId: game.id })}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
