import React from 'react';

// TELA A — Início / Vagas. Grid of vaga cards + "Nova vaga" + shortcuts.
export default function VagasHome({
  vagas,
  candidates,
  onOpenVaga,
  onNewVaga,
  onOpenNone,
  onOpenAll,
}) {
  const notArchived = (c) => !c.archived;
  const countFor = (id) => candidates.filter((c) => notArchived(c) && c.vaga_id === id).length;
  const reviewFor = (id) =>
    candidates.filter((c) => notArchived(c) && c.vaga_id === id && c.meta?.needs_review).length;

  const countNone = candidates.filter((c) => notArchived(c) && !c.vaga_id).length;
  const countAll = candidates.filter(notArchived).length;

  // First-use empty state: no vagas at all.
  if (vagas.length === 0) {
    return (
      <div className="card empty">
        <h2 style={{ marginTop: 0 }}>Bem-vindo(a)! Comece criando sua primeira vaga.</h2>
        <p style={{ maxWidth: '52ch', margin: '0 auto 20px' }}>
          Uma vaga é onde você junta os currículos de uma mesma função — por exemplo
          "Motorista Entregador" ou "Vendedor Externo".
        </p>
        <button className="btn lg" onClick={onNewVaga}>＋ Criar primeira vaga</button>
      </div>
    );
  }

  return (
    <div>
      <div className="vagas-grid">
        {vagas.map((v) => {
          const meta = [v.department, v.location].filter(Boolean).join(' · ');
          const nReview = reviewFor(v.id);
          return (
            <div
              key={v.id}
              className="vaga-card"
              role="button"
              tabIndex={0}
              onClick={() => onOpenVaga(v.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpenVaga(v.id)}
            >
              <div className="vaga-card__top">
                <div className="vaga-card__title">{v.title}</div>
                <span className="chip open">Aberta</span>
              </div>
              {meta && <div className="vaga-card__meta">{meta}</div>}
              {v.employment_type && (
                <div className="vaga-card__type">
                  <span className="chip">{v.employment_type}</span>
                </div>
              )}
              <div className="vaga-card__stats">
                <div className="vaga-card__stat">
                  <span className="num">{countFor(v.id)}</span>
                  <span className="lbl">candidatos</span>
                </div>
                <div className="vaga-card__stat">
                  <span className="num">{v.openings ?? 1}</span>
                  <span className="lbl">vagas</span>
                </div>
                {nReview > 0 && (
                  <div className="vaga-card__stat">
                    <span className="num" style={{ color: 'var(--medium)' }}>{nReview}</span>
                    <span className="lbl">pra revisar</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <button className="vaga-card--new" onClick={onNewVaga}>
          <span className="plus">＋</span>
          Nova vaga
        </button>
      </div>

      <div className="vagas-shortcuts">
        <button className="btn ghost" onClick={onOpenNone}>
          Currículos sem vaga ({countNone})
        </button>
        <button className="btn ghost" onClick={onOpenAll}>
          Ver todos os candidatos ({countAll})
        </button>
      </div>
    </div>
  );
}
