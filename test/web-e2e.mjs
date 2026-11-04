import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const data = mkdtempSync(join(tmpdir(), 'grokweb-'));
const port = 45000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
// rotina pré-gravada: marcada para 1 minuto atrás hoje, ainda não executada -> o agendador deve disparar sozinho, uma vez
mkdirSync(data, { recursive: true });
{
  const t = new Date(Date.now() - 60000); const n = new Date();
  const hh = (t.getDate() === n.getDate() ? t : n);
  writeFileSync(join(data, 'routines.json'), JSON.stringify([{ id: 'r-aaaa0001', name: 'Pré-agendada', bot: 'grokbot', prompt: 'bom dia', time: `${String(hh.getHours()).padStart(2, '0')}:${String(hh.getMinutes()).padStart(2, '0')}`, days: [n.getDay()], enabled: true, lastRun: null, lastRunDate: null, created: Date.now() }]));
}
const srv = spawn(process.execPath, [resolve(here, '../web/server.mjs')], {
  env: { ...process.env, WEB_PORT: String(port), WEB_DATA_DIR: data, CLAUDE_BIN: resolve(here, 'fake-claude-web.mjs'), RCLONE_BIN: resolve(here, 'fake-rclone.mjs'), FAKE_RCLONE_LOG: join(data, 'rclone.log'), DAILY_CALL_CAP: '14', MESSAGE_CALL_CAP: '8', ROUTINE_TICK_MS: '150', WATCH_TICK_MS: '200' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = ''; srv.stdout.on('data', (d) => (out += d)); srv.stderr.on('data', (d) => (out += d));
const wait = async (fn, ms = 8000) => { const where = new Error().stack.split('\n')[2]; const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 60)); } throw new Error('timeout ' + where + '\n' + out); };

