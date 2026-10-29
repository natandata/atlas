import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'grokbot-'));
const fakeLog = join(tmp, 'claude-args.log');
writeFileSync(fakeLog, '');

// Fila de mensagens que o "Telegram" vai entregar.
let nextId = 1;
const queue = [];
const sent = [];
const send = (from, text, type = 'private') =>
  queue.push({ update_id: nextId++, message: { message_id: nextId, from: { id: from }, chat: { id: from, type }, text } });

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const method = req.url.split('/').pop();
    const data = body ? JSON.parse(body) : {};
    let result = true;
    if (method === 'getUpdates') {
      result = queue.splice(0).filter((u) => u.update_id >= (data.offset || 0));
    } else if (method === 'sendMessage') {
      sent.push(data);
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, result }));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const bot = spawn(process.execPath, [resolve(here, '../src/bot.js')], {
  env: {
    ...process.env,
    TELEGRAM_BOT_TOKEN: 'TOKEN_DE_TESTE',
    ALLOWED_USER_ID: '111',
    TELEGRAM_API_BASE: `http://127.0.0.1:${port}`,
    CLAUDE_BIN: resolve(here, 'fake-claude.mjs'),
    FAKE_LOG: fakeLog,
    STATE_FILE: join(tmp, 'state.json'),
    CLAUDE_MODEL: 'opus',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let botOut = '';
bot.stdout.on('data', (d) => (botOut += d));
bot.stderr.on('data', (d) => (botOut += d));

const until = async (fn, ms = 8000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (fn()) return; await new Promise((r) => setTimeout(r, 50)); }
  throw new Error('timeout esperando condição\n' + botOut);
};

try {
  // 1) Desconhecido é ignorado, dono é atendido
  send(222, 'oi sou estranho');
  send(111, 'olá');
  await until(() => sent.length >= 1);
  assert.equal(sent.length, 1, 'só o dono deve receber resposta');
  assert.equal(sent[0].chat_id, 111);
  assert.match(sent[0].text, /eco: olá/);
  assert.ok(!/retomada/.test(sent[0].text), 'primeira mensagem não retoma sessão');

  // 2) Segunda mensagem retoma a sessão
  send(111, 'segunda');
  await until(() => sent.length >= 2);
  assert.match(sent[1].text, /eco: segunda \(retomada\)/);

  // 3) /novo zera a sessão
  send(111, '/novo');
  await until(() => sent.length >= 3);
  send(111, 'depois do novo');
  await until(() => sent.length >= 4);
  assert.ok(!/retomada/.test(sent[3].text), 'após /novo não retoma');

  // 4) Resposta longa é dividida
  send(111, 'LONGO');
  await until(() => sent.length >= 6);
  assert.ok(sent.slice(4).every((m) => m.text.length <= 4000), 'partes ≤ 4000');

  // 5) Erro do Claude vira mensagem de erro
  send(111, '**negrito** e\n# titulo');
  await until(() => sent.length >= 7);
  assert.ok(!/\*\*|# titulo/.test(sent[6].text), 'markdown removido');
  send(111, 'FALHAR');
  await until(() => sent.length >= 8);
  assert.match(sent[7].text, /Deu erro/);

  // 6) Argumentos passados ao Claude: somente ferramentas de leitura/web
  const calls = readFileSync(fakeLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const first = calls[0];
  assert.ok(first.includes('-p') && first.includes('--output-format'));
  assert.equal(first[first.indexOf('--allowedTools') + 1], 'Read,Glob,Grep,WebSearch,WebFetch');
  assert.ok(!first.some((a) => /dangerously|bypass/i.test(a)), 'nunca pular permissões');
  assert.equal(first[first.indexOf('--permission-mode') + 1], 'dontAsk');
  assert.ok(first.includes('--strict-mcp-config'));
  assert.match(first[first.indexOf('--disallowedTools') + 1], /Bash/);

  // 7) O token não vaza nos logs
  assert.ok(!botOut.includes('TOKEN_DE_TESTE'), 'token apareceu no log');
  console.log('OK: todos os testes passaram (' + sent.length + ' respostas verificadas)');
} catch (e) {
  console.error('FALHOU:', e.message);
  process.exitCode = 1;
} finally {
  bot.kill();
  server.close();
}
