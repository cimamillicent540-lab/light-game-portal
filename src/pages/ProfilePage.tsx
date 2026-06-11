import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { ReferralStats, UserProfile, UserWallet } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';

type ProfilePageProps = {
  user: User;
  accessToken: string | null;
  profile: UserProfile | null;
  wallet: UserWallet | null;
  referralStats: ReferralStats;
  isAccountLoading: boolean;
  accountError: string;
  onRefresh: () => Promise<void>;
  onLogout: () => void;
};

const referralBaseUrl = 'https://main--dancing-valkyrie-691e44.netlify.app/register';

const getTodayKey = () => new Date().toISOString().slice(0, 10);

const getCountdownToNextDay = () => {
  const now = new Date();
  const nextDay = new Date(now);
  nextDay.setUTCHours(24, 0, 0, 0);

  const diff = Math.max(0, nextDay.getTime() - now.getTime());
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
    seconds,
  ).padStart(2, '0')}`;
};

export function ProfilePage({
  user,
  accessToken,
  profile,
  wallet,
  referralStats,
  isAccountLoading,
  accountError,
  onRefresh,
  onLogout,
}: ProfilePageProps) {
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [hasCheckedInToday, setHasCheckedInToday] = useState(false);
  const [checkinMessage, setCheckinMessage] = useState('');
  const [checkinError, setCheckinError] = useState('');
  const [countdown, setCountdown] = useState(getCountdownToNextDay);
  const referralLink = useMemo(
    () => (profile?.referral_code ? `${referralBaseUrl}?ref=${profile.referral_code}` : ''),
    [profile?.referral_code],
  );

  useEffect(() => {
    const timerId = window.setInterval(() => setCountdown(getCountdownToNextDay()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    const loadCheckinStatus = async () => {
      if (!supabase) {
        return;
      }

      const { data } = await supabase
        .from('daily_checkins')
        .select('id')
        .eq('user_id', user.id)
        .eq('checkin_date', getTodayKey())
        .maybeSingle();

      setHasCheckedInToday(Boolean(data));
    };

    void loadCheckinStatus();
  }, [user.id, wallet?.balance]);

  useEffect(() => {
    const storageKey = `referral-reward:${user.id}`;
    if (!accessToken || window.localStorage.getItem(storageKey)) {
      return;
    }

    window.localStorage.setItem(storageKey, 'requested');
    fetch('/.netlify/functions/grant-referral-reward', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Referral reward request failed');
        }

        return response.json();
      })
      .then((result) => {
        if (result?.rewarded) {
          void onRefresh();
        }
      })
      .catch(() => {
        window.localStorage.removeItem(storageKey);
      });
  }, [accessToken, onRefresh, user.id]);

  const handleDailyCheckin = async () => {
    if (!supabase || hasCheckedInToday || isCheckingIn) {
      return;
    }

    setIsCheckingIn(true);
    setCheckinMessage('');
    setCheckinError('');

    const { error } = await supabase.rpc('daily_checkin');
    setIsCheckingIn(false);

    if (error) {
      setCheckinError(error.message);
      if (error.message.toLowerCase().includes('already')) {
        setHasCheckedInToday(true);
      }
      return;
    }

    setHasCheckedInToday(true);
    setCheckinMessage('签到成功，获得 20 金币。');
    await onRefresh();
  };

  const copyReferralLink = async () => {
    if (!referralLink) {
      return;
    }

    await navigator.clipboard.writeText(referralLink);
  };

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

        <div className="profile-section">
          <div className="section-heading compact">
            <h2>每日签到</h2>
            <span>{hasCheckedInToday ? '今日已签到' : '奖励 20 金币'}</span>
          </div>
          <button
            className="primary-button form-submit"
            disabled={hasCheckedInToday || isCheckingIn}
            type="button"
            onClick={handleDailyCheckin}
          >
            {hasCheckedInToday ? '今日已签到' : isCheckingIn ? '签到中...' : '每日签到'}
          </button>
          <p className="profile-note">下次签到倒计时：{countdown}</p>
          {checkinMessage ? <p className="form-message success">{checkinMessage}</p> : null}
          {checkinError ? <p className="form-message error">{checkinError}</p> : null}
        </div>

        <div className="profile-section">
          <div className="section-heading compact">
            <h2>邀请奖励</h2>
            <span>邀请人 +100 金币</span>
          </div>
          <div className="profile-grid">
            <div className="profile-field">
              <span>邀请码</span>
              <strong>{profile?.referral_code ?? '--'}</strong>
            </div>
            <div className="profile-field">
              <span>邀请人数</span>
              <strong>{referralStats.inviteCount}</strong>
            </div>
            <div className="profile-field balance">
              <span>累计奖励金币</span>
              <strong>{referralStats.totalRewarded}</strong>
            </div>
          </div>
          <div className="referral-link">
            <span>邀请链接</span>
            <strong>{referralLink || '--'}</strong>
          </div>
          <button className="ghost-button copy-button" disabled={!referralLink} type="button" onClick={copyReferralLink}>
            复制邀请链接
          </button>
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
