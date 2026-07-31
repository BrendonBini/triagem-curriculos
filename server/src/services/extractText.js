// Turn an uploaded PDF/DOCX buffer into plain text BEFORE it goes to the LLM.
// Import pdf-parse's inner module directly to avoid its debug-on-import behavior.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';

const MAX_CHARS = 24000; // keep prompts affordable; CVs rarely exceed this

export function detectType(filename = '', mimetype = '') {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf') || mimetype === 'application/pdf') return 'pdf';
  if (
    lower.endsWith('.docx') ||
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx';
  }
  if (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    mimetype === 'image/jpeg' ||
    mimetype === 'image/png'
  ) {
    return 'image';
  }
  return 'unknown';
}

// Map a filename/mimetype to the canonical mimeType the vision transcription
// (ai.transcribeMedia) expects: 'image/jpeg' | 'image/png' | 'application/pdf'.
// Returns null for anything the transcriber can't handle (e.g. docx).
export function transcribeMimeType(filename = '', mimetype = '') {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png') || mimetype === 'image/png') return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || mimetype === 'image/jpeg') {
    return 'image/jpeg';
  }
  if (lower.endsWith('.pdf') || mimetype === 'application/pdf') return 'application/pdf';
  return null;
}

export async function extractText(buffer, type) {
  let text = '';
  if (type === 'pdf') {
    const data = await pdfParse(buffer);
    text = data.text || '';
  } else if (type === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value || '';
  } else {
    throw new Error('unsupported_type');
  }

  text = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  if (!text) {
    // e.g. scanned/image-only PDF with no selectable text
    throw new Error('empty_text');
  }
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
}
