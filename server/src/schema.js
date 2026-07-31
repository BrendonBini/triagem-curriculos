// Canonical "candidate" data contract shared by backend, AI and frontend.
// Keys in English; content extracted from the CV stays in pt-BR.
//
// This is the shape the AI must return (without id/meta, which the server adds).

export const SCORE_TIERS = {
  strong: { min: 80, label: 'Forte' },
  medium: { min: 60, label: 'Médio' },
  weak: { min: 0, label: 'Fraco' },
};

export function scoreTier(score) {
  if (typeof score !== 'number') return 'weak';
  if (score >= SCORE_TIERS.strong.min) return 'strong';
  if (score >= SCORE_TIERS.medium.min) return 'medium';
  return 'weak';
}

// Canonical seniority set stored in the JSON. Frontend maps these to pt-BR UI
// labels (junior->"Iniciante", pleno->"Intermediário", senior->"Experiente").
// Keep this in sync with the frontend mapping.
export const SENIORITY_LEVELS = ['junior', 'pleno', 'senior'];

// Map the model's free-form seniority to the canonical set. Accent/case-insensitive.
// Anything that can't be confidently mapped becomes null (clean contract: the
// frontend only ever has to handle the 3 canonical values + null).
function normalizeSeniority(v) {
  if (typeof v !== 'string') return null;
  const k = v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents (junior)
    .toLowerCase()
    .replace(/\(.*?\)/g, '') // drop "(a)"/"(o)" gender suffixes
    .replace(/[^a-z\s-]/g, '')
    .trim();
  if (!k) return null;
  const map = {
    junior: 'junior', jr: 'junior', iniciante: 'junior', trainee: 'junior',
    estagio: 'junior', estagiario: 'junior', aprendiz: 'junior', entry: 'junior',
    pleno: 'pleno', plena: 'pleno', mid: 'pleno', midlevel: 'pleno',
    intermediario: 'pleno', intermediate: 'pleno',
    senior: 'senior', sr: 'senior', especialista: 'senior', expert: 'senior',
    lead: 'senior', lider: 'senior', principal: 'senior', staff: 'senior',
    gestor: 'senior', gerente: 'senior', avancado: 'senior',
  };
  if (map[k]) return map[k];
  // Fall back to whole-word token match (e.g. "desenvolvedor senior").
  for (const token of k.split(/[\s-]+/)) {
    if (map[token]) return map[token];
  }
  return null;
}

// Minimal, forgiving validation so a slightly-off AI response still stores
// cleanly instead of crashing the whole batch. Missing fields become explicit
// unknowns (null / []), never invented.
export function normalizeCandidate(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const extraction = r.extraction && typeof r.extraction === 'object' ? r.extraction : {};
  const analysis = r.analysis && typeof r.analysis === 'object' ? r.analysis : {};
  const contact = extraction.contact && typeof extraction.contact === 'object' ? extraction.contact : {};

  const num = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : null);
  const arr = (v) => (Array.isArray(v) ? v : []);
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const score = clamp(num(analysis.score), 0, 100);

  return {
    extraction: {
      full_name: str(extraction.full_name),
      contact: {
        email: str(contact.email),
        phone: str(contact.phone),
        location: str(contact.location),
        links: arr(contact.links).filter((x) => typeof x === 'string'),
      },
      summary: str(extraction.summary),
      skills: arr(extraction.skills).filter((x) => typeof x === 'string'),
      years_experience_total: num(extraction.years_experience_total),
      education: arr(extraction.education).map((e) => ({
        degree: str(e?.degree),
        institution: str(e?.institution),
        level: str(e?.level),
        start_year: num(e?.start_year),
        end_year: num(e?.end_year),
      })),
      roles: arr(extraction.roles).map((ro) => ({
        title: str(ro?.title),
        company: str(ro?.company),
        start_date: str(ro?.start_date),
        end_date: str(ro?.end_date),
        is_current: Boolean(ro?.is_current),
        summary: str(ro?.summary),
      })),
    },
    analysis: {
      score: score ?? 0,
      score_breakdown: {
        skill_match: clamp(num(analysis?.score_breakdown?.skill_match), 0, 100),
        seniority: clamp(num(analysis?.score_breakdown?.seniority), 0, 100),
        red_flag_penalty: num(analysis?.score_breakdown?.red_flag_penalty) ?? 0,
      },
      seniority_estimate: normalizeSeniority(analysis.seniority_estimate),
      strengths: arr(analysis.strengths).filter((x) => typeof x === 'string'),
      weaknesses: arr(analysis.weaknesses).filter((x) => typeof x === 'string'),
      points_to_check: arr(analysis.points_to_check).filter((x) => typeof x === 'string'),
      red_flags: arr(analysis.red_flags)
        .map((f) => {
          if (typeof f === 'string') return { type: 'generic', detail: f };
          return { type: str(f?.type) || 'generic', detail: str(f?.detail) };
        })
        .filter((f) => f.detail),
      confidence: clamp(num(analysis.confidence), 0, 1),
    },
  };
}

function clamp(v, min, max) {
  if (v === null) return null;
  return Math.min(max, Math.max(min, v));
}
