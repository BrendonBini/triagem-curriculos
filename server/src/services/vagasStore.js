// Local persistence for "vagas" (job postings). Same simple JSON-file approach.
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'vagas.json');

let writeChain = Promise.resolve();

async function readAll() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function persist(list) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

function enqueue(fn) {
  const p = writeChain.then(async () => fn(await readAll()));
  writeChain = p.then(() => {}, () => {});
  return p;
}

export async function getAll() {
  return readAll();
}

export async function getById(id) {
  const list = await readAll();
  return list.find((v) => v.id === id) || null;
}

// Coerce "openings" to an integer >= 1; default 1 when absent/invalid.
function sanitizeOpenings(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function create({
  title,
  role,
  skills,
  department,
  location,
  employment_type,
  openings,
  description,
}) {
  return enqueue(async (list) => {
    const vaga = {
      id: randomUUID(),
      title: (title || '').trim() || 'Vaga sem título',
      role: (role || '').trim(),
      skills: (skills || '').trim(),
      department: (department || '').trim(),
      location: (location || '').trim(),
      employment_type: (employment_type || '').trim(),
      openings: sanitizeOpenings(openings),
      description: (description || '').trim(),
      archived: false,
      created_at: new Date().toISOString(),
    };
    list.push(vaga);
    await persist(list);
    return vaga;
  });
}

export function update(id, patch) {
  return enqueue(async (list) => {
    const idx = list.findIndex((v) => v.id === id);
    if (idx === -1) return null;
    const allowed = {};
    const keys = [
      'title',
      'role',
      'skills',
      'archived',
      'department',
      'location',
      'employment_type',
      'openings',
      'description',
    ];
    for (const k of keys) {
      if (k in patch) allowed[k] = patch[k];
    }
    if ('openings' in allowed) allowed.openings = sanitizeOpenings(allowed.openings);
    list[idx] = { ...list[idx], ...allowed };
    await persist(list);
    return list[idx];
  });
}

export function remove(id) {
  return enqueue(async (list) => {
    const idx = list.findIndex((v) => v.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    await persist(list);
    return true;
  });
}
