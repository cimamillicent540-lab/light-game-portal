import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type UserProfile = {
  username: string | null;
  vip_level: string | null;
  referral_code: string | null;
};

export type UserWallet = {
  balance: number;
};

export type ReferralStats = {
  inviteCount: number;
  totalRewarded: number;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  wallet: UserWallet | null;
  referralStats: ReferralStats;
  isLoading: boolean;
  isAccountLoading: boolean;
  accountError: string;
  refreshAccountData: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [wallet, setWallet] = useState<UserWallet | null>(null);
  const [referralStats, setReferralStats] = useState<ReferralStats>({
    inviteCount: 0,
    totalRewarded: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isAccountLoading, setIsAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState('');

  const loadAccountData = async (userId: string) => {
    if (!supabase) {
      setProfile(null);
      setWallet(null);
      setReferralStats({ inviteCount: 0, totalRewarded: 0 });
      setAccountError('Supabase 环境变量尚未配置。');
      return;
    }

    setIsAccountLoading(true);
    setAccountError('');

    const [profileResult, walletResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('username, vip_level, referral_code')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    if (profileResult.error) {
      setAccountError(profileResult.error.message);
      setProfile(null);
    } else {
      setProfile(profileResult.data);
    }

    if (walletResult.error) {
      setAccountError((currentError) =>
        currentError ? `${currentError}; ${walletResult.error.message}` : walletResult.error.message,
      );
      setWallet(null);
    } else {
      setWallet(walletResult.data);
    }

    const referralResult = await supabase
      .from('referral_rewards')
      .select('reward_amount, status')
      .eq('referrer_id', userId);

    if (referralResult.error) {
      setAccountError((currentError) =>
        currentError ? `${currentError}; ${referralResult.error.message}` : referralResult.error.message,
      );
      setReferralStats({ inviteCount: 0, totalRewarded: 0 });
    } else {
      const rows = referralResult.data ?? [];
      setReferralStats({
        inviteCount: rows.length,
        totalRewarded: rows
          .filter((row) => row.status === 'rewarded')
          .reduce((total, row) => total + (row.reward_amount ?? 0), 0),
      });
    }

    setIsAccountLoading(false);
  };

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return undefined;
    }

    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      setSession(data.session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setWallet(null);
      setReferralStats({ inviteCount: 0, totalRewarded: 0 });
      setAccountError('');
      setIsAccountLoading(false);
      return;
    }

    void loadAccountData(session.user.id);
  }, [session?.user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      wallet,
      referralStats,
      isLoading,
      isAccountLoading,
      accountError,
      refreshAccountData: async () => {
        if (session?.user) {
          await loadAccountData(session.user.id);
        }
      },
      signOut: async () => {
        if (!supabase) {
          setSession(null);
          setProfile(null);
          setWallet(null);
          setReferralStats({ inviteCount: 0, totalRewarded: 0 });
          return;
        }

        const { error } = await supabase.auth.signOut();
        if (error) {
          throw error;
        }

        setSession(null);
        setProfile(null);
        setWallet(null);
        setReferralStats({ inviteCount: 0, totalRewarded: 0 });
      },
    }),
    [accountError, isAccountLoading, isLoading, profile, referralStats, session, wallet],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
