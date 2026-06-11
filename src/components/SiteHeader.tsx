type SiteHeaderProps = {
  userEmail?: string;
  onHome: () => void;
  onGames: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onProfile: () => void;
  onRegister: () => void;
};

const formatEmail = (email: string) => {
  if (email.length <= 22) {
    return email;
  }

  const [name, domain] = email.split('@');
  return `${name.slice(0, 8)}...@${domain}`;
};

export function SiteHeader({
  userEmail,
  onHome,
  onGames,
  onLogin,
  onLogout,
  onProfile,
  onRegister,
}: SiteHeaderProps) {
  return (
    <header className="site-header">
      <button className="brand-button" type="button" onClick={onHome}>
        <span className="brand-mark" aria-hidden="true">
          LG
        </span>
        <span>Light Game Portal</span>
      </button>
      <nav aria-label="主要导航">
        <button className="nav-button" type="button" onClick={onHome}>
          首页
        </button>
        <button className="nav-button" type="button" onClick={onGames}>
          游戏列表
        </button>
        {userEmail ? (
          <>
            <button className="nav-button email-chip" type="button" onClick={onProfile}>
              {formatEmail(userEmail)}
            </button>
            <button className="nav-button" type="button" onClick={onProfile}>
              Profile
            </button>
            <button className="nav-button" type="button" onClick={onLogout}>
              Logout
            </button>
          </>
        ) : (
          <>
            <button className="nav-button" type="button" onClick={onLogin}>
              Login
            </button>
            <button className="nav-button strong" type="button" onClick={onRegister}>
              Register
            </button>
          </>
        )}
      </nav>
    </header>
  );
}
