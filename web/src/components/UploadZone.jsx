import React, { useEffect, useRef, useState } from 'react';

const ACCEPT = '.pdf,.docx,.jpg,.jpeg,.png';

// Guided upload block. The destination is ALWAYS the current context (the given
// `vaga`, or "Sem vaga" when null) — no destination picker. role/skills are
// prefilled from the vaga and hidden behind an optional toggle.
export default function UploadZone({ onUpload, uploading, vaga = null }) {
  const [files, setFiles] = useState([]);
  const [drag, setDrag] = useState(false);
  const [role, setRole] = useState(vaga?.role || '');
  const [skills, setSkills] = useState(vaga?.skills || '');
  const [showScoring, setShowScoring] = useState(false);
  const inputRef = useRef(null);

  // Keep the prefilled scoring hints in sync when the context vaga changes.
  useEffect(() => {
    setRole(vaga?.role || '');
    setSkills(vaga?.skills || '');
  }, [vaga?.id]);

  function addFiles(list) {
    const arr = Array.from(list).filter((f) => /\.(pdf|docx|jpe?g|png)$/i.test(f.name));
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name + f.size));
      return [...prev, ...arr.filter((f) => !names.has(f.name + f.size))];
    });
  }

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleDrop(e) {
    e.preventDefault();
    setDrag(false);
    addFiles(e.dataTransfer.files);
  }

  function submit() {
    if (!files.length || uploading) return;
    onUpload(files, { role, skills, vagaId: vaga?.id || undefined });
    setFiles([]);
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Enviar currículos para esta vaga</h3>
      <p className="field-hint" style={{ marginTop: 0 }}>
        Os currículos vão para: <strong>{vaga ? vaga.title : 'Sem vaga — você organiza depois'}</strong>
      </p>

      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
      >
        <p><strong>Arraste currículos aqui (PDF, DOCX ou foto/imagem)</strong> ou clique para escolher</p>
        <p style={{ fontSize: 13 }}>Pode mandar vários de uma vez (PDF, Word ou imagem). Máx. 10MB cada.</p>
        <p style={{ fontSize: 13 }}>Aceita também foto do currículo (JPG/PNG) e PDF escaneado. Para foto, prefira imagem nítida e reta.</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {files.map((f, i) => (
            <div className="file-row" key={f.name + i}>
              <span>{f.name}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: 'var(--text-dim)' }}>{(f.size / 1024).toFixed(0)} KB</span>
                <button
                  type="button"
                  className="file-remove"
                  title="Remover este arquivo"
                  onClick={() => removeFile(i)}
                >
                  ✕
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="btn ghost sm"
        style={{ marginTop: 12 }}
        onClick={() => setShowScoring((s) => !s)}
      >
        {showScoring ? '▾' : '▸'} Ajustar o que é mais importante (opcional)
      </button>
      {showScoring && (
        <>
          <div className="field" style={{ marginTop: 10 }}>
            <label>Cargo / função de referência</label>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Ex.: Motorista Entregador"
            />
          </div>
          <div className="field">
            <label>Habilidades desejadas</label>
            <input
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              placeholder="Ex.: CNH D, carga/descarga, rota, atendimento"
            />
          </div>
        </>
      )}

      <button
        className="btn lg block"
        style={{ marginTop: 16 }}
        disabled={!files.length || uploading}
        onClick={submit}
      >
        {uploading
          ? 'Lendo e analisando…'
          : `Analisar ${files.length || ''} currículo${files.length === 1 ? '' : 's'}`.trim()}
      </button>
    </div>
  );
}
