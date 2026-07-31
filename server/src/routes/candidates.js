import express from 'express';
import multer from 'multer';
import { getAll, getById, addMany, updateById, removeById, clearAll } from '../services/store.js';
import * as vagas from '../services/vagasStore.js';
import { processFile, mapLimit } from '../services/pipeline.js';
import { analyzeCv } from '../services/ai.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 50 }, // 10MB/file, up to 50 files
});

// `source_text` (the raw extracted CV text) is INTERNAL — kept only in
// persistence so /reevaluate can re-score without the original file. Never ship
// it to the frontend: strip it from every candidate object leaving this API.
function sanitize(candidate) {
  if (!candidate || typeof candidate !== 'object') return candidate;
  const { source_text, ...rest } = candidate;
  return rest;
}

// Build the AI scoring target from a vaga (same shape the upload route uses).
function targetFromVaga(vaga) {
  return {
    role: vaga?.role || '',
    skills: vaga?.skills || '',
    title: vaga?.title || '',
    description: vaga?.description || '',
  };
}

// POST /api/candidates — batch upload (multipart field "files").
// Optional: vagaId (organizes + derives the scoring target from the vaga).
router.post('/', upload.array('files', 50), async (req, res) => {
  const files = req.files || [];
  if (files.length === 0) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  const vagaId = req.body?.vagaId || null;
  let vaga = null;
  if (vagaId) {
    vaga = await vagas.getById(vagaId);
    if (!vaga) return res.status(400).json({ error: 'Vaga informada não existe.' });
  }

  // Explicit form fields win; otherwise fall back to the vaga's target.
  // title/description are carried as *context* so that "title-only" vagas
  // (role/skills empty — common for non-technical HR) still get a meaningful
  // fit score: the model infers the expected role from the job title/description.
  const target = {
    role: req.body?.targetRole || vaga?.role || '',
    skills: req.body?.targetSkills || vaga?.skills || '',
    title: vaga?.title || '',
    description: vaga?.description || '',
  };

  const results = await mapLimit(files, 4, (file) => processFile(file, target, vagaId));

  const ok = results.filter((r) => r.source_file.status === 'ok');
  if (ok.length) await addMany(ok);

  res.json({
    processed: results.length,
    succeeded: ok.length,
    failed: results.length - ok.length,
    results: results.map(sanitize),
  });
});

// GET /api/candidates — list all stored candidates (source_text stripped)
router.get('/', async (_req, res) => {
  const list = await getAll();
  res.json(list.map(sanitize));
});

// GET /api/candidates/:id — one candidate detail (source_text stripped)
router.get('/:id', async (req, res) => {
  const c = await getById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Candidato não encontrado.' });
  res.json(sanitize(c));
});

// POST /api/candidates/:id/reevaluate — re-run the AI analysis against the
// candidate's CURRENT vaga. Needed because a candidate keeps the score from
// whatever vaga it was uploaded to; moving it (PATCH vaga_id) does not re-score.
router.post('/:id/reevaluate', async (req, res) => {
  const existing = await getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Candidato não encontrado.' });

  if (!existing.source_text) {
    // Imported before source_text was persisted — nothing to re-analyze.
    return res.status(400).json({
      error:
        'Este currículo foi importado antes deste recurso. Reenvie o arquivo para poder reavaliar.',
    });
  }

  if (!existing.vaga_id) {
    return res.status(400).json({
      error: 'Mova o candidato para uma vaga antes de reavaliar.',
    });
  }

  const vaga = await vagas.getById(existing.vaga_id);
  if (!vaga) {
    // vaga_id points at a vaga that no longer exists.
    return res.status(400).json({
      error: 'A vaga atual do candidato não existe mais. Mova-o para uma vaga válida.',
    });
  }

  let result;
  try {
    result = await analyzeCv(existing.source_text, targetFromVaga(vaga));
  } catch (err) {
    // Reuse the typed failure convention from analyzeCv (err.userMessage).
    const status = err.message === 'missing_api_key' ? 500 : 502;
    return res.status(status).json({
      error: err.userMessage || 'Falha na análise por IA.',
    });
  }

  const now = new Date().toISOString();
  // Replace extraction/analysis/meta wholesale; preserve id, vaga_id, archived,
  // created_at, source_file and source_text (shallow merge does exactly this).
  const updated = await updateById(existing.id, {
    extraction: result.candidate.extraction,
    analysis: result.candidate.analysis,
    meta: {
      ...result.meta,
      scored_for_vaga_id: existing.vaga_id,
      extracted_at: now,
      rescored_at: now,
    },
  });

  if (!updated) return res.status(404).json({ error: 'Candidato não encontrado.' });
  res.json(sanitize(updated));
});

