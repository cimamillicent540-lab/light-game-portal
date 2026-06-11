export const formatScoreValue = (score: number, scoreType?: string | null) => {
  if (scoreType === 'reaction_score') {
    return `${score} pts`;
  }

  if (scoreType === 'memory_score') {
    return `${score} pts`;
  }

  return `${score}`;
};

export const formatDuration = (durationMs?: number | null) => {
  if (!durationMs) {
    return '--';
  }

  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  return `${Math.round(durationMs / 1000)}s`;
};

export const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
