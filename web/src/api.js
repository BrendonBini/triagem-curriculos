// Thin API wrapper. Uses relative URLs (Vite proxies /api to the backend).

async function jsonOrThrow(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || fallback);
  return data;
}

export async function getHealth() {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error('health_failed');
  return res.json();
}

// ---- Candidates ----
export async function getCandidates() {
  const res = await fetch('/api/candidates');
  return jsonOrThrow(res, 'Falha ao carregar candidatos.');
}

export async function uploadCandidates(files, { role, skills, vagaId } = {}) {
  const form = new FormData();
  for (const f of files) form.append('files', f);
  if (role) form.append('targetRole', role);
  if (skills) form.append('targetSkills', skills);
  if (vagaId) form.append('vagaId', vagaId);

  const res = await fetch('/api/candidates', { method: 'POST', body: form });
  return jsonOrThrow(res, 'Falha no envio.');
}

export async function patchCandidate(id, patch) {
  const res = await fetch(`/api/candidates/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return jsonOrThrow(res, 'Falha ao atualizar candidato.');
}

export async function deleteCandidate(id) {
  const res = await fetch(`/api/candidates/${id}`, { method: 'DELETE' });
  return jsonOrThrow(res, 'Falha ao excluir candidato.');
}

// Re-runs the AI analysis against the vaga the candidate currently sits in.
export async function reevaluateCandidate(id) {
  const res = await fetch(`/api/candidates/${id}/reevaluate`, { method: 'POST' });
  return jsonOrThrow(res, 'Falha ao reavaliar candidato.');
}

// On-demand: asks the AI to score this candidate against a short list of vagas.
// The frontend pre-ranks the open vagas and sends only the best few ids.
export async function compareVagas(id, vagaIds) {
  const res = await fetch(`/api/candidates/${id}/compare-vagas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vagaIds }),
  });
  return jsonOrThrow(res, 'Falha ao comparar com outras vagas.');
}

export async function clearCandidates() {
  const res = await fetch('/api/candidates', { method: 'DELETE' });
  return jsonOrThrow(res, 'Falha ao limpar.');
}

// ---- Vagas ----
export async function getVagas() {
  const res = await fetch('/api/vagas');
  return jsonOrThrow(res, 'Falha ao carregar vagas.');
}

export async function createVaga(vaga) {
  const res = await fetch('/api/vagas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vaga),
  });
  return jsonOrThrow(res, 'Falha ao criar vaga.');
}

export async function updateVaga(id, patch) {
  const res = await fetch(`/api/vagas/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return jsonOrThrow(res, 'Falha ao atualizar vaga.');
}

export async function deleteVaga(id) {
  const res = await fetch(`/api/vagas/${id}`, { method: 'DELETE' });
  return jsonOrThrow(res, 'Falha ao excluir vaga.');
}