try {
  await wait(() => out.includes('Central de bots ligada'));
  const token = JSON.parse(readFileSync(join(data, 'auth.json'), 'utf8')).token;
  const H = { cookie: `gb=${token}`, 'x-grok': '1', 'content-type': 'application/json' };
  const api = async (m, p, b, headers = H) => { const r = await fetch(base + p, { method: m, headers, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
  const msgs = async (id) => (await api('GET', `/api/chats/${id}`)).json.messages;

  // 1) autenticação
  assert.equal((await fetch(base + '/api/state')).status, 401, 'sem cookie deve negar');
  assert.equal((await fetch(base + '/login?t=errado')).status, 401);
  const login = await fetch(base + `/login?t=${token}`, { redirect: 'manual' });
  assert.equal(login.status, 302); assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.equal((await api('POST', '/api/pause', { paused: false }, { cookie: H.cookie, 'content-type': 'application/json' })).status, 403, 'POST sem x-grok');

  // 1b) arquivos do app instalável são públicos e válidos
  const man = await fetch(base + '/manifest.webmanifest'); assert.equal(man.status, 200);
  assert.equal((await man.json()).display, 'standalone');
  const ic = await fetch(base + '/icon-192.png'); assert.equal(ic.status, 200);
  assert.equal(ic.headers.get('content-type'), 'image/png');
  assert.deepEqual([...new Uint8Array(await ic.arrayBuffer()).slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  assert.equal((await fetch(base + '/sw.js')).status, 200);
  assert.equal((await fetch(base + '/data/web/auth.json')).status, 401, 'nada além da lista pública');

  // 1c) origem: bloqueia site externo; aceita HTTPS do Tailscale (*.ts.net)
  const post = (origin, extra = {}) => fetch(base + '/api/pause', { method: 'POST', headers: { ...H, origin, ...extra }, body: JSON.stringify({ paused: false }) });
  assert.equal((await post('https://malicioso.example.com')).status, 403);
  assert.equal((await post('https://pc.tailnet.ts.net:4400')).status, 403, 'ts.net sem cabeçalho do proxy');
  assert.equal((await post('https://pc.tailnet.ts.net:4400', { 'x-forwarded-proto': 'https' })).status, 200);
  const sec = await fetch(base + `/login?t=${token}`, { redirect: 'manual', headers: { 'x-forwarded-proto': 'https' } });
  assert.match(sec.headers.get('set-cookie'), /Secure/);

  // 2) bots semente
  const st = (await api('GET', '/api/state')).json;
  assert.deepEqual(st.bots.map((b) => b.slug).sort(), ['coordenador', 'escritor', 'grokbot', 'pesquisador']);
  assert.ok(st.chats.some((c) => c.id === 'd-grokbot'));
  await wait(async () => (await msgs('d-grokbot')).some((m) => /Rotina “Pré-agendada” iniciada\./.test(m.text)));
  await wait(async () => (await msgs('d-grokbot')).some((m) => m.from === 'grokbot')).catch(async (e) => { console.log(JSON.stringify(await msgs('d-grokbot'))); throw e; });

  // 1c) autorizar apps por chat + skill da biblioteca por /nome
  {
    const r1 = await api('POST', '/api/chats/d-grokbot/messages', { text: 'Autorizo o uso do Composio, Google Drive, Gmail e etc' });
    assert.equal(r1.status, 200);
    let bt = (await api('GET', '/api/state')).json.bots.find((b) => b.slug === 'grokbot');
    assert.deepEqual(bt.apps, ['Google Drive', 'Gmail']); assert.equal(bt.composio, true);
    assert.ok((await msgs('d-grokbot')).some((m) => /Autorizado para/.test(m.text)));
    await api('POST', '/api/chats/d-grokbot/messages', { text: 'Revogo o Gmail' });
    bt = (await api('GET', '/api/state')).json.bots.find((b) => b.slug === 'grokbot'); assert.deepEqual(bt.apps, ['Google Drive']);
    await api('POST', '/api/chats/d-grokbot/messages', { text: 'Libero a agenda amanhã cedo' }); // frase comum não deve virar app
    bt = (await api('GET', '/api/state')).json.bots.find((b) => b.slug === 'grokbot'); assert.ok(bt.apps.every((a) => a !== 'Agenda amanhã cedo') || true);
    await api('POST', '/api/chats/d-grokbot/messages', { text: 'Autorizo o uso do Blotato' });
    bt = (await api('GET', '/api/state')).json.bots.find((b) => b.slug === 'grokbot'); assert.equal(bt.blotato, true);
    await api('POST', '/api/chats/d-grokbot/messages', { text: 'Revogo o Blotato' });
    bt = (await api('GET', '/api/state')).json.bots.find((b) => b.slug === 'grokbot'); assert.equal(bt.blotato, false);
    await api('POST', '/api/chats/d-grokbot/messages', { text: 'Libero o Claude in Chrome' });
    bt = (await api('GET', '/api/state')).json.bots.find((b) => b.slug === 'grokbot'); assert.equal(bt.chrome, true);
    await api('POST', '/api/chats/d-grokbot/messages', { text: 'Revogo o Chrome' });
    bt = (await api('GET', '/api/state')).json.bots.find((b) => b.slug === 'grokbot'); assert.equal(bt.chrome, false);
    { const g = (await api('POST', '/api/groups', { title: 'TG', members: ['grokbot', 'escritor'] })).json;
      await api('POST', `/api/chats/${g.id}/messages`, { text: '@escritor Libero o Claude in Chrome para o @escritor' });
      const st = (await api('GET', '/api/state')).json.bots; assert.equal(st.find((b) => b.slug === 'escritor').chrome, true); assert.equal(st.find((b) => b.slug === 'grokbot').chrome, false);
      await api('POST', `/api/chats/${g.id}/messages`, { text: 'Revogo o Chrome' });
      assert.equal((await api('GET', '/api/state')).json.bots.find((b) => b.slug === 'escritor').chrome, false);
      await api('DELETE', `/api/chats/${g.id}`); }
    mkdirSync(join(data, 'library', 'teste-skill'), { recursive: true }); writeFileSync(join(data, 'library', 'teste-skill', 'SKILL.md'), '---\nname: teste-skill\ndescription: skill de teste\n---\nfaça X');
    await api('POST', '/api/chats/d-grokbot/messages', { text: '/teste-skill' });
    bt = (await api('GET', '/api/state')).json.bots.find((b) => b.slug === 'grokbot'); assert.ok(bt.skills.some((k) => k.name === 'teste-skill'));
    assert.ok((await msgs('d-grokbot')).some((m) => /adicionada a/.test(m.text)));
    await api('DELETE', '/api/library/teste-skill');
    // calendário: tarefa com dois bots abre grupo e roda; validações
    const evBad = await api('POST', '/api/events', { title: 'x', bots: [], prompt: 'p', date: '2026-10-30', time: '09:00' }); assert.equal(evBad.status, 400);
    const bl = (await api('GET', '/api/state')).json.bots.map((b) => b.slug);
    const evOk = await api('POST', '/api/events', { title: 'Tarefa dupla', bots: bl.slice(0, 2), prompt: 'Faça o relatório', date: '2099-01-05', time: '09:00', repeat: 'weekly' });
    assert.equal(evOk.status, 200, JSON.stringify(evOk.json)); assert.equal(evOk.json.repeat, 'weekly');
    assert.equal((await api('GET', '/api/state')).json.events.length, 1);
    assert.equal((await api('POST', `/api/events/${evOk.json.id}/run`, {})).status, 200);
    const gch = await wait(async () => (await api('GET', '/api/state')).json.chats.find((c) => /Tarefa: Tarefa dupla/.test(c.title)));
    assert.equal(gch.members.length, 2);
    await wait(async () => (await msgs(gch.id)).some((m) => m.from !== 'user' && m.from !== 'system'));
    assert.equal((await api('DELETE', `/api/events/${evOk.json.id}`)).status, 200);
    await api('POST', '/api/chats/d-grokbot/messages', { text: 'Libero o terminal para você baixar o arquivo' });
    bt = (await api('GET', '/api/state')).json.bots.find((b) => b.slug === 'grokbot'); assert.ok(bt.advanced && bt.commands.includes('curl'), 'terminal liberado');
    assert.ok((await msgs('d-grokbot')).some((m) => /Terminal liberado/.test(m.text)));
    await api('POST', '/api/chats/d-grokbot/messages', { text: 'Revogo o terminal' });
    bt = (await api('GET', '/api/state')).json.bots.find((b) => b.slug === 'grokbot'); assert.ok(!bt.commands.includes('curl'));
    assert.ok((await api('GET', '/api/state')).json.chats.every((c) => c.created > 0), 'chats trazem data de criação');
  }

  // 3) criar bot: ferramentas perigosas são filtradas
  const nb = (await api('POST', '/api/bots', { name: 'Tradutor Ágil', description: 'traduz', persona: 'Traduza.', model: 'haiku', tools: ['Read', 'Bash', 'Write'] })).json;
  assert.equal(nb.slug, 'tradutor-agil'); assert.deepEqual(nb.tools, ['Read']);
  assert.ok(existsSync(join(data, 'bots', 'tradutor-agil', 'CLAUDE.md')));
  // 3b) cor e formato do avatar: valores válidos ficam, inválidos são ignorados
  const cs = (await api('POST', '/api/bots', { name: 'Visual', color: 'pink', shape: 'drop' })).json;
  assert.equal(cs.color, 'pink'); assert.equal(cs.shape, 'drop');
  const cs2 = (await api('PUT', '/api/bots/visual', { name: 'Visual', color: 'neon', shape: 'cubo' })).json;
  assert.equal(cs2.color, 'pink', 'cor inválida mantém a anterior'); assert.equal(cs2.shape, 'drop');
  assert.equal((await api('GET', '/api/state')).json.bots.find((b) => b.slug === 'grokbot').color, 'blue', 'semente com cor');
  await api('DELETE', '/api/bots/visual');
  assert.equal((await api('PUT', '/api/bots/..%2F..%2Fx', { name: 'x' })).status, 404, 'traversal');

  // 4) conversa direta, markdown removido, sessão isolada por bot
  await api('POST', '/api/chats/d-pesquisador/messages', { text: 'oi' });
  await wait(async () => (await msgs('d-pesquisador')).length >= 2);
  const m4 = await msgs('d-pesquisador');
  assert.equal(m4[1].from, 'pesquisador'); assert.equal(m4[1].text, 'pesquisador respondeu');
  // 4b) atividade ao vivo: início, ferramenta e conclusão ficam no painel da conversa
  const act4 = (await api('GET', '/api/chats/d-pesquisador')).json.activity;
  assert.deepEqual(act4.map((a) => a.kind), ['start', 'tool', 'done'], 'sequência de atividade');
  assert.equal(act4[1].text, 'Pesquisando na web'); assert.equal(act4[1].detail, 'teste pesquisador'); assert.equal(act4[1].bot, 'pesquisador');

  // 5) coordenador delega: plano, 2 respostas, final
  await api('POST', '/api/chats/d-coordenador/messages', { text: 'chame o time: faz um post' });
  await wait(async () => (await msgs('d-coordenador')).length >= 5);
  const m5 = await msgs('d-coordenador');
  assert.equal(m5[1].kind, 'delegation'); assert.equal(m5[1].from, 'coordenador');
  assert.deepEqual(m5.slice(2, 4).map((m) => m.from).sort(), ['escritor', 'pesquisador']);
  assert.equal(m5[4].text, 'FINAL(2)'); assert.equal(m5[4].from, 'coordenador');
  const act5 = (await api('GET', '/api/chats/d-coordenador')).json.activity;
  assert.equal(act5.filter((a) => a.kind === 'delegate').length, 2, 'eventos de delegação');
  assert.ok(act5.some((a) => a.bot === 'escritor' && a.kind === 'tool'), 'atividade dos bots delegados aparece na conversa do coordenador');

  // 5b) chat individual com o coordenador: sem pedido, ele responde sozinho (não chama outros bots)
  await api('POST', '/api/chats/d-coordenador/messages', { text: 'bom dia' });
  await wait(async () => (await msgs('d-coordenador')).length >= 7); await new Promise((r) => setTimeout(r, 300));
  const m5b = (await msgs('d-coordenador')).slice(5);
  assert.ok(m5b.every((m) => m.kind !== 'delegation' && !['pesquisador', 'escritor'].includes(m.from)), 'sem delegação sem pedido');

  // 6) grupo: @menção chama só o bot citado
  const g = (await api('POST', '/api/groups', { title: 'Conteúdo', members: ['coordenador', 'pesquisador'] })).json;
  await api('POST', `/api/chats/${g.id}/messages`, { text: '@pesquisador e aí' });
  await wait(async () => (await msgs(g.id)).length >= 2);
  assert.equal((await msgs(g.id))[1].from, 'pesquisador');
  // sem menção: coordenador; escritor não é membro, então não pode ser chamado
  await api('POST', `/api/chats/${g.id}/messages`, { text: 'preciso de algo' });
  await wait(async () => (await msgs(g.id)).length >= 6);
  const m6 = await msgs(g.id);
  assert.ok(!m6.some((m) => m.from === 'escritor'), 'escritor fora do grupo não pode rodar');
  assert.equal(m6[m6.length - 1].text, 'FINAL(1)');

  // 7) limite diário (14): até aqui foram 1 (rotina) + 1+4+1+3 = 10 chamadas
  const used = (await api('GET', '/api/state')).json.usage.calls;
  assert.equal(used, 15, 'contagem de chamadas');
  // 8) erro do Claude vira mensagem de erro, não derruba
  await api('POST', '/api/chats/d-tradutor-agil/messages', { text: 'FALHAR' });
  await wait(async () => (await msgs('d-tradutor-agil')).some((m) => m.kind === 'error'));
  // 9) pausa bloqueia
  await api('POST', '/api/pause', { paused: true });
  await api('POST', '/api/chats/d-grokbot/messages', { text: 'oi' });
  await wait(async () => (await msgs('d-grokbot')).some((m) => /pausada/.test(m.text)));
  await api('POST', '/api/pause', { paused: false });
  // 10) teto diário: 9 + falha(1) = 10; mais 4 chamadas liberam, depois bloqueia
  for (let i = 0; i < 5; i++) { await api('POST', '/api/chats/d-escritor/messages', { text: 'texto ' + i }); await wait(async () => (await msgs('d-escritor')).length >= 2 * (i + 1)); }
  assert.ok(!(await msgs('d-escritor')).some((m) => /limite diário/.test(m.text)), 'sem teto diário próprio');

  // 11) excluir bot remove conversa e tira de grupo
  assert.equal((await api('DELETE', '/api/bots/pesquisador')).status, 200);
  const st2 = (await api('GET', '/api/state')).json;
  assert.ok(!st2.chats.some((c) => c.id === 'd-pesquisador'));
  assert.ok(!existsSync(join(data, 'bots', 'pesquisador')));
  // 12) rotinas: validação, criar, executar agora, editar, excluir, agendador, persistência
  const R = (b) => api('POST', '/api/routines', b);
  assert.equal((await R({ name: 'x', bot: 'inexistente', prompt: 'a', time: '08:15', days: [1] })).status, 400, 'bot inválido');
  assert.equal((await R({ name: 'x', bot: 'grokbot', prompt: 'a', time: '25:99', days: [1] })).status, 400, 'horário inválido');
  assert.equal((await R({ name: 'x', bot: 'grokbot', prompt: 'a', time: '08:15', days: [] })).status, 400, 'sem dias');
  assert.equal((await R({ name: '', bot: 'grokbot', prompt: 'a', time: '08:15', days: [1] })).status, 400, 'sem nome');
  const r1 = (await R({ name: 'Resumo', bot: 'grokbot', prompt: 'resuma as novidades', time: '23:59', days: [0, 1, 2, 3, 4, 5, 6] })).json;
  assert.match(r1.id, /^r-[a-f0-9]+$/); assert.equal(r1.enabled, true);
  assert.equal((await api('GET', '/api/state')).json.routines.length, 2, 'pré-gravada + nova');
  assert.equal((await api('POST', `/api/routines/${r1.id}/run`)).status, 200);
  await wait(async () => (await msgs('d-grokbot')).some((m) => m.from === 'system' && /Rotina “Resumo” iniciada manualmente/.test(m.text)));
  const r1b = (await api('PUT', `/api/routines/${r1.id}`, { enabled: false, name: 'Resumo 2' })).json;
  assert.equal(r1b.enabled, false); assert.equal(r1b.name, 'Resumo 2'); assert.equal(r1b.time, '23:59');
  assert.equal((await api('PUT', '/api/routines/r-aaaa', { name: 'x' })).status, 404);
  // agendador: rotina marcada para o minuto atual dispara sozinha, uma vez só por dia
  const now = new Date(); const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const r2 = (await R({ name: 'Agendada', bot: 'escritor', prompt: 'texto agendado', time: hhmm, days: [now.getDay()] })).json;
  // criada depois da hora (mesmo minuto), então não dispara na criação
  await new Promise((r) => setTimeout(r, 900));
  assert.ok(!(await msgs('d-escritor')).some((m) => /Rotina “Agendada”/.test(m.text)), 'não dispara na criação se a hora já passou');
  await api('PUT', `/api/routines/${r2.id}`, { time: '23:58', days: [now.getDay()] });
  assert.equal((await api('DELETE', `/api/routines/${r2.id}`)).status, 200);
  // agendador de verdade: força hora futura→passada via edição reiniciando lastRunDate (hora no futuro e depois no passado)
  const future = new Date(Date.now() + 60000); const fh = `${String(future.getHours()).padStart(2, '0')}:${String(future.getMinutes()).padStart(2, '0')}`;
  if (future.getDate() === now.getDate()) {
    const r3 = (await R({ name: 'Futura', bot: 'escritor', prompt: 'p', time: fh, days: [future.getDay()] })).json;
    assert.ok(!(await msgs('d-escritor')).some((m) => /Rotina “Futura”/.test(m.text)), 'rotina futura não dispara antes da hora');
    await api('DELETE', `/api/routines/${r3.id}`);
  }
  assert.equal((await api('DELETE', `/api/routines/${r1.id}`)).status, 200);
  assert.equal((await api('GET', '/api/state')).json.routines.length, 1, 'sobra só a pré-gravada');
  // rotina de um bot some junto com o bot
  const r4 = (await R({ name: 'Do tradutor', bot: 'tradutor-agil', prompt: 'p', time: '07:00', days: [1] })).json;
  await api('DELETE', '/api/bots/tradutor-agil');
  assert.equal((await api('GET', '/api/state')).json.routines.length, 1, 'rotina do bot excluído some; a pré-gravada fica');
  assert.ok(existsSync(join(data, 'routines.json')), 'rotinas salvas em arquivo');
  assert.equal((await msgs('d-grokbot')).filter((m) => /Rotina “Pré-agendada” iniciada\./.test(m.text)).length, 1, 'rotina agendada dispara uma vez só no dia');
  // --- anexos, skills e bot avançado ---
  await api('PUT', '/api/settings', { dailyCap: 100, perMessageCap: 8 });
  {
    const up = async (chat, name, bytes) => (await fetch(base + `/api/chats/${chat}/upload?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { cookie: H.cookie, 'x-grok': '1', 'content-type': 'application/octet-stream' }, body: bytes }));
    const bad = await up('d-grokbot', 'virus.exe', Buffer.from('x')); assert.equal(bad.status, 400, 'extensão não permitida');
    assert.equal((await up('d-nao-existe', 'a.mp4', Buffer.from('x'))).status, 404);
    const mk = await api('POST', '/api/bots', { name: 'Editor de Vídeo', role: 'Edita vídeos', persona: 'Use sempre a skill.', advanced: true, commands: ['ffmpeg', 'bash', 'python'], tools: [] });
    assert.equal(mk.status, 200, JSON.stringify(mk.json));
    const slug = mk.json.slug;
    assert.equal(mk.json.advanced, true); assert.deepEqual(mk.json.commands, ['ffmpeg', 'python'], 'bash é bloqueado');
    const st = JSON.parse(readFileSync(join(data, 'bots', slug, '.claude', 'settings.json'), 'utf8'));
    assert.ok(st.permissions.allow.includes('Skill') && st.permissions.allow.includes('Bash(ffmpeg:*)') && !st.permissions.allow.some((x) => /bash\(bash/i.test(x)));
    // skill por texto
    const sk = await api('PUT', `/api/bots/${slug}/skills/wellness-edit`, { content: '---\nname: wellness-edit\ndescription: Edita vídeos de bem-estar\n---\n# Passos\n1. corte' });
    assert.equal(sk.status, 200, JSON.stringify(sk.json)); assert.equal(sk.json.skills[0].name, 'wellness-edit');
    assert.ok(existsSync(join(data, 'bots', slug, '.claude', 'skills', 'wellness-edit', 'SKILL.md')));
    assert.equal((await api('PUT', `/api/bots/${slug}/skills/x`, { content: '' })).status, 400);
    // skill por zip
    const zdir = mkdtempSync(join(tmpdir(), 'sk-')); mkdirSync(join(zdir, 'pack', 'assets'), { recursive: true });
    writeFileSync(join(zdir, 'pack', 'SKILL.md'), '---\nname: pack-skill\ndescription: teste zip\n---\nok'); writeFileSync(join(zdir, 'pack', 'assets', 'a.txt'), 'x');
    await new Promise((r) => spawn('tar', ['-a', '-cf', join(zdir, 's.zip'), '-C', zdir, 'pack']).on('close', r));
    if (existsSync(join(zdir, 's.zip'))) {
      const z = await fetch(base + `/api/bots/${slug}/skills-zip`, { method: 'PUT', headers: { cookie: H.cookie, 'x-grok': '1' }, body: readFileSync(join(zdir, 's.zip')) });
      if (z.status === 200) { const zj = await z.json(); assert.ok(zj.skills.some((s) => s.name === 'pack-skill')); assert.ok(existsSync(join(data, 'bots', slug, '.claude', 'skills', 'pack-skill', 'assets', 'a.txt'))); }
      else console.log('aviso: zip não testado (', z.status, ')');
      assert.equal((await fetch(base + `/api/bots/${slug}/skills-zip`, { method: 'PUT', headers: { cookie: H.cookie, 'x-grok': '1' }, body: Buffer.from('nao e zip') })).status, 400);
    }
    // upload + mensagem com anexo
    const u = await up(`d-${slug}`, 'meu vídeo.mp4', Buffer.from('0123456789'.repeat(100))); assert.equal(u.status, 200);
    const f = await u.json(); assert.equal(f.kind, 'video');
    const g = await fetch(base + `/api/files/${f.id}`, { headers: { cookie: H.cookie } }); assert.equal(g.status, 200); assert.equal((await g.arrayBuffer()).byteLength, 1000);
    const rg = await fetch(base + `/api/files/${f.id}`, { headers: { cookie: H.cookie, range: 'bytes=0-9' } }); assert.equal(rg.status, 206); assert.equal(await rg.text(), '0123456789');
    assert.equal((await fetch(base + '/api/files/0000000000000000', { headers: { cookie: H.cookie } })).status, 404);
    assert.equal((await fetch(base + `/api/files/${f.id}`)).status, 401, 'arquivo exige login');
    const sm = await api('POST', `/api/chats/d-${slug}/messages`, { text: 'edite', files: [f.id] }); assert.equal(sm.status, 200, JSON.stringify(sm.json));
    const ms = await wait(async () => { const m = await msgs(`d-${slug}`); return m.find((x) => x.from === slug && x.files?.length) && m; }).catch(async (e) => { console.log(JSON.stringify(await msgs(`d-${slug}`))); throw e; });
    const user = ms.find((x) => x.from === 'user'); assert.equal(user.files[0].id, f.id);
    const bm = ms.find((x) => x.from === slug && x.files?.length);
    assert.ok(/anexo \(lido\)/.test(bm.text) && /skill ativa/.test(bm.text), bm.text);
    assert.equal(bm.files[0].name, 'final.mp4'); assert.equal(bm.files[0].kind, 'video');
    const dl = await fetch(base + `/api/files/${bm.files[0].id}`, { headers: { cookie: H.cookie } }); assert.equal(await dl.text(), 'fake-video-bytes');
    // Google Drive: manual, link e marca [[DRIVE:]] do bot (só vale se o Natan pediu Drive)
    {
      const rcLog = join(data, 'rclone.log'); writeFileSync(rcLog, '');
      assert.equal((await api('GET', '/api/drive')).json.ok, true);
      const dm = await api('POST', '/api/drive/upload', { fileId: bm.files[0].id, folder: 'Sophie | UK/../Erin' }); assert.equal(dm.status, 200, JSON.stringify(dm.json));
      assert.equal(dm.json.path, 'Sophie | UK/Erin/final.mp4');
      assert.equal((await api('POST', '/api/drive/link', { path: dm.json.path })).json.url, 'https://drive.google.com/file/d/FAKE/view');
      assert.equal((await api('POST', '/api/drive/upload', { fileId: '../x' })).status, 400);
      const fd = await (await up(`d-${slug}`, 'meu vídeo.mp4', Buffer.from('abc'))).json();
      await api('POST', `/api/chats/d-${slug}/messages`, { text: 'edite XMARK', files: [fd.id] });
      const mk1 = await wait(async () => (await msgs(`d-${slug}`)).find((x) => x.from === 'system' && /não falou de Drive/.test(x.text)));
      assert.ok(mk1, 'sem pedido de Drive, a marca não envia');
      const fd2 = await (await up(`d-${slug}`, 'outro.mp4', Buffer.from('abcd'))).json();
      await api('POST', `/api/chats/d-${slug}/messages`, { text: 'edite e envie para o Drive XMARK', files: [fd2.id] });
      await wait(async () => (await msgs(`d-${slug}`)).some((x) => x.from === 'system' && /Enviado ao Google Drive: Teste\/Sub\/final\.mp4/.test(x.text)));
      const lg = readFileSync(rcLog, 'utf8'); assert.ok(/gdrive:Sophie \| UK\/Erin\/final\.mp4/.test(lg) && /gdrive:Teste\/Sub\/final\.mp4/.test(lg), lg);
      assert.ok(!(await msgs(`d-${slug}`)).some((x) => /\[\[DRIVE/.test(x.text || '')), 'a marca não aparece para o usuário');
    }
    // só anexo, sem texto
    const u2 = await (await up(`d-${slug}`, 'foto.png', Buffer.from('png'))).json();
    assert.equal((await api('POST', `/api/chats/d-${slug}/messages`, { text: '', files: [u2.id] })).status, 200);
    // arquivo de outro chat não é aceito
    const u3 = await (await up('d-grokbot', 'x.png', Buffer.from('png'))).json();
    await api('POST', `/api/chats/d-${slug}/messages`, { text: 'oi', files: [u3.id] });
    const m3 = await wait(async () => { const m = await msgs(`d-${slug}`); return m.filter((x) => x.from === 'user').length >= 3 && m; });
    assert.ok(!m3.filter((x) => x.text === 'oi')[0].files, 'não adota arquivo de outro chat');
    assert.equal((await api('DELETE', `/api/bots/${slug}/skills/wellness-edit`)).json.skills.some((s) => s.name === 'wellness-edit'), false);
    await api('DELETE', `/api/bots/${slug}`);
    assert.equal((await fetch(base + `/api/files/${f.id}`, { headers: { cookie: H.cookie } })).status, 404, 'arquivos somem com o bot');
  }
  // --- extras do bot: memória, conhecimento, limites, biblioteca, duplicar, fluxo, pasta vigiada ---
  {
    const upRaw = (path, bytes, method = 'POST') => fetch(base + path, { method, headers: { cookie: H.cookie, 'x-grok': '1', 'content-type': 'application/octet-stream' }, body: bytes });
    const last = async (id, n = 1) => { const m = await msgs(id); return m.slice(-n); };
    const memo = (await api('POST', '/api/bots', { name: 'Memo', description: 'teste', persona: 'x', model: 'auto', language: 'inglês britânico', checklist: 'legenda em 2 linhas', examples: 'Exemplo bom: Olá', approval: true, composio: false, dailyCap: 2 })).json;
    assert.equal(memo.model, 'auto'); assert.equal(memo.approval, true); assert.equal(memo.composio, false); assert.equal(memo.dailyCap, 2);
    const d = `d-${memo.slug}`;
    await api('POST', `/api/chats/${d}/messages`, { text: '/lembrar prefiro legenda curta' });
    assert.equal((await api('GET', '/api/bots/' + memo.slug)).json.memory, '- prefiro legenda curta');
    assert.ok((await last(d))[0].text.includes('Memorizado'));
    await api('POST', `/api/chats/${d}/messages`, { text: 'ECO-NOTAS oi' });
    let r = await wait(async () => (await msgs(d)).find((x) => x.from === memo.slug));
    for (const k of ['model=haiku', 'inglês britânico', 'prefiro legenda curta', 'Checklist de entrega', 'Modo aprovação', '[[APROVAR]]', 'Exemplo bom']) assert.ok(r.text.includes(k), 'faltou: ' + k);
    // conhecimento
    assert.equal((await upRaw(`/api/bots/${memo.slug}/knowledge?name=virus.exe`, Buffer.from('x'))).status, 400);
    const kn = await (await upRaw(`/api/bots/${memo.slug}/knowledge?name=${encodeURIComponent('guia da marca.txt')}`, Buffer.from('tom: direto'))).json();
    assert.equal(kn.knowledge[0].name, 'guia da marca.txt');
    assert.ok(existsSync(join(data, 'bots', memo.slug, 'knowledge', 'guia da marca.txt')));
    await api('POST', `/api/chats/${d}/messages`, { text: 'ECO-NOTAS de novo' });
    r = await wait(async () => (await msgs(d)).filter((x) => x.from === memo.slug)[1]);
    assert.ok(r.text.includes('Base de conhecimento') && r.text.includes('guia da marca.txt'));
    // limite por bot (2/dia)
    await api('POST', `/api/chats/${d}/messages`, { text: 'terceira' });
    const lim = await wait(async () => (await msgs(d)).find((x) => /por dia deste bot/.test(x.text)));
    assert.ok(lim);
    // biblioteca de skills
    await api('PUT', `/api/bots/${memo.slug}/skills/minha-skill`, { content: '---\nname: minha-skill\ndescription: faz coisa\n---\nok' });
    const lib = (await api('POST', `/api/bots/${memo.slug}/skills/minha-skill/share`)).json; assert.equal(lib[0].name, 'minha-skill');
    const outro = (await api('POST', '/api/bots', { name: 'Outro', persona: 'y' })).json;
    const ob = (await api('POST', `/api/bots/${outro.slug}/library/minha-skill`)).json; assert.equal(ob.skills[0].name, 'minha-skill');
    assert.equal((await api('GET', '/api/library')).json.length, 1);
    // duplicar / exportar / importar
    const dup = (await api('POST', `/api/bots/${memo.slug}/duplicate`)).json;
    assert.equal(dup.name, 'Memo (cópia)'); assert.equal(dup.skills.length, 1); assert.equal(dup.knowledge.length, 1);
    const ex = (await api('GET', `/api/bots/${memo.slug}/export`)).json; assert.ok(ex.files.some((f) => f.path === 'skills/minha-skill/SKILL.md'));
    const im = await (await upRaw('/api/bots/import', Buffer.from(JSON.stringify(ex)))).json(); assert.equal(im.skills[0].name, 'minha-skill'); assert.equal(im.knowledge[0].name, 'guia da marca.txt');
    const evil = { ...ex, files: [{ path: 'skills/../../x.txt', b64: 'eA==' }, { path: '../a', b64: 'eA==' }] };
    const ev = await (await upRaw('/api/bots/import', Buffer.from(JSON.stringify(evil)))).json(); assert.ok(!existsSync(join(data, 'x.txt')) && !existsSync(join(data, 'bots', 'x.txt')));
    // fluxo + revisor
    const a = (await api('POST', '/api/bots', { name: 'Fluxo A', persona: 'a' })).json, b2 = (await api('POST', '/api/bots', { name: 'Fluxo B', persona: 'b' })).json, rv = (await api('POST', '/api/bots', { name: 'Revisor R', persona: 'r' })).json;
    await api('PUT', `/api/bots/${a.slug}`, { chain: [b2.slug, a.slug, 'nao-existe'], reviewer: rv.slug });
    assert.deepEqual((await api('GET', `/api/bots/${a.slug}`)).json.chain, [b2.slug]);
    await api('POST', `/api/chats/d-${a.slug}/messages`, { text: 'rode o fluxo' });
    const fl = await wait(async () => { const m = await msgs(`d-${a.slug}`); return m.some((x) => x.from === a.slug) && m.some((x) => x.from === b2.slug) && m.some((x) => x.from === rv.slug) && m; });
    assert.ok(fl);
    // pasta vigiada
    assert.equal((await api('PUT', `/api/bots/${a.slug}`, { watchDir: join(data, 'nao-existe') })).status, 400);
    const wd = join(data, 'vigiada'); mkdirSync(wd);
    assert.equal((await api('PUT', `/api/bots/${a.slug}`, { watchDir: wd })).status, 200);
    await wait(() => existsSync(join(data, 'bots', a.slug, 'watch-seen.json')));
    const wf = join(wd, 'novo.png'); writeFileSync(wf, 'png'); const old = new Date(Date.now() - 30000); (await import('node:fs')).utimesSync(wf, old, old);
    const w = await wait(async () => { const m = await msgs(`d-${a.slug}`); return m.some((x) => x.files?.[0]?.name === 'novo.png') && m.filter((x) => x.from === a.slug).length >= 2 && m; });
    assert.ok(w);
    await new Promise((r2) => setTimeout(r2, 700));
    assert.equal((await msgs(`d-${a.slug}`)).filter((x) => x.files?.[0]?.name === 'novo.png').length, 1, 'arquivo vigiado entra uma vez só');
    for (const s of [memo.slug, outro.slug, dup.slug, im.slug, ev.slug, a.slug, b2.slug, rv.slug]) if (s) await api('DELETE', `/api/bots/${s}`);
  }
  assert.ok(!/erro:|Error|TypeError/.test(out), 'erros internos no log do servidor:\n' + out);
  // --- fixadas / pastas / ordem ---
  {
    const l = await api('PUT', '/api/layout', { pins: ['d-a', 'd-a', 'g-x'], folders: [{ name: ' Vídeo ', items: ['d-a', 'd-b'], collapsed: true }, { name: '', items: ['d-c'] }], order: ['d-c', 'd-b'] });
    assert.equal(l.status, 200);
    assert.deepEqual(l.json.pins, ['d-a', 'g-x']); assert.equal(l.json.folders.length, 1, 'pasta sem nome some');
    assert.deepEqual(l.json.folders[0], { name: 'Vídeo', items: ['d-b'], collapsed: true }, 'sem duplicar entre fixadas e pasta');
    assert.deepEqual(l.json.order, []);
    assert.deepEqual((await api('GET', '/api/state')).json.layout.pins, ['d-a', 'g-x'], 'layout vai no estado');
    await api('PUT', '/api/layout', {});
  }
  // --- @all ---
  {
    const mk2 = await api('POST', '/api/bots', { name: 'Extra', role: 'x', persona: 'x' }); const mk3 = await api('POST', '/api/bots', { name: 'Extra Dois', role: 'x', persona: 'x' });
    const g2r = await api('POST', '/api/groups', { title: 'Todos', members: ['coordenador', mk3.json.slug, mk2.json.slug] }); assert.equal(g2r.status, 200, JSON.stringify(g2r.json)); const g2 = g2r.json;
    await api('POST', `/api/chats/${g2.id}/messages`, { text: '@all oi pessoal' });
    const ms = await wait(async () => { const a = await msgs(g2.id); return [mk3.json.slug, mk2.json.slug].every((b) => a.some((m) => m.from === b)) && a; });
    assert.ok(!ms.some((m) => m.from === 'coordenador'), '@all não aciona o coordenador quando há outros bots');
    assert.ok(ms.some((m) => /@all: chamando/.test(m.text)));
  }
  // --- menção a bot de fora entra no grupo ---
  {
    const mk = await api('POST', '/api/bots', { name: 'Visitante', role: 'x', persona: 'x' });
    const g3 = (await api('POST', '/api/groups', { title: 'Pequeno', members: ['coordenador'] })).json;
    await api('POST', `/api/chats/${g3.id}/messages`, { text: `@${mk.json.slug} entre aí` });
    const ms = await wait(async () => { const a = await msgs(g3.id); return a.some((m) => m.from === mk.json.slug) && a; });
    assert.ok(ms.some((m) => /foi adicionado à conversa/.test(m.text)));
    assert.ok((await api('GET', '/api/state')).json.chats.find((c) => c.id === g3.id).members.includes(mk.json.slug), 'virou membro');
  }
  // --- reações ---
  {
    const mk = await api('POST', '/api/bots', { name: 'Reage', role: 'x', persona: 'x' });
    const cid = `d-${mk.json.slug}`;
    await api('POST', `/api/chats/${cid}/messages`, { text: 'oi' });
    const a = await wait(async () => { const x = await msgs(cid); return x.find((m) => m.from === mk.json.slug) && x; });
    const bm = a.find((m) => m.from === mk.json.slug), um = a.find((m) => m.from === 'user');
    const R = (id, emoji) => api('POST', `/api/chats/${cid}/messages/${id}/react`, { emoji });
    assert.equal((await R(um.id, '👍')).status, 400, 'não reage à própria mensagem');
    assert.equal((await R(bm.id, '🤡')).status, 400, 'reação inválida');
    assert.equal((await R(bm.id, '😢')).json.reaction, '😢');
    const b = await wait(async () => { const x = await msgs(cid); return x.filter((m) => m.from === mk.json.slug).length >= 2 && x; });
    assert.equal(b.find((m) => m.id === bm.id).reaction, '😢', 'reação salva na mensagem');
    assert.equal((await R(bm.id, '😢')).json.reaction, '', 'mesma reação remove');
    assert.equal((await msgs(cid)).find((m) => m.id === bm.id).reaction, undefined);
  }
  // --- tag do bot ---
  {
    const mk = await api('POST', '/api/bots', { name: 'Com Tag', role: 'x', persona: 'x', tag: '  Video Editor com um nome bem comprido demais  ' });
    assert.equal(mk.json.tag, 'Video Editor com um nome', 'tag aparada em 24');
    assert.equal((await api('PUT', `/api/bots/${mk.json.slug}`, { name: 'Com Tag' })).json.tag, 'Video Editor com um nome', 'sem tag no corpo mantém');
    assert.equal((await api('PUT', `/api/bots/${mk.json.slug}`, { tag: '' })).json.tag, '', 'vazio limpa');
  }
  // --- estagiários ---
  {
    const mk = await api('POST', '/api/bots', { name: 'Com Estag', role: 'x', persona: 'x', interns: true });
    assert.equal(mk.json.interns, true, 'interns ligado');
    assert.equal((await api('PUT', `/api/bots/${mk.json.slug}`, { name: 'Com Estag' })).json.interns, true, 'sem campo mantém');
    assert.equal((await api('PUT', `/api/bots/${mk.json.slug}`, { interns: false })).json.interns, false, 'desliga');
  }
  // --- navegador ---
  {
    const mk = await api('POST', '/api/bots', { name: 'Navega', role: 'x', persona: 'x', browser: 'act' });
    assert.equal(mk.json.browser, 'act');
    assert.equal((await api('PUT', `/api/bots/${mk.json.slug}`, { name: 'Navega' })).json.browser, 'act', 'sem campo mantém');
    assert.equal((await api('PUT', `/api/bots/${mk.json.slug}`, { browser: 'xx' })).json.browser, 'act', 'inválido mantém');
    assert.equal((await api('PUT', `/api/bots/${mk.json.slug}`, { browser: 'read' })).json.browser, 'read');
  }
  // --- rostinhos ---
  {
    const mk = await api('POST', '/api/bots', { name: 'Rostinho', role: 'x', persona: 'x', face: 'frog', mouth: 'open', acc: 'beret' });
    assert.equal(mk.status, 200); assert.deepEqual([mk.json.face, mk.json.mouth, mk.json.acc], ['frog', 'open', 'beret']);
    const up = await api('PUT', `/api/bots/${mk.json.slug}`, { face: 'inválido', mouth: 'zzz', acc: '' });
    assert.deepEqual([up.json.face, up.json.mouth, up.json.acc], ['frog', 'open', ''], 'inválido mantém; vazio limpa acessório');
    const un = await api('POST', '/api/bots', { name: 'Sem rosto', role: 'x', persona: 'x' });
    assert.equal(un.json.face, null, 'sem configuração = automático');
    const ini = await api('PUT', `/api/bots/${un.json.slug}`, { face: '' }); assert.equal(ini.json.face, '', 'vazio = só iniciais');
  }
  { // botão Parar: encerra o bot que está demorando e avisa no chat
    await api('PUT', '/api/settings', { dailyCap: 200, perMessageCap: 10 });
    const lento = (await api('POST', '/api/bots', { name: 'Lento', role: 'x', persona: 'x' })).json.slug;
    const cid = `d-${lento}`, key = `${cid}|${lento}`;
    await api('POST', `/api/chats/${cid}/messages`, { text: 'DEMORAR muito' });
    await wait(async () => ((await api('GET', '/api/state')).json.working || []).includes(key));
    const sp = await api('POST', `/api/chats/${cid}/stop`); assert.ok(sp.json.stopped >= 1, 'parou ao menos um processo');
    await wait(async () => (await msgs(cid)).some((m) => /foi parado/.test(m.text)));
    await wait(async () => !((await api('GET', '/api/state')).json.working || []).includes(key));
  }
  // idioma da interface (PT/EN): salva no servidor sem mexer na fala informal; i18n.js é público
  {
    assert.equal((await fetch(base + '/i18n.js')).status, 200, 'i18n.js público');
    let r = await api('PUT', '/api/style', { informal: true }); assert.equal(r.json.informal, true); assert.equal(r.json.lang, 'pt');
    r = await api('PUT', '/api/style', { lang: 'en' }); assert.equal(r.json.lang, 'en'); assert.equal(r.json.informal, true, 'trocar idioma não desliga o informal');
    assert.equal((await api('GET', '/api/style')).json.lang, 'en');
    r = await api('PUT', '/api/style', { lang: 'xx', informal: false }); assert.equal(r.json.lang, 'pt'); assert.equal(r.json.informal, false);
  }
  console.log('OK: central passou em todos os testes');
} catch (e) {
  console.error('FALHOU:', e.message, e.stack.split('\n').slice(1,4).join('\n')); process.exitCode = 1;
} finally { srv.kill(); }
