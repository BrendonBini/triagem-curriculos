import React from 'react';

export function tierOf(score) {
  if (typeof score !== 'number') return 'weak';
  if (score >= 80) return 'strong';
  if (score >= 60) return 'medium';
  return 'weak';
}

export default function ScorePill({ score }) {
  const tier = tierOf(score);
  const value = typeof score === 'number' ? Math.round(score) : '—';
  return <span className={`score-pill tier-${tier}`}>{value}</span>;
}
