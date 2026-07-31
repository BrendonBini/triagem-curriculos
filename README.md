# Triagem de Currículos com IA (POC)

App standalone e local: você envia **vários currículos de uma vez** (PDF/DOCX,
em pt-BR), a IA (Gemini por padrão, ou Anthropic) **lê e extrai** os dados, **analisa e pontua** cada
candidato (pontos fortes, fracos, pontos a verificar, alertas e nota), e um
**dashboard** mostra o ranking, filtros, gráficos e o detalhe de cada um.

> Convenções: textos da interface e conteúdo dos CVs em **pt-BR**; código,
> comentários e chaves de JSON em **inglês**.

## 1. Pré-requisitos
- Node.js 18+ (recomendado 20+).
- Uma chave de API de IA. Padrão: **Gemini (grátis)** —
  https://aistudio.google.com/apikey
  (Opcional: Anthropic — https://console.anthropic.com/)

## 2. Onde colocar o token (importante)
A chave vai num arquivo `.env` **dentro da pasta `server/`** — nunca no código,
nunca no frontend.

```bash
# a partir da raiz do projeto
copy server\.env.example server\.env      # PowerShell / CMD
# ou:  cp server/.env.example server/.env  # Git Bash
```

Abra `server/.env` e preencha (padrão = Gemini grátis):

```
AI_PROVIDER=gemini
GEMINI_API_KEY=sua-chave-do-gemini-aqui
GEMINI_MODEL=gemini-flash-latest   # opcional
PORT=3001                        # opcional
```

Para usar o Anthropic no lugar, troque para `AI_PROVIDER=anthropic` e preencha
`ANTHROPIC_API_KEY`. O `.env` já está no `.gitignore`, então a chave não é
versionada.

## 3. Instalar

```bash
npm install                # instala o 'concurrently' da raiz
npm run install:all        # instala server/ e web/
```

## 4. Rodar (backend + frontend juntos)

```bash
npm.cmd run dev
```

- Backend: http://localhost:3001
- Frontend: http://localhost:5173  ← **abra este**

Ou rode em dois terminais: `npm run dev:server` e `npm run dev:web`.

## 5. Usar
1. (Opcional) informe a **vaga** e as **skills desejadas** — isso melhora o
   `skill_match` da pontuação.
2. Arraste vários PDFs/DOCX e clique em **Analisar**.
3. Veja o ranking, use os filtros/busca, clique num candidato para o resumo
   completo (fortes, fracos, a verificar, alertas, nota e histórico).

Candidatos ficam salvos em `server/data/candidates.json`. Botão **Limpar**
zera tudo.

## Arquitetura (enxuta, POC)
```
server/   Node + Express
  src/services/extractText.js   PDF (pdf-parse) / DOCX (mammoth) -> texto
  src/services/ai.js            IA (Gemini/Anthropic): texto -> JSON estrito (extração + análise)
  src/services/providers/       gemini.js e anthropic.js (troca via AI_PROVIDER)
  src/services/store.js         persistência local em JSON
  src/routes/candidates.js      upload em lote, listagem, detalhe, reset
  src/schema.js                 contrato de dados do candidato + normalização
web/      React + Vite + Recharts (dashboard)
```

### Endpoints
- `POST /api/candidates` — upload em lote (campo `files`, +`targetRole`/`targetSkills`).
- `GET  /api/candidates` — lista todos.
- `GET  /api/candidates/:id` — detalhe.
- `DELETE /api/candidates` — limpa tudo.
- `GET  /api/health` — status + se a chave está configurada.

## Custo e robustez
- Um arquivo com problema (PDF digitalizado sem texto, formato inválido, JSON
  inválido da IA) **não derruba o lote** — cada arquivo retorna `ok` ou `failed`
  com o motivo.
- Lote processado com concorrência limitada (4 por vez).
- `temperature: 0` e no máx. 1 retentativa quando a IA não devolve JSON válido;
  senão o candidato é marcado como `needs_review`.
- Tokens aproximados por CV são registrados em `meta.approx_tokens`.

## Solução de problemas
- **Badge "IA sem chave"**: falta `server/.env` com a chave do provider
  (`GEMINI_API_KEY` por padrão); crie e
  reinicie o servidor.
- **"PDF digitalizado/imagem?"**: o PDF não tem texto selecionável (é imagem);
  este POC não faz OCR.
- **401/403 da API**: chave inválida ou sem créditos.
