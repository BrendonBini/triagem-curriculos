// Dead-simple local persistence: one JSON file per collection. Good enough for a POC.
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'candidates.json');

// Serialize writes so concurrent batch inserts/edits don't clobber each other.
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

// Enqueue a read-modify-write on the chain and return its result.
function enqueue(fn) {
  const p = writeChain.then(async () => {
    const list = await readAll();
    return fn(list);
  });
  writeChain = p.then(() => {}, () => {});
  return p;
}

export async function getAll() {
  return readAll();
}

export async function getById(id) {
  const list = await readAll();
  return list.find((c) => c.id === id) || null;
}

export function addMany(candidates) {
  return enqueue(async (list) => {
    list.push(...candidates);
    await persist(list);
    return candidates;
  });
}

export function updateById(id, patch) {
  return enqueue(async (list) => {
    const idx = list.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...patch };
    await persist(list);
    return list[idx];
  });
}

export function removeById(id) {
  return enqueue(async (list) => {
    const idx = list.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    await persist(list);
    return true;
  });
}

// When a vaga is deleted, detach its candidates instead of losing them.
export function unassignVaga(vagaId) {
  return enqueue(async (list) => {
    let changed = 0;
    for (const c of list) {
      if (c.vaga_id === vagaId) {
        c.vaga_id = null;
        changed++;
      }
    }
    if (changed) await persist(list);
    return changed;
  });
}

export function clearAll() {
  return enqueue(async () => {
    await persist([]);
    return true;
  });
}
