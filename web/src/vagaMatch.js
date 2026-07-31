// Best-fit vaga matcher — PURE JS, ZERO AI cost, NO schema change.
//
// Given an already-analyzed candidate and the list of OPEN vagas, derive (in the
// browser, in real time) which vaga fits best, so the UI can surface a "MELHOR
// ENCAIXE" hint. Because it is derived on the fly from data that already exists
// (candidate.extraction.skills / roles + vaga.skills / role / title), the
// suggestion always reflects the current set of open vagas — no persistence.
//
// Data contract (defined elsewhere — this file only READS it):
//   candidate.extraction.skills        -> string[]   (pt-BR skill labels)
//   candidate.extraction.roles[].title -> string|null (past job titles)
//   candidate.analysis.seniority_estimate -> 'junior'|'pleno'|'senior'|null
//   vaga.skills  -> string  (comma/semicolon/newline separated)
//   vaga.role    -> string  (target role, may be empty)
//   vaga.title   -> string  (job posting title)
//
// EXPECTATION: the caller passes only OPEN vagas (activeVagas). This function
// does NOT filter `archived` itself — filter upstream so archived vagas never
// leak into a suggestion.

// ---------------------------------------------------------------------------
// Tunables (documented so they can be tweaked deliberately, like prompts).
// ---------------------------------------------------------------------------

// Below this normalized score (0-100) we return null: too little overlap to be
// a useful hint, and a wrong suggestion is worse than none. 30 means "roughly a
// third of the vaga's requirements are met, OR a partial match backed by a role
// title hit". Chosen to require real skill overlap, not just a title coincidence.
export const MATCH_THRESHOLD = 30;

// Friendly-confidence cutoffs (0-100). The frontend maps the returned key to
// pt-BR text. Only 'high' | 'medium' | 'low' are ever returned (below-threshold
// candidates yield null and show nothing).
export const MATCH_CONFIDENCE_TIERS = {
  high: 70, // strong overlap — safe to feature prominently
  medium: 45, // decent partial fit
  low: MATCH_THRESHOLD, // weak but worth a soft mention
};

// A title/role hit gives a *leve* boost that never pushes past 100 and shrinks
// as the skill score is already high (so it can't rescue a zero-skill match on
// its own past the threshold).
const TITLE_BONUS = 0.15;

// Generic words in role/title strings that carry no matching signal. Kept small
// and pt-BR focused; extend deliberately.
const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'a', 'o', 'as', 'os',
  'vaga', 'vagas', 'analista', 'assistente', 'auxiliar', 'especialista',
  'desenvolvedor', 'desenvolvedora', 'dev', 'engenheiro', 'engenheira',
  'pessoa', 'profissional', 'junior', 'pleno', 'senior', 'jr', 'sr',
  'estagio', 'estagiario', 'trainee', 'i', 'ii', 'iii', 'iv',
]);

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

