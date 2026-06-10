type SiteHeaderProps = {
  onHome: () => void;
};

export function SiteHeader({ onHome }: SiteHeaderProps) {
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
      </nav>
    </header>
  );
}
