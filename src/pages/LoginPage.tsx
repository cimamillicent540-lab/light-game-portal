import { FormEvent, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

type LoginPageProps = {
  onRegister: () => void;
  onSuccess: () => void;
};

export function LoginPage({ onRegister, onSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');

    if (!supabase) {
      setErrorMessage('Supabase 环境变量尚未配置。');
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    onSuccess();
  };

  return (
    <section className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">Welcome back</p>
        <h1>登录</h1>
        <p className="auth-copy">登录后可以进入用户中心，后续也会用于保存成绩和排行榜。</p>

        {!isSupabaseConfigured ? (
          <p className="form-message error">请先配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。</p>
        ) : null}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
          </label>

          <label>
            Password
            <input
              autoComplete="current-password"
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 6 位"
              required
              type="password"
              value={password}
            />
          </label>

          {errorMessage ? <p className="form-message error">{errorMessage}</p> : null}

          <button className="primary-button form-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? '登录中...' : '登录'}
          </button>
        </form>

        <button className="text-button auth-switch" type="button" onClick={onRegister}>
          没有账号？去注册
        </button>
      </div>
    </section>
  );
}