// lowercase, strip accents, punctuation -> spaces, collapse whitespace.
// "React.js" -> "react js", "Node/JS" -> "node js", "Análise de Dados" -> "analise de dados".
function normalize(str) {
  if (typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') // any punctuation/symbol -> space
    .trim()
    .replace(/\s+/g, ' ');
}

function tokens(str) {
  const n = normalize(str);
  return n ? n.split(' ') : [];
}

// Split a vaga's free-text skills string into individual normalized skills.
function splitVagaSkills(skillsStr) {
  if (typeof skillsStr !== 'string') return [];
  return skillsStr
    .split(/[,;\n/]+/)
    .map((s) => ({ label: s.trim(), norm: normalize(s), tokens: tokens(s) }))
    .filter((s) => s.norm);
}

// ---------------------------------------------------------------------------
// Skill matching
// ---------------------------------------------------------------------------
// Token-set based so it is robust without being noisy: two skills match when the
// smaller token set is fully contained in the larger. Handles "react" vs
// "react js" and "node" vs "node js", while avoiding false hits like "go" in
// "google" or treating "java" == "javascript".
function skillsMatch(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return false;
  const [small, big] = aTokens.length <= bTokens.length ? [aTokens, bTokens] : [bTokens, aTokens];
  const bigSet = new Set(big);
  return small.every((t) => bigSet.has(t));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// matchScore(candidate, vaga) -> { score, matchedSkills } | null
// score is 0-100 (null when no usable data). matchedSkills are the ORIGINAL
// vaga skill labels that the candidate satisfied (for the "por quê" in the UI).
export function matchScore(candidate, vaga) {
  const candSkills = (candidate?.extraction?.skills || [])
    .map((s) => ({ label: s, tokens: tokens(s) }))
    .filter((s) => s.tokens.length);

  // Target skill set: the vaga's declared skills. If none were declared, fall
  // back to the meaningful words of role/title so title-only vagas still match.
  let vagaSkills = splitVagaSkills(vaga?.skills);
  if (!vagaSkills.length) {
    const roleTokens = [...tokens(vaga?.role), ...tokens(vaga?.title)].filter(
      (t) => t.length > 1 && !STOPWORDS.has(t),
    );
    vagaSkills = [...new Set(roleTokens)].map((t) => ({ label: t, norm: t, tokens: [t] }));
  }

  if (!vagaSkills.length || !candSkills.length) return null;

  const matchedSkills = [];
  for (const vs of vagaSkills) {
    const hit = candSkills.some((cs) => skillsMatch(cs.tokens, vs.tokens));
    if (hit) matchedSkills.push(vs.label);
  }

  const skillScore = matchedSkills.length / vagaSkills.length; // 0..1

  // Title/role bonus: does any past role title (or seniority label) share a
  // meaningful word with the vaga's role/title?
  const vagaRoleTokens = new Set(
    [...tokens(vaga?.role), ...tokens(vaga?.title)].filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
  const candRoleTokens = new Set(
    (candidate?.extraction?.roles || [])
      .flatMap((r) => tokens(r?.title))
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
  const titleHit = [...candRoleTokens].some((t) => vagaRoleTokens.has(t));

  // Leve boost that never exceeds 1 and shrinks as skillScore rises.
  let score01 = skillScore;
  if (titleHit) score01 = score01 + TITLE_BONUS * (1 - score01);

  return { score: Math.round(score01 * 100), matchedSkills };
}

// matchConfidence(score) -> 'high' | 'medium' | 'low'
// Assumes score >= MATCH_THRESHOLD (call only on suggested matches).
export function matchConfidence(score) {
  if (score >= MATCH_CONFIDENCE_TIERS.high) return 'high';
  if (score >= MATCH_CONFIDENCE_TIERS.medium) return 'medium';
  return 'low';
}

// bestVagaMatch(candidate, openVagas) -> { vaga, score, matchedSkills, confidence } | null
// Returns the single best-fitting OPEN vaga, or null when nothing clears the
// threshold. Deterministic tie-break: higher score, then more matched skills,
// then vaga title A-Z (stable across identical input).
export function bestVagaMatch(candidate, vagas) {
  if (!candidate || !Array.isArray(vagas) || !vagas.length) return null;

  let best = null;
  for (const vaga of vagas) {
    const res = matchScore(candidate, vaga);
    if (!res || res.score < MATCH_THRESHOLD) continue;

    const candidateMatch = {
      vaga,
      score: res.score,
      matchedSkills: res.matchedSkills,
      confidence: matchConfidence(res.score),
    };
    if (!best || isBetter(candidateMatch, best)) best = candidateMatch;
  }
  return best;
}

function isBetter(a, b) {
  if (a.score !== b.score) return a.score > b.score;
  if (a.matchedSkills.length !== b.matchedSkills.length) {
    return a.matchedSkills.length > b.matchedSkills.length;
  }
  return String(a.vaga?.title || '').localeCompare(String(b.vaga?.title || '')) < 0;
}
