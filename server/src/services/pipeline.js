// Shared CV-processing pipeline used by BOTH the upload route and the email
// poller. A "file" here is the multer-in-memory shape: { originalname, mimetype,
// buffer }. The email poller builds the same shape from a parsed attachment,
// so a single, well-tested path handles every incoming resume.
import { randomUUID } from 'crypto';
import { detectType, extractText, transcribeMimeType } from './extractText.js';
import { analyzeCv, transcribeMedia } from './ai.js';

// Resolve the plain CV text for a file, routing by detected type. This is the
// ONLY place that decides "parse vs. vision-transcribe":
//   - docx  -> extractText (unchanged text path).
//   - pdf   -> extractText first (fast/cheap). If the PDF is scanned/image-only
//              (extractText throws 'empty_text'), fall back to vision
//              transcription. Any OTHER read error propagates as a per-file
//              failure, exactly as before.
//   - image -> vision transcription only (no selectable text to extract).
// Whatever string comes back here is what gets analyzed AND persisted as
// source_text, so images / scanned PDFs stay re-scorable like everything else.
async function resolveText(file, type) {
  if (type === 'docx') {
    return extractText(file.buffer, 'docx');
  }
  if (type === 'pdf') {
    try {
      return await extractText(file.buffer, 'pdf');
    } catch (err) {
      if (err.message === 'empty_text') {
        return transcribeMedia({ mimeType: 'application/pdf', buffer: file.buffer });
      }
      throw err; // corrupt/unreadable PDF -> stays a per-file failure
    }
  }
  if (type === 'image') {
    const mimeType = transcribeMimeType(file.originalname, file.mimetype);
    return transcribeMedia({ mimeType, buffer: file.buffer });
  }
  throw new Error('unsupported_type');
}

// Process a single in-memory file end-to-end. Never throws — returns a result
// object with source_file.status = 'ok' | 'failed'. On failure it carries an
// { error: { code, message } } so callers can report per-file outcomes.
export async function processFile(file, target, vagaId) {
  const base = {
    id: randomUUID(),
    vaga_id: vagaId || null,
    archived: false,
    source_file: {
      filename: file.originalname,
      type: detectType(file.originalname, file.mimetype),
      status: 'failed',
    },
    created_at: new Date().toISOString(),
  };

  if (base.source_file.type === 'unknown') {
    return {
      ...base,
      error: {
        code: 'unsupported_type',
        message: 'Formato não suportado (use PDF, DOCX ou imagem JPG/PNG).',
      },
    };
  }

  let text;
  try {
    // Routes docx/pdf/image (incl. scanned-PDF vision fallback). transcribeMedia
    // failures (missing_api_key, empty_text, quota/429) surface here with their
    // pt-BR userMessage as a per-file failure — the batch keeps going.
    text = await resolveText(file, base.source_file.type);
  } catch (err) {
    const map = {
      empty_text: 'Não foi possível extrair texto (PDF digitalizado/imagem?).',
      unsupported_type: 'Formato não suportado.',
    };
    return {
      ...base,
      error: {
        code: err.message,
        message: err.userMessage || map[err.message] || 'Falha ao ler o arquivo.',
      },
    };
  }

  try {
    const { candidate, meta } = await analyzeCv(text, target);
    return {
      ...base,
      source_file: { ...base.source_file, status: 'ok' },
      ...candidate,
      // Keep the extracted plain text so the candidate can be re-scored against
      // a different vaga later WITHOUT re-uploading the file. Internal only:
      // read endpoints strip source_text before responding (see routes).
      source_text: text,
      meta: {
        ...meta,
        // The vaga this analysis was scored against (null when scored "sem vaga").
        scored_for_vaga_id: vagaId || null,
        extracted_at: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      ...base,
      error: {
        code: err.message,
        message: err.userMessage || 'Falha na análise por IA.',
      },
    };
  }
}

// Small concurrency limiter so a large batch doesn't fire N API calls at once.
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}
