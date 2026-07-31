import React from 'react';
import ScorePill from './ScorePill.jsx';
import { seniorityLabel } from '../labels.js';

export default function CandidateList({ candidates, selectedId, onSelect, sort, onSort }) {
  function header(label, key) {
    const active = sort.key === key;
    return (
      <th onClick={() => onSort(key)}>
        {label} {active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
      </th>
    );
  }

  return (
    <table className="candidates">
      <thead>
        <tr>
          {header('Nome', 'name')}
          {header('Nota', 'score')}
          {header('Nível de experiência', 'seniority')}
          <th>Principais habilidades</th>
          {header('Pontos de atenção', 'flags')}
        </tr>
      </thead>
      <tbody>
        {candidates.map((c) => {
          const ex = c.extraction || {};
          const an = c.analysis || {};
          const flags = an.red_flags?.length || 0;
          return (
            <tr
              key={c.id}
              className={[c.id === selectedId ? 'selected' : '', c.archived ? 'archived' : ''].filter(Boolean).join(' ')}
              onClick={() => onSelect(c.id)}
            >
              <td>
                {ex.full_name || <span style={{ color: 'var(--text-dim)' }}>Sem nome</span>}
                {c.meta?.needs_review && <span className="chip review" style={{ marginLeft: 6 }}>Revisar manualmente</span>}
                {c.archived && <span className="chip archived" style={{ marginLeft: 6 }}>Guardado</span>}
              </td>
              <td><ScorePill score={an.score} /></td>
              <td>{seniorityLabel(an.seniority_estimate)}</td>
              <td>
                {(ex.skills || []).slice(0, 3).map((s, i) => (
                  <span className="chip" key={i}>{s}</span>
                ))}
                {(ex.skills?.length || 0) > 3 && (
                  <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                    +{ex.skills.length - 3}
                  </span>
                )}
              </td>
              <td>
                {flags > 0 ? <span className="chip flag">{flags} ponto{flags > 1 ? 's' : ''} de atenção</span> : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
