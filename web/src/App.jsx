import React, { useEffect, useMemo, useState } from 'react';
import VagasHome from './components/VagasHome.jsx';
import VagaView from './components/VagaView.jsx';
import CandidateDetail from './components/CandidateDetail.jsx';
import VagaForm from './components/VagaForm.jsx';
import {
  getCandidates,
  getHealth,
  uploadCandidates,
  patchCandidate,
  deleteCandidate,
  reevaluateCandidate as apiReevaluateCandidate,
  getVagas,
  createVaga,
  updateVaga,
  deleteVaga,
} from './api.js';

// Simple view-state navigation (no router). See docs/UX-redesign.md §1.
// view: 'home' | 'vaga' | 'candidate' | 'form'
export default function App() {
  const [candidates, setCandidates] = useState([]);
  const [vagas, setVagas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [health, setHealth] = useState(null);
  const [lastRun, setLastRun] = useState(null);

  const [view, setView] = useState('home');
  const [selectedVaga, setSelectedVaga] = useState('all'); // 'all' | 'none' | <id>
  const [selectedId, setSelectedId] = useState(null);
  const [editingVaga, setEditingVaga] = useState(null); // null | 'new' | <id>

  const [filters, setFilters] = useState({
    query: '',
    minScore: 0,
    seniority: 'all',
    onlyFlags: false,
    showArchived: false,
  });
  const [sort, setSort] = useState({ key: 'score', dir: 'desc' });

  async function refresh() {
    try {
      const data = await getCandidates();
      setCandidates(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadVagas() {
    try {
      setVagas(await getVagas());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth({ ok: false }));
    loadVagas();
    refresh();
  }, []);

  const activeVagas = useMemo(() => vagas.filter((v) => v.archived !== true), [vagas]);
  const activeVaga = useMemo(
    () => activeVagas.find((v) => v.id === selectedVaga) || null,
    [activeVagas, selectedVaga]
  );

  // ---- Navigation ----
  function openVaga(scope) {
    setSelectedVaga(scope);
    setSelectedId(null);
    setLastRun(null);
    setView('vaga');
  }
  function backToHome() {
    setSelectedId(null);
    setLastRun(null);
    loadVagas();
    setView('home');
  }
  function openCandidate(id) {
    setSelectedId(id);
    setView('candidate');
  }
  function openNewVaga() {
    setEditingVaga('new');
    setView('form');
  }
  function openEditVaga(id) {
    setEditingVaga(id);
    setView('form');
  }

  // ---- Upload ----
  async function handleUpload(files, target) {
    setUploading(true);
    setError(null);
    setLastRun(null);
    try {
      const res = await uploadCandidates(files, target);
      setLastRun(res);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  // ---- Vaga CRUD ----
  async function handleSaveVaga(data) {
    try {
      if (editingVaga === 'new') {
        const created = await createVaga(data);
        await loadVagas();
        setEditingVaga(null);
        openVaga(created.id);
      } else {
        await updateVaga(editingVaga, data);
        await loadVagas();
        setEditingVaga(null);
        setView('vaga');
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDeleteVaga(vaga) {
    if (!confirm(
      `Excluir a vaga "${vaga.title}"? Os currículos enviados para ela não são apagados — ` +
      'eles voltam para "Sem vaga". Esta ação não pode ser desfeita.'
    )) return;
    try {
      await deleteVaga(vaga.id);
      setEditingVaga(null);
      await loadVagas();
      await refresh();
      backToHome();
    } catch (e) {
      setError(e.message);
    }
  }

  // ---- Candidate actions (detail) ----
  const selected = candidates.find((c) => c.id === selectedId) || null;

  async function moveCandidate(vagaId) {
    if (!selected) return;
    try {
      await patchCandidate(selected.id, { vaga_id: vagaId || null });
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function toggleArchiveCandidate() {
    if (!selected) return;
    try {
      await patchCandidate(selected.id, { archived: !selected.archived });
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function reevaluateCandidate() {
    if (!selected) return;
    try {
      await apiReevaluateCandidate(selected.id);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function removeCandidate() {
    if (!selected) return;
    const name = selected.extraction?.full_name || 'sem nome';
    if (!confirm(
      `Excluir o candidato "${name}"? O currículo analisado será removido. ` +
      'Esta ação não pode ser desfeita.'
    )) return;
    try {
      await deleteCandidate(selected.id);
      setSelectedId(null);
      await refresh();
      setView('vaga');
    } catch (e) {
      setError(e.message);
    }
  }

  // ---- Derived data for the vaga view ----
  const seniorityOptions = useMemo(() => {
    const set = new Set(candidates.map((c) => c.analysis?.seniority_estimate).filter(Boolean));
    return ['all', ...set];
  }, [candidates]);

  const scopeCandidates = useMemo(() => candidates.filter((c) => {
    if (selectedVaga === 'none') return !c.vaga_id;
    if (selectedVaga !== 'all') return c.vaga_id === selectedVaga;
    return true;
  }), [candidates, selectedVaga]);

  const filtered = useMemo(() => {
    let list = scopeCandidates.filter((c) => {
      if (!filters.showArchived && c.archived) return false;
      const ex = c.extraction || {};
      const an = c.analysis || {};
      if ((an.score ?? 0) < filters.minScore) return false;
      if (filters.seniority !== 'all' && an.seniority_estimate !== filters.seniority) return false;
      if (filters.onlyFlags && !(an.red_flags?.length > 0)) return false;
      if (filters.query) {
        const hay = `${ex.full_name || ''} ${(ex.skills || []).join(' ')}`.toLowerCase();
        if (!hay.includes(filters.query.toLowerCase())) return false;
      }
      return true;
    });

    const dir = sort.dir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      const av = sortVal(a, sort.key);
      const bv = sortVal(b, sort.key);
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * dir;
      }
      return (av - bv) * dir;
    });
    return list;
  }, [scopeCandidates, filters, sort]);

  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
  }

  const backLabel = selectedVaga === 'none'
    ? '← Currículos sem vaga'
    : selectedVaga === 'all'
      ? '← Todos os candidatos'
      : '← Voltar para a vaga';

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Triagem de Currículos com IA</h1>
          <div className="sub">Selecione uma vaga para ver os candidatos</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {health && (
            <span className={`badge ${health.hasApiKey ? 'ok' : 'warn'}`}>
              {health.hasApiKey ? `IA: ${health.model}` : 'IA sem chave'}
            </span>
          )}
          {view === 'home' && (
            <button className="btn lg" onClick={openNewVaga}>＋ Nova vaga</button>
          )}
        </div>
      </header>

      {health && !health.hasApiKey && (
        <div className="warn-banner">
          ⚠ Nenhuma chave da API configurada (provider: <strong>{health.provider}</strong>).
          Crie <code>server/.env</code> a partir de <code>server/.env.example</code> com
          {' '}<code>{health.keyEnvVar || 'GEMINI_API_KEY'}</code> e reinicie o servidor.
        </div>
      )}
      {error && <div className="error-banner">{error}</div>}

      {view === 'home' && (
        loading ? (
          <div className="card loading"><div className="spinner" />Carregando…</div>
        ) : (
          <VagasHome
            vagas={activeVagas}
            candidates={candidates}
            onOpenVaga={openVaga}
            onNewVaga={openNewVaga}
            onOpenNone={() => openVaga('none')}
            onOpenAll={() => openVaga('all')}
          />
        )
      )}

      {view === 'form' && (
        <>
          <button className="btn-back" onClick={() => (editingVaga === 'new' ? backToHome() : setView('vaga'))}>
            ← Voltar
          </button>
          <VagaForm
            initial={editingVaga === 'new' ? undefined : activeVaga}
            onSave={handleSaveVaga}
            onCancel={() => (editingVaga === 'new' ? backToHome() : setView('vaga'))}
            onDelete={editingVaga === 'new' ? undefined : handleDeleteVaga}
          />
        </>
      )}

      {view === 'vaga' && (
        uploading ? (
          <>
            <button className="btn-back" onClick={backToHome}>← Vagas</button>
            <div className="card loading">
              <div className="spinner" />
              Lendo e analisando… isso pode levar alguns segundos por currículo.
            </div>
          </>
        ) : (
          <VagaView
            scope={selectedVaga}
            vaga={activeVaga}
            scopeCandidates={scopeCandidates}
            filtered={filtered}
            seniorityOptions={seniorityOptions}
            filters={filters}
            setFilters={setFilters}
            sort={sort}
            onSort={toggleSort}
            loading={loading}
            uploading={uploading}
            lastRun={lastRun}
            onBack={backToHome}
            onEditVaga={openEditVaga}
            onSelectCandidate={openCandidate}
            onUpload={handleUpload}
          />
        )
      )}

      {view === 'candidate' && (
        <CandidateDetail
          candidate={selected}
          vagas={activeVagas}
          backLabel={backLabel}
          onBack={() => setView('vaga')}
          onMove={moveCandidate}
          onReevaluate={reevaluateCandidate}
          onToggleArchive={toggleArchiveCandidate}
          onDelete={removeCandidate}
        />
      )}
    </div>
  );
}

function sortVal(c, key) {
  const an = c.analysis || {};
  switch (key) {
    case 'name': return c.extraction?.full_name || '';
    case 'seniority': return an.seniority_estimate || '';
    case 'flags': return an.red_flags?.length || 0;
    case 'score':
    default: return an.score ?? 0;
  }
}
