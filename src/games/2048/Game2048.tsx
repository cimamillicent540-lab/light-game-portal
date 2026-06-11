import { useEffect, useMemo, useState } from 'react';
import { ScoreSubmitPanel } from '../../components/ScoreSubmitPanel';
import type { GameComponentProps } from '../../types';

type Direction = 'up' | 'down' | 'left' | 'right';

const size = 4;
const emptyBoard = Array.from({ length: size * size }, () => 0);

const getEmptyIndexes = (board: number[]) =>
  board.reduce<number[]>((indexes, value, index) => {
    if (value === 0) {
      indexes.push(index);
    }
    return indexes;
  }, []);

const addRandomTile = (board: number[]) => {
  const emptyIndexes = getEmptyIndexes(board);
  if (emptyIndexes.length === 0) {
    return board;
  }

  const nextBoard = [...board];
  const targetIndex = emptyIndexes[Math.floor(Math.random() * emptyIndexes.length)];
  nextBoard[targetIndex] = Math.random() < 0.9 ? 2 : 4;
  return nextBoard;
};

const createInitialBoard = () => addRandomTile(addRandomTile(emptyBoard));

const compressRow = (row: number[]) => {
  const values = row.filter(Boolean);
  const merged: number[] = [];
  let gained = 0;

  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === values[index + 1]) {
      const nextValue = values[index] * 2;
      merged.push(nextValue);
      gained += nextValue;
      index += 1;
    } else {
      merged.push(values[index]);
    }
  }

  while (merged.length < size) {
    merged.push(0);
  }

  return { row: merged, gained };
};

const moveBoard = (board: number[], direction: Direction) => {
  const nextBoard = [...emptyBoard];
  let gained = 0;

  for (let line = 0; line < size; line += 1) {
    const row = Array.from({ length: size }, (_, offset) => {
      if (direction === 'left' || direction === 'right') {
        return board[line * size + offset];
      }
      return board[offset * size + line];
    });

    const sourceRow = direction === 'right' || direction === 'down' ? row.reverse() : row;
    const result = compressRow(sourceRow);
    const outputRow = direction === 'right' || direction === 'down' ? result.row.reverse() : result.row;
    gained += result.gained;

    outputRow.forEach((value, offset) => {
      if (direction === 'left' || direction === 'right') {
        nextBoard[line * size + offset] = value;
      } else {
        nextBoard[offset * size + line] = value;
      }
    });
  }

  return { board: nextBoard, gained };
};

const boardsMatch = (left: number[], right: number[]) =>
  left.every((value, index) => value === right[index]);

const hasMoves = (board: number[]) =>
  getEmptyIndexes(board).length > 0 ||
  (['up', 'down', 'left', 'right'] as Direction[]).some(
    (direction) => !boardsMatch(board, moveBoard(board, direction).board),
  );

const keyDirections: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

export function Game2048({ onLeaderboard, onLogin }: GameComponentProps) {
  const [board, setBoard] = useState(createInitialBoard);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);

  const isGameOver = useMemo(() => !hasMoves(board), [board]);
  const maxTile = useMemo(() => Math.max(...board), [board]);

  const resetGame = () => {
    setBoard(createInitialBoard());
    setScore(0);
    setMoves(0);
    setStartedAt(Date.now());
    setFinishedAt(null);
  };

  const move = (direction: Direction) => {
    if (isGameOver) {
      return;
    }

    const result = moveBoard(board, direction);
    if (boardsMatch(board, result.board)) {
      return;
    }

    const nextBoard = addRandomTile(result.board);
    const nextScore = score + result.gained;
    setBoard(nextBoard);
    setScore(nextScore);
    setMoves((currentMoves) => currentMoves + 1);
    setBestScore((currentBest) => Math.max(currentBest, nextScore));
  };

  useEffect(() => {
    if (isGameOver && finishedAt === null) {
      setFinishedAt(Date.now());
    }
  }, [finishedAt, isGameOver]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const direction = keyDirections[event.key];
      if (!direction) {
        return;
      }

      event.preventDefault();
      move(direction);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [board, isGameOver, score]);

  const handleTouchEnd = (clientX: number, clientY: number) => {
    if (!touchStart) {
      return;
    }

    const deltaX = clientX - touchStart.x;
    const deltaY = clientY - touchStart.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (Math.max(absX, absY) < 24) {
      setTouchStart(null);
      return;
    }

    move(absX > absY ? (deltaX > 0 ? 'right' : 'left') : deltaY > 0 ? 'down' : 'up');
    setTouchStart(null);
  };

  return (
    <div className="arcade-game">
      <div className="game-title-block compact">
        <p className="eyebrow">数字益智</p>
        <h1>2048</h1>
      </div>

      <div className="game-toolbar">
        <div className="score-box">
          <span>分数</span>
          <strong>{score}</strong>
        </div>
        <div className="score-box best">
          <span>最好</span>
          <strong>{bestScore}</strong>
        </div>
        <div className="score-box">
          <span>步数</span>
          <strong>{moves}</strong>
        </div>
        <button className="ghost-button" type="button" onClick={resetGame}>
          新局
        </button>
      </div>

      <div
        className="board-2048"
        onTouchStart={(event) =>
          setTouchStart({
            x: event.touches[0].clientX,
            y: event.touches[0].clientY,
          })
        }
        onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0].clientX, event.changedTouches[0].clientY)}
      >
        {board.map((value, index) => (
          <div className={`tile tile-${value || 'empty'}`} key={`${index}-${value}`}>
            {value || ''}
          </div>
        ))}
      </div>

      {isGameOver ? <p className="game-message">没有可移动的方块了，开一局新的吧。</p> : null}

      {isGameOver && finishedAt !== null ? (
        <ScoreSubmitPanel
          gameSlug="2048"
          score={score}
          scoreType="points"
          durationMs={finishedAt - startedAt}
          metadata={{ moves, max_tile: maxTile }}
          resultKey={`2048-${finishedAt}-${score}`}
          onLogin={onLogin}
          onLeaderboard={() => onLeaderboard('2048')}
        />
      ) : null}

      <div className="direction-pad" aria-label="移动方向">
        <button type="button" onClick={() => move('up')}>
          上
        </button>
        <button type="button" onClick={() => move('left')}>
          左
        </button>
        <button type="button" onClick={() => move('right')}>
          右
        </button>
        <button type="button" onClick={() => move('down')}>
          下
        </button>
      </div>
    </div>
  );
}