// POST /api/candidates/:id/compare-vagas — EXPLORATORY, read-only.
// Score one candidate against a short list of open vagas (chosen/ranked by the
// frontend heuristic) and return the REAL AI score for each. Nothing is
// persisted here: the candidate's saved score/vaga_id are untouched.
// Body: { vagaIds: string[] }.
router.post('/:id/compare-vagas', async (req, res) => {
  const existing = await getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Candidato não encontrado.' });

  if (!existing.source_text) {
    // Same guard/message convention as /reevaluate: no text -> can't re-score.
    return res.status(400).json({
      error:
        'Este currículo foi importado antes deste recurso. Reenvie o arquivo para poder comparar.',
    });
  }

  const requestedIds = Array.isArray(req.body?.vagaIds) ? req.body.vagaIds : [];

  // Keep only vagas that EXIST and are OPEN (archived !== true), preserving the
  // frontend's ranking order. COST GUARD: never score more than the top 3.
  const allVagas = await vagas.getAll();
  const byId = new Map(allVagas.map((v) => [v.id, v]));
  const validVagas = [];
  for (const id of requestedIds) {
    const vaga = byId.get(id);
    if (vaga && vaga.archived !== true) validVagas.push(vaga);
    if (validVagas.length === 3) break; // cap at the first 3 valid ones
  }

  if (validVagas.length === 0) {
    return res.status(400).json({ error: 'Nenhuma vaga aberta para comparar.' });
  }

  // Score each vaga independently. mapLimit(2) keeps us under provider rate
  // limits. A failure on ONE vaga degrades to a per-item error instead of
  // dropping the whole request.
  let sawSuccess = false;
  let lastError = null;
  const results = await mapLimit(validVagas, 2, async (vaga) => {
    try {
      const { candidate } = await analyzeCv(existing.source_text, targetFromVaga(vaga));
      sawSuccess = true;
      const analysis = candidate.analysis || {};
      const strengths = Array.isArray(analysis.strengths)
        ? analysis.strengths.slice(0, 3)
        : [];
      return {
        vaga_id: vaga.id,
        title: vaga.title,
        score: analysis.score ?? null,
        seniority_estimate: analysis.seniority_estimate ?? null,
        strengths,
      };
    } catch (err) {
      lastError = err;
      return {
        vaga_id: vaga.id,
        title: vaga.title,
        score: null,
        error: err.userMessage || 'Falha na análise por IA.',
      };
    }
  });

  // If EVERY vaga failed (e.g. missing_api_key across the board), surface a
  // global error following the /reevaluate convention instead of a 200 of
  // errors — this is a real outage, not a per-item hiccup.
  if (!sawSuccess && lastError) {
    const status = lastError.message === 'missing_api_key' ? 500 : 502;
    return res.status(status).json({
      error: lastError.userMessage || 'Falha na análise por IA.',
    });
  }

  // Rank by real score desc; items with error/null score sink to the bottom.
  results.sort((a, b) => {
    const sa = a.score ?? -Infinity;
    const sb = b.score ?? -Infinity;
    return sb - sa;
  });

  res.json({ candidate_id: existing.id, results });
});

// PATCH /api/candidates/:id — archive/unarchive or move to another vaga.
router.patch('/:id', async (req, res) => {
  const patch = {};
  if ('archived' in (req.body || {})) patch.archived = Boolean(req.body.archived);
  if ('vaga_id' in (req.body || {})) patch.vaga_id = req.body.vaga_id || null;
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'Nada para atualizar.' });
  }
  const updated = await updateById(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'Candidato não encontrado.' });
  res.json(sanitize(updated));
});

// DELETE /api/candidates/:id — remove one candidate permanently.
router.delete('/:id', async (req, res) => {
  const ok = await removeById(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Candidato não encontrado.' });
  res.json({ ok: true });
});

// DELETE /api/candidates — reset all (handy for demos)
router.delete('/', async (_req, res) => {
  await clearAll();
  res.json({ ok: true });
});

export default router;
