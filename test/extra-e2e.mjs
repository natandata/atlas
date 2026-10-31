// Testes das funções extras da Central (busca, tarefas, projetos, memória, versões, exportação, backup, GitHub, Drive em lote).
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const data = mkdtempSync(join(tmpdir(), 'grokextra-'));
const work = mkdtempSync(join(tmpdir(), 'grokextra-w-'));
const port = 45000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
const driveDir = join(work, 'Meu Drive'); mkdirSync(driveDir, { recursive: true });
// pasta "do código" de mentira, para o envio ao GitHub
const src = join(work, 'src-code'); mkdirSync(join(src, 'web'), { recursive: true }); mkdirSync(join(src, 'data'), { recursive: true });
writeFileSync(join(src, 'web', 'app.js'), 'console.log(1)'); writeFileSync(join(src, '.env'), 'API_KEY=segredo-super-longo-123\n'); writeFileSync(join(src, 'data', 'x.json'), '{}');
writeFileSync(join(src, 'package.json'), '{"name":"x","version":"1.2.3"}');
const remote = join(work, 'remote.git'); execSync(`git init --bare -q "${remote}"`);

// conversa pré-gravada: o bot entregou 3 versões de um vídeo e um link
mkdirSync(join(data, 'chats'), { recursive: true });
const mkfile = (name, kind) => { const id = [...Array(16)].map(() => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join(''); const d = join(data, 'files', id); mkdirSync(d, { recursive: true }); writeFileSync(join(d, name), 'conteudo ' + name); const meta = { id, name, size: 12, kind, chat: 'd-grokbot', ts: Date.now(), attached: true }; writeFileSync(join(d, 'meta.json'), JSON.stringify(meta)); return { id, name, size: 12, kind }; };
const v1 = mkfile('erin-previa-v1-720p.mp4', 'video'), v2 = mkfile('erin-previa-v2-720p.mp4', 'video'), v3 = mkfile('erin-previa-v3-720p.mp4', 'video'), doc = mkfile('roteiro-erin.pdf', 'file');
const now = Date.now();
writeFileSync(join(data, 'chats', 'd-grokbot.json'), JSON.stringify({ id: 'd-grokbot', type: 'direct', title: 'Grokbot', members: ['grokbot'], sessions: {}, created: now - 9e6, messages: [
  { id: 'm-0001', ts: now - 8e6, from: 'user', text: 'Monte a prévia da Erin', kind: 'normal' },
  { id: 'm-0002', ts: now - 7e6, from: 'grokbot', text: 'Prévia v1 pronta https://exemplo.com/pasta-erin', kind: 'normal', files: [v1] },
  { id: 'm-0003', ts: now - 6e6, from: 'grokbot', text: 'Prévia v2 com a legenda corrigida', kind: 'normal', files: [v2, doc] },
  { id: 'm-0004', ts: now - 5e6, from: 'grokbot', text: 'Prévia v3', kind: 'normal', files: [v3] },
] }));

const srv = spawn(process.execPath, [resolve(here, '../web/server.mjs')], {
  env: { ...process.env, WEB_PORT: String(port), WEB_DATA_DIR: data, CLAUDE_BIN: resolve(here, 'fake-claude-web.mjs'), PLAN_USAGE: 'off', LIVE_SCREEN: 'off', DRIVE_LOCAL_DIR: driveDir, GITHUB_REMOTE: remote, GITHUB_SRC_DIR: src, UPDATE_CHECK: 'off', EXTRA_TICK_MS: '3600000' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = ''; srv.stdout.on('data', (d) => (out += d)); srv.stderr.on('data', (d) => (out += d));
const wait = async (fn, ms = 10000) => { const where = new Error().stack.split('\n')[2]; const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 60)); } throw new Error('tempo esgotado em' + where + '\n' + out.slice(-500)); };

try {
  await wait(() => out.includes('Central de bots ligada'));
  const token = JSON.parse(readFileSync(join(data, 'auth.json'), 'utf8')).token;
  const H = { cookie: `gb=${token}`, 'x-grok': '1', 'content-type': 'application/json' };
  const api = async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
  const getText = async (p) => { const r = await fetch(base + p, { headers: H }); return { status: r.status, type: r.headers.get('content-type'), disp: r.headers.get('content-disposition'), text: await r.text() }; };
  const msgs = async (id) => (await api('GET', `/api/chats/${id}`)).json.messages;
  // eventos em tempo real
  const events = []; (async () => { const r = await fetch(base + '/api/events', { headers: { cookie: H.cookie } }); const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = ''; for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 2); if (l.startsWith('data: ')) events.push(JSON.parse(l.slice(6))); } } })().catch(() => {});

  // públicos
  assert.equal((await fetch(base + '/extra.js')).status, 200); assert.equal((await fetch(base + '/extra.css')).status, 200);

  // novidades
  const ab = (await api('GET', '/api/about')).json; assert.match(ab.version, /^\d+\.\d+\.\d+$/); assert.ok(Array.isArray(ab.changelog)); assert.equal(ab.drive.mode, 'pasta');
  assert.ok(ab.startedAt > 0);

  // projetos por cliente
  const pr = (await api('POST', '/api/projects', { name: 'Sophie | UK', driveFolder: 'Sophie | UK', rules: 'Legendas em Futura Light, inglês britânico.' })).json; assert.match(pr.id, /^p-/);
  assert.equal((await api('POST', '/api/projects', { name: '' })).status, 400);
  assert.equal((await api('PUT', '/api/chats/d-grokbot/project', { project: pr.id })).json.project, pr.id);
  assert.equal((await api('PUT', '/api/chats/d-grokbot/project', { project: 'p-ffff' })).status, 404);
  assert.equal((await api('GET', '/api/state')).json.chats.find((c) => c.id === 'd-grokbot').project, pr.id);
  await api('POST', '/api/chats/d-grokbot/messages', { text: 'ECO-NOTAS oi' });
  const eco = await wait(async () => (await msgs('d-grokbot')).find((m) => m.from === 'grokbot' && /Regras deste cliente/.test(m.text)));
  assert.match(eco.text, /Futura Light/); assert.match(eco.text, /Pasta padrão do Drive deste cliente: Sophie \| UK/);

  // tarefas: histórico, fila, repetir
  const t1 = (await api('GET', '/api/tasks')).json; assert.ok(t1.tasks.length >= 1); const done = t1.tasks.find((t) => t.status === 'ok'); assert.ok(done, 'tarefa concluída'); assert.equal(done.project, pr.id); assert.equal(done.bot, 'grokbot');
  assert.ok(events.some((e) => e.type === 'task'), 'evento de tarefa');
  assert.equal((await api('GET', `/api/tasks?project=${pr.id}&status=ok`)).json.tasks.every((t) => t.project === pr.id && t.status === 'ok'), true);
  const nBefore = (await msgs('d-grokbot')).filter((m) => m.from === 'grokbot').length;
  assert.equal((await api('POST', `/api/tasks/${done.id}/repeat`)).json.accepted, true);
  await wait(async () => (await msgs('d-grokbot')).filter((m) => m.from === 'grokbot').length > nBefore);
  // cancelar uma tarefa em andamento
  await api('POST', '/api/chats/d-grokbot/messages', { text: 'DEMORAR muito' });
  const run = await wait(async () => (await api('GET', '/api/tasks')).json.active.find((t) => t.status === 'running'));
  assert.equal((await api('POST', `/api/tasks/${run.id}/cancel`)).json.ok, true);
  const cancelled = await wait(async () => (await api('GET', '/api/tasks')).json.tasks.find((t) => t.id === run.id && t.status === 'cancelled'));
  assert.ok(cancelled.endedAt);
  await wait(async () => (await msgs('d-grokbot')).some((m) => m.from === 'system' && /foi parado/.test(m.text)));
  assert.equal((await api('POST', `/api/tasks/${run.id}/cancel`)).status, 400, 'já terminou');

  // aguardando você (aprovação) e falha de rotina
  await api('POST', '/api/chats/d-grokbot/messages', { text: 'ECO-NOTAS [[APROVAR]] posso publicar?' });
  const wt = await wait(async () => (await api('GET', '/api/tasks')).json.waiting.find((w) => w.chat === 'd-grokbot'));
  assert.equal(wt.kind, 'approve');
  const rt = (await api('POST', '/api/routines', { name: 'Falha', bot: 'grokbot', prompt: 'FALHAR agora', time: '00:00', days: [0, 1, 2, 3, 4, 5, 6] })).json;
  assert.ok(rt.next > Date.now(), 'próxima execução'); assert.equal(rt.lastResult, null);
  await api('POST', `/api/routines/${rt.id}/run`);
  const failed = await wait(async () => (await api('GET', '/api/state')).json.routines.find((r) => r.id === rt.id && r.lastResult));
  assert.equal(failed.lastResult.ok, false); assert.ok(events.some((e) => e.type === 'notify' && e.level === 'error' && /falhou/.test(e.title)), 'aviso de falha');

  // busca global
  const s1 = (await api('GET', '/api/search?q=legenda')).json; assert.ok(s1.results.some((r) => r.kind === 'msg' && r.mid === 'm-0003'));
  const s2 = (await api('GET', '/api/search?q=roteiro&type=file')).json; assert.equal(s2.results.length, 1); assert.equal(s2.results[0].file.id, doc.id);
  const s3 = (await api('GET', '/api/search?type=link')).json; assert.ok(s3.results.some((r) => r.url === 'https://exemplo.com/pasta-erin'));
  assert.equal((await api('GET', `/api/search?q=prévia&project=${pr.id}&bot=grokbot`)).json.results.every((r) => r.from === 'grokbot'), true);
  assert.equal((await api('GET', '/api/search?q=')).json.total, 0);
  assert.equal((await api('GET', '/api/search?q=xyz-nao-existe')).json.total, 0);

  // fixar, responder e lembrar
  assert.equal((await api('POST', '/api/chats/d-grokbot/messages/m-0004/pin')).json.pinned, true);
  assert.equal((await msgs('d-grokbot')).find((m) => m.id === 'm-0004').pinned, true);
  assert.equal((await api('POST', '/api/chats/d-grokbot/messages/m-0004/pin')).json.pinned, false);
  await api('POST', '/api/chats/d-grokbot/messages', { text: 'sobre essa prévia, ok', reply: 'm-0003' });
  const rep = await wait(async () => (await msgs('d-grokbot')).find((m) => m.from === 'user' && m.text === 'sobre essa prévia, ok'));
  assert.equal(rep.reply.id, 'm-0003'); assert.match(rep.reply.text, /legenda corrigida/);
  assert.equal((await api('POST', '/api/chats/d-grokbot/messages/m-0003/remember', { scope: 'bot' })).json.name, 'Grokbot');
  assert.match((await api('GET', '/api/memory')).json.bots.find((b) => b.slug === 'grokbot').memory, /legenda corrigida/);
  assert.equal((await api('POST', '/api/chats/d-grokbot/messages/m-0003/remember', { scope: 'project', text: 'Sempre 720p na prévia' })).json.name, 'Sophie | UK');
  assert.match((await api('GET', '/api/memory')).json.projects[0].memory, /720p/);
  assert.equal((await api('PUT', `/api/memory/project/${pr.id}`, { memory: '- só isto' })).json.ok, true);
  assert.equal((await api('GET', '/api/memory')).json.projects[0].memory, '- só isto');
  assert.equal((await api('POST', '/api/chats/d-grokbot/messages/nao-existe/remember', {})).status, 404);

  // versões, aprovação e revisões
  const vs = (await api('GET', '/api/chats/d-grokbot/versions')).json; const fam = vs.families.find((f) => f.versions.length === 3); assert.ok(fam, 'família com 3 versões'); assert.deepEqual(fam.versions.map((v) => v.v), [1, 2, 3]);
  assert.equal(vs.families.some((f) => f.versions.some((v) => v.name === 'roteiro-erin.pdf')), false, 'documento solto não vira família');
  const ap = (await api('POST', `/api/chats/d-grokbot/files/${v2.id}/approve`, { on: true })).json.flags;
  assert.equal(ap[v2.id].approved, true); assert.equal(ap[v1.id].rev, true); assert.equal(ap[v3.id]?.rev, undefined, 'a v3 é mais nova: não vira revisão');
  assert.equal((await api('POST', `/api/chats/d-grokbot/files/${v3.id}/approve`, { on: true })).json.flags[v2.id].approved, undefined, 'só uma aprovada por família');
  assert.equal((await api('POST', `/api/chats/d-grokbot/files/${v2.id}/drive-approved`, {})).status, 400, 'v2 deixou de ser a aprovada');
  await api('POST', `/api/chats/d-grokbot/files/${v2.id}/approve`, { on: true });
  const da = (await api('POST', `/api/chats/d-grokbot/files/${v2.id}/drive-approved`, {})).json;
  assert.ok(da.paths[0].endsWith('/erin-previa-v2-720p.mp4') && da.paths[0].startsWith('Sophie | UK/'), da.paths.join());
  assert.ok(existsSync(join(driveDir, 'Sophie | UK', 'erin-previa-v2-720p.mp4'))); assert.ok(existsSync(join(driveDir, 'Sophie | UK', 'revisoes', 'erin-previa-v1-720p.mp4')), 'revisão na pasta revisoes');
  assert.ok(events.some((e) => e.type === 'flags'));

  // Drive em lote (usa a pasta do cliente)
  const { job } = (await api('POST', '/api/drive/upload-many', { fileIds: [v3.id, doc.id] })).json;
  await wait(() => events.find((e) => e.type === 'drive' && e.job === job && e.finished));
  const fin = events.find((e) => e.type === 'drive' && e.job === job && e.finished); assert.equal(fin.ok, true); assert.equal(fin.paths.length, 2);
  assert.ok(existsSync(join(driveDir, 'Sophie | UK', 'roteiro-erin.pdf')));
  assert.equal((await api('GET', '/api/drive')).json.root, driveDir);
  const lk = (await api('POST', '/api/drive/link', { path: 'Sophie | UK/roteiro-erin.pdf' })).json; assert.equal(lk.search, true); assert.match(lk.url, /drive\.google\.com\/drive\/search\?q=roteiro-erin\.pdf/);

  // uso e custos
  const us = (await api('GET', '/api/usage')).json; assert.ok(us.today.calls >= 3); assert.ok(us.days.length >= 1); assert.ok(us.total.grokbot >= 3);

  // exportação
  const md = await getText('/api/chats/d-grokbot/export'); assert.equal(md.status, 200); assert.match(md.disp, /attachment/); assert.match(md.text, /# Grokbot/); assert.match(md.text, /erin-previa-v1-720p\.mp4/); assert.match(md.text, /em resposta a/); assert.doesNotMatch(md.text, /\[\[APROVAR\]\]/);
  assert.equal(JSON.parse((await getText('/api/chats/d-grokbot/export?fmt=json')).text).id, 'd-grokbot');
  const csv = await getText('/api/export/deliveries'); assert.match(csv.type, /csv/); assert.match(csv.text, /erin-previa-v2-720p\.mp4/); assert.match(csv.text, /https:\/\/exemplo\.com\/pasta-erin/); assert.match(csv.text, /Sophie \| UK/);
  const all = JSON.parse((await getText('/api/export/all')).text); assert.ok(all.chats.length >= 4 && all.projects.length === 1 && all.bots.length >= 4); assert.equal(JSON.stringify(all).includes(token), false, 'sem o token de acesso');
  assert.equal((await getText('/api/chats/nao-existe/export')).status, 404);

  // backup
  const bk = (await api('POST', '/api/backup')).json; assert.match(bk.name, /^backup-/); assert.equal(bk.backups.length, 1);
  const bdir = join(data, 'backups', bk.name); assert.ok(existsSync(join(bdir, 'chats', 'd-grokbot.json'))); assert.ok(existsSync(join(bdir, 'projects.json'))); assert.equal(existsSync(join(bdir, 'auth.json')), false, 'sem o token'); assert.equal(existsSync(join(bdir, 'files')), false, 'sem os arquivos pesados');

  // GitHub: envia o código, sem segredos
  assert.equal((await api('PUT', '/api/github', { repo: 'errado' })).status, 400);
  assert.equal((await api('PUT', '/api/github', { repo: 'https://github.com/natandata/data-house.git', auto: true })).json.repo, 'natandata/data-house');
  writeFileSync(join(src, 'vazou.txt'), 'meu token ' + token);
  const bad = await api('POST', '/api/github/push', {}); assert.equal(bad.status, 502); assert.match(bad.json.error, /bloqueado/);
  await wait(async () => events.some((e) => e.type === 'notify' && /GitHub/.test(e.title)));
  execSync(`rm "${join(src, 'vazou.txt')}"`);
  const ok1 = (await api('POST', '/api/github/push', { message: 'primeiro envio' })).json; assert.equal(ok1.note, 'enviado'); assert.match(ok1.sha, /^[0-9a-f]{7}$/);
  const files = execSync(`git -C "${remote}" ls-tree -r --name-only main`).toString().split('\n').filter(Boolean);
  assert.deepEqual(files.sort(), ['package.json', 'web/app.js'], 'só o código: sem .env e sem data/');
  assert.equal(execSync(`git -C "${remote}" log main -1 --format=%s`).toString().trim(), 'primeiro envio');
  assert.equal((await api('POST', '/api/github/push', {})).json.note, 'nada novo para enviar');
  writeFileSync(join(src, 'web', 'app.js'), 'console.log(2)');
  assert.equal((await api('POST', '/api/github/push', {})).json.note, 'enviado');
  const gh = (await api('GET', '/api/github')).json; assert.equal(gh.lastResult, 'enviado'); assert.equal(gh.auto, true);

  // reiniciar: a rota existe e a Central volta (testada à parte no e2e principal); aqui só confere a pausa
  assert.equal((await api('DELETE', `/api/projects/${pr.id}`)).json.ok, true);
  assert.equal((await api('GET', '/api/state')).json.chats.find((c) => c.id === 'd-grokbot').project, '');
  console.log('OK: funções extras passaram em todos os testes');
} catch (e) {
  console.error('FALHOU:', e.message); console.error(out.slice(-1500)); process.exitCode = 1;
} finally { srv.kill(); }
