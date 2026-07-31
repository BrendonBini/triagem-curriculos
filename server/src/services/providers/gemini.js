// Google Gemini provider (free tier via Google AI Studio).
// Docs/key: https://aistudio.google.com/apikey
import { GoogleGenAI } from '@google/genai';

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

let ai = null;
function client() {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!ai) ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return ai;
}

export const info = {
  name: 'gemini',
  keyEnvVar: 'GEMINI_API_KEY',
  get model() {
    return MODEL;
  },
};

export function hasKey() {
  return Boolean(process.env.GEMINI_API_KEY);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Returns { text, usage }. Retries a couple of times on rate limit (429),
// which matters on the free tier.
// `media` (optional): array of { mimeType, data } with base64 `data`. When
// present, `contents` becomes a parts array [{ text: user }, { inlineData }...]
// so Gemini can read images (image/jpeg, image/png) and PDFs (application/pdf)
// natively. Without `media`, behavior is unchanged (contents = user string).
export async function complete({ system, user, json, media }) {
  const c = client();
  const contents =
    media && media.length
      ? [{ text: user }, ...media.map((m) => ({ inlineData: { mimeType: m.mimeType, data: m.data } }))]
      : user;
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await c.models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction: system,
          temperature: 0,
          maxOutputTokens: 4096,
          ...(json ? { responseMimeType: 'application/json' } : {}),
        },
      });
      return {
        text: res.text || '',
        usage: res.usageMetadata?.totalTokenCount ?? null,
      };
    } catch (err) {
      lastErr = err;
      const status = err?.status || err?.code;
      const isRate = status === 429 || /RESOURCE_EXHAUSTED|rate|quota/i.test(String(err?.message));
      if (!isRate || attempt === 2) break;
      await sleep(2000 * (attempt + 1)); // 2s, 4s
    }
  }
  throw lastErr;
}
