import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';

type ScoreSubmitPanelProps = {
  gameSlug: string;
  score: number;
  scoreType: string;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
  resultKey: string;
  onLeaderboard: () => void;
  onLogin: () => void;
};

type SubmitState = 'idle' | 'saving' | 'saved' | 'error';

export function ScoreSubmitPanel({
  gameSlug,
  score,
  scoreType,
  durationMs = null,
  metadata = {},
  resultKey,
  onLeaderboard,
  onLogin,
}: ScoreSubmitPanelProps) {
  const { user } = useAuth();
  const submittedKey = useRef('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user || !supabase || submittedKey.current === resultKey) {
      return;
    }

    submittedKey.current = resultKey;
    setSubmitState('saving');
    setMessage('正在保存成绩...');

    supabase
      .rpc('submit_game_score', {
        p_game_slug: gameSlug,
        p_score: score,
        p_score_type: scoreType,
        p_duration_ms: durationMs,
        p_metadata: metadata,
      })
      .then(({ error }) => {
        if (error) {
          submittedKey.current = '';
          setSubmitState('error');
          setMessage(error.message);
          return;
        }

        setSubmitState('saved');
        setMessage('成绩已保存到排行榜。');
      });
  }, [durationMs, gameSlug, metadata, resultKey, score, scoreType, user]);

  if (!user) {
    return (
      <div className="score-submit-panel">
        <p>登录后可保存本局成绩并参与排行榜。</p>
        <div className="inline-actions">
          <button className="primary-button compact-button" type="button" onClick={onLogin}>
            登录保存成绩
          </button>
          <button className="ghost-button" type="button" onClick={onLeaderboard}>
            查看排行榜
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`score-submit-panel score-submit-${submitState}`} aria-live="polite">
      <p>{message || '准备保存成绩...'}</p>
      <div className="inline-actions">
        <button className="ghost-button" type="button" onClick={onLeaderboard}>
          查看排行榜
        </button>
      </div>
    </div>
  );
}
