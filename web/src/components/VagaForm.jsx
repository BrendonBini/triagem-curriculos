import React, { useState } from 'react';
import { EMPLOYMENT_TYPES } from '../labels.js';

// Full-screen create/edit form for a vaga. `initial` present => edit mode.
// Grouped in 3 blocks; only `title` is required (see docs/UX-redesign.md §3).
export default function VagaForm({ initial, onSave, onCancel, onDelete }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [department, setDepartment] = useState(initial?.department || '');
  const [location, setLocation] = useState(initial?.location || '');
  const [employmentType, setEmploymentType] = useState(initial?.employment_type || '');
  const [openings, setOpenings] = useState(initial?.openings ?? 1);
  const [description, setDescription] = useState(initial?.description || '');
  const [role, setRole] = useState(initial?.role || '');
  const [skills, setSkills] = useState(initial?.skills || '');
  const [showScoring, setShowScoring] = useState(Boolean(initial?.role || initial?.skills));
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({
        title,
        department,
        location,
        employment_type: employmentType,
        openings: Number(openings) || 1,
        description,
        role,
        skills,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card vaga-form">
      <h2 style={{ marginTop: 0 }}>{initial ? 'Editar vaga' : 'Nova vaga'}</h2>

      {/* Bloco 1 — O básico (o que aparece no card) */}
      <div className="section-title" style={{ marginTop: 8 }}>O básico</div>
      <div className="form-grid">
        <div className="field field--full">
          <label>Nome da vaga *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Motorista Entregador CNH D"
            autoFocus
          />
        </div>
        <div className="field">
          <label>Setor / área</label>
          <input
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="Ex.: Distribuição, Vendas, Depósito"
          />
        </div>
        <div className="field">
          <label>Local / unidade</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Ex.: CD Ribeirão Preto, Filial Centro"
          />
        </div>
        <div className="field">
          <label>Tipo de contratação</label>
          <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
            <option value="">Selecione…</option>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Quantas vagas?</label>
          <input
            className="openings"
            type="number"
            min="1"
            value={openings}
            onChange={(e) => setOpenings(e.target.value)}
            placeholder="1"
          />
        </div>
      </div>

      {/* Bloco 2 — Descrição */}
      <div className="section-title">Descrição</div>
      <div className="form-grid">
        <div className="field field--full">
          <label>O que a pessoa vai fazer / requisitos</label>
          <textarea
            className="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: Entregar bebidas na rota da região; carga e descarga; CNH D válida; experiência com caminhão 3/4."
          />
        </div>
      </div>

      {/* Bloco 3 — Pontuação (recolhível) */}
      <button
        type="button"
        className="btn ghost sm"
        style={{ marginTop: 12 }}
        onClick={() => setShowScoring((s) => !s)}
      >
        {showScoring ? '▾' : '▸'} Ajustar como os currículos são pontuados (opcional)
      </button>
      {showScoring && (
        <div className="form-grid" style={{ marginTop: 12 }}>
          <div className="field field--full">
            <label>Cargo / função de referência</label>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Ex.: Motorista Entregador"
            />
            <div className="field-hint">Usado para calcular a nota do candidato.</div>
          </div>
          <div className="field field--full">
            <label>Habilidades desejadas</label>
            <input
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              placeholder="Ex.: CNH D, carga/descarga, rota, atendimento"
            />
            <div className="field-hint">Separe por vírgulas. Usado para calcular a nota.</div>
          </div>
        </div>
      )}

      <div className="vaga-form__footer">
        <button className="btn" onClick={submit} disabled={!title.trim() || saving}>
          {saving ? 'Salvando…' : initial ? 'Salvar alterações' : 'Criar vaga'}
        </button>
        <button className="btn ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
        {initial && onDelete && (
          <>
            <span className="spacer" />
            <button className="btn danger" onClick={() => onDelete(initial)} disabled={saving}>
              Excluir vaga
            </button>
          </>
        )}
      </div>
    </div>
  );
}
