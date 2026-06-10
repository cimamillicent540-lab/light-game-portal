import { useEffect, useRef, useState } from 'react';

type Phase = 'idle' | 'waiting' | 'ready' | 'result' | 'too-soon';

const phaseText: Record<Phase, string> = {
  idle: 'Start',
  waiting: '等待变色',
  ready: '现在点击',
  result: '再来一次',
  'too-soon': '点早了',
};

export function ReactionGame() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [reactionTime, setReactionTime] = useState<number | null>(null);
  const [bestTime, setBestTime] = useState<number | null>(null);
  const readyAt = useRef(0);
  const timerId = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerId.current) {
        window.clearTimeout(timerId.current);
      }
    };
  }, []);

  const startRound = () => {
    if (timerId.current) {
      window.clearTimeout(timerId.current);
    }

    setReactionTime(null);
    setPhase('waiting');

    const delay = 1000 + Math.random() * 2000;
    timerId.current = window.setTimeout(() => {
      readyAt.current = performance.now();
      setPhase('ready');
    }, delay);
  };

  const handleMainClick = () => {
    if (phase === 'idle' || phase === 'result' || phase === 'too-soon') {
      startRound();
      return;
    }

    if (phase === 'waiting') {
      if (timerId.current) {
        window.clearTimeout(timerId.current);
      }
      setPhase('too-soon');
      return;
    }

    const currentReaction = Math.round(performance.now() - readyAt.current);
    setReactionTime(currentReaction);
    setBestTime((currentBest) =>
      currentBest === null ? currentReaction : Math.min(currentBest, currentReaction),
    );
    setPhase('result');
  };

  return (
    <div className="reaction-layout">
      <div className="game-title-block">
        <p className="eyebrow">小游戏 01</p>
        <h1>反应速度测试</h1>
      </div>

      <div className={`reaction-stage reaction-stage-${phase}`}>
        <button className="reaction-button" type="button" onClick={handleMainClick}>
          <span>{phaseText[phase]}</span>
        </button>
      </div>

      <div className="score-row" aria-live="polite">
        <div className="score-box">
          <span>本次成绩</span>
          <strong>{reactionTime === null ? '--' : `${reactionTime} ms`}</strong>
        </div>
        <div className="score-box best">
          <span>最好成绩</span>
          <strong>{bestTime === null ? '--' : `${bestTime} ms`}</strong>
        </div>
      </div>
    </div>
  );
}
