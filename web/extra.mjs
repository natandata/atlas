// Módulos extras da Central: busca, tarefas, projetos por cliente, memória, versões de entregas,
// exportação, backup, novidades e envio ao GitHub. O server.mjs liga tudo por createExtra(contexto).
import { readFile, readdir, rm, stat, cp, mkdir, copyFile } from 'node:fs/promises';
import { existsSync, createReadStream, createWriteStream } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';

const fold = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const URL_RE = /https?:\/\/[^\s<>"'`\])]+/g;
const hex = (n = 4) => randomBytes(n).toString('hex');

export function createExtra(X) {
  const { DATA, root, bots, chats, broadcast, readJson, writeJson, clip, httpErr, persist, fileMeta, fileDir, running, killTree, today } = X;
  const F = (n) => join(DATA, n);
  let projects = [], tasks = [], history = {}, cfg = { autoBackup: true, github: { repo: process.env.GITHUB_REPO || 'natandata/data-house', auto: false, lastPush: 0, lastSha: '', lastResult: '', lastError: '' } };
  let version = '0.0.0', changelog = [];
  const startedAt = Date.now();
  const SRC = () => process.env.GITHUB_SRC_DIR || root; // pasta enviada ao GitHub (testes trocam)
  const timers = [];
  const dsave = {}; const later = (k, fn, ms = 800) => { clearTimeout(dsave[k]); dsave[k] = setTimeout(() => fn().catch(() => {}), ms); };
  const saveProjects = () => writeJson(F('projects.json'), projects);
  const saveTasks = () => writeJson(F('tasks.json'), tasks.slice(-300));
  const saveCfg = () => writeJson(F('extra-settings.json'), cfg);
  const notify = (level, title, text = '', chatId = '') => broadcast({ type: 'notify', level, title, text: clip(text, 240), chatId });

  // ---------- projetos por cliente ----------
  const cleanProject = (b, old) => {
    const name = clip(String(b.name ?? old?.name ?? '').trim(), 40); if (!name) throw httpErr(400, 'dê um nome ao cliente');
    return {
      name,
      color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : (old?.color || '#4f8cff'),
      driveFolder: clip(String(b.driveFolder ?? old?.driveFolder ?? '').trim(), 160),
      driveUrl: (() => { const u = String(b.driveUrl ?? old?.driveUrl ?? '').trim(); if (!u) return ''; if (!/^https:\/\/drive\.google\.com\/[^\s]+$/i.test(u)) throw httpErr(400, 'cole o link de uma pasta do Google Drive (começa com https://drive.google.com/)'); return clip(u, 300); })(),
      rules: clip(String(b.rules ?? old?.rules ?? '').trim(), 3000),
      memory: clip(String(b.memory ?? old?.memory ?? '').trim(), 4000),
    };
  };
  const projView = (p) => ({ ...p, chats: [...chats.values()].filter((c) => c.project === p.id).map((c) => c.id) });
  const projectOf = (chatId) => { const c = chats.get(chatId); return c?.project ? projects.find((p) => p.id === c.project) : null; };
  const projectNote = (chat) => {
    const p = chat?.project && projects.find((x) => x.id === chat.project); if (!p) return '';
    return [`Cliente/projeto desta conversa: “${p.name}”.`, p.rules ? `Regras deste cliente (siga sempre):\n${p.rules}` : '', p.memory ? `Memória deste cliente:\n${p.memory}` : '', p.driveFolder ? `Pasta padrão do Drive deste cliente: ${p.driveFolder}.` : ''].filter(Boolean).join('\n');
  };
  const projectDriveFolder = (chatId) => projectOf(chatId)?.driveFolder || '';

  // ---------- arquivos e entregas de uma conversa ----------
  function filesOfChat(c) {
    const out = new Map();
    for (const d of c.deliveries || []) if (d.file && !out.has(d.file.id)) out.set(d.file.id, { ...d.file, ts: d.ts, from: d.from, mid: d.mid });
    for (const m of c.messages) if (m.from !== 'user' && m.from !== 'system') for (const f of m.files || []) out.set(f.id, { ...f, ts: m.ts, from: m.from, mid: m.id });
    return [...out.values()];
  }
  function famOf(name) {
    const base = fold(String(name).replace(/\.[^.]+$/, ''));
    const mv = base.match(/(?:^|[-_ .(])v(?:er)?[-_ ]?(\d+)/);
    const key = base.replace(/(?:^|[-_ .(])v(?:er)?[-_ ]?\d+\)?/g, ' ').replace(/\b(720p|1080p|2160p|4k|60fps|30fps|final|revisado|rev\d*|copy|copia|nova?|corrigido)\b/g, ' ').replace(/\(\d+\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
    return { key: key || base, v: mv ? Number(mv[1]) : 0 };
  }
  function versionsOf(c) {
    const flags = c.fileFlags || {}; const fams = new Map();
    for (const f of filesOfChat(c)) {
      if (f.kind === 'file' && !/\.(pdf|docx|xlsx|pptx|srt|vtt|txt|csv)$/i.test(f.name)) continue;
      const { key, v } = famOf(f.name); const l = fams.get(key) || []; l.push({ id: f.id, name: f.name, kind: f.kind, size: f.size, ts: f.ts, from: f.from, mid: f.mid, v, approved: Boolean(flags[f.id]?.approved), rev: Boolean(flags[f.id]?.rev) }); fams.set(key, l);
    }
    return [...fams].map(([key, versions]) => ({ key, versions: versions.sort((a, b) => a.v - b.v || a.ts - b.ts) })).filter((f) => f.versions.length > 1 || f.versions[0].approved);
  }
  async function approveFile(c, fid, on) {
    const f = filesOfChat(c).find((x) => x.id === fid); if (!f) throw httpErr(404, 'arquivo não está nesta conversa');
    c.fileFlags ||= {};
    const { key, v } = famOf(f.name);
    if (!on) { delete c.fileFlags[fid]; }
    else {
      c.fileFlags[fid] = { approved: true, at: Date.now() };
      for (const o of filesOfChat(c)) {
        if (o.id === fid || famOf(o.name).key !== key) continue;
        const ov = famOf(o.name).v;
        if (ov < v || (ov === v && o.ts < f.ts)) { const { approved, ...rest } = c.fileFlags[o.id] || {}; c.fileFlags[o.id] = { ...rest, rev: true }; }
        else if (c.fileFlags[o.id]?.approved) delete c.fileFlags[o.id].approved; // só uma aprovada por família
      }
    }
    await persist(c); broadcast({ type: 'flags', chatId: c.id, flags: c.fileFlags });
    return c.fileFlags;
  }

  // ---------- busca global ----------
  function search(q, o = {}) {
    const needle = fold(q).trim(); const from = o.from ? Date.parse(o.from) : 0, to = o.to ? Date.parse(o.to) + 86399999 : Infinity;
    const type = ['msg', 'file', 'link'].includes(o.type) ? o.type : 'all';
    if (!needle && !o.bot && !o.project && !o.chat && type === 'all' && !from && to === Infinity) return { results: [], total: 0 };
    const res = [];
    const snip = (t, i) => { t = String(t).replace(/\s+/g, ' '); const a = Math.max(0, i - 50); return (a ? '…' : '') + t.slice(a, a + 160) + (t.length > a + 160 ? '…' : ''); };
    for (const c of chats.values()) {
      if (o.chat && c.id !== o.chat) continue; if (o.project && c.project !== o.project) continue;
      const base = { chat: c.id, chatTitle: c.title, project: c.project || '' };
      const items = [...(c.deliveries || []).map((d) => ({ id: d.mid, ts: d.ts, from: d.from, text: '', files: d.file ? [d.file] : [], arch: true, url: d.url })), ...c.messages];
      for (const m of items) {
        if (m.ts < from || m.ts > to) continue; if (o.bot && m.from !== o.bot) continue;
        if (!m.arch && (type === 'all' || type === 'msg') && m.text) { const i = needle ? fold(m.text).indexOf(needle) : 0; if (i >= 0 && (needle || o.bot || o.project || o.chat || from || to !== Infinity)) res.push({ ...base, kind: 'msg', mid: m.id, from: m.from, ts: m.ts, text: snip(m.text, Math.max(0, i)) }); }
        if (type === 'all' || type === 'file') for (const f of m.files || []) { if (!needle || fold(f.name).includes(needle)) res.push({ ...base, kind: 'file', mid: m.id, from: m.from, ts: m.ts, text: f.name, file: f }); }
        if ((type === 'all' || type === 'link') && m.from !== 'user' && m.from !== 'system') {
          const urls = m.arch ? (m.url ? [m.url] : []) : [...new Set(String(m.text || '').match(URL_RE) || [])].map((u) => u.replace(/[.,;:!?]+$/, ''));
          for (const u of urls) if (!needle || fold(u).includes(needle)) res.push({ ...base, kind: 'link', mid: m.id, from: m.from, ts: m.ts, text: u, url: u });
        }
      }
    }
    res.sort((a, b) => b.ts - a.ts);
    return { results: res.slice(0, 100), total: res.length };
  }

  // ---------- tarefas (fila de trabalho dos bots) ----------
  const taskView = (t) => ({ id: t.id, chat: t.chat, chatTitle: chats.get(t.chat)?.title || '', bot: t.bot, label: t.label, status: t.status, queuedAt: t.queuedAt, startedAt: t.startedAt || null, endedAt: t.endedAt || null, error: t.error || '', project: t.project || '', repeatable: Boolean(t.userText || t.prompt) });
  function taskQueued(chat, bot, prompt, label, userText) {
    const t = { id: 't-' + hex(4), chat: chat.id, bot: bot.slug, label: clip(label, 100), prompt: clip(prompt, 2500), userText: userText ? clip(userText, 2500) : '', status: 'queued', queuedAt: Date.now(), project: chat.project || '' };
    tasks.push(t); if (tasks.length > 300) tasks.splice(0, tasks.length - 300);
    broadcast({ type: 'task', task: taskView(t) }); later('tasks', saveTasks, 1500); return t;
  }
  const taskRunning = (t) => { t.status = 'running'; t.startedAt = Date.now(); broadcast({ type: 'task', task: taskView(t) }); };
  function taskEnd(t, status, error = '') {
    if (!t || t.endedAt) return;
    t.status = t.cancelled ? 'cancelled' : status; t.endedAt = Date.now(); t.error = clip(error, 240);
    broadcast({ type: 'task', task: taskView(t) }); later('tasks', saveTasks, 1500);
  }
  function waiting() {
    const out = [];
    for (const c of chats.values()) {
      const last = [...c.messages].reverse().find((x) => x.from !== 'system'); if (!last || last.from === 'user' || !bots.has(last.from)) continue;
      const ap = /\[\[APROVAR\]\]/.test(last.text || ''), need = /(^|\n)\s*precisa de você/i.test(last.text || '');
      if (ap || need) out.push({ chat: c.id, chatTitle: c.title, mid: last.id, from: last.from, ts: last.ts, kind: ap ? 'approve' : 'need', text: clip(String(last.text).replace(/\[\[APROVAR\]\]/g, '').replace(/\s+/g, ' ').trim(), 220), project: c.project || '' });
    }
    return out.sort((a, b) => b.ts - a.ts);
  }

  // ---------- uso e custos ----------
  const noteUsage = (u) => { history[u.date] = { calls: u.calls, byBot: { ...u.byBot } }; const k = Object.keys(history).sort(); for (const d of k.slice(0, Math.max(0, k.length - 90))) delete history[d]; later('hist', () => writeJson(F('usage-history.json'), history), 3000); };
  const planSeen = new Set();
  function checkPlan(plan) {
    for (const [k, nome] of [['session', 'da sessão'], ['week', 'semanal']]) {
      const x = plan?.[k]; if (!x) continue;
      for (const lv of [95, 80]) if (x.pct >= lv) { const id = `${k}|${x.reset}|${lv}`; if (!planSeen.has(id)) { planSeen.add(id); notify(lv >= 95 ? 'error' : 'warn', `Limite ${nome} do Claude em ${x.pct}%`, x.reset ? `Volta ${new Date(x.reset).toLocaleString('pt-BR')}` : ''); } break; }
    }
  }
  function usageReport() {
    const u = X.getUsage(); const days = { ...history, [u.date]: { calls: u.calls, byBot: u.byBot } };
    const keys = Object.keys(days).sort().slice(-30); const total = {};
    const list = keys.map((d) => { for (const [b, n] of Object.entries(days[d].byBot || {})) total[b] = (total[b] || 0) + n; return { date: d, calls: days[d].calls || 0, byBot: days[d].byBot || {} }; });
    return { days: list, total, today: { calls: u.calls, byBot: u.byBot }, plan: X.getPlan(), bots: [...bots.values()].map((b) => ({ slug: b.slug, name: b.name, cap: b.dailyCap || 0 })) };
  }

  // ---------- rotinas ----------
  function nextRoutine(r) {
    if (!r.enabled) return null; const now = new Date();
    for (let i = 0; i < 8; i++) {
      const d = new Date(now); d.setDate(d.getDate() + i); if (!r.days.includes(d.getDay())) continue;
      const [h, m] = r.time.split(':').map(Number); d.setHours(h, m, 0, 0); if (d <= now && i === 0) continue; return d.getTime();
    }
    return null;
  }
  function runResult(item, chat, n0, save, kind) {
    const errs = chat.messages.slice(n0).filter((m) => m.kind === 'error');
    item.lastResult = { ok: !errs.length, ts: Date.now(), text: clip(errs[0]?.text || '', 200) };
    save().catch(() => {}); broadcast({ type: 'state' });
    if (errs.length) notify('error', `${kind} “${item.name || item.title}” falhou`, errs[0].text, chat.id);
  }

  // ---------- memória ----------
  async function remember(c, mid, scope, text) {
    const msg = c.messages.find((x) => x.id === mid); if (!msg) throw httpErr(404, 'mensagem não encontrada');
    const line = clip(String(text || msg.text || '').replace(/\[\[APROVAR\]\]/g, '').replace(/\s+/g, ' ').trim(), 300); if (!line) throw httpErr(400, 'nada para lembrar');
    if (scope === 'project') {
      const p = projects.find((x) => x.id === c.project); if (!p) throw httpErr(400, 'esta conversa não está em nenhum cliente (atribua um cliente primeiro)');
      p.memory = clip(`${p.memory ? p.memory + '\n' : ''}- ${line}`, 4000); await saveProjects(); broadcast({ type: 'state' }); return { scope, name: p.name };
    }
    const bot = bots.get(bots.has(msg.from) ? msg.from : c.members[0]); if (!bot) throw httpErr(400, 'bot não encontrado');
    bot.memory = clip(`${bot.memory ? bot.memory + '\n' : ''}- ${line}`, 4000); await X.saveBot(bot); broadcast({ type: 'state' }); return { scope: 'bot', name: bot.name };
  }

  // ---------- exportação ----------
  const ymd = (t) => new Date(t).toLocaleDateString('sv');
  const hm = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  function chatMarkdown(c) {
    const nm = (s) => (s === 'user' ? 'Natan' : s === 'system' ? 'Sistema' : X.nameOf(s));
    const L = [`# ${c.title}`, '', `_Exportado em ${new Date().toLocaleString('pt-BR')}_`, ''];
    let day = '';
    for (const m of c.messages) {
      if (ymd(m.ts) !== day) { day = ymd(m.ts); L.push(`## ${day}`, ''); }
      L.push(`**${nm(m.from)}** · ${hm(m.ts)}${m.pinned ? ' 📌' : ''}${m.reaction ? ' ' + m.reaction : ''}`);
      if (m.reply) L.push(`> em resposta a ${m.reply.name}: ${m.reply.text}`);
      if (m.text) L.push('', String(m.text).replace(/\[\[APROVAR\]\]/g, '').trim());
      for (const f of m.files || []) L.push('', `📎 ${f.name} (${f.size} bytes) — /api/files/${f.id}`);
      L.push('');
    }
    return L.join('\n');
  }
  const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  function deliveriesRows(o) {
    const rows = [];
    for (const c of chats.values()) {
      if (o.chat && c.id !== o.chat) continue; if (o.project && c.project !== o.project) continue;
      const p = projects.find((x) => x.id === c.project);
      for (const f of filesOfChat(c)) rows.push({ data: new Date(f.ts).toISOString(), conversa: c.title, cliente: p?.name || '', bot: X.nameOf(f.from), tipo: f.kind, arquivo: f.name, bytes: f.size, aprovado: c.fileFlags?.[f.id]?.approved ? 'sim' : '', revisao: c.fileFlags?.[f.id]?.rev ? 'sim' : '', id: f.id });
      const seen = new Set(); for (const m of [...(c.deliveries || []).filter((d) => d.url).map((d) => ({ ...d, text: d.url })), ...c.messages.filter((m) => m.from !== 'user' && m.from !== 'system')]) for (let u of m.url ? [m.url] : String(m.text || '').match(URL_RE) || []) { u = u.replace(/[.,;:!?]+$/, ''); if (seen.has(u)) continue; seen.add(u); rows.push({ data: new Date(m.ts).toISOString(), conversa: c.title, cliente: p?.name || '', bot: X.nameOf(m.from), tipo: 'link', arquivo: u, bytes: '', aprovado: '', revisao: '', id: '' }); }
    }
    return rows.sort((a, b) => b.data.localeCompare(a.data));
  }
  async function allBundle() {
    const strip = (c) => { const { _q, _run, sessions, ...v } = c; return v; };
    return { exportedAt: new Date().toISOString(), version, bots: [...bots.values()].map((b) => ({ ...b })), chats: [...chats.values()].map(strip), routines: X.getRoutines(), events: X.getEvents(), projects, tasks: tasks.slice(-100) };
  }

  // ---------- backup em disco ----------
  const BK = F('backups');
  async function makeBackup(label = 'manual') {
    const name = `backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${label}`; const dest = join(BK, name); await mkdir(dest, { recursive: true });
    const skip = /(^|[\\/])(browser-profile|out|node_modules|backups|files|tmp|github-repo|auth\.json)([\\/]|$)/;
    for (const e of await readdir(DATA)) { if (skip.test(e)) continue; await cp(join(DATA, e), join(dest, e), { recursive: true, filter: (s) => !skip.test(s.slice(DATA.length)) }).catch(() => {}); }
    const all = (await readdir(BK).catch(() => [])).filter((d) => d.startsWith('backup-')).sort();
    for (const d of all.slice(0, Math.max(0, all.length - 7))) await rm(join(BK, d), { recursive: true, force: true }).catch(() => {});
    return name;
  }
  async function dirSize(d) { let n = 0; for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) { const p = join(d, e.name); n += e.isDirectory() ? await dirSize(p) : (await stat(p).catch(() => ({ size: 0 }))).size; } return n; }
  async function listBackups() {
    const out = []; for (const d of (await readdir(BK).catch(() => [])).filter((x) => x.startsWith('backup-')).sort().reverse()) out.push({ name: d, size: await dirSize(join(BK, d)), at: (await stat(join(BK, d)).catch(() => ({ mtimeMs: 0 }))).mtimeMs });
    return out;
  }

  // ---------- novidades (versão + changelog) ----------
  async function loadAbout() {
    try { version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version || version; } catch { /* sem package.json */ }
    try {
      const md = await readFile(join(root, 'CHANGELOG.md'), 'utf8'); changelog = [];
      for (const part of md.split(/^##\s+/m).slice(1)) { const [head, ...rest] = part.split('\n'); const hm2 = /^v?([\d.]+)\s*(?:[—–-]\s*(.*))?$/.exec(head.trim()); if (!hm2) continue; changelog.push({ version: hm2[1], date: (hm2[2] || '').trim(), items: rest.map((l) => /^\s*[-*]\s+(.*)$/.exec(l)?.[1]).filter(Boolean) }); }
    } catch { changelog = []; }
  }
  let remoteCache = { at: 0, data: null };
  async function checkUpdate() {
    if (remoteCache.data && Date.now() - remoteCache.at < 600000) return remoteCache.data;
    const repo = cfg.github.repo; let data = { checked: false };
    if (process.env.GITHUB_REMOTE || !/^[\w.-]+\/[\w.-]+$/.test(repo || '') || process.env.UPDATE_CHECK === 'off') return data;
    try {
      const r = await fetch(`https://api.github.com/repos/${repo}/commits/main`, { headers: { 'User-Agent': 'atlas-central', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(8000) });
      if (r.ok) { const j = await r.json(); data = { checked: true, sha: String(j.sha || '').slice(0, 7), full: j.sha, message: clip(j.commit?.message?.split('\n')[0] || '', 120), date: j.commit?.committer?.date || '', behind: Boolean(cfg.github.lastSha && j.sha && !String(j.sha).startsWith(cfg.github.lastSha) && !String(cfg.github.lastSha).startsWith(String(j.sha).slice(0, 7))) }; }
    } catch { /* sem internet */ }
    remoteCache = { at: Date.now(), data }; return data;
  }

  // ---------- envio do código ao GitHub ----------
  let pushing = false;
  async function leakCheck(dir) {
    const secrets = new Set(); const tok = X.getAuthToken?.(); if (tok) secrets.add(tok);
    try { for (const l of (await readFile(join(SRC(), '.env'), 'utf8')).split(/\r?\n/)) { const m = /^\s*([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASS\w*)[A-Z0-9_]*)\s*=\s*(.+?)\s*$/i.exec(l); if (m && m[2].replace(/^["']|["']$/g, '').length >= 8) secrets.add(m[2].replace(/^["']|["']$/g, '')); } } catch { /* sem .env */ }
    if (!secrets.size) return null;
    const walk = async (d) => { for (const e of await readdir(d, { withFileTypes: true })) { if (e.name === '.git') continue; const p = join(d, e.name); if (e.isDirectory()) { const r = await walk(p); if (r) return r; } else { const s = await stat(p); if (s.size > 2_000_000) continue; const t = await readFile(p, 'utf8').catch(() => ''); for (const k of secrets) if (t.includes(k)) return p.slice(dir.length + 1); } } return null; };
    return walk(dir);
  }
  async function githubPush(message) {
    if (pushing) throw httpErr(409, 'já tem um envio em andamento'); pushing = true;
    const g = cfg.github; const run = (a, cwd) => X.runCmd('git', cwd ? ['-C', cwd, ...a] : a, 240000);
    try {
      const remote = process.env.GITHUB_REMOTE || `https://github.com/${g.repo}.git`; const work = F('github-repo');
      const git = await X.runCmd('git', ['--version'], 15000); if (git.code !== 0) throw new Error('git não encontrado neste PC (instale o Git para Windows).');
      if (!existsSync(join(work, '.git'))) { await rm(work, { recursive: true, force: true }); await mkdir(DATA, { recursive: true }); const r = await run(['clone', remote, work]); if (r.code !== 0) throw new Error('não consegui clonar: ' + clip(r.err || r.out, 200)); }
      else { await run(['fetch', 'origin'], work); }
      const hasMain = (await run(['rev-parse', '--verify', 'origin/main'], work)).code === 0;
      if (hasMain) await run(['checkout', '-B', 'main', 'origin/main'], work); else await run(['checkout', '-B', 'main'], work);
      for (const e of await readdir(work)) if (!['.git', 'workdir'].includes(e)) await rm(join(work, e), { recursive: true, force: true });
      const top = new Set(['.git', 'data', 'node_modules', '.env', 'workdir']);
      for (const e of await readdir(SRC())) { if (top.has(e) || /\.log$|\.antigo\./.test(e) || e === '.DS_Store') continue; await cp(join(SRC(), e), join(work, e), { recursive: true, filter: (s) => !/(^|[\\/])(node_modules|\.git|\.env)([\\/]|$)/.test(s.slice(SRC().length)) }); }
      const leak = await leakCheck(work); if (leak) throw new Error(`envio bloqueado: o arquivo ${leak} contém uma chave ou token do seu .env`);
      await run(['add', '-A'], work);
      const st = await run(['status', '--porcelain'], work);
      let sha = (await run(['rev-parse', 'HEAD'], work)).out.trim(); let note = 'nada novo para enviar';
      if (st.out.trim()) {
        const hasUser = (await run(['config', 'user.email'], work)).out.trim();
        const c = await X.runCmd('git', ['-C', work, ...(hasUser ? [] : ['-c', 'user.name=Atlas', '-c', 'user.email=atlas@localhost']), 'commit', '-m', message || `Atlas: atualização ${new Date().toLocaleString('pt-BR')}`], 60000);
        if (c.code !== 0) throw new Error('commit falhou: ' + clip(c.err || c.out, 200));
        const p = await run(['push', 'origin', 'HEAD:main'], work); if (p.code !== 0) throw new Error('envio falhou (confira o login do GitHub neste PC): ' + clip(p.err || p.out, 220));
        sha = (await run(['rev-parse', 'HEAD'], work)).out.trim(); note = 'enviado';
      }
      Object.assign(g, { lastPush: Date.now(), lastSha: sha.slice(0, 7), lastResult: note, lastError: '' }); await saveCfg(); remoteCache.at = 0;
      return { ok: true, note, sha: sha.slice(0, 7) };
    } catch (e) {
      Object.assign(g, { lastPush: Date.now(), lastResult: 'erro', lastError: clip(e.message, 300) }); await saveCfg().catch(() => {}); notify('error', 'Envio ao GitHub falhou', e.message); throw e.status ? e : httpErr(502, e.message);
    } finally { pushing = false; }
  }

  // ---------- Drive em lote com progresso ----------
  async function driveMany(fileIds, folder, jobId) {
    const ids = [...new Set(fileIds)].filter((x) => /^[a-f0-9]{16}$/.test(String(x))).slice(0, 20); const paths = []; let ok = true, err = '';
    for (let i = 0; i < ids.length; i++) {
      const meta = await fileMeta(ids[i]); const fl = meta ? (folder || projectDriveFolder(meta.chat)) : folder;
      broadcast({ type: 'drive', job: jobId, done: i, total: ids.length, current: meta?.name || '', pct: 0 });
      try { const r = await X.driveUpload(ids[i], fl, (pct) => broadcast({ type: 'drive', job: jobId, done: i, total: ids.length, current: meta?.name || '', pct })); paths.push(r.path); if (meta) { const c = chats.get(meta.chat); if (c && i === ids.length - 1) X.post(c, 'system', `${r.local ? 'Copiado para a pasta do Google Drive (o Drive sincroniza em seguida)' : 'Enviado ao Google Drive'}: ${paths.join(', ')}.`, 'sys'); } }
      catch (e) { ok = false; err = e.message; break; }
    }
    broadcast({ type: 'drive', job: jobId, done: paths.length, total: ids.length, finished: true, ok, error: err, paths });
  }

  // ---------- rotas JSON ----------
  async function route(m, p, url, body) {
    let mm;
    if (m === 'GET' && p === '/api/about') return { version, startedAt, changelog: changelog.slice(0, 8), github: { ...cfg.github, pushing }, backups: await listBackups(), autoBackup: cfg.autoBackup, drive: X.driveInfo() };
    if (m === 'GET' && p === '/api/update') return checkUpdate();
    if (m === 'GET' && p === '/api/search') return search(url.searchParams.get('q') || '', Object.fromEntries(['bot', 'type', 'from', 'to', 'project', 'chat'].map((k) => [k, url.searchParams.get(k) || ''])));
    if (m === 'GET' && p === '/api/projects') return { projects: projects.map(projView) };
    if (m === 'POST' && p === '/api/projects') { if (projects.length >= 60) throw httpErr(400, 'máximo de 60 clientes'); const pr = { id: 'p-' + hex(4), ...cleanProject(body), created: Date.now() }; projects.push(pr); await saveProjects(); broadcast({ type: 'state' }); return projView(pr); }
    if ((m === 'PUT' || m === 'DELETE') && (mm = p.match(/^\/api\/projects\/(p-[a-f0-9]+)$/))) {
      const pr = projects.find((x) => x.id === mm[1]); if (!pr) throw httpErr(404, 'cliente não encontrado');
      if (m === 'DELETE') { projects = projects.filter((x) => x !== pr); for (const c of chats.values()) if (c.project === pr.id) { delete c.project; persist(c); } await saveProjects(); broadcast({ type: 'state' }); return { ok: true }; }
      Object.assign(pr, cleanProject(body, pr)); await saveProjects(); broadcast({ type: 'state' }); return projView(pr);
    }
    if (m === 'PUT' && (mm = p.match(/^\/api\/chats\/([a-z0-9-]+)\/project$/))) {
      const c = chats.get(mm[1]); if (!c) throw httpErr(404, 'conversa não encontrada'); const id = String(body.project || '');
      if (id && !projects.some((x) => x.id === id)) throw httpErr(404, 'cliente não encontrado');
      if (id) c.project = id; else delete c.project; await persist(c); broadcast({ type: 'state' }); return { project: c.project || '' };
    }
    if (m === 'GET' && p === '/api/tasks') {
      const pr = url.searchParams.get('project'), bot = url.searchParams.get('bot'), st = url.searchParams.get('status'); const lim = Math.min(200, Number(url.searchParams.get('limit')) || 80);
      let list = tasks.filter((t) => (!pr || t.project === pr) && (!bot || t.bot === bot) && (!st || t.status === st));
      return { tasks: list.slice(-lim).reverse().map(taskView), active: tasks.filter((t) => t.status === 'queued' || t.status === 'running').map(taskView), queue: X.queueLen(), waiting: waiting() };
    }
    if (m === 'POST' && (mm = p.match(/^\/api\/tasks\/(t-[a-f0-9]+)\/(cancel|repeat)$/))) {
      const t = tasks.find((x) => x.id === mm[1]); if (!t) throw httpErr(404, 'tarefa não encontrada');
      if (mm[2] === 'cancel') {
        if (t.status !== 'queued' && t.status !== 'running') throw httpErr(400, 'a tarefa já terminou');
        t.cancelled = true; if (t.status === 'queued') taskEnd(t, 'cancelled');
        else for (const ch of running.get(`${t.chat}|${t.bot}`) || []) killTree(ch);
        return { ok: true };
      }
      const c = chats.get(t.chat), b = bots.get(t.bot); if (!c || !b) throw httpErr(404, 'conversa ou bot não existe mais');
      X.rerun(c, b, t.userText || t.prompt); return { accepted: true };
    }
    if (m === 'GET' && p === '/api/usage') return usageReport();
    if (m === 'GET' && p === '/api/memory') return { bots: [...bots.values()].map((b) => ({ slug: b.slug, name: b.name, memory: b.memory || '' })), projects: projects.map((x) => ({ id: x.id, name: x.name, memory: x.memory || '' })) };
    if (m === 'PUT' && (mm = p.match(/^\/api\/memory\/(bot|project)\/([\w-]+)$/))) {
      const text = clip(String(body.memory ?? ''), 4000);
      if (mm[1] === 'bot') { const b = bots.get(mm[2]); if (!b) throw httpErr(404, 'bot não encontrado'); b.memory = text; await X.saveBot(b); }
      else { const pr = projects.find((x) => x.id === mm[2]); if (!pr) throw httpErr(404, 'cliente não encontrado'); pr.memory = text; await saveProjects(); }
      broadcast({ type: 'state' }); return { ok: true };
    }
    if (m === 'POST' && (mm = p.match(/^\/api\/chats\/([a-z0-9-]+)\/messages\/([\w-]+)\/remember$/))) {
      const c = chats.get(mm[1]); if (!c) throw httpErr(404, 'conversa não encontrada'); return remember(c, mm[2], body.scope === 'project' ? 'project' : 'bot', body.text);
    }
    if (m === 'POST' && (mm = p.match(/^\/api\/chats\/([a-z0-9-]+)\/messages\/([\w-]+)\/pin$/))) {
      const c = chats.get(mm[1]); if (!c) throw httpErr(404, 'conversa não encontrada'); const msg = c.messages.find((x) => x.id === mm[2]); if (!msg) throw httpErr(404, 'mensagem não encontrada');
      if (msg.pinned) delete msg.pinned; else { if (c.messages.filter((x) => x.pinned).length >= 20) throw httpErr(400, 'máximo de 20 mensagens fixadas'); msg.pinned = true; }
      await persist(c); broadcast({ type: 'pin', chatId: c.id, id: msg.id, pinned: Boolean(msg.pinned) }); return { pinned: Boolean(msg.pinned) };
    }
    if (m === 'GET' && (mm = p.match(/^\/api\/chats\/([a-z0-9-]+)\/versions$/))) { const c = chats.get(mm[1]); if (!c) throw httpErr(404, 'conversa não encontrada'); return { families: versionsOf(c), flags: c.fileFlags || {} }; }
    if (m === 'POST' && (mm = p.match(/^\/api\/chats\/([a-z0-9-]+)\/files\/([a-f0-9]{16})\/approve$/))) { const c = chats.get(mm[1]); if (!c) throw httpErr(404, 'conversa não encontrada'); return { flags: await approveFile(c, mm[2], body.on !== false) }; }
    if (m === 'POST' && (mm = p.match(/^\/api\/chats\/([a-z0-9-]+)\/files\/([a-f0-9]{16})\/drive-approved$/))) {
      const c = chats.get(mm[1]); if (!c) throw httpErr(404, 'conversa não encontrada'); const fl = c.fileFlags || {}; if (!fl[mm[2]]?.approved) throw httpErr(400, 'aprove esta versão antes');
      const dir = String(body.folder || '').trim() || projectDriveFolder(c.id); const sent = [];
      const ap = await X.driveUpload(mm[2], dir); sent.push(ap.path);
      for (const f of filesOfChat(c)) if (fl[f.id]?.rev) { const r = await X.driveUpload(f.id, (dir ? dir + '/' : '') + 'revisoes'); sent.push(r.path); }
      X.post(c, 'system', `Versão aprovada enviada ao Drive: ${sent[0]}${sent.length > 1 ? ` (+ ${sent.length - 1} revisão(ões) na pasta revisoes)` : ''}.`, 'sys'); return { paths: sent };
    }
    if (m === 'POST' && p === '/api/drive/upload-many') { const job = 'j-' + hex(3); driveMany(Array.isArray(body.fileIds) ? body.fileIds.map(String) : [], String(body.folder || '').trim(), job); return { job }; }
    if (m === 'GET' && p === '/api/github') return { ...cfg.github, pushing };
    if (m === 'PUT' && p === '/api/github') {
      if (body.repo !== undefined) { const r = String(body.repo).trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, ''); if (!/^[\w.-]+\/[\w.-]+$/.test(r)) throw httpErr(400, 'use o formato dono/repositório'); cfg.github.repo = r; remoteCache.at = 0; }
      if (body.auto !== undefined) cfg.github.auto = Boolean(body.auto);
      if (body.autoBackup !== undefined) cfg.autoBackup = Boolean(body.autoBackup);
      await saveCfg(); return { ...cfg.github, autoBackup: cfg.autoBackup };
    }
    if (m === 'POST' && p === '/api/github/push') return githubPush(String(body.message || '').trim());
    if (m === 'POST' && p === '/api/backup') { const name = await makeBackup('manual'); return { name, backups: await listBackups() }; }
    return undefined;
  }

  // ---------- rotas de download (texto/arquivo) ----------
  async function raw(req, res, url) {
    if (req.method !== 'GET') return false; let mm;
    const out = (name, type, text) => { res.writeHead(200, { 'content-type': type + '; charset=utf-8', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(text); return true; };
    if ((mm = url.pathname.match(/^\/api\/chats\/([a-z0-9-]+)\/export$/))) {
      const c = chats.get(mm[1]); if (!c) throw httpErr(404, 'conversa não encontrada'); const fmt = url.searchParams.get('fmt') === 'json' ? 'json' : 'md'; const safe = fold(c.title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'conversa';
      if (fmt === 'json') { const { _q, _run, sessions, ...v } = c; return out(`${safe}.json`, 'application/json', JSON.stringify(v, null, 1)); }
      return out(`${safe}.md`, 'text/markdown', chatMarkdown(c));
    }
    if (url.pathname === '/api/export/deliveries') {
      const rows = deliveriesRows({ chat: url.searchParams.get('chat') || '', project: url.searchParams.get('project') || '' });
      if (url.searchParams.get('fmt') === 'json') return out('entregas.json', 'application/json', JSON.stringify(rows, null, 1));
      const cols = ['data', 'conversa', 'cliente', 'bot', 'tipo', 'arquivo', 'bytes', 'aprovado', 'revisao', 'id'];
      return out('entregas.csv', 'text/csv', '﻿' + [cols.join(';'), ...rows.map((r) => cols.map((k) => csvCell(r[k])).join(';'))].join('\r\n'));
    }
    if (url.pathname === '/api/export/all') return out(`atlas-${today()}.json`, 'application/json', JSON.stringify(await allBundle(), null, 1));
    return false;
  }

  async function init() {
    await mkdir(BK, { recursive: true });
    const pr = await readJson(F('projects.json'), []); projects = Array.isArray(pr) ? pr.filter((x) => x && /^p-[a-f0-9]+$/.test(x.id)) : [];
    const tk = await readJson(F('tasks.json'), []); tasks = Array.isArray(tk) ? tk : [];
    for (const t of tasks) if (t.status === 'queued' || t.status === 'running') { t.status = 'interrupted'; t.endedAt = Date.now(); }
    history = await readJson(F('usage-history.json'), {});
    const sv = await readJson(F('extra-settings.json'), {}); cfg = { ...cfg, ...sv, github: { ...cfg.github, ...(sv.github || {}) } };
    await loadAbout();
    const hourly = async () => {
      const h = new Date().getHours();
      if (cfg.autoBackup && h >= 3 && !(await readdir(BK).catch(() => [])).some((d) => d.startsWith('backup-' + new Date().toISOString().slice(0, 10)))) await makeBackup('auto').catch(() => {});
      if (cfg.github.auto && h >= 4 && cfg.github.lastPush < new Date().setHours(0, 0, 0, 0)) await githubPush('Atlas: envio automático').catch(() => {});
    };
    timers.push(setInterval(hourly, Number(process.env.EXTRA_TICK_MS || 3600000)).unref()); setTimeout(() => hourly().catch(() => {}), 60000).unref();
  }

  return {
    init, route, raw, notify, projectNote, projectDriveFolder, taskQueued, taskRunning, taskEnd, noteUsage, checkPlan, nextRoutine, runResult,
    replyInfo(c, mid) { const m = c.messages.find((x) => x.id === mid); return m ? { id: m.id, from: m.from, name: m.from === 'user' ? 'Você' : X.nameOf(m.from), text: clip(String(m.text || (m.files?.length ? m.files[0].name : '')).replace(/\[\[APROVAR\]\]/g, '').replace(/\s+/g, ' ').trim(), 160) } : null; },
  };
}
