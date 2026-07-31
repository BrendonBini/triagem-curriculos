import 'dotenv/config';
import { createApp } from './src/app.js';
import { providerInfo } from './src/services/ai.js';
import { startEmailPoller } from './src/services/emailPoller.js';

const PORT = process.env.PORT || 3001;
const info = providerInfo();

if (!info.hasKey) {
  console.warn(
    `\n[aviso] ${info.keyEnvVar} não definida (provider: ${info.provider}).\n` +
      '        Crie server/.env a partir de server/.env.example.\n' +
      '        Sem a chave, o upload responde com erro amigável em cada arquivo.\n'
  );
}

const app = createApp();
app.listen(PORT, () => {
  console.log(`[server] rodando em http://localhost:${PORT}`);
  console.log(`[server] IA: ${info.provider} (${info.model})`);

  // Start the IMAP email watcher AFTER the server is up. It's a no-op unless
  // IMAP_* is configured, and any connection error is caught internally so it
  // can never crash the server.
  startEmailPoller();
});
