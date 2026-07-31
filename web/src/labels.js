// Shared UI label mappings (pt-BR). JSON keys stay in English; only the visible
// text changes. See docs/UX-redesign.md §4 "MAPA DE LINGUAGEM SIMPLES".

// Canonical backend seniority values: junior | pleno | senior | null.
export const SENIORITY_LABELS = {
  junior: 'Iniciante',
  pleno: 'Intermediário',
  senior: 'Experiente',
};

export function seniorityLabel(value) {
  return SENIORITY_LABELS[value] || '—';
}

// Best-fit confidence keys returned by vagaMatch.matchConfidence().
export const MATCH_CONFIDENCE_LABELS = {
  high: 'Alto encaixe',
  medium: 'Encaixe médio',
  low: 'Possível encaixe',
};

export function matchConfidenceLabel(value) {
  return MATCH_CONFIDENCE_LABELS[value] || 'Possível encaixe';
}

// employment_type options for the vaga form select.
export const EMPLOYMENT_TYPES = ['CLT', 'Temporário', 'Estágio', 'PJ', 'Outro'];

// Fallback for missing string fields.
export function na(value) {
  return value || 'não informado';
}
