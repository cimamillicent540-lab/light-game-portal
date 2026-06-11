import type { User } from '@supabase/supabase-js';
import type { UserProfile, UserWallet } from '../auth/AuthContext';

type ProfilePageProps = {
  user: User;
  profile: UserProfile | null;
  wallet: UserWallet | null;
  isAccountLoading: boolean;
  accountError: string;
  onRefresh: () => void;
  onLogout: () => void;
};

export function ProfilePage({
  user,
  profile,
  wallet,
  isAccountLoading,
  accountError,
  onRefresh,
  onLogout,
}: ProfilePageProps) {
  return (
    <section className="profile-page">
      <div className="profile-panel">
        <p className="eyebrow">User center</p>
        <h1>用户中心</h1>

        {isAccountLoading ? <p className="form-message success">正在读取用户资料和钱包...</p> : null}
        {accountError ? <p className="form-message error">{accountError}</p> : null}

        <div className="profile-grid">
          <div className="profile-field">
            <span>Email</span>
            <strong>{user.email ?? '--'}</strong>
          </div>
          <div className="profile-field">
            <span>User ID</span>
            <strong>{user.id}</strong>
          </div>
          <div className="profile-field">
            <span>Username</span>
            <strong>{profile?.username || '未设置'}</strong>
          </div>
          <div className="profile-field">
            <span>VIP Level</span>
            <strong>{profile?.vip_level || 'free'}</strong>
          </div>
          <div className="profile-field balance">
            <span>金币余额</span>
            <strong>{wallet?.balance ?? 0}</strong>
          </div>
        </div>

        <div className="profile-actions">
          <button className="ghost-button" type="button" onClick={onRefresh}>
            刷新资料
          </button>
          <button className="primary-button profile-logout" type="button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>
    </section>
  );
}
