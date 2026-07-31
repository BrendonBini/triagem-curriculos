import React, { useState } from 'react';
import UploadZone from './UploadZone.jsx';
import CandidateList from './CandidateList.jsx';
import Charts from './Charts.jsx';
import { seniorityLabel } from '../labels.js';

// TELA B — dentro da vaga (ou "Sem vaga" / "Todos os candidatos").
export default function VagaView({
  scope, // 'all' | 'none' | <id>
  vaga, // vaga object when scope is an id; null otherwise
  scopeCandidates, // candidates in scope, before toolbar/archived filters
  filtered, // fully filtered + sorted list
  seniorityOptions,
  filters,
  setFilters,
  sort,
  onSort,
  loading,
  uploading,
  lastRun,
  onBack,
  onEditVaga,
  onSelectCandidate,
  onUpload,
}) {
  const isVaga = scope !== 'all' && scope !== 'none';
  const canUpload = scope !== 'all'; // "Todos" is read-only comparison view
  const [showUpload, setShowUpload] = useState(false);
  const [showDesc, setShowDesc] = useState(false);

  const title = isVaga ? vaga?.title : scope === 'none' ? 'Currículos sem vaga' : 'Todos os candidatos';
  const metaParts = isVaga
    ? [vaga?.department, vaga?.location, vaga?.employment_type,
       vaga?.openings ? `${vaga.openings} vaga${vaga.openings > 1 ? 's' : ''}` : null].filter(Boolean)
    : [];

  const hasScope = scopeCandidates.length > 0;
  const onlyArchivedHidden =
    !filters.showArchived && hasScope && scopeCandidates.every((c) => c.archived);

  function clearFilters() {
    setFilters((f) => ({ ...f, query: '', minScore: 0, seniority: 'all', onlyFlags: false }));
  }

  function openUpload() {
    setShowUpload(true);
    setTimeout(() => document.getElementById('upload-block')?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  // Empty state inside the list area.
  function renderEmpty() {
    if (!hasScope) {
      if (scope === 'none') {
        return (
          <div className="empty">
            <p><strong>Nenhum currículo solto por aqui.</strong></p>
            <p>Todos os currículos já estão dentro de uma vaga. Bom trabalho!</p>
            <button className="btn ghost" onClick={onBack}>← Voltar para as vagas</button>
          </div>
        );
      }
      if (scope === 'all') {
        return (
          <div className="empty">
            <p><strong>Você ainda não enviou nenhum currículo.</strong></p>
            <p>Abra uma vaga e envie os currículos por lá.</p>
            <button className="btn ghost" onClick={onBack}>← Voltar para as vagas</button>
          </div>
        );
      }
      return (
        <div className="empty">
          <p><strong>Esta vaga ainda não tem currículos.</strong></p>
          <p>Envie os currículos (PDF ou Word) das pessoas que se candidataram a esta vaga.
            O sistema lê e organiza sozinho, do melhor para o pior.</p>
          <button className="btn lg" onClick={openUpload}>⬆ Enviar currículos para esta vaga</button>
        </div>
      );
    }
    if (onlyArchivedHidden) {
      return (
        <div className="empty">
          <p><strong>Todos os currículos desta vaga estão guardados.</strong></p>
          <button className="btn ghost" onClick={() => setFilters((f) => ({ ...f, showArchived: true }))}>
            Mostrar guardados
          </button>
        </div>
      );
    }
    return (
      <div className="empty">
        <p><strong>Nenhum currículo com esses filtros.</strong> Tente diminuir a nota mínima ou limpar os filtros.</p>
        <button className="btn ghost" onClick={clearFilters}>Limpar filtros</button>
      </div>
    );
  }

  return (
    <div>
      <button className="btn-back" onClick={onBack}>← Vagas</button>

      <div className="vaga-header">
        <div className="vaga-header__top">
          <h2>{title}</h2>
          {isVaga && (
            <button className="btn ghost sm" onClick={() => onEditVaga(vaga.id)}>Editar vaga</button>
          )}
        </div>
        {metaParts.length > 0 && <div className="vaga-header__meta">{metaParts.join(' · ')}</div>}
        {isVaga && vaga?.description && (
          <div style={{ marginTop: 8 }}>
            <button className="btn-link" onClick={() => setShowDesc((s) => !s)}>
              {showDesc ? 'Ocultar requisitos da vaga' : 'Ver requisitos da vaga'}
            </button>
            {showDesc && <div className="vaga-header__desc">{vaga.description}</div>}
          </div>
        )}
        {canUpload && (
          <div className="vaga-header__cta">
            <button className="btn lg" onClick={() => (showUpload ? setShowUpload(false) : openUpload())}>
              ＋ Enviar currículos {isVaga ? 'para esta vaga' : ''}
            </button>
          </div>
        )}
      </div>

      {canUpload && showUpload && (
        <div id="upload-block" style={{ marginBottom: 20 }}>
          <UploadZone onUpload={onUpload} uploading={uploading} vaga={isVaga ? vaga : null} />
        </div>
      )}

      {lastRun && (
        <div className="results-summary card">
          <strong>Prontos: {lastRun.succeeded}</strong> · Com problema: {lastRun.failed}
          {lastRun.failed > 0 && (
            <ul className="bullet-list" style={{ marginTop: 8 }}>
              {lastRun.results
                .filter((r) => r.source_file.status === 'failed')
                .map((r) => (
                  <li key={r.id}>
                    <strong>{r.source_file.filename}</strong>: {r.error?.message || 'não pôde ser lido'}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {filtered.length > 0 && <Charts candidates={filtered} />}

      <div className="card" style={{ marginTop: 20 }}>
        <div className="toolbar">
          <input
            placeholder="Buscar por nome ou habilidade…"
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
          />
          <select
            value={filters.seniority}
            onChange={(e) => setFilters((f) => ({ ...f, seniority: e.target.value }))}
          >
            {seniorityOptions.map((s) => (
              <option key={s} value={s}>{s === 'all' ? 'Todo nível de experiência' : seniorityLabel(s)}</option>
            ))}
          </select>
          <label className="toolbar__inline">
            Nota mín.
            <input
              type="number" min="0" max="100" value={filters.minScore} style={{ width: 70 }}
              onChange={(e) => setFilters((f) => ({ ...f, minScore: Number(e.target.value) || 0 }))}
            />
          </label>
          <label className="toolbar__inline">
            <input
              type="checkbox"
              checked={filters.onlyFlags}
              onChange={(e) => setFilters((f) => ({ ...f, onlyFlags: e.target.checked }))}
            />
            Só com pontos de atenção
          </label>
          <label className="toolbar__inline">
            <input
              type="checkbox"
              checked={filters.showArchived}
              onChange={(e) => setFilters((f) => ({ ...f, showArchived: e.target.checked }))}
            />
            Mostrar guardados
          </label>
        </div>

        <p className="field-hint" style={{ marginTop: 0 }}>
          <strong>Nota de aderência:</strong> de 0 a 100, mostra o quanto cada currículo combina com
          esta vaga. Quanto maior, mais perto do que você pediu. É uma sugestão — a decisão é sua.
        </p>

        {loading ? (
          <div className="loading"><div className="spinner" />Carregando…</div>
        ) : filtered.length === 0 ? (
          renderEmpty()
        ) : (
          <CandidateList
            candidates={filtered}
            selectedId={null}
            onSelect={onSelectCandidate}
            sort={sort}
            onSort={onSort}
          />
        )}
      </div>
    </div>
  );
}
