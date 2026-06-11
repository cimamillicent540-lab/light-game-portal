import { useEffect, useMemo, useRef, useState } from 'react';
import { ScoreSubmitPanel } from '../../components/ScoreSubmitPanel';
import type { GameComponentProps } from '../../types';

type MemoryCard = {
  id: string;
  value: string;
  matched: boolean;
};

const values = ['A', 'B', 'C', 'D', 'E', 'F'];

const createDeck = () =>
  [...values, ...values]
    .map((value, index) => ({ id: `${value}-${index}`, value, matched: false }))
    .sort(() => Math.random() - 0.5);

export function MemoryGame({ onLeaderboard, onLogin }: GameComponentProps) {
  const [cards, setCards] = useState<MemoryCard[]>(createDeck);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const roundRef = useRef(0);

  const matchedCount = useMemo(() => cards.filter((card) => card.matched).length, [cards]);
  const elapsedSeconds =
    startedAt === null ? 0 : Math.round(((finishedAt ?? now) - startedAt) / 1000);
  const durationMs = startedAt !== null && finishedAt !== null ? finishedAt - startedAt : null;
  const leaderboardScore = durationMs === null ? 0 : Math.max(0, 100_000 - moves * 1000 - durationMs);

  useEffect(() => {
    if (startedAt === null || finishedAt !== null) {
      return undefined;
    }

    const timerId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, [finishedAt, startedAt]);

  const resetGame = () => {
    roundRef.current += 1;
    setCards(createDeck());
    setSelectedIds([]);
    setMoves(0);
    setStartedAt(null);
    setFinishedAt(null);
    setNow(Date.now());
  };

  const selectCard = (card: MemoryCard) => {
    if (card.matched || selectedIds.includes(card.id) || selectedIds.length >= 2) {
      return;
    }

    if (startedAt === null) {
      const startTime = Date.now();
      setStartedAt(startTime);
      setNow(startTime);
    }

    const nextSelectedIds = [...selectedIds, card.id];
    setSelectedIds(nextSelectedIds);

    if (nextSelectedIds.length !== 2) {
      return;
    }

    setMoves((currentMoves) => currentMoves + 1);

    const selectedCards = cards.filter((item) => nextSelectedIds.includes(item.id));
    const isMatch = selectedCards[0].value === selectedCards[1].value;
    const round = roundRef.current;

    window.setTimeout(() => {
      if (round !== roundRef.current) {
        return;
      }

      if (isMatch) {
        setCards((currentCards) => {
          const nextCards = currentCards.map((item) =>
            nextSelectedIds.includes(item.id) ? { ...item, matched: true } : item,
          );

          if (nextCards.every((item) => item.matched)) {
            setFinishedAt(Date.now());
          }

          return nextCards;
        });
      }

      setSelectedIds([]);
    }, isMatch ? 320 : 720);
  };

  return (
    <div className="arcade-game">
      <div className="game-title-block compact">
        <p className="eyebrow">记忆挑战</p>
        <h1>记忆翻牌</h1>
      </div>

      <div className="game-toolbar">
        <div className="score-box">
          <span>步数</span>
          <strong>{moves}</strong>
        </div>
        <div className="score-box best">
          <span>用时</span>
          <strong>{elapsedSeconds}s</strong>
        </div>
        <button className="ghost-button" type="button" onClick={resetGame}>
          重开
        </button>
      </div>

      <div className="memory-board">
        {cards.map((card) => {
          const isVisible = card.matched || selectedIds.includes(card.id);
          return (
            <button
              className={`memory-card ${isVisible ? 'visible' : ''}`}
              key={card.id}
              type="button"
              onClick={() => selectCard(card)}
            >
              <span>{isVisible ? card.value : ''}</span>
            </button>
          );
        })}
      </div>

      {matchedCount === cards.length ? <p className="game-message">全部配对完成。</p> : null}

      {matchedCount === cards.length && finishedAt !== null && durationMs !== null ? (
        <ScoreSubmitPanel
          gameSlug="memory"
          score={leaderboardScore}
          scoreType="memory_score"
          durationMs={durationMs}
          metadata={{ moves, pairs: values.length }}
          resultKey={`memory-${finishedAt}-${moves}`}
          onLogin={onLogin}
          onLeaderboard={() => onLeaderboard('memory')}
        />
      ) : null}
    </div>
  );
}
