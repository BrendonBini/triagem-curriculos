import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import candidatesRouter from './routes/candidates.js';
import vagasRouter from './routes/vagas.js';
import { providerInfo } from './services/ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/src/app.js -> ../../web/dist
const WEB_DIST = path.join(__dirname, '..', '..', 'web', 'dist');
const WEB_INDEX = path.join(WEB_DIST, 'index.html');

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    const p = providerInfo();
    res.json({
      ok: true,
      provider: p.provider,
      model: p.model,
      keyEnvVar: p.keyEnvVar,
      hasApiKey: p.hasKey,
    });
  });

  app.use('/api/candidates', candidatesRouter);
  app.use('/api/vagas', vagasRouter);

  // Serve the frontend build (single process / single port in production).
  // Mounted AFTER the /api routes so it can never shadow them.
  if (fs.existsSync(WEB_INDEX)) {
    app.use(express.static(WEB_DIST));

    // SPA fallback: any GET that is NOT /api and was not matched as a static
    // file returns index.html. The negative lookahead keeps /api untouched.
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(WEB_INDEX);
    });
  } else {
    console.warn(
      '[aviso] build do frontend não encontrado em web/dist — ' +
        'rode o build antes de servir em produção'
    );
  }

  // Multer / generic error handler with friendly pt-BR messages.
  app.use((err, _req, res, _next) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Arquivo acima de 10MB.' });
    }
    console.error('[server] erro:', err);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  });

  return app;
}
