import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { askClaude } from './claude.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = {
  token: process.env.TELEGRAM_BOT_TOKEN,
  allowedId: String(process.env.ALLOWED_USER_ID || '').trim(),
  model: process.env.CLAUDE_MODEL || 'sonnet',
  tools: process.env.ALLOWED_TOOLS ?? 'Read,Glob,Grep,WebSearch,WebFetch',
  timeoutMs: Number(process.env.CLAUDE_TIMEOUT_MS || 180000),
  api: process.env.TELEGRAM_API_BASE || 'https://api.telegram.org',
  stateFile: resolve(root, process.env.STATE_FILE || 'data/state.json'),
  workdir: resolve(root, 'workdir'),
};

if (!cfg.token) {
  console.error('Falta TELEGRAM_BOT_TOKEN no .env');
  process.exit(1);
}
if (!cfg.allowedId) {
  console.warn('ALLOWED_USER_ID vazio: o bot NÃO responde ninguém. Mande uma mensagem ao bot e copie o ID que aparecer aqui.');
}

async function tg(method, body, timeoutMs = 15000) {
  const res = await fetch(`${cfg.api}/bot${cfg.token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description || res.status}`);
  return json.result;
}

let state = { offset: 0, sessionId: null };
async function loadState() {
  try {
    state = { ...state, ...JSON.parse(await readFile(cfg.stateFile, 'utf8')) };
  } catch {
    /* primeiro uso */
  }
}
async function saveState() {
  await mkdir(dirname(cfg.stateFile), { recursive: true });
  await writeFile(cfg.stateFile, JSON.stringify(state));
}

// Telegram em texto simples não renderiza markdown: tira os ** e os # de título.
function limpar(text) {
  return String(text || '').replace(/\*\*(.+?)\*\*/gs, '$1').replace(/^#{1,6}\s+/gm, '');
}

function chunks(text, size = 4000) {
  const out = [];
  let rest = limpar(text) || '(sem resposta)';
  while (rest.length > size) {
    let cut = rest.lastIndexOf('\n', size);
    if (cut < size / 2) cut = size;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  out.push(rest);
  return out;
}

async function handle(msg) {
  const chatId = msg.chat.id;
  const fromId = String(msg.from?.id ?? '');
  if (msg.chat.type !== 'private' || !cfg.allowedId || fromId !== cfg.allowedId) {
    console.log(`Mensagem ignorada do ID ${fromId}${cfg.allowedId ? '' : ' (configure ALLOWED_USER_ID com ele se for você)'}`);
    return;
  }
  const text = (msg.text || '').trim();
  if (!text) {
    await tg('sendMessage', { chat_id: chatId, text: 'Por enquanto só entendo texto.' });
    return;
  }
  if (text === '/novo') {
    state.sessionId = null;
    await saveState();
    await tg('sendMessage', { chat_id: chatId, text: 'Conversa nova. Pode mandar.' });
    return;
  }

  const typing = setInterval(() => tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {}), 4000);
  tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
  try {
    const r = await askClaude({
      prompt: text,
      sessionId: state.sessionId,
      cwd: cfg.workdir,
      model: cfg.model,
      allowedTools: cfg.tools,
      timeoutMs: cfg.timeoutMs,
    });
    state.sessionId = r.sessionId || state.sessionId;
    await saveState();
    for (const part of chunks(r.text)) await tg('sendMessage', { chat_id: chatId, text: part });
  } catch (e) {
    console.error('Erro ao consultar o Claude:', e.message);
    await tg('sendMessage', { chat_id: chatId, text: `Deu erro: ${e.message}` }).catch(() => {});
  } finally {
    clearInterval(typing);
  }
}

let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopping = true; console.log('\nEncerrando...'); setTimeout(() => process.exit(0), 300); });

async function main() {
  await loadState();
  console.log('Grokbot ligado. Ctrl+C para parar.');
  while (!stopping) {
    try {
      const updates = await tg('getUpdates', { offset: state.offset, timeout: 25, allowed_updates: ['message'] }, 40000);
      for (const u of updates) {
        state.offset = u.update_id + 1;
        await saveState();
        if (u.message) await handle(u.message);
      }
    } catch (e) {
      console.error(e.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
main();
