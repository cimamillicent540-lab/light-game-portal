import type { User } from '@supabase/supabase-js';

type ProfilePageProps = {
  user: User;
  onLogout: () => void;
};

export function ProfilePage({ user, onLogout }: ProfilePageProps) {
  return (
    <section className="profile-page">
      <div className="profile-panel">
        <p className="eyebrow">User center</p>
        <h1>用户中心</h1>
        <div className="profile-grid">
          <div className="profile-field">
            <span>Email</span>
            <strong>{user.email}</strong>
          </div>
          <div className="profile-field">
            <span>User ID</span>
            <strong>{user.id}</strong>
          </div>
        </div>
        <button className="primary-button profile-logout" type="button" onClick={onLogout}>
          Logout
        </button>
      </div>
    </section>
  );
}
