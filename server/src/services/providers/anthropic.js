// Anthropic provider (optional — used when AI_PROVIDER=anthropic).
// Key: https://console.anthropic.com/
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export const info = {
  name: 'anthropic',
  keyEnvVar: 'ANTHROPIC_API_KEY',
  get model() {
    return MODEL;
  },
};

export function hasKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Returns { text, usage }. (Anthropic has no JSON mode; the prompt enforces it.)
// `media` (optional): array of { mimeType, data } with base64 `data`. When
// present, the user message `content` becomes a blocks array: a text block plus
// an image block per image (image/jpeg, image/png) and a document block per PDF
// (application/pdf). Without `media`, behavior is unchanged (content = string).
export async function complete({ system, user, media }) {
  const c = getClient();
  let content = user;
  if (media && media.length) {
    content = [
      { type: 'text', text: user },
      ...media.map((m) =>
        m.mimeType === 'application/pdf'
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: m.data } }
          : { type: 'image', source: { type: 'base64', media_type: m.mimeType, data: m.data } }
      ),
    ];
  }
  const res = await c.messages.create({
    model: MODEL,
    max_tokens: 2000,
    temperature: 0,
    system,
    messages: [{ role: 'user', content }],
  });
  const text = res.content?.map((b) => (b.type === 'text' ? b.text : '')).join('') || '';
  const usage = res.usage ? (res.usage.input_tokens || 0) + (res.usage.output_tokens || 0) : null;
  return { text, usage };
}
