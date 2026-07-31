// Email watcher (IMAP poller). When configured, it periodically checks the
// MAIN mailbox (not a dedicated one) for resumes and imports them through the
// SAME pipeline as the upload route.
//
// SECURITY POSTURE (this feature touches an untrusted external inbox):
//   - READ-ONLY: the mailbox is opened read-only. We never mark as read, move,
//     flag or delete anything. Dedup is tracked locally by UID.
//   - STRICT ATTACHMENT ALLOWLIST: only .pdf / .docx / .jpg / .jpeg / .png,
//     checked by BOTH the real final extension AND the MIME type. Everything
//     else (.exe, .scr, .bat, .cmd, .js, .vbs, .zip, .rar, .7z, .docm, ...) is
//     rejected without being processed.
//   - IMAGES ARE DATA, NOT CODE: image attachments (photos/scans of resumes)
//     are only base64-encoded and SENT to the AI vision model for text
//     transcription — never decoded, rendered or executed locally. They stay
//     subject to the same 10MB per-attachment cap. Scanned PDFs arrive as .pdf
//     and are handled by the pipeline's vision fallback (no new type needed).
//   - IN-MEMORY ONLY: attachment bytes live in a Buffer and are discarded after
//     text extraction/transcription. The raw binary is NEVER written to disk —
//     only the extracted candidate JSON is persisted (same as the upload flow).
//   - NEVER follow links from the email body. We only look at attachments.
//   - FAIL-SAFE: a corrupt/odd attachment is skipped with a log; it never takes
//     down the poller or the server. IMAP connection errors are caught and
//     retried on the next cycle.
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { processFile, mapLimit } from './pipeline.js';
import { addMany } from './store.js';
import * as vagas from './vagasStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '..', '..', 'data', 'processed_emails.json');

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB per attachment

// Strict allowlist: extension -> the single MIME type we expect for it.
const EXT_MIME = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};
// Some mail clients label real PDFs/DOCX as a generic binary type. We accept
// those ONLY when the extension is already on the allowlist (defense in depth:
// a mismatched *known-other* MIME is still rejected).
const GENERIC_MIME = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
  'application/download',
  'application/x-download',
]);

// ---------------------------------------------------------------------------
// Pure helpers (exported for dry-run/unit testing without an IMAP connection)
// ---------------------------------------------------------------------------

// U+0300..U+036F is the Unicode "combining diacritical marks" block. Built via
// RegExp() so the source stays plain ASCII (no fragile literal combining chars).
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');
export function stripAccents(s) {
  return String(s || '').normalize('NFD').replace(COMBINING_MARKS, '');
}

export function norm(s) {
  return stripAccents(s).toLowerCase().trim();
}

// Subject must contain at least one keyword (accent- and case-insensitive).
export function subjectMatchesKeywords(subject, keywords) {
  const s = norm(subject);
  if (!s) return false;
  return keywords.some((k) => {
    const nk = norm(k);
    return nk && s.includes(nk);
  });
}

// Attachment allowlist: real final extension AND a consistent MIME type.
export function isAllowedAttachment(filename, contentType) {
  const name = String(filename || '').toLowerCase().trim();
  const dot = name.lastIndexOf('.');
  const ext = dot === -1 ? '' : name.slice(dot);
  const expected = EXT_MIME[ext];
  if (!expected) return false; // extension not on the strict allowlist
  const mime = String(contentType || '').toLowerCase().split(';')[0].trim();
  if (mime === expected) return true;
  if (GENERIC_MIME.has(mime)) return true; // generic binary + allowed extension
  return false; // extension ok but MIME is a known-other type -> reject
}

