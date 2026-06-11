import { FormEvent, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

type RegisterPageProps = {
  onLogin: () => void;
};

export function RegisterPage({ onLogin }: RegisterPageProps) {
  const referralCode = new URLSearchParams(window.location.search).get('ref')?.trim().toUpperCase() ?? '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (password !== confirmPassword) {
      setErrorMessage('两次输入的密码不一致。');
      return;
    }

    if (!supabase) {
      setErrorMessage('Supabase 环境变量尚未配置。');
      return;
    }

    setIsSubmitting(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: referralCode
        ? {
            data: {
              referral_code: referralCode,
            },
          }
        : undefined,
    });
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    if (data.session) {
      setSuccessMessage('注册成功，已自动登录。');
    } else {
      setSuccessMessage('注册成功，请检查邮箱并完成确认，然后返回登录。');
    }

    setPassword('');
    setConfirmPassword('');
  };

  return (
    <section className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">Create account</p>
        <h1>注册</h1>
        <p className="auth-copy">先创建基础账号，后续可接入云端成绩、个人资料和排行榜。</p>

        {referralCode ? <p className="form-message success">已使用邀请码：{referralCode}</p> : null}

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
              autoComplete="new-password"
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 6 位"
              required
              type="password"
              value={password}
            />
          </label>

          <label>
            Confirm password
            <input
              autoComplete="new-password"
              minLength={6}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="再次输入密码"
              required
              type="password"
              value={confirmPassword}
            />
          </label>

          {errorMessage ? <p className="form-message error">{errorMessage}</p> : null}
          {successMessage ? <p className="form-message success">{successMessage}</p> : null}

          <button className="primary-button form-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? '注册中...' : '注册'}
          </button>
        </form>

        <button className="text-button auth-switch" type="button" onClick={onLogin}>
          已有账号？去登录
        </button>
      </div>
    </section>
  );
}
