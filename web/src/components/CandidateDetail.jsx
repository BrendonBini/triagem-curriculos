import React, { useState } from 'react';
import ScorePill from './ScorePill.jsx';
import { na, seniorityLabel, matchConfidenceLabel } from '../labels.js';
import { bestVagaMatch, matchScore } from '../vagaMatch.js';
import { compareVagas } from '../api.js';

function BulletBlock({ title, items, kind }) {
  if (!items || items.length === 0) return null;
  return (
    <>
      <div className="section-title">{title}</div>
      <ul className="bullet-list">
        {items.map((it, i) => (
          <li key={i} style={kind === 'flag' ? { color: 'var(--weak)' } : undefined}>
            {typeof it === 'string' ? it : it.detail}
          </li>
        ))}
      </ul>
    </>
  );
}

// TELA C — detalhe do candidato (tela própria, com "voltar").
export default function CandidateDetail({ candidate, vagas = [], backLabel, onBack, onMove, onReevaluate, onToggleArchive, onDelete }) {
  const [showScore, setShowScore] = useState(false);
  const [reevaluating, setReevaluating] = useState(false);

  // On-demand "compare with other vagas" — state kept LOCAL to this screen.
  const [comparing, setComparing] = useState(false);
  const [compareResults, setCompareResults] = useState(null);
  const [compareError, setCompareError] = useState(null);

  async function handleReevaluate() {
    if (reevaluating) return;
    setReevaluating(true);
    try {
      await onReevaluate?.();
    } finally {
      // App owns the error banner; locally we just restore the button.
      setReevaluating(false);
    }
  }

  async function handleCompare() {
    if (comparing) return;
    setComparing(true);
    setCompareError(null);
    setCompareResults(null);
    try {
      // Pre-rank the OPEN vagas locally (free) and send only the 3 best ids;
      // the AI does the expensive real scoring on those.
      const ranked = vagas
        .map((v) => ({ v, s: matchScore(candidate, v)?.score ?? 0 }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 3)
        .map((r) => r.v.id);
      const data = await compareVagas(candidate.id, ranked);
      setCompareResults(data.results || []);
    } catch (err) {
      setCompareError(err.message || 'Falha ao comparar com outras vagas.');
    } finally {
      setComparing(false);
    }
  }

  if (!candidate) {
    return (
      <div>
        <button className="btn-back" onClick={onBack}>{backLabel || '← Voltar'}</button>
        <div className="card empty">Candidato não encontrado.</div>
      </div>
    );
  }

  const ex = candidate.extraction || {};
  const an = candidate.analysis || {};
  const contact = ex.contact || {};
  const bd = an.score_breakdown || {};
  const penalty = bd.red_flag_penalty ?? 0;

  // Best-fit vaga suggestion, derived live from the OPEN vagas passed in.
  // Null when there is no useful overlap — in that case we render nothing.
  const match = bestVagaMatch(candidate, vagas);
  const alreadyHere = match && candidate.vaga_id === match.vaga.id;
  const isEstimate = !!candidate.meta?.needs_review;

  // Score staleness: the current score was computed for a different vaga than
  // the one the candidate now sits in. meta.scored_for_vaga_id is null when it
  // was scored without any vaga.
  const hasVaga = !!candidate.vaga_id;
  const scoreStale = hasVaga && candidate.meta?.scored_for_vaga_id !== candidate.vaga_id;

  return (
    <div>
      <button className="btn-back" onClick={onBack}>{backLabel || '← Voltar para a vaga'}</button>

      <div className="card detail">
        {candidate.meta?.needs_review && (
          <div className="warn-banner">
            ⚠ Revisar manualmente: {candidate.meta.review_reason || 'o sistema não teve certeza; confira este currículo à mão.'}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h2>{ex.full_name || 'Sem nome'}</h2>
            <div className="muted">{candidate.source_file?.filename}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <ScorePill score={an.score} />
            <div className="muted" style={{ marginTop: 4 }}>{seniorityLabel(an.seniority_estimate)}</div>
          </div>
        </div>

        {scoreStale && (
          <div className="stale-note">
            ⚠ Esta nota foi calculada para outra vaga. Clique em Reavaliar para atualizar.
          </div>
        )}

        {match && (
          <div className={`match-suggestion conf-${match.confidence}`}>
            <div className="match-suggestion__head">
              <span className="match-suggestion__label">
                Melhor encaixe{isEstimate && <span className="match-suggestion__estimate"> (estimativa)</span>}
              </span>
              <span className="chip match-conf">{matchConfidenceLabel(match.confidence)}</span>
            </div>
            <div className="match-suggestion__vaga">
              <strong>{match.vaga.title}</strong>
              <span className="match-suggestion__score">Encaixe {match.score}</span>
            </div>
            {match.matchedSkills.length > 0 && (
              <div className="match-suggestion__skills">
                <span className="match-suggestion__skills-label">Atende:</span>
                {match.matchedSkills.map((s, i) => (
                  <span className="chip" key={i}>{s}</span>
                ))}
              </div>
            )}
            <div className="match-suggestion__action">
              {alreadyHere ? (
                <span className="match-suggestion__here">✓ Já está na vaga de melhor encaixe</span>
              ) : (
                <button className="btn sm" onClick={() => onMove?.(match.vaga.id)}>
                  Mover para esta vaga
                </button>
              )}
            </div>
          </div>
        )}

        {vagas.length > 0 && (
          <div className="compare-block">
            <button className="btn ghost sm" disabled={comparing} onClick={handleCompare}>
              {comparing ? 'Comparando… (pode levar alguns segundos)' : 'Comparar com outras vagas'}
            </button>

            {compareError && (
              <div className="compare-error">{compareError}</div>
            )}

            {compareResults && compareResults.length > 0 && (
              <div className="compare-results">
                <div className="compare-results__label">Notas da IA nas melhores vagas</div>
                {compareResults.map((r, i) => (
                  <div
                    className={`compare-row${i === 0 && !r.error ? ' is-best' : ''}${r.error ? ' has-error' : ''}`}
                    key={r.vaga_id || i}
                  >
                    <div className="compare-row__main">
                      <div className="compare-row__head">
                        <strong>{r.title || 'Vaga'}</strong>
                        {r.error ? (
                          <span className="score-pill tier-weak">—</span>
                        ) : (
                          <ScorePill score={r.score} />
                        )}
                      </div>
                      {r.error ? (
                        <div className="compare-row__err">{r.error}</div>
                      ) : (
                        <>
                          <div className="compare-row__meta">{seniorityLabel(r.seniority_estimate)}</div>
                          {r.strengths?.length > 0 && (
                            <div className="compare-row__skills">
                              {r.strengths.slice(0, 3).map((s, j) => (
                                <span className="chip" key={j}>{s}</span>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {!r.error && (
                      <button className="btn sm" onClick={() => onMove?.(r.vaga_id)}>
                        Mover para esta vaga
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="detail-actions">
          <select
            title="Mover para vaga"
            value={candidate.vaga_id || ''}
            onChange={(e) => onMove?.(e.target.value)}
          >
            <option value="">Sem vaga</option>
            {vagas.map((v) => (
              <option key={v.id} value={v.id}>{v.title}</option>
            ))}
          </select>
          {hasVaga ? (
            <button
              className={`btn sm${scoreStale ? '' : ' ghost'}`}
              disabled={reevaluating}
              onClick={handleReevaluate}
            >
              {reevaluating ? 'Reavaliando…' : 'Reavaliar para esta vaga'}
            </button>
          ) : (
            <span className="muted reevaluate-hint">Mova para uma vaga para poder reavaliar.</span>
          )}
          <button className="btn ghost sm" onClick={() => onToggleArchive?.()}>
            {candidate.archived ? 'Tirar de guardados' : 'Guardar'}
          </button>
          <span className="spacer" />
          <button className="btn danger sm" onClick={() => onDelete?.()}>Excluir candidato</button>
        </div>

        <button className="btn ghost sm" style={{ marginTop: 4 }} onClick={() => setShowScore((s) => !s)}>
          {showScore ? '▾' : '▸'} Como chegamos na nota
        </button>
        {showScore && (
          <div style={{ marginTop: 8 }}>
            <div className="kv"><span className="k">Combinação de habilidades</span><span>{bd.skill_match ?? '—'}</span></div>
            <div className="kv"><span className="k">Nível de experiência</span><span>{bd.seniority ?? '—'}</span></div>
            <div className="kv"><span className="k">Desconto por pontos de atenção</span><span>{penalty > 0 ? `-${penalty}` : penalty}</span></div>
            <div className="kv"><span className="k">Confiança da leitura</span><span>{an.confidence != null ? `${Math.round(an.confidence * 100)}%` : '—'}</span></div>
          </div>
        )}

        <div className="section-title">Contato</div>
        <div className="kv"><span className="k">E-mail</span><span>{na(contact.email)}</span></div>
        <div className="kv"><span className="k">Telefone</span><span>{na(contact.phone)}</span></div>
        <div className="kv"><span className="k">Local</span><span>{na(contact.location)}</span></div>
        {ex.years_experience_total != null && (
          <div className="kv"><span className="k">Tempo de experiência</span><span>{ex.years_experience_total} anos</span></div>
        )}

        {ex.summary && (
          <>
            <div className="section-title">Resumo</div>
            <p style={{ margin: 0 }}>{ex.summary}</p>
          </>
        )}

        {ex.skills?.length > 0 && (
          <>
            <div className="section-title">Principais habilidades</div>
            <div>{ex.skills.map((s, i) => <span className="chip" key={i}>{s}</span>)}</div>
          </>
        )}

        <BulletBlock title="Pontos fortes" items={an.strengths} />
        <BulletBlock title="Pode faltar / atenção" items={an.weaknesses} />
        <BulletBlock title="Confirmar na entrevista" items={an.points_to_check} />
        <BulletBlock title="Pontos de atenção" items={an.red_flags} kind="flag" />

        {ex.roles?.length > 0 && (
          <>
            <div className="section-title">Onde já trabalhou</div>
            {ex.roles.map((r, i) => (
              <div className="role-item" key={i}>
                <div className="role-title">{na(r.title)}{r.company ? ` — ${r.company}` : ''}</div>
                <div className="role-meta">
                  {r.start_date || '?'} → {r.is_current ? 'atual' : r.end_date || '?'}
                </div>
                {r.summary && <div style={{ fontSize: 14, marginTop: 2 }}>{r.summary}</div>}
              </div>
            ))}
          </>
        )}

        {ex.education?.length > 0 && (
          <>
            <div className="section-title">Estudos</div>
            {ex.education.map((e, i) => (
              <div className="role-item" key={i}>
                <div className="role-title">{na(e.degree)}</div>
                <div className="role-meta">
                  {[e.institution, e.level, e.end_year].filter(Boolean).join(' · ')}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