// Route to an OPEN vaga whose title appears in the subject (accent/case-
// insensitive substring). Among matches, prefer the longest (most specific)
// title. Returns the vaga or null ("Sem vaga").
export function matchVagaBySubject(subject, vagaList) {
  const s = norm(subject);
  if (!s) return null;
  let best = null;
  let bestLen = 0;
  for (const v of vagaList || []) {
    if (!v || v.archived === true) continue;
    const t = norm(v.title);
    if (!t) continue;
    if (s.includes(t) && t.length > bestLen) {
      best = v;
      bestLen = t.length;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Config (env-driven). If the 3 essentials are missing, the poller stays OFF.
// ---------------------------------------------------------------------------

export function readConfig() {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const password = process.env.IMAP_PASSWORD;
  const enabled = Boolean(host && user && password);

  const keywords = (process.env.CV_SUBJECT_KEYWORDS || 'curriculo,currículo,vaga,candidatura')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    enabled,
    host,
    port: parseInt(process.env.IMAP_PORT, 10) || 993,
    secure: (process.env.IMAP_SECURE ?? 'true').toString().toLowerCase() !== 'false',
    user,
    password,
    keywords,
    intervalMin: Math.max(1, parseInt(process.env.POLL_INTERVAL_MIN, 10) || 10),
    lookbackDays: Math.max(0, parseInt(process.env.INITIAL_LOOKBACK_DAYS, 10) || 0),
  };
}

// ---------------------------------------------------------------------------
// Local state: watermark + processed UIDs (keyed by uidValidity to stay correct
// if the mailbox is recreated). No mailbox mutation — this is our dedup memory.
// ---------------------------------------------------------------------------

async function loadState() {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      watermark: parsed.watermark || null,
      uidValidity: parsed.uidValidity || null,
      processed: Array.isArray(parsed.processed) ? parsed.processed : [],
    };
  } catch (err) {
    if (err.code === 'ENOENT') return { watermark: null, uidValidity: null, processed: [] };
    throw err;
  }
}

async function saveState(state) {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Processing one matching email: download source, parse, filter attachments,
// run the shared pipeline, persist the good candidates. Binary is discarded.
// ---------------------------------------------------------------------------

async function processEmail(client, item, uidValidity) {
  const msg = await client.fetchOne(item.uid, { source: true }, { uid: true });
  if (!msg || !msg.source) return;

  const parsed = await simpleParser(msg.source);
  const attachments = parsed.attachments || [];

  const files = [];
  for (const att of attachments) {
    const filename = att.filename || '';
    if (!isAllowedAttachment(filename, att.contentType)) {
      console.warn(
        `[email] anexo rejeitado (fora da allowlist): "${filename}" ` +
          `[${att.contentType || '?'}] — uid ${item.uid}`
      );
      continue;
    }
    const buf = att.content;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      console.warn(`[email] anexo vazio/ilegível: "${filename}" — uid ${item.uid}`);
      continue;
    }
    if (buf.length > MAX_ATTACHMENT_BYTES) {
      console.warn(
        `[email] anexo acima de 10MB: "${filename}" (${buf.length} bytes) — uid ${item.uid}`
      );
      continue;
    }
    // Same shape as multer's in-memory file. Buffer only; nothing hits disk.
    files.push({ originalname: filename, mimetype: att.contentType, buffer: buf });
  }

  if (files.length === 0) return;

  // Route by vaga title found in the subject.
  const allVagas = await vagas.getAll();
  const vaga = matchVagaBySubject(item.subject, allVagas);
  const target = {
    role: vaga?.role || '',
    skills: vaga?.skills || '',
    title: vaga?.title || '',
    description: vaga?.description || '',
  };
  const vagaId = vaga?.id || null;

  const results = await mapLimit(files, 2, (f) => processFile(f, target, vagaId));
  const ok = results.filter((r) => r.source_file.status === 'ok');
  if (ok.length) await addMany(ok);

  const failed = results.length - ok.length;
  console.log(
    `[email] uid ${item.uid} "${item.subject}" -> vaga: ` +
      `${vaga ? vaga.title : 'Sem vaga'} | ${ok.length} ok / ${failed} falha(s)`
  );
  // `files`/`results` buffers go out of scope here and are garbage-collected.
}

// ---------------------------------------------------------------------------
// One poll cycle: connect (read-only), find new emails since the watermark,
// filter by subject, process matching ones, remember UIDs. Always cleans up.
// ---------------------------------------------------------------------------

