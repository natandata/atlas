// Extras da Central, parte 1: base (diálogos, avisos, tempo real), botão Reiniciar, busca Ctrl+K, acessibilidade e menus.
'use strict';
const XU = window.XU = { tasks: new Map(), lastAct: {}, queue: 0, waiting: [], projects: [], reply: null, boot: Date.now() };
const xfold = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const xpad = (n) => String(n).padStart(2, '0');
XU.dur = (ms) => { const s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h${xpad(m % 60)}` : m ? `${m}m${xpad(s % 60)}s` : `${s}s`; };
XU.when = (ts) => { if (!ts) return '—'; const d = new Date(ts); const sameD = d.toDateString() === new Date().toDateString(); return sameD ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
XU.projName = (id) => XU.projects.find((p) => p.id === id)?.name || '';
XU.err = (e) => { XU.toast('Algo deu errado', e?.message || String(e), { level: 'error' }); };
XU.svg = (d, w = 18) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('width', w); s.setAttribute('height', w); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.innerHTML = d; return s; };
const IC = {
  restart: '<path d="M21 12a9 9 0 11-3-6.7"/><path d="M21 3v6h-6"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', tasks: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>', chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', brain: '<path d="M9 4a3 3 0 00-3 3v1a3 3 0 00-2 3 3 3 0 002 3v1a3 3 0 003 3 2 2 0 004 0V4a2 2 0 00-4 0zM15 4a3 3 0 013 3v1a3 3 0 012 3 3 3 0 01-2 3v1a3 3 0 01-3 3"/>',
  sys: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
};
XU.IC = IC;

// ---------- diálogo padrão ----------
XU.open = (id, title, sub = '', cls = '') => {
  let d = document.getElementById(id);
  if (!d) {
    d = h('dialog', { id, class: 'xd ' + cls, 'aria-labelledby': id + 'T' });
    d.append(h('div', { class: 'xd-head' }, h('div', {}, h('h2', { id: id + 'T' }), h('div', { class: 'sub' })), h('button', { class: 'x', type: 'button', 'aria-label': 'Fechar', title: 'Fechar', text: '✕', onclick: () => d.close() })), h('div', { class: 'xd-slot', style: 'display:contents' }));
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    document.body.append(d);
  }
  d.querySelector('h2').textContent = title; d.querySelector('.sub').textContent = sub;
  d.set = (...nodes) => d.querySelector('.xd-slot').replaceChildren(...nodes.flat().filter(Boolean));
  d.sub = (t) => { d.querySelector('.sub').textContent = t; };
  if (!d.open) { for (const o of document.querySelectorAll('dialog.xd[open]')) if (o !== d) o.close(); d.showModal(); }
  return d;
};
XU.confirm = (title, text, okLabel = 'Confirmar', danger = false) => new Promise((res) => {
  const d = h('dialog', { class: 'xd narrow', 'aria-label': title });
  const done = (v) => { d.close(); d.remove(); res(v); };
  d.append(h('div', { class: 'xd-head' }, h('div', {}, h('h2', { text: title }))), h('div', { class: 'xd-body', style: 'color:var(--muted);font-size:14px' }, text),
    h('div', { class: 'xd-bar', style: 'justify-content:flex-end;border:0;padding-bottom:16px' }, h('button', { class: 'xb', type: 'button', text: 'Cancelar', onclick: () => done(false) }), h('button', { class: 'xb p' + (danger ? ' d' : ''), type: 'button', text: okLabel, onclick: () => done(true) })));
  d.addEventListener('cancel', (e) => { e.preventDefault(); done(false); }); document.body.append(d); d.showModal();
});

// ---------- avisos (toasts) ----------
XU.toast = (title, text = '', o = {}) => {
  let box = document.getElementById('xToasts'); if (!box) { box = h('div', { id: 'xToasts', 'aria-live': 'polite', role: 'status' }); document.body.append(box); }
  const el = h('div', { class: 'xtoast ' + (o.level || '') }, h('b', { text: title }), text ? h('div', { text }) : null);
  const api = { el, close: () => el.remove(), progress: (pct) => { let b = el.querySelector('.bar i'); if (!b) { el.append(h('div', { class: 'bar' }, h('i'))); b = el.querySelector('.bar i'); } b.style.width = pct + '%'; }, text: (t) => { el.children[1] ? (el.children[1].textContent = t) : el.insertBefore(h('div', { text: t }), el.children[1] || null); } };
  if (o.actions?.length) el.append(h('div', { class: 'a' }, ...o.actions.map((a) => h('button', { class: 'xb', type: 'button', text: a.label, onclick: () => { api.close(); a.run(); } }))));
  el.append(); box.append(el);
  if (o.ms !== 0) setTimeout(() => el.remove(), o.ms || (o.level === 'error' ? 12000 : 6500));
  while (box.children.length > 5) box.firstChild.remove();
  return api;
};

// ---------- tempo real (conexão própria, só para os eventos novos) ----------
const XH = {
  task(d) { XU.tasks.set(d.task.id, d.task); XU.onTasks?.(); },
  notify(d) {
    XU.toast(d.title, d.text, { level: d.level === 'error' ? 'error' : d.level === 'warn' ? 'warn' : '', ms: d.level === 'error' ? 20000 : 9000, actions: d.chatId ? [{ label: 'Abrir conversa', run: () => openChat(d.chatId) }] : [] });
    if (document.hidden && window.Notification && Notification.permission === 'granted') { try { new Notification(d.title, { body: d.text || '', tag: 'x-' + d.title }); } catch { /* sem notificação */ } }
  },
  activity(d) { XU.lastAct[d.item.bot] = d.item; if (S.cur === d.chatId) renderTyping(); XU.onOffice?.(); },
  state() { XU.loadProjects(); },
  flags(d) { if (S.chat && S.chat.id === d.chatId) { S.chat.fileFlags = d.flags; XU.onFlags?.(); } },
  pin(d) { if (S.chat && S.chat.id === d.chatId) { const m = S.chat.messages.find((x) => x.id === d.id); if (m) { if (d.pinned) m.pinned = true; else delete m.pinned; renderMsgs(false); XU.renderPinned?.(); } } },
  drive(d) { XU.onDrive?.(d); },
};
(function sse() {
  const es = new EventSource('/api/events');
  es.onmessage = (ev) => { let d; try { d = JSON.parse(ev.data); } catch { return; } try { XH[d.type]?.(d); } catch (e) { console.error(e); } };
  es.onopen = () => { XU.refreshTasks?.(); };
})();
XU.loadProjects = async () => { try { XU.projects = (await api('GET', '/api/projects')).projects; XU.onProjects?.(); } catch { /* servidor antigo */ } };

// ---------- botão Reiniciar em destaque ----------
// equivale ao Ctrl+F5: limpa o cache do navegador e do app e recarrega
XU.hardReload = async () => {
  try { for (const r of await navigator.serviceWorker?.getRegistrations?.() || []) await r.unregister(); } catch { /* sem service worker */ }
  try { for (const k of await caches?.keys?.() || []) await caches.delete(k); } catch { /* sem cache */ }
  try { await Promise.all(['/', '/extra.css', '/extra.js', '/extra2.js', '/extra3.js'].map((u) => fetch(u, { cache: 'reload' }))); } catch { /* ok */ }
  location.reload();
};
XU.restart = async () => {
  const active = [...XU.tasks.values()].filter((t) => t.status === 'running' || t.status === 'queued').length;
  const ok = await XU.confirm('Reiniciar a Central?', active ? `${active} tarefa${active > 1 ? 's' : ''} em andamento ${active > 1 ? 'serão interrompidas' : 'será interrompida'}. As conversas continuam salvas.` : 'Aciona o reiniciar-central.bat e recarrega esta página sem cache (como Ctrl+F5). Leva alguns segundos; conversas e arquivos continuam salvos.', 'Reiniciar agora', true);
  if (!ok) return;
  let before = null; try { before = (await api('GET', '/api/about')).startedAt; } catch { /* versão antiga */ }
  try { await api('POST', '/api/restart', {}); } catch (e) { XU.err(e); return; }
  const ov = h('div', { class: 'x-ov', role: 'alert' }, h('div', { class: 'box' }, h('div', { class: 'x-spin' }), h('b', { text: 'Reiniciando a Central…' }), h('span', { text: 'A página recarrega sozinha quando ela voltar.' })));
  document.body.append(ov); const t0 = Date.now();
  const tick = async () => {
    try { const r = await fetch('/api/about', { cache: 'no-store' }); if (r.ok) { const j = await r.json(); if (before == null ? Date.now() - t0 > 2500 : j.startedAt !== before) { XU.hardReload(); return; } } } catch { /* ainda reiniciando */ }
    if (Date.now() - t0 > 60000) { ov.querySelector('b').textContent = 'A Central não voltou em 1 minuto'; ov.querySelector('span').textContent = 'Abra o reiniciar-central.bat na pasta do Atlas. Esta página recarrega sozinha quando ela estiver no ar.'; ov.querySelector('.x-spin').remove(); }
    setTimeout(tick, 900);
  };
  setTimeout(tick, 1500);
};

// ---------- barra rápida na lateral ----------
function xMountQuick() {
  const bot = document.querySelector('.s-bot'); if (!bot || bot.querySelector('.x-quick')) return;
  const mk = (ico, label, run, extra = '') => h('button', { class: 'xb', type: 'button', title: label, 'aria-label': label, onclick: run, style: 'flex:1;justify-content:center;padding:7px 6px' }, XU.svg(IC[ico], 16), extra);
  const row = h('div', { class: 'x-quick', style: 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:2px' },
    mk('search', 'Buscar (Ctrl+K)', () => XU.palette()), (() => { const b = mk('tasks', 'Tarefas e aprovações', () => XU.tasksDlg(), h('span', { class: 'xchip warn', id: 'xTaskN', hidden: '' })); return b; })(),
    mk('folder', 'Clientes', () => XU.clientsDlg()), mk('chart', 'Custos e limites', () => XU.costsDlg()), mk('brain', 'Memória', () => XU.memoryDlg()));
  const rs = h('button', { class: 'x-restart', type: 'button', id: 'xRestart', title: 'Reiniciar a Central agora', onclick: () => XU.restart() }, XU.svg(IC.restart, 18), 'Reiniciar a Central');
  bot.prepend(rs); bot.prepend(row);
  rs.style.margin = '8px 0 8px'; rs.style.width = '100%';
}
XU.badge = () => {
  const n = [...XU.tasks.values()].filter((t) => t.status === 'running' || t.status === 'queued').length + XU.waiting.length;
  const c = document.getElementById('xTaskN'); if (c) { c.hidden = !n; c.textContent = n; }
  const r = document.querySelector('.x-rail-tasks'); if (r) { let b = r.querySelector('.bd'); if (n) { if (!b) { b = h('i', { class: 'bd' }); r.append(b); } b.textContent = n; } else b?.remove(); }
  const rr = document.getElementById('xRestart'); if (rr) { const act = [...XU.tasks.values()].filter((t) => t.status === 'running').length; rr.title = act ? `Reiniciar a Central (${act} tarefa(s) em andamento)` : 'Reiniciar a Central agora'; }
};

// ---------- ícones novos no trilho (visual WhatsApp / desktop) ----------
const _renderRail = window.renderRail;
window.renderRail = function () {
  _renderRail();
  const r = document.getElementById('waRail'); if (!r) return;
  const mk = (ico, title, run, cls) => { const b = h('button', { class: 'rl ' + cls, type: 'button', title, 'aria-label': title, onclick: (e) => { e.stopPropagation(); run(); } }); b.append(XU.svg(IC[ico], 24)); return b; };
  const sp = r.querySelector('.sp');
  const tk = mk('tasks', 'Tarefas e aprovações', () => XU.tasksDlg(), 'x-rail-tasks'); const rs = mk('restart', 'Reiniciar a Central', () => XU.restart(), 'x-rail-restart');
  const find = mk('search', 'Buscar (Ctrl+K)', () => XU.palette(), '');
  if (sp) { r.insertBefore(find, sp); r.insertBefore(tk, sp); r.insertBefore(rs, sp.nextSibling); } else r.append(find, tk, rs);
  XU.badge();
};

// ---------- menu principal: novos itens ----------
let _inMain = false;
const _mainMenu = window.mainMenu;
window.mainMenu = function (a, p) { _inMain = true; try { _mainMenu(a, p); } finally { _inMain = false; } };
const _showMenu = window.showMenu;
window.showMenu = function (anchor, items, place) {
  if (_inMain) {
    const fz = XU.fz(); const hc = document.documentElement.dataset.contrast === 'high';
    const add = [{ label: 'Buscar… (Ctrl+K)', run: () => XU.palette() }, { label: 'Tarefas e aprovações', run: () => XU.tasksDlg() }, { label: 'Clientes (projetos)', run: () => XU.clientsDlg() }, { label: 'Custos e limites', run: () => XU.costsDlg() }, { label: 'Modelo gratuito (Ollama)', run: () => window.openOllama && window.openOllama() }, { label: 'Transcrição de áudio', run: () => window.openTranscribe && window.openTranscribe() }, { label: `Fala informal: ${XU.informal ? 'ligada' : 'desligada'} (trocar)`, run: () => XU.setInformal(!XU.informal) },
      { label: 'Memória dos bots e clientes', run: () => XU.memoryDlg() }, { label: 'Sistema: backup, GitHub e novidades', run: () => XU.systemDlg() }, { sep: true },
      { label: `Tamanho do texto: ${['normal', 'grande', 'maior'][fz]} (trocar)`, run: () => XU.setFz((fz + 1) % 3) }, { label: `Alto contraste: ${hc ? 'ligado' : 'desligado'} (trocar)`, run: () => XU.setContrast(!hc) }, { label: 'Atalhos de teclado (?)', run: () => XU.shortcuts() }, { sep: true }];
    const i = items.findIndex((x) => x.label === 'Reiniciar a central');
    items = i >= 0 ? [...items.slice(0, i), ...add, { label: '↻ Reiniciar a Central', run: () => XU.restart() }, ...items.slice(i + 1)] : [...items, ...add];
  }
  return _showMenu(anchor, items, place);
};

// ---------- acessibilidade ----------
const FZ = [1, 1.15, 1.3];
XU.informal = false;
XU.setInformal = async (on) => { try { const r = await api('PUT', '/api/style', { informal: on }); XU.informal = !!r.informal; XU.toast(XU.informal ? 'Fala informal ligada' : 'Fala informal desligada', XU.informal ? 'Os bots passam a conversar de forma mais solta e direta.' : 'Os bots voltam ao tom normal.'); } catch (e) { XU.toast('Não consegui trocar', e.message || ''); } };
setTimeout(() => { try { api('GET', '/api/style').then((r) => { XU.informal = !!r.informal; }).catch(() => {}); } catch {} }, 1500);
XU.fz = () => { const v = Number(store.get('xfz')); return v >= 0 && v <= 2 ? v : 0; };
XU.setFz = (i) => { store.set('xfz', String(i)); document.documentElement.style.setProperty('--xz', FZ[i]); XU.toast('Tamanho do texto', ['Normal', 'Grande', 'Maior'][i], { ms: 1800 }); };
XU.setContrast = (on) => { store.set('xhc', on ? '1' : ''); if (on) document.documentElement.dataset.contrast = 'high'; else delete document.documentElement.dataset.contrast; XU.toast('Alto contraste', on ? 'Ligado' : 'Desligado', { ms: 1800 }); };
document.documentElement.style.setProperty('--xz', FZ[XU.fz()]); if (store.get('xhc')) document.documentElement.dataset.contrast = 'high';
{ const mc = document.getElementById('msgcol'); if (mc) { mc.setAttribute('role', 'log'); mc.setAttribute('aria-live', 'polite'); mc.setAttribute('aria-label', 'Mensagens da conversa'); }
  const lbl = { in: 'Mensagem', q: 'Buscar conversas', back: 'Voltar', clip: 'Anexar arquivo' }; for (const [id, t] of Object.entries(lbl)) { const e = document.getElementById(id); if (e && !e.getAttribute('aria-label')) e.setAttribute('aria-label', t); }
  document.getElementById('list')?.setAttribute('aria-label', 'Conversas'); }
XU.shortcuts = () => {
  const rows = [['Ctrl + K', 'Buscar mensagens, arquivos, links e comandos'], ['Ctrl + B', 'Mostrar ou ocultar a barra lateral'], ['?', 'Esta lista de atalhos (fora de campos de texto)'], ['Esc', 'Fechar janela, busca ou menu'], ['↑ ↓ Enter', 'Navegar e abrir resultados da busca'], ['← →', 'Anterior e próximo na prévia de arquivos'], ['+  −  0', 'Zoom na prévia de imagem'], ['Espaço', 'Reproduzir ou pausar o vídeo da prévia'], ['P', 'Voltar à tela principal (no escritório)']];
  const d = XU.open('xShort', 'Atalhos de teclado', '', 'narrow');
  d.set(h('div', { class: 'xd-body' }, ...rows.map(([k, t]) => h('div', { class: 'xrow' }, h('div', { class: 'm' }, h('div', { class: 'n' }, h('kbd', { text: k }))), h('div', { class: 's', style: 'flex:2;white-space:normal', text: t })))));
};
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); XU.palette(); return; }
  if (e.key === '?' && !typing && !document.querySelector('dialog[open]')) { e.preventDefault(); XU.shortcuts(); }
});

// ---------- esqueletos de carregamento ----------
XU.skelList = (n = 7) => Array.from({ length: n }, () => h('div', { class: 'xsk-row' }, h('div', { class: 'av xsk' }), h('div', { class: 'ln' }, h('i', { class: 'xsk', style: 'width:55%' }), h('i', { class: 'xsk', style: 'width:85%' }))));
XU.skelMsgs = () => [h('div', { class: 'xsk xsk-msg' }), h('div', { class: 'xsk xsk-msg me' }), h('div', { class: 'xsk xsk-msg', style: 'width:70%;height:78px' }), h('div', { class: 'xsk xsk-msg me', style: 'width:34%' })];
{ const l = document.getElementById('list'); if (l && !l.children.length) l.replaceChildren(...XU.skelList()); }
const _openChat = window.openChat;
window.openChat = async function (id) {
  if (S.cur !== id || !S.chat) { document.getElementById('empty').style.display = 'none'; document.getElementById('chat').classList.add('on'); document.getElementById('msgcol').replaceChildren(...XU.skelMsgs()); }
  return _openChat(id);
};
// indicador "digitando" mostra a ferramenta em uso
const _renderTyping = window.renderTyping;
window.renderTyping = function () {
  _renderTyping();
  const c = S.chat; if (!c) return; const tn = typingNames(c.id); if (!tn.length) return;
  const last = [...(S.activity || [])].reverse().find((a) => (a.kind === 'tool' || a.kind === 'start' || a.kind === 'delegate') && Date.now() - a.ts < 600000);
  const sp = document.querySelector('#typcol > span:not(.dots)'); if (sp && last) sp.textContent = `${tn.join(', ')} trabalhando… ${last.text}`;
};

// ---------- busca global (Ctrl+K) ----------
XU.commands = () => [
  ['Reiniciar a Central', '↻', () => XU.restart(), 'reiniciar restart'], ['Fala informal (ligar/desligar)', '💬', () => XU.setInformal(!XU.informal), 'informal fala tom estilo conversa'], ['Transcrição de áudio (chave do Groq)', '🎙', () => window.openTranscribe && window.openTranscribe(), 'transcricao audio voz groq chave whisper'], ['Tarefas e aprovações', '☑', () => XU.tasksDlg(), 'tarefas fila aprovar'], ['Clientes (projetos)', '📁', () => XU.clientsDlg(), 'clientes projetos'],
  ['Custos e limites', '📊', () => XU.costsDlg(), 'custos uso limites'], ['Memória dos bots e clientes', '🧠', () => XU.memoryDlg(), 'memoria lembrar'], ['Entregas', '📦', () => openDeliveries(), 'entregas arquivos'],
  ['Escritório virtual', '🏢', () => openOffice(), 'escritorio'], ['Calendário', '📅', () => openCal(), 'calendario agenda'], ['Sistema: backup, GitHub e novidades', '⚙', () => XU.systemDlg(), 'sistema backup github novidades atualizar'],
  ['Alternar tamanho do texto', 'A', () => XU.setFz((XU.fz() + 1) % 3), 'fonte texto tamanho'], ['Alternar alto contraste', '◐', () => XU.setContrast(document.documentElement.dataset.contrast !== 'high'), 'contraste acessibilidade'],
  ['Atalhos de teclado', '⌨', () => XU.shortcuts(), 'atalhos teclado ajuda'], ['Nova rotina', '⏰', () => openRoutineDialog(null), 'rotina agendar'], ['Novo bot', '🤖', () => openBotDialog(null), 'bot novo criar'], ['Novo grupo', '👥', () => openGroupDialog(), 'grupo novo'],
];
XU.jump = async (chatId, mid) => {
  if (S.cur !== chatId) await openChat(chatId);
  const find = () => document.getElementById('msgcol')?.querySelector(`[data-mid="${CSS.escape(mid)}"]`);
  let el = find(); if (!el) { XU.toast('Mensagem antiga', 'Ela saiu do histórico (guardamos as últimas 500), mas o arquivo continua em Entregas.'); return; }
  document.getElementById('app').classList.remove('psheet'); el.scrollIntoView({ block: 'center' }); el.classList.remove('jump'); void el.offsetWidth; el.classList.add('jump');
};
XU.palette = (initial = '') => {
  if (document.getElementById('xPal')) { document.querySelector('#xPal input.q').focus(); return; }
  const st = { type: 'all', bot: '', project: '', from: '', to: '', sel: 0, seq: 0, items: [], tm: 0 };
  const ov = h('div', { id: 'xPal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Buscar' }); const box = h('div', { class: 'box' });
  const q = h('input', { class: 'q', type: 'text', placeholder: 'Buscar mensagens, arquivos, links, conversas ou comandos…', 'aria-label': 'Buscar', autocomplete: 'off' }); q.value = initial;
  const flt = h('div', { class: 'flt' });
  const chip = (k, t) => { const b = h('button', { class: 'xb' + (st.type === k ? ' on' : ''), type: 'button', text: t, style: 'padding:3px 10px;font-size:12px', onclick: () => { st.type = k; for (const x of flt.querySelectorAll('.xb')) x.classList.toggle('on', x.dataset.k === st.type); run(); } }); b.dataset.k = k; return b; };
  const botSel = h('select', { 'aria-label': 'Filtrar por bot', onchange: (e) => { st.bot = e.target.value; run(); } }, h('option', { value: '', text: 'Qualquer bot' }), ...S.bots.map((b) => h('option', { value: b.slug, text: b.name })));
  const prSel = h('select', { 'aria-label': 'Filtrar por cliente', onchange: (e) => { st.project = e.target.value; run(); } }, h('option', { value: '', text: 'Qualquer cliente' }), ...XU.projects.map((p) => h('option', { value: p.id, text: p.name })));
  const d1 = h('input', { type: 'date', 'aria-label': 'De', onchange: (e) => { st.from = e.target.value; run(); } }), d2 = h('input', { type: 'date', 'aria-label': 'Até', onchange: (e) => { st.to = e.target.value; run(); } });
  flt.append(chip('all', 'Tudo'), chip('msg', 'Mensagens'), chip('file', 'Arquivos'), chip('link', 'Links'), botSel, prSel, d1, d2);
  const res = h('div', { class: 'res', role: 'listbox' }), ft = h('div', { class: 'ft' }, h('span', {}, h('kbd', { text: '↑↓' }), ' navegar'), h('span', {}, h('kbd', { text: 'Enter' }), ' abrir'), h('span', {}, h('kbd', { text: 'Esc' }), ' fechar'));
  box.append(q, flt, res, ft); ov.append(box); document.body.append(ov);
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey, true); };
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  const mark = (t, n) => { t = String(t); if (!n) return document.createTextNode(t); const i = xfold(t).indexOf(xfold(n)); if (i < 0) return document.createTextNode(t); const f = document.createDocumentFragment(); f.append(t.slice(0, i), h('mark', { text: t.slice(i, i + n.length) }), t.slice(i + n.length)); return f; };
  const ICON = { msg: '💬', file: '📎', link: '🔗', chat: '🗨', cmd: '⌘' };
  const paint = (remote) => {
    const needle = q.value.trim(); const nf = xfold(needle); st.items = []; res.replaceChildren();
    const group = (t, list) => { if (!list.length) return; res.append(h('div', { class: 'g', text: t })); for (const it of list) { const i = st.items.length; st.items.push(it); res.append(h('button', { class: 'it' + (i === st.sel ? ' sel' : ''), type: 'button', role: 'option', onmousemove: () => { st.sel = i; hl(); }, onclick: () => pick(it) }, h('span', { class: 'ic', text: it.ic }), h('span', { class: 'tx' }, h('div', { class: 't1' }, mark(it.t1, needle)), it.t2 ? h('div', { class: 't2' }, it.t2) : null))); } };
    const filt = st.type === 'all' && !st.bot && !st.project && !st.from && !st.to;
    if (filt) {
      group('Comandos', XU.commands().filter((c) => !nf || xfold(c[0] + ' ' + c[3]).includes(nf)).slice(0, nf ? 6 : 5).map((c) => ({ ic: c[1], t1: c[0], run: c[2] })));
      group('Conversas', S.chats.filter((c) => !nf || xfold(c.title).includes(nf)).slice(0, nf ? 6 : 5).map((c) => ({ ic: ICON.chat, t1: c.title, t2: c.last?.text || '', open: c.id })));
    }
    if (remote) {
      const nm = (s) => (s === 'user' ? 'Você' : s === 'system' ? 'Sistema' : nameOf(s));
      const mk = (r) => ({ ic: ICON[r.kind], t1: r.kind === 'msg' ? r.text : r.kind === 'file' ? r.file.name : r.url, t2: `${r.chatTitle}${r.project ? ' · ' + XU.projName(r.project) : ''} · ${nm(r.from)} · ${XU.when(r.ts)}`, r });
      group('Mensagens', remote.filter((r) => r.kind === 'msg').slice(0, 25).map(mk)); group('Arquivos', remote.filter((r) => r.kind === 'file').slice(0, 25).map(mk)); group('Links', remote.filter((r) => r.kind === 'link').slice(0, 25).map(mk));
    }
    if (!st.items.length) res.append(h('div', { class: 'xnone', text: needle.length < 2 && filt ? 'Digite para buscar.' : 'Nada encontrado.' }));
  };
  const hl = () => { [...res.querySelectorAll('.it')].forEach((b, i) => { b.classList.toggle('sel', i === st.sel); if (i === st.sel) b.scrollIntoView({ block: 'nearest' }); }); };
  const pick = async (it) => {
    close();
    if (it.run) return it.run();
    if (it.open) return openChat(it.open);
    const r = it.r; if (r.kind === 'link') return window.open(r.url, '_blank', 'noopener');
    if (r.kind === 'file' && r.file) { await XU.jump(r.chat, r.mid); return; }
    return XU.jump(r.chat, r.mid);
  };
  const run = () => {
    clearTimeout(st.tm); st.sel = 0; paint(null);
    const needle = q.value.trim(); const filt = st.type === 'all' && !st.bot && !st.project && !st.from && !st.to;
    if (needle.length < 2 && filt) return;
    const my = ++st.seq; st.tm = setTimeout(async () => {
      try { const u = new URLSearchParams({ q: needle, type: st.type, bot: st.bot, project: st.project, from: st.from, to: st.to }); const r = await api('GET', '/api/search?' + u); if (my === st.seq) { paint(r.results); } } catch { /* servidor antigo */ }
    }, 220);
  };
  const onKey = (e) => {
    if (!document.getElementById('xPal')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); st.sel = Math.min(st.items.length - 1, st.sel + 1); hl(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); st.sel = Math.max(0, st.sel - 1); hl(); }
    else if (e.key === 'Enter' && st.items[st.sel]) { e.preventDefault(); pick(st.items[st.sel]); }
  };
  document.addEventListener('keydown', onKey, true); q.addEventListener('input', run); paint(null); q.focus(); if (initial) run();
};

// ---------- início ----------
const _loadState = window.loadState;
window.loadState = async function () { const r = await _loadState(); xMountQuick(); return r; };
xMountQuick(); XU.loadProjects();
try { window.renderRail(); } catch { /* ainda sem estado */ }
