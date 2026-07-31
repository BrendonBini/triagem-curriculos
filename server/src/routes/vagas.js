import express from 'express';
import * as vagas from '../services/vagasStore.js';
import { unassignVaga } from '../services/store.js';

const router = express.Router();

// GET /api/vagas
router.get('/', async (_req, res) => {
  res.json(await vagas.getAll());
});

// POST /api/vagas
router.post('/', async (req, res) => {
  const { title, role, skills, department, location, employment_type, openings, description } =
    req.body || {};
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Informe um título para a vaga.' });
  }
  const vaga = await vagas.create({
    title,
    role,
    skills,
    department,
    location,
    employment_type,
    openings,
    description,
  });
  res.status(201).json(vaga);
});

// PATCH /api/vagas/:id
router.patch('/:id', async (req, res) => {
  const updated = await vagas.update(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Vaga não encontrada.' });
  res.json(updated);
});

// DELETE /api/vagas/:id — detaches its candidates (they become "sem vaga").
router.delete('/:id', async (req, res) => {
  const ok = await vagas.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Vaga não encontrada.' });
  const detached = await unassignVaga(req.params.id);
  res.json({ ok: true, detached });
});

export default router;