async function runCycle(cfg) {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    logger: false,
    emitLogs: false,
  });

  let lock;
  try {
    await client.connect();
    // READ-ONLY open: guarantees we never alter the user's real inbox.
    lock = await client.getMailboxLock('INBOX', { readOnly: true });

    const state = await loadState();
    const uidValidity = client.mailbox?.uidValidity
      ? String(client.mailbox.uidValidity)
      : null;

    // Mailbox recreated -> old UIDs are meaningless; drop them, keep watermark.
    if (state.uidValidity && uidValidity && state.uidValidity !== uidValidity) {
      console.warn('[email] uidValidity mudou — limpando UIDs processados antigos.');
      state.processed = [];
    }
    state.uidValidity = uidValidity;

    // First-run safeguard: set a watermark so we don't import the whole history.
    if (!state.watermark) {
      const wm = new Date(Date.now() - cfg.lookbackDays * 86400000);
      state.watermark = wm.toISOString();
      await saveState(state);
      console.log(
        `[email] primeira execução — watermark = ${state.watermark} ` +
          `(lookback ${cfg.lookbackDays} dia(s))`
      );
    }

    const sinceDate = new Date(state.watermark);
    const uids = (await client.search({ since: sinceDate }, { uid: true })) || [];
    const processedSet = new Set(state.processed);
    const newUids = uids.filter((u) => !processedSet.has(`${uidValidity}:${u}`));

    if (newUids.length === 0) {
      state.processed = [...processedSet];
      await saveState(state);
      return;
    }

    // Phase 1 — cheap envelope fetch to filter by subject before downloading.
    const toProcess = [];
    for await (const m of client.fetch(newUids, { uid: true, envelope: true }, { uid: true })) {
      const subject = m.envelope?.subject || '';
      const date = m.envelope?.date;
      const key = `${uidValidity}:${m.uid}`;

      // Extra watermark guard (IMAP "since" is date-granular / server-fuzzy).
      if (date && new Date(date) < sinceDate) {
        processedSet.add(key);
        continue;
      }
      if (subjectMatchesKeywords(subject, cfg.keywords)) {
        toProcess.push({ uid: m.uid, subject });
      } else {
        processedSet.add(key); // seen and irrelevant -> never look again
      }
    }

    // Phase 2 — download + process matching emails, one failure never spreads.
    for (const item of toProcess) {
      try {
        await processEmail(client, item, uidValidity);
      } catch (err) {
        console.error(`[email] falha ao processar uid ${item.uid}:`, err.message);
      }
      processedSet.add(`${uidValidity}:${item.uid}`);
    }

    state.processed = [...processedSet];
    await saveState(state);
  } finally {
    if (lock) lock.release();
    try {
      await client.logout();
    } catch {
      /* ignore logout errors */
    }
  }
}

// ---------------------------------------------------------------------------
// Public entry point: start the poller if configured. Runs once immediately,
// then every POLL_INTERVAL_MIN. Never throws to the caller.
// ---------------------------------------------------------------------------

export function startEmailPoller() {
  const cfg = readConfig();
  if (!cfg.enabled) {
    console.log('[email] desativado — configure IMAP_* no .env');
    return null;
  }

  console.log(
    `[email] vigia ativo — ${cfg.user}@${cfg.host}:${cfg.port} ` +
      `(INBOX, somente leitura) a cada ${cfg.intervalMin} min`
  );
  console.log(`[email] palavras-chave de assunto: ${cfg.keywords.join(', ')}`);

  let running = false;
  const tick = async () => {
    if (running) return; // don't overlap cycles
    running = true;
    try {
      await runCycle(cfg);
    } catch (err) {
      // Connection/auth errors must not crash the process — retry next cycle.
      console.error('[email] ciclo falhou (nova tentativa no próximo ciclo):', err.message);
    } finally {
      running = false;
    }
  };

  tick(); // run immediately on startup
  const timer = setInterval(tick, cfg.intervalMin * 60 * 1000);
  timer.unref?.(); // don't keep the event loop alive just for the poller
  return timer;
}
