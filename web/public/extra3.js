// Extras da Central, parte 3: mensagens (responder/fixar/lembrar), prévia e comparação, Entregas em grade, escritório ao vivo.
'use strict';
const x3 = (t, run, cls = '') => h('button', { class: 'xb ' + cls, type: 'button', text: t, onclick: run });

// ---------- mensagens ----------
const _msgEl = window.msgEl;
window.msgEl = function (m, prev) {
  const e = _msgEl(m, prev); if (!e || !m) return e;
  try {
    if (m.reply) { const q = h('div', { class: 'xrp', role: 'button', tabindex: '0', title: 'Ir para a mensagem citada', onclick: () => XU.jump(S.cur, m.reply.id) }, h('b', { text: m.reply.name }), h('span', { text: m.reply.text })); (e.querySelector('.bub, .body') || e).prepend(q); }
    if (m.pinned) (e.querySelector('.bub, .body') || e).append(h('span', { class: 'xpin', title: 'Mensagem fixada', text: '📌' }));
    const tx = e.querySelector('.txt, .t'); if (tx && (m.text || '').length > 900 && !tx.dataset.xc) { tx.dataset.xc = '1'; tx.classList.add('xclamp'); tx.after(h('button', { class: 'xmore', type: 'button', text: 'Ver mais', onclick: (ev) => { const on = tx.classList.toggle('xclamp'); ev.target.textContent = on ? 'Ver mais' : 'Ver menos'; } })); }
    if (m.from !== 'system' && m.kind !== 'sys') {
      const b = h('button', { class: 'xmb', type: 'button', 'aria-label': 'Ações da mensagem', title: 'Responder, fixar, lembrar', text: '⋯', onclick: (ev) => { ev.stopPropagation(); XU.msgMenu(b, m, ev); } });
      e.append(b);
    }
  } catch (err) { console.error(err); }
  return e;
};
XU.msgMenu = (anchor, m, ev) => {
  const items = [{ label: '↩ Responder', run: () => XU.setReply(m) }, { label: m.pinned ? 'Desafixar' : '📌 Fixar no topo', run: () => api('POST', `/api/chats/${S.cur}/messages/${m.id}/pin`, { pinned: !m.pinned }).catch(XU.err) }];
  items.push({ sep: true }, { label: '🧠 Lembrar disso (nesta conversa/bot)', run: () => XU.remember(m, 'bot') });
  if (S.chat?.project) items.push({ label: `🧠 Lembrar disso para o cliente ${XU.projName(S.chat.project)}`, run: () => XU.remember(m, 'project') });
  items.push({ sep: true }, { label: 'Copiar texto', run: () => navigator.clipboard?.writeText(m.text || '').then(() => XU.toast('Copiado', '', { ms: 1500 })) });
  showMenu(anchor, items, 'below');
};
XU.remember = async (m, scope) => { try { const r = await api('POST', `/api/chats/${S.cur}/messages/${m.id}/remember`, { scope }); XU.toast('Guardado na memória', r.target || '', { ms: 3500, actions: [{ label: 'Ver memória', run: () => XU.memoryDlg() }] }); } catch (e) { XU.err(e); } };
// responder
XU.setReply = (m) => {
  XU.reply = { id: m.id, name: m.from === 'user' ? 'Você' : nameOf(m.from), text: String(m.text || (m.files?.[0]?.name || '')).replace(/\s+/g, ' ').slice(0, 90) };
  let bar = document.getElementById('xReply'); if (!bar) { bar = h('div', { id: 'xReply' }); const ch = document.getElementById('chips'); (ch?.parentNode || document.getElementById('chat')).insertBefore(bar, ch || null); }
  bar.replaceChildren(h('div', { class: 'q' }, h('b', { text: 'Respondendo a ' + XU.reply.name }), h('span', { text: XU.reply.text })), h('button', { class: 'x', type: 'button', 'aria-label': 'Cancelar resposta', text: '✕', onclick: XU.clearReply })); bar.hidden = false; document.getElementById('in')?.focus();
};
XU.clearReply = () => { XU.reply = null; const b = document.getElementById('xReply'); if (b) b.hidden = true; };
const _api = window.api;
window.api = function (method, path, body) {
  if (method === 'POST' && XU.reply && /^\/api\/chats\/[\w-]+\/messages$/.test(path) && body && body.text !== undefined) { body = { ...body, reply: XU.reply.id }; XU.clearReply(); }
  return _api(method, path, body);
};
// fixadas
XU.renderPinned = () => {
  let bar = document.getElementById('xPinned'); const pins = (S.chat?.messages || []).filter((m) => m.pinned);
  if (!pins.length) { bar?.remove(); return; }
  if (!bar) { bar = h('div', { id: 'xPinned' }); const w = document.querySelector('#chat .mwrap') || document.getElementById('msgcol'); w.parentNode.insertBefore(bar, w); }
  const last = pins[pins.length - 1];
  bar.replaceChildren(h('button', { class: 'pb', type: 'button', onclick: () => XU.jump(S.cur, last.id) }, h('b', { text: `📌 ${pins.length > 1 ? pins.length + ' fixadas · ' : ''}${last.from === 'user' ? 'Você' : nameOf(last.from)}` }), h('span', { text: String(last.text || '').replace(/\s+/g, ' ').slice(0, 120) })), pins.length > 1 ? x3('Todas', (ev) => showMenu(ev.target, pins.map((p) => ({ label: String(p.text || '').slice(0, 60), run: () => XU.jump(S.cur, p.id) })), 'below')) : null);
};
{ const r = window.renderMsgs; window.renderMsgs = function () { const v = r.apply(this, arguments); try { XU.renderPinned(); } catch { /* ok */ } return v; }; }
{ const o = window.openChat; window.openChat = async function (id) { XU.clearReply(); return o(id); }; }

// ---------- prévia de arquivos ----------
XU.preview = (list, i = 0) => {
  let k = i, zoom = 1; const fu = (f) => `/api/files/${f.id}`;
  const d = h('dialog', { class: 'xv', 'aria-label': 'Prévia' }); const stage = h('div', { class: 'xv-stage' }); const cap = h('div', { class: 'xv-cap' }); const bar = h('div', { class: 'xv-bar' });
  const close = () => { d.close(); d.remove(); document.removeEventListener('keydown', key, true); };
  const paint = () => {
    const f = list[k]; stage.replaceChildren(); zoom = 1; cap.textContent = `${f.name} · ${k + 1}/${list.length}`; bar.replaceChildren();
    if (f.kind === 'image') { const im = h('img', { src: fu(f), alt: f.name }); stage.append(im); const z = (n) => { zoom = Math.min(5, Math.max(0.3, n)); im.style.transform = `scale(${zoom})`; }; d._z = z; bar.append(x3('−', () => z(zoom - 0.25)), x3('100%', () => z(1)), x3('+', () => z(zoom + 0.25))); }
    else if (f.kind === 'video') { const v = h('video', { src: fu(f), controls: '', playsinline: '', autoplay: '' }); stage.append(v); d._v = v; bar.append(...[0.5, 1, 1.5, 2].map((s) => x3(s + '×', () => { v.playbackRate = s; })), x3('◀ quadro', () => { v.pause(); v.currentTime = Math.max(0, v.currentTime - 1 / 30); }), x3('quadro ▶', () => { v.pause(); v.currentTime += 1 / 30; })); }
    else if (f.kind === 'audio') stage.append(h('audio', { src: fu(f), controls: '', autoplay: '' }));
    else if (/\.pdf$/i.test(f.name)) stage.append(h('iframe', { src: fu(f), title: f.name }));
    else if (/\.(txt|md|csv|srt|vtt|json)$/i.test(f.name)) { const pre = h('pre', { text: 'Carregando…' }); stage.append(pre); fetch(fu(f)).then((r) => r.text()).then((t) => { pre.textContent = t.slice(0, 200000); }).catch(() => { pre.textContent = 'Não foi possível abrir.'; }); }
    else stage.append(h('div', { class: 'xnone', text: 'Sem prévia para este tipo de arquivo.' }));
    bar.append(h('a', { class: 'xb', href: fu(f), target: '_blank', text: 'Abrir' }), h('a', { class: 'xb', href: fu(f) + '?dl=1', text: 'Baixar' }), x3('Drive', (ev) => sendToDrive(f, ev.target)));
  };
  const go = (n) => { k = (k + n + list.length) % list.length; paint(); };
  const key = (e) => {
    if (!d.isConnected) return; if (e.key === 'ArrowRight' && list.length > 1) { e.preventDefault(); go(1); } else if (e.key === 'ArrowLeft' && list.length > 1) { e.preventDefault(); go(-1); }
    else if ((e.key === '+' || e.key === '=') && d._z) d._z(zoom + 0.25); else if (e.key === '-' && d._z) d._z(zoom - 0.25); else if (e.key === '0' && d._z) d._z(1);
    else if (e.key === ' ' && d._v && document.activeElement?.tagName !== 'VIDEO') { e.preventDefault(); d._v.paused ? d._v.play() : d._v.pause(); } else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };
  d.append(h('div', { class: 'xv-head' }, cap, h('button', { class: 'x', type: 'button', 'aria-label': 'Fechar', text: '✕', onclick: close })), h('div', { class: 'xv-main' }, list.length > 1 ? h('button', { class: 'nav l', type: 'button', 'aria-label': 'Anterior', text: '‹', onclick: () => go(-1) }) : null, stage, list.length > 1 ? h('button', { class: 'nav r', type: 'button', 'aria-label': 'Próximo', text: '›', onclick: () => go(1) }) : null), bar);
  document.body.append(d); document.addEventListener('keydown', key, true); paint(); d.showModal();
};
// comparar versões lado a lado
XU.compare = (a, b) => {
  const d = h('dialog', { class: 'xv cmp', 'aria-label': 'Comparar versões' }); const mk = (f) => { const u = `/api/files/${f.id}`; const el = f.kind === 'video' ? h('video', { src: u, controls: '', playsinline: '', muted: '' }) : f.kind === 'image' ? h('img', { src: u, alt: f.name }) : h('iframe', { src: u, title: f.name }); return [el, h('div', { class: 'xv-cap', text: f.name })]; };
  const [ea, ca] = mk(a), [eb, cb] = mk(b); const close = () => { d.close(); d.remove(); };
  const vids = [ea, eb].filter((e) => e.tagName === 'VIDEO'); const ctl = vids.length === 2 ? h('div', { class: 'xv-bar' }, x3('▶ Tocar os dois', () => vids.forEach((v) => { v.currentTime = 0; v.play(); })), x3('⏸ Pausar', () => vids.forEach((v) => v.pause())), x3('Sincronizar tempo', () => { vids[1].currentTime = vids[0].currentTime; })) : null;
  d.append(h('div', { class: 'xv-head' }, h('b', { text: 'Comparar versões' }), h('button', { class: 'x', type: 'button', 'aria-label': 'Fechar', text: '✕', onclick: close })), h('div', { class: 'xv-two' }, h('div', {}, ea, ca), h('div', {}, eb, cb)), ctl);
  document.body.append(d); d.showModal();
};

// ---------- Entregas em grade ----------
const DV = { scope: 'chat', view: 'grid', q: '', type: 'all', bot: '', project: '', sel: new Set(), rows: [], flags: {}, fam: [] };
const ktype = (f) => (f.kind === 'image' ? 'img' : f.kind === 'video' ? 'vid' : f.kind === 'audio' ? 'aud' : 'doc');
XU.deliveries = async (pre = {}) => {
  Object.assign(DV, { q: '', type: 'all', bot: '', project: '', sel: new Set() }, pre); if (pre.project) DV.scope = 'all';
  const d = XU.open('xDel', 'Entregas', '', 'wide big'); d.set(h('div', { class: 'xd-body' }, h('div', { class: 'xnone', text: 'Carregando…' }))); await XU.loadDel(); XU.paintDel();
};
XU.loadDel = async () => {
  const rows = []; const ids = DV.scope === 'chat' ? (S.cur ? [S.cur] : []) : S.chats.filter((c) => !DV.project || c.project === DV.project).map((c) => c.id).slice(0, 60);
  await Promise.all(ids.map(async (id) => { try { const c = id === S.cur && S.chat ? S.chat : await api('GET', `/api/chats/${id}`); const t = (c.title || (S.chats.find((x) => x.id === id) || {}).title || id); for (const dl of collectDeliveries(c)) rows.push({ ...dl, chat: id, chatTitle: t, project: c.project || '', flags: c.fileFlags || {} }); } catch { /* ignora */ } }));
  DV.rows = rows.sort((a, b) => b.ts - a.ts);
};
XU.paintDel = () => {
  const d = document.getElementById('xDel'); if (!d) return;
  const nf = xfold(DV.q); let list = DV.rows.filter((r) => (DV.type === 'all' || r.type === DV.type) && (!DV.bot || r.from === DV.bot) && (!DV.project || r.project === DV.project) && (!nf || xfold((r.file?.name || r.url) + ' ' + r.chatTitle).includes(nf)));
  d.sub(`${list.length} de ${DV.rows.length} entregas · ${DV.scope === 'chat' ? 'desta conversa' : 'de todas as conversas'}`);
  const sel = (label, val, opts, on) => h('select', { 'aria-label': label, onchange: (e) => on(e.target.value) }, ...opts.map(([v, t]) => { const o = h('option', { value: v, text: t }); if (v === val) o.selected = true; return o; }));
  const q = h('input', { type: 'search', placeholder: 'Buscar arquivo ou conversa…', 'aria-label': 'Buscar entregas', value: DV.q, oninput: (e) => { DV.q = e.target.value; clearTimeout(DV._t); DV._t = setTimeout(() => { XU.paintDel(); document.querySelector('#xDel input[type=search]')?.focus(); }, 250); } });
  const tools = h('div', { class: 'xd-bar xtools' }, q,
    sel('Escopo', DV.scope, [['chat', 'Esta conversa'], ['all', 'Todas']], async (v) => { DV.scope = v; await XU.loadDel(); XU.paintDel(); }),
    sel('Tipo', DV.type, [['all', 'Tudo'], ['img', 'Imagens'], ['vid', 'Vídeos'], ['doc', 'Documentos'], ['aud', 'Áudios'], ['link', 'Links']], (v) => { DV.type = v; XU.paintDel(); }),
    sel('Bot', DV.bot, [['', 'Qualquer bot'], ...S.bots.map((b) => [b.slug, b.name])], (v) => { DV.bot = v; XU.paintDel(); }),
    sel('Cliente', DV.project, [['', 'Qualquer cliente'], ...XU.projects.map((p) => [p.id, p.name])], async (v) => { DV.project = v; if (DV.scope === 'all') await XU.loadDel(); XU.paintDel(); }),
    x3(DV.view === 'grid' ? '☰ Lista' : '▦ Grade', () => { DV.view = DV.view === 'grid' ? 'list' : 'grid'; XU.paintDel(); }));
  const files = list.filter((r) => r.file); const links = list.filter((r) => !r.file);
  const mkCard = (r) => {
    const f = r.file, u = f ? `/api/files/${f.id}` : r.url; const fl = r.flags?.[f?.id] || {}; const idx = files.indexOf(r);
    const th = f?.kind === 'image' ? h('img', { src: u, alt: '', loading: 'lazy' }) : f?.kind === 'video' ? h('video', { src: u + '#t=0.5', preload: 'metadata', muted: '', playsinline: '' }) : h('span', { class: 'ico', text: f ? (f.kind === 'audio' ? '🎧' : /\.pdf$/i.test(f.name) ? '📕' : '📄') : '🔗' });
    const cb = f ? h('input', { type: 'checkbox', 'aria-label': 'Selecionar ' + f.name, onclick: (e) => e.stopPropagation(), onchange: (e) => { e.target.checked ? DV.sel.add(f.id) : DV.sel.delete(f.id); XU.paintDelBar(); } }) : null; if (cb) cb.checked = DV.sel.has(f.id);
    const open = () => (f ? XU.preview(files.map((x) => x.file), idx) : window.open(r.url, '_blank', 'noopener'));
    const card = h('div', { class: 'xcard' + (fl.approved ? ' ok' : '') + (fl.rev ? ' rev' : ''), tabindex: '0', role: 'button', onclick: open, onkeydown: (e) => { if (e.key === 'Enter') open(); } },
      h('div', { class: 'th' }, th, cb, fl.approved ? h('span', { class: 'xchip ok', text: 'Aprovada' }) : fl.rev ? h('span', { class: 'xchip', text: 'Revisão antiga' }) : null),
      h('div', { class: 'nm', text: f ? f.name : r.url.replace(/^https?:\/\//, '') }), h('div', { class: 'sb', text: `${nameOf(r.from)} · ${XU.when(r.ts)}${DV.scope === 'all' ? ' · ' + r.chatTitle : ''}` }));
    return card;
  };
  const body = h('div', { class: 'xd-body' });
  if (!list.length) body.append(h('div', { class: 'xnone', text: 'Nada encontrado.' }));
  else if (DV.view === 'grid') body.append(h('div', { class: 'xg' }, ...list.map(mkCard)));
  else body.append(...list.map((r) => { const f = r.file; return h('div', { class: 'xrow' }, h('div', { class: 'm' }, h('div', { class: 'n', text: f ? f.name : r.url }), h('div', { class: 's', text: `${nameOf(r.from)} · ${XU.when(r.ts)} · ${r.chatTitle}${f ? ' · ' + humanSz(f.size) : ''}` })), f ? h('input', { type: 'checkbox', 'aria-label': 'Selecionar', checked: DV.sel.has(f.id) ? '' : null, onchange: (e) => { e.target.checked ? DV.sel.add(f.id) : DV.sel.delete(f.id); XU.paintDelBar(); } }) : null, x3(f ? 'Prévia' : 'Abrir', () => (f ? XU.preview(files.map((x) => x.file), files.indexOf(r)) : window.open(r.url, '_blank', 'noopener')))); }));
  d.set(tools, body, h('div', { class: 'xd-bar', id: 'xDelBar' })); XU.paintDelBar();
};
XU.paintDelBar = () => {
  const bar = document.getElementById('xDelBar'); if (!bar) return; const ids = [...DV.sel]; bar.replaceChildren();
  const all = DV.rows.filter((r) => r.file && DV.sel.has(r.file.id));
  bar.append(h('span', { style: 'flex:1;color:var(--muted);font-size:13px', text: ids.length ? `${ids.length} selecionado(s)` : 'Selecione arquivos para enviar ao Drive, aprovar ou comparar.' }));
  if (ids.length === 2) bar.append(x3('Comparar os dois', () => XU.compare(all[1].file, all[0].file)));
  if (ids.length === 1) { const r = all[0]; const ap = r.flags?.[r.file.id]?.approved; bar.append(x3(ap ? 'Tirar aprovação' : '✓ Aprovar versão', async () => { try { await api('POST', `/api/chats/${r.chat}/files/${r.file.id}/approve`, { on: !ap }); await XU.loadDel(); XU.paintDel(); } catch (e) { XU.err(e); } })); if (ap) bar.append(x3('Enviar aprovada ao Drive', async () => { try { const x = await api('POST', `/api/chats/${r.chat}/files/${r.file.id}/drive-approved`, {}); XU.toast('Enviada ao Drive', x.paths?.[0] || '', { ms: 6000 }); } catch (e) { XU.err(e); } }, 'p')); }
  if (ids.length) bar.append(x3('Enviar ao Drive', () => XU.driveBatch(ids), 'p'), x3('Limpar', () => { DV.sel.clear(); XU.paintDel(); }));
  bar.append(h('a', { class: 'xb', href: `/api/export/deliveries?fmt=csv${DV.project ? '&project=' + DV.project : ''}${DV.scope === 'chat' && S.cur ? '&chat=' + S.cur : ''}`, text: 'Exportar CSV' }), h('a', { class: 'xb', href: `/api/export/deliveries?fmt=json${DV.project ? '&project=' + DV.project : ''}${DV.scope === 'chat' && S.cur ? '&chat=' + S.cur : ''}`, text: 'JSON' }));
};
// envio em lote ao Drive, com progresso
XU.driveBatch = async (ids) => {
  const proj = XU.projects.find((p) => p.id === (S.chat?.project || '')); const def = proj?.driveFolder || store.get('driveFolder') || '';
  const folder = prompt(`Enviar ${ids.length} arquivo(s) para qual pasta do Drive?\n(deixe em branco para a pasta do cliente ou a padrão)`, def); if (folder == null) return;
  store.set('driveFolder', folder.trim());
  try { const { job } = await api('POST', '/api/drive/upload-many', { fileIds: ids, folder: folder.trim() }); const t = XU.toast('Enviando ao Drive…', `0/${ids.length}`, { ms: 0 }); XU.onDrive = (e) => { if (e.job !== job) return; if (e.finished) { t.close(); XU.toast(e.ok ? 'Enviado ao Drive' : 'Envio terminou com erros', e.ok ? `${e.done} arquivo(s)` : e.error || '', { level: e.ok ? '' : 'error', ms: 8000 }); XU.onDrive = null; } else { t.text(`${e.done}/${e.total} · ${e.current || ''}`); t.progress(e.pct || 0); } }; } catch (e) { XU.err(e); }
};
// Drive por arquivo: pasta do cliente + caminho + link
window.sendToDrive = async function (f, btn) {
  const proj = XU.projects.find((p) => p.id === (S.chat?.project || '')); const def = proj?.driveFolder || store.get('driveFolder') || '';
  const folder = prompt(`Enviar "${f.name}" para qual pasta do Google Drive?\n${proj ? `(pasta do cliente ${proj.name}: ${proj.driveFolder || 'sem pasta definida'})` : '(ex.: Sophie | UK/Erin)'}`, def); if (folder == null) return;
  store.set('driveFolder', folder.trim());
  const old = btn?.textContent; if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  const t = XU.toast('Enviando ao Drive…', f.name, { ms: 0 });
  XU.onDrive = (e) => { if (e.file === f.id || e.current === f.name) t.progress(e.pct || 0); };
  try {
    const r = await api('POST', '/api/drive/upload', { fileId: f.id, folder: folder.trim() }); t.close();
    const acts = [{ label: 'Copiar caminho', run: () => navigator.clipboard?.writeText(r.path) }];
    if (proj?.driveUrl) acts.unshift({ label: 'Abrir pasta do cliente', run: () => window.open(proj.driveUrl, '_blank', 'noopener') });
    acts.push({ label: r.local ? 'Buscar no Drive' : 'Gerar link', run: async () => { try { const l = await api('POST', '/api/drive/link', { path: r.path }); if (l.search) window.open(l.url, '_blank', 'noopener'); else { await navigator.clipboard?.writeText(l.url).catch(() => {}); XU.toast('Link copiado', l.url, { ms: 8000 }); } } catch (e) { XU.err(e); } } });
    XU.toast(r.local ? 'Copiado para a pasta do Drive' : 'Enviado ao Drive', r.path + (r.local ? '\nO Drive sincroniza em seguida.' : ''), { ms: 12000, actions: acts });
  } catch (e) { t.close(); XU.err(e); } finally { XU.onDrive = null; if (btn) { btn.disabled = false; btn.textContent = old; } }
};
window.openDeliveries = function () { if (!S.chat) { XU.toast('Abra uma conversa', 'Escolha uma conversa para ver as entregas dela.', { ms: 3000 }); return; } DV.scope = 'chat'; XU.deliveries(); };

// ---------- escritório ao vivo ----------
XU.onOffice = () => {
  const of = document.getElementById('office'); if (!of || of.hidden) return;
  let box = document.getElementById('xOfTeam'); if (!box) { box = h('div', { id: 'xOfTeam' }); of.append(box); }
  const act = [...XU.tasks.values()]; const rows = (XU.ofBots ? XU.ofBots() : S.bots).map((b) => { const run = act.find((t) => t.bot === b.slug && t.status === 'running'), q = act.filter((t) => t.bot === b.slug && t.status === 'queued').length; const a = XU.lastAct[b.slug];
    return h('button', { class: 'xot' + (run ? ' run' : ''), type: 'button', onclick: () => openBotSide?.(b.slug), title: 'Abrir ' + b.name }, h('i', { class: 'dot' + (run ? ' on' : '') }), h('b', { text: b.name }), h('span', { text: run ? `${run.label || 'trabalhando'} · ${XU.dur(Date.now() - (run.startedAt || run.queuedAt))}` : q ? `${q} na fila` : 'livre' }), run && a ? h('small', { text: a.text }) : null); });
  box.replaceChildren(h('div', { class: 'ttl', text: `Equipe agora${XU.queue ? ' · ' + XU.queue + ' aguardando vaga' : ''}` }), ...rows);
};
setInterval(XU.onOffice, 3000);
{ const o = window.openOffice; if (o) window.openOffice = function () { o(); setTimeout(XU.onOffice, 50); XU.refreshTasks?.(); }; }

// ---------- escritório: tarefas feitas nos últimos 7 dias (lado direito) ----------
XU.done = { list: [], at: 0 };
XU.loadDone = async () => { try { const r = await api('GET', '/api/done?days=7'); XU.done.list = r.tasks || []; XU.done.at = Date.now(); XU.drawDone(); } catch (e) { /* sem rede: mantém a lista anterior */ } };
XU.drawDone = () => {
  const body = document.getElementById('ofBody'); if (!body) return;
  let ax = document.getElementById('xOfTasks');
  if (!ax) { ax = h('aside', { id: 'xOfTasks', 'aria-label': 'Tarefas feitas nos últimos 7 dias' }); body.insertBefore(ax, document.getElementById('ofSide')); }
  const had0 = XU.done.inp && document.activeElement === XU.done.inp, p0 = had0 ? XU.done.inp.selectionStart : 0, p1 = had0 ? XU.done.inp.selectionEnd : 0;
  const list = XU.ofProj ? XU.done.list.filter((t) => t.project === XU.ofProj) : XU.done.list; const dayKey = (ts) => new Date(ts).toDateString(); const today = dayKey(Date.now()), yest = dayKey(Date.now() - 86400000);
  const dayLabel = (ts) => { const k = dayKey(ts); return k === today ? 'Hoje' : k === yest ? 'Ontem' : new Date(ts).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }); };
  const hm = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const nameOf = (s) => S.bots.find((b) => b.slug === s)?.name || s;
  const colorOf = (s) => { try { return COLORS[styleOf(s).color] || '#4f8cff'; } catch { return '#4f8cff'; } };
  const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const terms = fold(XU.done.q || '').split(/\s+/).filter(Boolean);
  const hay = (t) => fold([t.title, t.final, ...(t.bots || []).map(nameOf), ...(t.flow || []).map((f) => nameOf(f.bot) + ' ' + f.text)].join(' '));
  const shown = terms.length ? list.filter((t) => { const s = hay(t); return terms.every((w) => s.includes(w)); }) : list;
  if (!XU.done.sb) {
    const inp = h('input', { type: 'search', class: 'xtsi', placeholder: 'Buscar tarefa, bot ou resultado…', 'aria-label': 'Buscar tarefas', autocomplete: 'off', spellcheck: 'false' });
    inp.addEventListener('input', () => { XU.done.q = inp.value; XU.drawDone(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Escape' && inp.value) { e.stopPropagation(); inp.value = ''; XU.done.q = ''; XU.drawDone(); } });
    XU.done.sb = h('div', { class: 'xtsb' }, inp); XU.done.inp = inp;
  }
  const cnt = terms.length ? `${shown.length} de ${list.length}` : String(list.length);
  const kids = [h('div', { class: 'xthead' }, h('div', { class: 'xthd' }, h('b', { text: 'Tarefas feitas' }), h('span', { text: 'últimos 7 dias' }), h('i', { class: 'xthn', text: cnt })), XU.done.sb)];
  if (!list.length) kids.push(h('div', { class: 'xthe', text: 'Nenhuma tarefa concluída nos últimos 7 dias. Quando os bots responderem a um pedido, ele aparece aqui.' }));
  else if (!shown.length) kids.push(h('div', { class: 'xthe', text: `Nada encontrado para “${XU.done.q}”.` }));
  let lastDay = '';
  for (const t of shown) {
    const dl = dayLabel(t.ts); if (dl !== lastDay) { kids.push(h('div', { class: 'xtday', text: dl })); lastDay = dl; }
    const chips = t.bots.map((s) => { const c = colorOf(s); return h('span', { class: 'xtbc' + (s === t.finalBot ? ' on' : ''), style: `--c:${c}`, title: nameOf(s) + (s === t.finalBot ? ' · entregou o resultado' : '') }, (() => { try { return botAvatar(s, 20); } catch { return h('i'); } })(), h('b', { text: nameOf(s) })); });
    const steps = t.flow.map((f, i) => h('li', { style: `--c:${colorOf(f.bot)}` }, h('b', { text: nameOf(f.bot) }), h('span', { text: f.text || '—' })));
    const card = h('div', { class: 'xtk', role: 'button', tabindex: '0', title: 'Abrir a conversa desta tarefa', onclick: () => XU.openTaskChat(t) },
      h('div', { class: 'xttt' }, h('b', { text: t.title }), h('time', { text: hm(t.ts) })),
      h('div', { class: 'xtbots' }, ...chips),
      h('div', { class: 'xtfin' }, h('small', { text: 'Resultado' }), h('p', { text: t.final || '—' }), t.files ? h('em', { text: `${t.files} arquivo(s)` }) : null),
      steps.length > 1 ? h('div', { class: 'xtfl' }, h('small', { text: 'Fluxo' }), h('ol', {}, ...steps)) : null);
    card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } };
    kids.push(card);
  }
  const keep = ax.scrollTop, inp = XU.done.inp;
  ax.replaceChildren(...kids); ax.scrollTop = keep; if (had0) { inp.focus(); try { inp.setSelectionRange(p0, p1); } catch (e) { /* tipo search */ } }
};
XU.openTaskChat = async (t) => {
  try {
    OF.side = t.finalBot || (t.bots || [])[0] || 'x'; document.getElementById('ofChatHost').append(document.getElementById('chat')); document.getElementById('ofSide').hidden = false; document.getElementById('office').classList.add('sideopen');
    await openChat(t.chat); setTimeout(officeResize, 0);
  } catch (e) { XU.err?.(e); }
};
{
  const o2 = window.openOffice;
  if (o2) window.openOffice = function () { o2.apply(this, arguments); XU.drawDone(); XU.loadDone(); setTimeout(officeResize, 30); };
  setInterval(() => { const of = document.getElementById('office'); if (of && !of.hidden) XU.loadDone(); }, 30000);
  const st = document.getElementById('ofStage'); if (st && window.ResizeObserver) new ResizeObserver(() => { try { officeResize(); } catch (e) { /* ainda sem escritório */ } }).observe(st);
}

// ---------- painéis do escritório recolhíveis (Equipe agora e Tarefas feitas) ----------
{
  const KEY = 'xofmin'; const rd = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const wr = (k, v) => { try { const o = rd(); o[k] = v; localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* sem armazenamento: vale só nesta sessão */ } };
  const apply = () => { const o = rd(); for (const [id, k] of [['xOfTeam', 'team'], ['xOfTasks', 'tasks']]) { const el = document.getElementById(id); if (el) { el.classList.toggle('min', !!o[k]); const hd = el.querySelector('.ttl, .xthd'); if (hd) { hd.setAttribute('role', 'button'); hd.setAttribute('tabindex', '0'); hd.setAttribute('aria-expanded', String(!o[k])); hd.title = o[k] ? 'Expandir' : 'Recolher'; } } } };
  const toggle = (id, k) => { const el = document.getElementById(id); if (!el) return; const v = !el.classList.contains('min'); wr(k, v); apply(); try { officeResize(); } catch (e) { /* canvas ainda não existe */ } };
  document.addEventListener('click', (e) => { if (e.target.closest('#xOfTeam .ttl')) toggle('xOfTeam', 'team'); else if (e.target.closest('#xOfTasks .xthd')) toggle('xOfTasks', 'tasks'); });
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('#xOfTeam .ttl, #xOfTasks .xthd')) { e.preventDefault(); e.target.click(); } });
  const a = XU.onOffice; XU.onOffice = function () { a?.apply(this, arguments); apply(); };
  const d = XU.drawDone; XU.drawDone = function () { d.apply(this, arguments); apply(); };
}

// ---------- menu de botão direito nas conversas ----------
{
  const UKEY = 'xunread';
  const manual = () => { try { return JSON.parse(localStorage.getItem(UKEY) || '{}'); } catch (e) { return {}; } };
  const setManual = (id, on) => { try { const o = manual(); if (on) o[id] = 1; else delete o[id]; localStorage.setItem(UKEY, JSON.stringify(o)); } catch (e) { /* sem armazenamento */ } };
  for (const id of Object.keys(manual())) S.unread[id] = true;
  { const oc = window.openChat; if (oc) window.openChat = async function (id) { setManual(id, false); return oc.apply(this, arguments); }; }

  // etiqueta colorida e identificação do item na lista
  const _item = window.itemEl;
  window.itemEl = function (c) {
    const e = _item(c); e.dataset.chat = c.id; if (S.unread?.[c.id]) e.classList.add('xunread');
    if (c.label?.color) {
      e.classList.add('haslab'); e.style.setProperty('--xl', COLORS[c.label.color] || '#3b82f6');
      if (c.label.text) { const nm = e.querySelector('.nm'); if (nm) nm.append(h('span', { class: 'xlab', text: c.label.text })); }
    }
    return e;
  };

  let box = null;
  const close = () => { if (box) { box.remove(); box = null; } };
  const call = async (fn) => { try { await fn(); } catch (e) { XU.err(e); } };

  const download = (url) => { const a = h('a', { href: url, download: '' }); document.body.append(a); a.click(); a.remove(); };
  const refresh = async () => { await loadState(); if (S.chat) { const c = S.chats.find((x) => x.id === S.chat.id); if (c) { S.chat.title = c.title; renderHead?.(); } } };

  function findBot(slug) {
    const wrap = document.getElementById('ofLabels'); if (!wrap) return;
    document.querySelectorAll('.xfind').forEach((e) => e.remove());
    const ring = h('div', { class: 'xfind' }); wrap.append(ring);
    const t0 = performance.now(); let seen = false;
    const tick = () => {
      const o = document.getElementById('office'); if (!o || o.hidden) return ring.remove();
      const e = OF.hit.find((x) => x.slug === slug);
      if (e) { seen = true; const s = OF.scale, d = 34 * s; ring.style.cssText = `left:${e.cx * s}px;top:${e.cy * s}px;width:${d}px;height:${d}px`; OF.tag.get(slug)?.classList.add('xfound'); }
      const dt = performance.now() - t0;
      if (dt < 5200 && (seen || dt < 2000)) return requestAnimationFrame(tick);
      ring.remove(); OF.tag.get(slug)?.classList.remove('xfound'); if (!seen) XU.toast('Bot fora do escritório', 'Esse bot não está em nenhum ambiente do escritório.', { ms: 4000 });
    };
    tick();
  }
  XU.findBot = findBot;

  const IC = {
    pin: 'M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z',
    unread: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', check: 'M20 6 9 17l-5-5', pencil: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
    tag: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01', drop: 'M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z',
    map: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', copy: 'M9 9h11v11H9zM5 15H4V4h11v1', box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3.3 7L12 12l8.7-5M12 22V12',
    down: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3', trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
    right: 'M9 6l6 6-6 6', left: 'M15 6l-6 6 6 6', file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h6', code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
    x: 'M18 6 6 18M6 6l12 12', users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  };
  const svg = (k, s = 16) => { const n = 'http://www.w3.org/2000/svg', e = document.createElementNS(n, 'svg'); e.setAttribute('viewBox', '0 0 24 24'); e.setAttribute('width', s); e.setAttribute('height', s); e.setAttribute('fill', k === 'unread' ? 'currentColor' : 'none'); e.setAttribute('stroke', 'currentColor'); e.setAttribute('stroke-width', '2'); e.setAttribute('stroke-linecap', 'round'); e.setAttribute('stroke-linejoin', 'round'); const p = document.createElementNS(n, 'path'); p.setAttribute('d', IC[k] || ''); e.append(p); return e; };
  const CNAME = { brown: 'Marrom', red: 'Vermelho', orange: 'Laranja', amber: 'Âmbar', green: 'Verde', teal: 'Turquesa', blue: 'Azul', purple: 'Roxo', pink: 'Rosa', gray: 'Cinza' };

  function menuFor(c) {
    const direct = c.type === 'direct', slug = c.members[0], pinned = L().pins.includes(c.id), unread = !!S.unread[c.id];
    const proj = (XU.projects || []).find((p) => p.id === c.project);
    const setLabel = (lb) => call(async () => { await api('PUT', `/api/chats/${c.id}/meta`, { label: lb }); await refresh(); });
    return [
      { sec: 'Organizar' },
      { label: pinned ? 'Desafixar' : 'Fixar no topo', ico: 'pin', tint: '#f5a524', run: () => placeChat(c.id, { kind: pinned ? 'rest' : 'pin' }) },
      { label: unread ? 'Marcar como lida' : 'Marcar como não lida', ico: unread ? 'check' : 'unread', tint: '#3b82f6', run: () => { if (unread) delete S.unread[c.id]; else S.unread[c.id] = true; setManual(c.id, !unread); renderList(); renderRail?.(); } },
      { label: 'Renomear conversa', ico: 'pencil', tint: '#737373', run: () => call(async () => { const n = prompt('Novo nome da conversa:' + (direct ? '\n(só muda aqui na lista; o bot continua com o mesmo nome)' : ''), c.title); if (n === null) return; if (!direct && !n.trim()) return; await api('PUT', `/api/chats/${c.id}/meta`, { title: n }); await refresh(); }) },
      { label: 'Cliente', ico: 'tag', tint: '#14b8a6', hint: proj?.name || '', sub: () => [
        { label: 'Nenhum cliente', check: !c.project, run: () => call(async () => { await api('PUT', `/api/chats/${c.id}/project`, { project: '' }); await loadState(); }) },
        ...(XU.projects || []).filter((p) => !p.archived || c.project === p.id).map((p) => ({ label: p.name, check: c.project === p.id, dot: p.color, run: () => call(async () => { await api('PUT', `/api/chats/${c.id}/project`, { project: p.id }); await loadState(); }) })),
        ...((XU.projects || []).length ? [] : [{ info: 'Nenhum cliente cadastrado ainda. Crie em Clientes.' }]),
      ] },
      { label: 'Cor e etiqueta', ico: 'drop', tint: '#ec4899', hint: c.label?.text || (c.label ? CNAME[c.label.color] : ''), dot: c.label ? COLORS[c.label.color] : '', sub: () => [
        { swatches: Object.keys(COLORS), cur: c.label?.color, text: c.label?.text || '', pick: (k) => setLabel({ color: k, text: c.label?.text || '' }) },
        { label: 'Texto da etiqueta…', ico: 'pencil', tint: '#737373', run: () => { const t = prompt('Texto da etiqueta (até 16 letras):', c.label?.text || ''); if (t === null) return; setLabel({ color: c.label?.color || 'blue', text: t }); } },
        ...(c.label ? [{ label: 'Remover etiqueta', ico: 'x', tint: '#e5484d', run: () => setLabel(null) }] : []),
      ] },
      ...(direct ? [
        { sec: 'Bot' },
        { label: 'Ir até o bot no escritório', ico: 'map', tint: '#22c55e', run: () => { const a = document.getElementById('cal'); if (a && !a.hidden) closeCal(); if (document.getElementById('office').hidden) openOffice(); setTimeout(() => findBot(slug), 350); } },
        { label: 'Duplicar bot', ico: 'copy', tint: '#8b5cf6', run: () => call(async () => { const nb = await api('POST', `/api/bots/${slug}/duplicate`); await loadState(); await openChat(`d-${nb.slug}`); XU.toast('Bot duplicado', nb.name || nb.slug, { ms: 3500 }); }) },
        { label: 'Apagar bot', ico: 'trash', danger: true, run: () => call(async () => {
          const nm = c.title;
          if (!(await XU.confirm(`Apagar o bot ${nm}?`, 'O bot some de vez: conversa direta, memória, skills, arquivos de conhecimento, rotinas e itens do calendário dele. Ele também sai dos grupos e dos projetos. Não dá para desfazer.', 'Apagar bot', true))) return;
          await api('DELETE', `/api/bots/${slug}`); setManual(c.id, false); delete S.unread[c.id];
          const was = S.cur === c.id || (S.chat && (S.chat.members || []).includes(slug) && S.chat.type === 'direct');
          await loadState(); await XU.loadProjects?.();
          if (was || (S.cur && !S.chats.find((x) => x.id === S.cur))) { S.cur = null; S.chat = null; document.getElementById('chat').classList.remove('on'); document.getElementById('empty').style.display = ''; document.getElementById('app').classList.remove('inchat'); history.replaceState(null, '', location.pathname); renderList(); }
          XU.toast('Bot apagado', nm, { ms: 3500 });
        }) },
      ] : []),
      { sec: 'Conteúdo' },
      { label: 'Ver entregas', ico: 'box', tint: '#f97316', run: () => call(async () => { await openChat(c.id); window.openDeliveries(); }) },
      { label: 'Exportar conversa', ico: 'down', tint: '#3b82f6', sub: () => [
        { label: 'Markdown (.md)', ico: 'file', tint: '#3b82f6', hint: 'legível', run: () => download(`/api/chats/${c.id}/export?fmt=md`) },
        { label: 'JSON (.json)', ico: 'code', tint: '#8b5cf6', hint: 'completo', run: () => download(`/api/chats/${c.id}/export?fmt=json`) },
      ] },
      { sep: true },
      { label: direct ? 'Apagar histórico da conversa' : 'Excluir conversa', ico: 'trash', danger: true, run: () => call(async () => {
        const ok = direct ? confirm(`Apagar TODO o histórico e os arquivos da conversa com ${c.title}?\nO bot continua existindo, mas esquece esta conversa. Não dá para desfazer.`) : confirm(`Excluir a conversa “${c.title}” e os arquivos dela?\nNão dá para desfazer.`);
        if (!ok) return; await api('DELETE', `/api/chats/${c.id}`); setManual(c.id, false); delete S.unread[c.id];
        const was = S.cur === c.id; await loadState();
        if (was) { if (direct) await openChat(c.id); else { S.cur = null; S.chat = null; document.getElementById('chat').classList.remove('on'); document.getElementById('empty').style.display = ''; document.getElementById('app').classList.remove('inchat'); history.replaceState(null, '', location.pathname); renderList(); } }
      }) },
    ];
  }

  function show(x, y, c) {
    close(); const stack = [{ title: c.title, items: menuFor(c) }];
    box = h('div', { class: 'xctx', role: 'menu' }); document.body.append(box);
    const sub = c.solo ? 'Conversa do projeto' : c.type === 'group' ? `Grupo · ${c.members.length} bots` : (botBy(c.members[0])?.tag || 'Conversa direta');
    const projName = (XU.projects || []).find((p) => p.id === c.project)?.name;
    const paint = (dir) => {
      const v = stack[stack.length - 1], kids = [];
      if (stack.length > 1) kids.push(h('button', { class: 'xci back', type: 'button', onclick: () => { stack.pop(); paint('back'); } }, svg('left', 16), h('span', { class: 'lb', text: v.title })));
      else { let av = null; try { av = chatAvatar(c, 34); } catch (e) { /* sem avatar */ } kids.push(h('div', { class: 'xch' }, av ? h('span', { class: 'av' }, av) : null, h('span', { class: 'tx' }, h('b', { text: c.title }), h('small', { text: sub + (projName ? ' · ' + projName : '') }))), h('div', { class: 'xcs' })); }
      for (const it of v.items) {
        if (!it) continue;
        if (it.sep) kids.push(h('div', { class: 'xcs' }));
        else if (it.sec) kids.push(h('div', { class: 'xsec', text: it.sec }));
        else if (it.info) kids.push(h('div', { class: 'xcn', text: it.info }));
        else if (it.swatches) {
          const cur = it.cur;
          kids.push(h('div', { class: 'xcw' }, ...it.swatches.map((k) => h('button', { class: 'xcsw' + (cur === k ? ' on' : ''), type: 'button', title: CNAME[k], 'aria-label': CNAME[k], style: `--c:${COLORS[k]}`, onclick: () => { close(); it.pick(k); } }, cur === k ? svg('check', 13) : null))),
            h('div', { class: 'xcp' }, h('span', { text: 'Prévia' }), h('em', { class: 'xlab', style: `--xl:${COLORS[cur] || '#8e8e95'}`, text: it.text || (cur ? CNAME[cur] : 'sem etiqueta') })));
        } else kids.push(h('button', { class: 'xci' + (it.danger ? ' danger' : ''), type: 'button', role: 'menuitem', style: it.tint ? `--t:${it.tint}` : '', onclick: () => { if (it.sub) { stack.push({ title: it.label, items: it.sub() }); paint('fwd'); } else { close(); it.run(); } } },
          it.ico ? h('span', { class: 'ib' }, svg(it.ico, 15)) : (it.check ? h('span', { class: 'ib ck' }, svg('check', 15)) : (it.dot ? h('span', { class: 'ib' }, h('i', { class: 'dt', style: `background:${it.dot}` })) : h('span', { class: 'ib none' }))),
          h('span', { class: 'lb', text: it.label }), it.check && it.ico ? h('span', { class: 'ckr' }, svg('check', 14)) : null, it.dot && it.ico ? h('i', { class: 'dt', style: `background:${it.dot}` }) : null, it.hint ? h('small', { text: it.hint }) : null, it.sub ? h('span', { class: 'chv' }, svg('right', 14)) : null));
      }
      box.replaceChildren(...kids); box.classList.remove('fwd', 'back'); void box.offsetWidth; if (dir) box.classList.add(dir);
      const w = box.offsetWidth, hh = box.offsetHeight;
      box.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px'; box.style.top = Math.max(8, Math.min(y, innerHeight - hh - 8)) + 'px';
      box.querySelector('.xci')?.focus({ preventScroll: true });
    };
    paint();
  }
  const list = document.getElementById('list');
  list?.addEventListener('contextmenu', (e) => {
    const it = e.target.closest('.item[data-chat]'); if (!it) return;
    const c = S.chats.find((x) => x.id === it.dataset.chat); if (!c) return;
    e.preventDefault(); e.stopPropagation(); show(e.clientX, e.clientY, c);
  }, true);
  document.addEventListener('mousedown', (e) => { if (box && !e.target.closest('.xctx')) close(); });
  document.addEventListener('keydown', (e) => {
    if (!box) return;
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const bs = [...box.querySelectorAll('.xci')]; const i = bs.indexOf(document.activeElement); bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length]?.focus(); }
  }, true);
  window.addEventListener('blur', close); window.addEventListener('resize', close); list?.addEventListener('scroll', close, { passive: true });
  renderList();
}

// ---------- Projetos (completos) ----------
{
  const ico = (d, s = 16) => { const n = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); n.setAttribute('viewBox', '0 0 24 24'); n.setAttribute('width', s); n.setAttribute('height', s); n.setAttribute('fill', 'none'); n.setAttribute('stroke', 'currentColor'); n.setAttribute('stroke-width', '2'); n.setAttribute('stroke-linecap', 'round'); n.setAttribute('stroke-linejoin', 'round'); n.innerHTML = d; return n; };
  const PLUS = '<path d="M12 5v14M5 12h14"/>';
  const bt = (text, run, cls = '') => h('button', { class: 'xb ' + cls, type: 'button', text, onclick: run });
  const atPoint = (ev, fallback) => { const x = ev.clientX || fallback?.getBoundingClientRect().left || 0, y = ev.clientY || fallback?.getBoundingClientRect().bottom || 0; return { getBoundingClientRect: () => ({ left: x, right: x + 200, top: y, bottom: y - 6 }) }; };
  const PX = XU.proj = { tpl: null, panelId: '', data: null, showArch: false };
  const fmtN = (n) => new Intl.NumberFormat('pt-BR').format(n);
  const ago = (ts) => { const m = Math.round((Date.now() - ts) / 60000); if (m < 1) return 'agora'; if (m < 60) return m + ' min'; const hh = Math.round(m / 60); if (hh < 24) return hh + ' h'; return Math.round(hh / 24) + ' d'; };
  const getTpl = async () => { if (!PX.tpl) PX.tpl = (await api('GET', '/api/project-templates')).templates; return PX.tpl; };
  const tabNow = () => { const l = S.layout || {}; return (l.tabs || []).find((t) => t.id === l.tab); };
  const imgOf = (p) => p.imgUrl || (p.image && p.id ? `/api/projects/${p.id}/image?v=${p.imgv || 0}` : '');
  const projMark = (p, s = 36) => { const u = imgOf(p); return h('span', { class: 'xpmark' + (u ? ' img' : ''), style: `--pc:${p.color};width:${s}px;height:${s}px;font-size:${Math.round(s * 0.52)}px` + (u ? `;background-image:url("${u}")` : ''), text: u ? '' : (p.icon || (p.name || '?').slice(0, 1).toUpperCase()) }); };
  const fileToSquare = async (file, size = 256) => {
    const bmp = await createImageBitmap(file); const cv = document.createElement('canvas'); cv.width = cv.height = size; const g = cv.getContext('2d');
    const m = Math.min(bmp.width, bmp.height); g.drawImage(bmp, (bmp.width - m) / 2, (bmp.height - m) / 2, m, m, 0, 0, size, size);
    let out = cv.toDataURL('image/png'); if (out.length > 190000) out = cv.toDataURL('image/jpeg', 0.86);
    if (out.length > 190000) { cv.width = cv.height = 192; cv.getContext('2d').drawImage(bmp, (bmp.width - m) / 2, (bmp.height - m) / 2, m, m, 0, 0, 192, 192); out = cv.toDataURL('image/jpeg', 0.8); }
    return out;
  };

  // ----- lista na aba "Projetos" -----
  const paintProjList = () => {
    const t = tabNow(); const list = document.getElementById('list'); if (!list || !t || t.type !== 'projects' || t.project) return;
    if (document.getElementById('q')?.value.trim()) return;
    const all = XU.projects || []; const full = all.filter((p) => p.full && !p.archived), simple = all.filter((p) => !p.full), arch = all.filter((p) => p.full && p.archived);
    const card = (p) => {
      const u = p.usage || { calls: 0 }; const pct = p.budget ? Math.min(100, Math.round((u.calls / p.budget) * 100)) : 0;
      return h('div', { class: 'xpc' + (PX.panelId === p.id ? ' sel' : ''), 'data-proj': p.id, tabindex: 0, role: 'button', onclick: () => PX.open(p.id), onkeydown: (e) => { if (e.key === 'Enter') PX.open(p.id); } },
        projMark(p, 38), h('div', { class: 'm' }, h('div', { class: 'n', text: p.name }),
          h('div', { class: 's', text: `${p.chats?.length || 0} conversa${(p.chats?.length || 0) === 1 ? '' : 's'} · ${p.team?.length || 0} bot${(p.team?.length || 0) === 1 ? '' : 's'}${p.client ? ' · ' + p.client : ''}` }),
          p.budget ? h('div', { class: 'xpb' + (pct >= 100 ? ' e' : pct >= 80 ? ' w' : '') }, h('i', { style: `width:${pct}%` })) : null));
    };
    const sec = (text, n) => h('div', { class: 'grp', style: 'cursor:default' }, h('span', { class: 'gn', text }), h('span', { class: 'gc', text: String(n) }));
    const kids = [h('div', { class: 'xpnew' }, h('button', { type: 'button', class: 'xpnb', onclick: () => PX.create() }, ico(PLUS, 16), h('span', { text: 'Novo projeto' })))];
    if (full.length) { kids.push(sec('Projetos', full.length)); full.forEach((p) => kids.push(card(p))); }
    if (simple.length) {
      kids.push(sec('Clientes (viram projeto com 1 clique)', simple.length));
      simple.forEach((p) => kids.push(h('div', { class: 'xpc simple', 'data-proj': p.id }, projMark(p, 32), h('div', { class: 'm' }, h('div', { class: 'n', text: p.name }), h('div', { class: 's', text: `${p.chats?.length || 0} conversa(s)` })),
        h('button', { type: 'button', class: 'xb', text: 'Virar projeto', onclick: (e) => { e.stopPropagation(); PX.promote(p); } }))));
    }
    if (arch.length) {
      kids.push(h('button', { type: 'button', class: 'xpar', text: (PX.showArch ? '▾' : '▸') + ` Arquivados (${arch.length})`, onclick: () => { PX.showArch = !PX.showArch; renderList(); } }));
      if (PX.showArch) arch.forEach((p) => kids.push(card(p)));
    }
    if (!full.length && !simple.length && !arch.length) kids.push(h('div', { class: 'emptylist' }, h('div', { text: 'Nenhum projeto ainda.' }), h('div', { class: 'xph', text: 'Um projeto junta conversas, bots, regras, pasta do Drive e tarefas de um trabalho.' })));
    list.replaceChildren(...kids);
  };
  { const r = window.renderList; window.renderList = function () { const v = r.apply(this, arguments); try { paintProjList(); } catch (e) { console.error(e); } return v; }; }
  { const o = XU.onProjects; XU.onProjects = function () { o?.apply(this, arguments); try { renderList(); } catch { /* */ } if (PX.panelId && document.getElementById('xProj')?.classList.contains('on')) PX.load(); }; }

  PX.promote = async (p) => {
    const tpl = await getTpl();
    const d = XU.open('xPromo', 'Virar projeto', `“${p.name}” vira um projeto completo: painel, equipe, regras, orçamento e rotinas. As conversas atuais continuam.`, 'narrow');
    const sel = h('select', {}, h('option', { value: '', text: 'Sem modelo' }), ...tpl.map((t) => h('option', { value: t.key, text: t.icon + ' ' + t.name })));
    d.set(h('div', { class: 'xd-body' }, h('label', { class: 'xf' }, h('span', { text: 'Modelo (opcional, só preenche regras e descrição vazias)' }), sel)),
      h('div', { class: 'xd-bar' }, h('span', { style: 'flex:1' }), bt('Cancelar', () => d.close()), bt('Virar projeto', async () => { try { await api('POST', `/api/projects/${p.id}/promote`, { template: sel.value }); await XU.loadProjects(); d.close(); XU.toast('Projeto criado', p.name); PX.open(p.id); } catch (e) { XU.err(e); } }, 'p')));
  };

  // ----- criar / editar -----
  PX.create = async (pre = {}) => {
    const tpl = await getTpl(); PX.form(null, tpl, pre);
  };
  PX.edit = async (p) => { PX.form(p, await getTpl(), {}); };
  PX.form = (p, tpl, pre) => {
    const d = XU.open('xNewProj', p ? 'Editar projeto' : 'Novo projeto', p ? p.name : 'Escolha um modelo para começar com regras e bots prontos, ou crie em branco.', 'wide');
    const st = { tpl: p?.template || pre.template || '', createBots: new Set(), bots: new Set(p ? (p.team?.length ? p.team : p.bots || []) : []), skills: new Set(p?.skills || []), skq: '', img: '', imgRemove: false };
    const f = {
      name: h('input', { type: 'text', maxlength: 40, value: p?.name || '', placeholder: 'Ex.: Reels do cliente X' }),
      icon: h('input', { type: 'text', maxlength: 2, value: p?.icon || '📁', class: 'xpicon', 'aria-label': 'Ícone (emoji)' }),
      color: h('input', { type: 'color', value: p?.color || '#4f8cff' }),
      client: h('input', { type: 'text', maxlength: 60, value: p?.client || '', placeholder: 'Opcional: nome do cliente' }),
      desc: h('input', { type: 'text', maxlength: 200, value: p?.desc || '', placeholder: 'Em uma frase, do que trata este projeto' }),
      url: h('input', { type: 'url', value: p?.driveUrl || '', placeholder: 'https://drive.google.com/…' }),
      folder: h('input', { type: 'text', maxlength: 160, value: p?.driveFolder || '', placeholder: 'Ex.: Clientes/Acme/Vídeos' }),
      rules: h('textarea', { rows: 5, placeholder: 'Regras fixas: estilo, o que nunca fazer, formato de entrega…' }),
      mem: h('textarea', { rows: 4, placeholder: 'Memória: fatos que os bots devem lembrar neste projeto' }),
      budget: h('input', { type: 'number', min: 0, step: 10, value: p?.budget || 0, placeholder: '0 = sem limite' }),
    };
    f.rules.value = p?.rules || ''; f.mem.value = p?.memory || '';
    const row = (l, el, hint) => h('label', { class: 'xf' }, h('span', { text: l }), el, hint ? h('span', { class: 'xph', text: hint }) : null);
    const tplBox = h('div', { class: 'xtpl' }); const botBox = h('div', { class: 'xbpick' }); const skBox = h('div', { class: 'xskills' }); let skAll = null;
    const paintSk = () => {
      const kids = [h('div', { class: 'xsec', text: 'Skills' }), h('div', { class: 'xph', text: 'Escolha skills que já existem no seu Claude. Elas são copiadas para todos os bots do projeto, que passam a usá-las quando o pedido combinar.' })];
      if (skAll === null) { kids.push(h('div', { class: 'xph', text: 'Procurando skills no seu Claude…' })); skBox.replaceChildren(...kids); return; }
      if (!skAll.length) { kids.push(h('div', { class: 'xskno', text: 'Nenhuma skill encontrada na pasta .claude do seu PC (nem na biblioteca do Atlas).' })); skBox.replaceChildren(...kids); return; }
      const q = st.skq.trim().toLowerCase();
      const inp = h('input', { type: 'search', class: 'xsks', placeholder: `Buscar entre ${skAll.length} skills…`, value: st.skq, oninput: (e) => { st.skq = e.target.value; paintSkList(); } });
      kids.push(inp, h('div', { class: 'xsksel' }), h('div', { class: 'xsklist' })); skBox.replaceChildren(...kids); paintSkList();
    };
    const SRC = { claude: 'Claude', plugin: 'Plugin', biblioteca: 'Biblioteca' };
    const paintSkList = () => {
      const q = st.skq.trim().toLowerCase(); const list = skBox.querySelector('.xsklist'), sel = skBox.querySelector('.xsksel'); if (!list) return;
      const rows = skAll.filter((k) => !q || (k.name + ' ' + k.description).toLowerCase().includes(q));
      list.replaceChildren(...rows.slice(0, 60).map((k) => h('label', { class: 'xsk' + (st.skills.has(k.name) ? ' on' : '') }, h('input', { type: 'checkbox', ...(st.skills.has(k.name) ? { checked: '' } : {}), onchange: (e) => { e.target.checked ? st.skills.add(k.name) : st.skills.delete(k.name); e.target.parentNode.classList.toggle('on', e.target.checked); paintSel(); } }), h('span', { class: 'tx' }, h('span', { class: 'n' }, k.name, h('em', { text: SRC[k.source] || k.source })), h('span', { class: 'd', text: k.description || 'Sem descrição' })))), ...(rows.length > 60 ? [h('div', { class: 'xph', text: `Mostrando 60 de ${rows.length}. Use a busca para filtrar.` })] : []), ...(!rows.length ? [h('div', { class: 'xph', text: 'Nada encontrado.' })] : []));
      paintSel();
    };
    const paintSel = () => { const sel = skBox.querySelector('.xsksel'); if (!sel) return; sel.replaceChildren(...[...st.skills].map((n) => h('button', { type: 'button', class: 'xskp', title: 'Tirar skill', onclick: () => { st.skills.delete(n); paintSkList(); } }, h('span', { text: n }), h('i', { text: '✕' })))); sel.hidden = !st.skills.size; };
    api('GET', '/api/skill-catalog').then((r) => { skAll = r.skills || []; for (const n of st.skills) if (!skAll.some((k) => k.name === n)) skAll.unshift({ name: n, description: 'Skill já ligada ao projeto (não encontrada agora no PC)', source: 'claude' }); paintSk(); }).catch(() => { skAll = []; paintSk(); });
    let applyTpl = (t) => {
      st.tpl = t?.key || ''; st.createBots = new Set();
      if (t) { if (!f.name.value.trim() || tpl.some((x) => x.name === f.name.value)) f.name.value = t.name; f.icon.value = t.icon; f.color.value = t.color; f.rules.value = t.rules; f.desc.value = t.desc; }
      paintTpl(); paintBots();
    };
    const paintTpl = () => {
      if (p) { tplBox.replaceChildren(); return; }
      tplBox.replaceChildren(h('div', { class: 'xsec', text: '1 · Escolha um modelo' }), h('div', { class: 'xtg' },
        h('button', { type: 'button', class: 'xtc' + (!st.tpl ? ' on' : ''), onclick: () => applyTpl(null) }, h('span', { class: 'i', text: '✨' }), h('span', { class: 'tx' }, h('span', { class: 'n', text: 'Em branco' }), h('span', { class: 'd', text: 'Começar do zero' }))),
        ...tpl.map((t) => h('button', { type: 'button', class: 'xtc' + (st.tpl === t.key ? ' on' : ''), style: `--pc:${t.color}`, title: t.desc, onclick: () => applyTpl(t) }, h('span', { class: 'i', text: t.icon }), h('span', { class: 'tx' }, h('span', { class: 'n', text: t.name }), h('span', { class: 'd', text: `${t.bots.length} bots sugeridos` }))))));
    };
    const paintBots = () => {
      const t = tpl.find((x) => x.key === st.tpl); const kids = [h('div', { class: 'xsec', text: (p ? '' : '3 · ') + 'Bots do projeto' })];
      if (!p && t) {
        kids.push(h('div', { class: 'xph', text: 'Sugeridos pelo modelo. Nenhum é criado sozinho: marque só os que quiser criar.' }));
        t.bots.forEach((b, i) => kids.push(h('label', { class: 'xchk' }, h('input', { type: 'checkbox', ...(st.createBots.has(i) ? { checked: '' } : {}), onchange: (e) => { e.target.checked ? st.createBots.add(i) : st.createBots.delete(i); } }), h('span', { class: 'n', text: b.name }), h('span', { class: 's', text: b.description }))));
      }
      kids.push(h('div', { class: 'xph', text: S.bots.length ? 'Bots que você já tem (um bot pode estar em vários projetos):' : 'Você ainda não tem bots.' }));
      const wrap = h('div', { class: 'xchips' });
      for (const b of S.bots) wrap.append(h('label', { class: 'xchip' + (st.bots.has(b.slug) ? ' on' : '') }, h('input', { type: 'checkbox', ...(st.bots.has(b.slug) ? { checked: '' } : {}), onchange: (e) => { e.target.checked ? st.bots.add(b.slug) : st.bots.delete(b.slug); e.target.parentNode.classList.toggle('on', e.target.checked); } }), botAvatar(b.slug, 22), h('span', { text: b.name }), h('i', { class: 'ck', text: '✓' })));
      kids.push(wrap); botBox.replaceChildren(...kids);
    };
    const save = async () => {
      const body = { name: f.name.value.trim(), icon: f.icon.value.trim(), color: f.color.value, client: f.client.value.trim(), desc: f.desc.value.trim(), driveUrl: f.url.value.trim(), driveFolder: f.folder.value.trim(), rules: f.rules.value, memory: f.mem.value, budget: Number(f.budget.value) || 0, bots: [...st.bots], skills: [...st.skills] };
      if (!body.name) { XU.toast('Dê um nome ao projeto'); f.name.focus(); return; }
      try {
        if (p) { const rr = await api('PUT', `/api/projects/${p.id}`, body); if (st.img) await api('POST', `/api/projects/${p.id}/image`, { data: st.img }); else if (st.imgRemove && p.image) await api('DELETE', `/api/projects/${p.id}/image`); await XU.loadProjects(); d.close(); if (rr?.skillsFailed?.length) XU.toast('Algumas skills não foram copiadas', rr.skillsFailed.join(', ')); if (PX.panelId === p.id) PX.load(); else PX.open(p.id); }
        else { body.template = st.tpl; body.createBots = [...st.createBots]; const r = await api('POST', '/api/projects/full', body); if (st.img) await api('POST', `/api/projects/${r.id}/image`, { data: st.img }).catch((er) => XU.err(er)); await XU.loadProjects(); try { await loadState(); } catch { /* */ } d.close(); XU.toast('Projeto criado', `${r.name}${r.createdBots?.length ? ' · ' + r.createdBots.length + ' bot(s) criado(s)' : ''}`); if (r.skillsFailed?.length) XU.toast('Algumas skills não foram copiadas', r.skillsFailed.join(', ')); PX.open(r.id); }
      } catch (e) { XU.err(e); }
    };
    const del = async () => { if (!(await XU.confirm('Apagar projeto?', 'As conversas, bots e arquivos não são apagados, só deixam de pertencer ao projeto.', 'Apagar', true))) return; try { await api('DELETE', `/api/projects/${p.id}`); await XU.loadProjects(); d.close(); PX.close(); } catch (e) { XU.err(e); } };
    const arch = async () => { try { await api('PUT', `/api/projects/${p.id}`, { archived: !p.archived }); await XU.loadProjects(); d.close(); if (!p.archived) PX.close(); else PX.open(p.id); } catch (e) { XU.err(e); } };
    const prev = h('div', { class: 'xprev' }); const mk = h('span'); const pt = h('div', { class: 'pt' }), ps = h('div', { class: 'ps' });
    let mkRef = mk; const syncSafe = () => { const m = projMark({ color: f.color.value, icon: f.icon.value.trim(), name: f.name.value || '?', imgUrl: st.img || (!st.imgRemove && p?.image ? imgOf(p) : '') }, 52); mkRef.replaceWith(m); mkRef = m; pt.textContent = f.name.value.trim() || 'Novo projeto'; ps.textContent = [f.client.value.trim() ? 'Cliente: ' + f.client.value.trim() : '', f.desc.value.trim()].filter(Boolean).join(' · ') || 'Prévia do cartão do projeto'; prev.style.setProperty('--pc', f.color.value); };
    prev.append(mk, h('div', { class: 'm' }, pt, ps));
    const SW = ['#4f8cff', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#f5a524', '#22c55e', '#14b8a6', '#06b6d4', '#64748b'];
    const EM = ['📁', '🎬', '🎨', '🧭', '📊', '📱', '✍️', '🎯', '💬', '🤝', '💰', '📰', '🔎', '🏢', '🎓', '⚙️', '🚀', '⭐'];
    const imgBox = h('div', { class: 'ximg' }); const fileIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: '' });
    const paintImg = () => {
      const has = Boolean(st.img || (!st.imgRemove && p?.image));
      imgBox.replaceChildren(projMark({ color: f.color.value, icon: f.icon.value.trim(), name: f.name.value || '?', imgUrl: st.img || (!st.imgRemove && p?.image ? imgOf(p) : '') }, 64), h('div', { class: 'b' }, bt(has ? 'Trocar imagem…' : 'Escolher imagem…', () => fileIn.click()), has ? bt('Remover', () => { st.img = ''; st.imgRemove = true; paintImg(); syncSafe(); }) : null, h('div', { class: 'xph', text: 'PNG ou JPG. Será cortada em quadrado. Sem imagem, aparece o ícone.' })), fileIn);
    };
    fileIn.addEventListener('change', async () => { const fl = fileIn.files[0]; fileIn.value = ''; if (!fl) return; try { st.img = await fileToSquare(fl); st.imgRemove = false; paintImg(); syncSafe(); } catch { XU.toast('Não consegui ler essa imagem', 'Tente um PNG ou JPG.'); } });
    const swBox = h('div', { class: 'xsw' }); const emBox = h('div', { class: 'xem' });
    const paintLook = () => {
      swBox.replaceChildren(...SW.map((c) => h('button', { type: 'button', class: 'sw' + (f.color.value.toLowerCase() === c ? ' on' : ''), style: `background:${c}`, 'aria-label': 'Cor ' + c, onclick: () => { f.color.value = c; paintLook(); syncSafe(); } })), h('label', { class: 'sw custom' + (SW.includes(f.color.value.toLowerCase()) ? '' : ' on'), title: 'Outra cor' }, h('span', { text: '+' }), f.color));
      emBox.replaceChildren(...EM.map((e) => h('button', { type: 'button', class: 'em' + (f.icon.value.trim() === e ? ' on' : ''), text: e, onclick: () => { f.icon.value = e; paintLook(); syncSafe(); } })));
    };
    for (const k of ['name', 'client', 'desc', 'icon']) f[k].addEventListener('input', () => { syncSafe(); if (k === 'icon') paintLook(); });
    f.color.addEventListener('input', () => { paintLook(); syncSafe(); });
    const origApply = applyTpl; applyTpl = (t) => { origApply(t); paintLook(); syncSafe(); };
    paintTpl(); paintBots(); paintLook(); syncSafe(); paintSk(); paintImg();
    d.set(h('div', { class: 'xd-body xnp' }, prev, tplBox,
      h('div', { class: 'xsec', text: (p ? '' : '2 · ') + 'Identidade' }),
      row('Nome', f.name), h('div', { class: 'xrow2' }, row('Cliente (opcional)', f.client), row('Descrição', f.desc)),
      h('div', { class: 'xf' }, h('span', { text: 'Imagem do projeto (opcional)' }), imgBox),
      h('div', { class: 'xf' }, h('span', { text: 'Cor' }), swBox), h('div', { class: 'xf' }, h('span', { text: 'Ícone' }), emBox, h('div', { class: 'xicr' }, f.icon, h('span', { class: 'xph', text: 'ou digite qualquer emoji' }))),
      botBox, skBox,
      h('div', { class: 'xsec', text: 'Regras e memória' }), row('Regras do projeto', f.rules, 'Todos os bots recebem isto nas conversas do projeto.'), row('Memória', f.mem),
      h('div', { class: 'xsec', text: 'Drive e orçamento' }), row('Link da pasta do projeto no Google Drive', f.url), row('Pasta para os envios (caminho no seu Drive)', f.folder),
      row('Orçamento mensal de chamadas', f.budget, 'Quando chegar no limite, o projeto pausa sozinho até o mês virar. Aviso aos 80%.')),
      h('div', { class: 'xd-bar' }, p ? bt(p.archived ? 'Desarquivar' : 'Arquivar', arch) : null, p ? bt('Apagar', del, 'd') : null, h('span', { style: 'flex:1' }), bt('Cancelar', () => d.close()), bt(p ? 'Salvar' : 'Criar projeto', save, 'p')));
    setTimeout(() => f.name.focus({ preventScroll: true }), 30);
  };
  XU.newProject = () => PX.create();

  // ----- painel -----
  const panelEl = () => {
    let el = document.getElementById('xProj'); if (el) return el;
    el = h('section', { id: 'xProj', 'aria-label': 'Painel do projeto' }); document.body.append(el);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && el.classList.contains('on') && !document.querySelector('dialog[open]')) PX.close(); });
    return el;
  };
  PX.close = () => { PX.panelId = ''; PX.data = null; document.getElementById('xProj')?.classList.remove('on'); document.body.classList.remove('xproj-on'); renderList(); };
  PX.open = async (id) => { PX.panelId = id; panelEl().classList.add('on'); document.body.classList.add('xproj-on'); renderList(); await PX.load(); };
  XU.refreshPanel = () => { if (PX.panelId) PX.load(); };
  PX.load = async () => {
    if (!PX.panelId) return; const id = PX.panelId;
    try { const r = await api('GET', `/api/projects/${id}/panel`); if (PX.panelId !== id) return; PX.data = r; PX.draw(); }
    catch (e) { if (/não encontrado/.test(e.message)) PX.close(); else XU.err(e); }
  };
  let pt = 0; const refresh = () => { clearTimeout(pt); pt = setTimeout(() => { if (PX.panelId) PX.load(); }, 700); };
  { const o = XU.onOffice; }
  setInterval(() => { if (PX.panelId && !document.hidden && !document.querySelector('#xProj :focus')) PX.load(); }, 20000);
  XU.onTasks = ((o) => function () { o?.apply(this, arguments); refresh(); })(XU.onTasks);

  PX.team = async (p, body, ok) => {
    try { const r = await api('POST', `/api/projects/${p.id}/team`, body); await XU.loadProjects(); try { await loadState(); } catch { /* */ } PX.load(); XU.toast(ok, r.detachedChats ? `${r.detachedChats} conversa(s) só com esse bot saíram do projeto` : '', { ms: 3500 }); if (r.skillsFailed?.length) XU.toast('Algumas skills não foram copiadas', r.skillsFailed.join(', ')); }
    catch (e) { XU.err(e); }
  };
  PX.teamMenu = (ev, p, slug) => {
    ev.preventDefault(); ev.stopPropagation(); const at = atPoint(ev, ev.currentTarget);
    const inTeam = new Set((PX.data?.team || []).map((b) => b.slug)); const outside = S.bots.filter((b) => !inTeam.has(b.slug));
    const pick = (title, list, run) => setTimeout(() => showMenu(at, list.length ? [{ info: title }, ...list.map((b) => ({ label: b.name + (b.tag ? ' · ' + b.tag : ''), run: () => run(b) }))] : [{ info: 'Todos os seus bots já estão neste projeto.' }]), 30);
    const items = [{ label: 'Adicionar bot…', run: () => pick('Adicionar ao projeto', outside, (b) => PX.team(p, { action: 'add', bot: b.slug }, `${b.name} entrou no projeto`)) }];
    if (slug) {
      const nm = botBy(slug)?.name || slug;
      items.push({ label: 'Trocar bot…', run: () => pick(`Trocar ${nm} por`, outside, (b) => PX.team(p, { action: 'swap', bot: slug, to: b.slug }, `${b.name} entrou no lugar de ${nm}`)) },
        { sep: true }, { label: 'Remover bot', danger: true, run: async () => { if (await XU.confirm(`Remover ${nm}?`, 'Ele sai do projeto e das conversas em grupo dele. O bot e o histórico continuam existindo.', 'Remover', true)) PX.team(p, { action: 'remove', bot: slug }, `${nm} saiu do projeto`); } });
    }
    showMenu(at, items);
  };
  PX.openChatId = (id) => { PX.close(); openChat(id); };
  PX.soloChat = async (p, slug) => { try { const r = await api('POST', `/api/projects/${p.id}/chat`, { bot: slug }); try { await loadState(); } catch { /* */ } PX.openChatId(r.id); } catch (e) { XU.err(e); } };
  PX.newChat = async (p) => {
    const t = p.team || []; if (!t.length) { XU.toast('Adicione bots ao projeto primeiro'); PX.edit(p); return; }
    const title = prompt('Nome da conversa:', 'Nova conversa'); if (title === null) return;
    try { const r = await api('POST', `/api/projects/${p.id}/chat`, { title: title.trim() }); try { await loadState(); } catch { /* */ } PX.openChatId(r.id); } catch (e) { XU.err(e); }
  };
  PX.routineForm = (p, team) => {
    const d = XU.open('xProjRt', 'Nova rotina do projeto', `A rotina roda dentro do projeto “${p.name}” e usa as regras dele.`, 'narrow');
    const f = { name: h('input', { type: 'text', maxlength: 40, placeholder: 'Ex.: Resumo semanal' }), bot: h('select', {}, ...team.map((b) => h('option', { value: b.slug, text: b.name }))), time: h('input', { type: 'time', value: '09:00' }), prompt: h('textarea', { rows: 4, placeholder: 'O que o bot deve fazer' }) };
    const days = [1, 2, 3, 4, 5]; const dn = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const dw = h('div', { class: 'xchips' }, ...dn.map((n, i) => h('label', { class: 'xchip' + (days.includes(i) ? ' on' : '') }, h('input', { type: 'checkbox', ...(days.includes(i) ? { checked: '' } : {}), onchange: (e) => { const k = days.indexOf(i); if (e.target.checked && k < 0) days.push(i); if (!e.target.checked && k >= 0) days.splice(k, 1); e.target.parentNode.classList.toggle('on', e.target.checked); } }), h('span', { text: n }))));
    const row = (l, el) => h('label', { class: 'xf' }, h('span', { text: l }), el);
    d.set(h('div', { class: 'xd-body' }, row('Nome', f.name), row('Bot', f.bot), row('Horário', f.time), h('div', { class: 'xf' }, h('span', { text: 'Dias' }), dw), row('Pedido', f.prompt)),
      h('div', { class: 'xd-bar' }, h('span', { style: 'flex:1' }), bt('Cancelar', () => d.close()), bt('Criar rotina', async () => { try { await api('POST', '/api/routines', { name: f.name.value.trim(), bot: f.bot.value, prompt: f.prompt.value.trim(), time: f.time.value, days: [...days], enabled: true, project: p.id }); d.close(); await XU.loadProjects(); PX.load(); } catch (e) { XU.err(e); } }, 'p')));
  };

  PX.draw = () => {
    const el = panelEl(); const D = PX.data; if (!D) return; const p = D.project;
    const card = (title, count, body, actions) => h('section', { class: 'xpcard' }, h('header', {}, h('b', { text: title }), count != null ? h('span', { class: 'xpn', text: String(count) }) : null, h('span', { style: 'flex:1' }), ...(actions || [])), body);
    const none = (t) => h('div', { class: 'xph', text: t });
    const u = D.usage; const pct = u.budget ? Math.min(100, Math.round((u.calls / u.budget) * 100)) : 0;
    const usage = h('div', {}, h('div', { class: 'xubig' }, h('b', { text: fmtN(u.calls) }), h('span', { text: u.budget ? ` de ${fmtN(u.budget)} chamadas no mês` : ' chamadas neste mês' })),
      u.budget ? h('div', { class: 'xpb big' + (pct >= 100 ? ' e' : pct >= 80 ? ' w' : '') }, h('i', { style: `width:${pct}%` })) : h('div', { class: 'xph', text: 'Sem limite definido. Defina um orçamento em Editar.' }),
      ...u.byBot.slice(0, 5).map((b) => h('div', { class: 'xurow' }, h('span', { text: b.name }), h('b', { text: String(b.n) }))));
    const teamBody = D.team.length ? h('div', { class: 'xteam' }, ...D.team.map((b) => h('button', { type: 'button', class: 'xtm', title: 'Clique para abrir a conversa · botão direito para opções', onclick: () => PX.soloChat(p, b.slug), oncontextmenu: (ev) => PX.teamMenu(ev, p, b.slug) }, h('span', { class: 'av' }, botAvatar(b.slug, 30), h('i', { class: 'st ' + b.status })), h('span', { class: 'n', text: b.name }), h('span', { class: 's', text: b.status === 'running' ? 'trabalhando' : b.status === 'queued' ? 'na fila' : b.tag })))) : none('Nenhum bot ainda. Clique em Editar para adicionar.');
    const waitBody = D.waiting.length ? h('div', {}, ...D.waiting.map((w) => h('button', { type: 'button', class: 'xwr', onclick: () => PX.openChatId(w.chat) }, h('span', { class: 'k ' + w.kind, text: w.kind === 'approve' ? 'Aprovar' : 'Precisa de você' }), h('span', { class: 't', text: `${X_name(w.from)}: ${w.text}` })))) : none('Nada esperando por você.');
    const chatBody = D.chats.length ? h('div', {}, ...D.chats.slice(0, 12).map((c) => h('button', { type: 'button', class: 'xcr', onclick: () => PX.openChatId(c.id) }, h('span', { class: 'n', text: c.title }), h('span', { class: 's', text: c.preview || `${c.members.length} bot(s)` }), h('span', { class: 'a', text: c.ts ? ago(c.ts) : '' })))) : none('Nenhuma conversa ainda.');
    const doneBody = D.done.length ? h('div', {}, ...D.done.slice(0, 8).map((t) => h('button', { type: 'button', class: 'xdr', onclick: () => PX.openChatId(t.chat) }, h('span', { class: 't', text: t.title }), h('span', { class: 'f', text: t.final }), h('span', { class: 'b' }, ...t.bots.slice(0, 5).map((s) => botAvatar(s, 20)), h('span', { class: 'a', text: ago(t.ts) }))))) : none('Nenhuma tarefa concluída nos últimos 30 dias.');
    const fileBody = D.files.length ? h('div', {}, ...D.files.slice(0, 8).map((f) => h('a', { class: 'xfr', href: `/api/files/${f.id}`, target: '_blank', rel: 'noopener' }, h('span', { class: 'n', text: (f.approved ? '✓ ' : '') + f.name }), h('span', { class: 'a', text: ago(f.ts) })))) : none('Nenhuma entrega ainda.');
    const rtBody = D.routines.length ? h('div', {}, ...D.routines.map((r) => h('div', { class: 'xrr' }, h('span', { class: 'n', text: r.name }), h('span', { class: 's', text: `${X_name(r.bot)} · ${r.time}${r.enabled ? '' : ' · pausada'}` })))) : none('Sem rotinas neste projeto.');
    const rules = h('div', { class: 'xrules' }, p.desc ? h('p', { class: 'xdesc', text: p.desc }) : null, h('div', { class: 'xrt' }, p.rules ? h('pre', { text: p.rules }) : none('Sem regras. Em Editar você define o que os bots devem seguir.')), p.memory ? h('div', { class: 'xph', text: 'Memória' }) : null, p.memory ? h('pre', { text: p.memory }) : null, p.skills?.length ? h('div', { class: 'xph', text: 'Skills' }) : null, p.skills?.length ? h('div', { class: 'xchips' }, ...p.skills.map((n) => h('span', { class: 'xchip on', text: n }))) : null, p.driveUrl ? h('a', { class: 'xb', href: p.driveUrl, target: '_blank', rel: 'noopener', text: 'Abrir pasta no Drive' }) : p.driveFolder ? h('div', { class: 'xph', text: 'Drive: ' + p.driveFolder }) : null);
    el.replaceChildren(
      h('div', { class: 'xph-head' }, projMark(p, 46), h('div', { class: 'm' }, h('h2', { text: p.name }), h('div', { class: 's', text: [p.client ? 'Cliente: ' + p.client : '', p.archived ? 'Arquivado' : '', `${D.chats.length} conversa(s)`].filter(Boolean).join(' · ') })),
        h('div', { class: 'b' }, bt('Nova conversa', () => PX.newChat(p), 'p'), bt('Editar', () => PX.edit(p)), bt('Entregas', () => XU.deliveries({ project: p.id })), h('button', { type: 'button', class: 'xpx', 'aria-label': 'Fechar painel', title: 'Fechar', onclick: PX.close, text: '✕' }))),
      h('div', { class: 'xpgrid' },
        card('Aguardando você', D.waiting.length, waitBody), card('Equipe', D.team.length, teamBody, [bt('+ Bot', (ev) => PX.teamMenu(ev, p, null))]), card('Uso e orçamento', null, usage),
        card('Tarefas recentes', D.done.length, doneBody), card('Chats', D.chats.length, chatBody), card('Entregas', D.filesTotal, fileBody),
        ...(XU.calCard ? [XU.calCard(D, p, card)] : []),
        card('Rotinas', D.routines.length, rtBody, [bt('+ Rotina', () => D.team.length ? PX.routineForm(p, D.team) : XU.toast('Adicione bots ao projeto primeiro'))]), card('Regras e memória', null, rules)));
  };
  const X_name = (s) => (s === 'user' ? 'Você' : botBy(s)?.name || s);
}

// ---------- escritório: filtro por projeto ----------
{
  const KEY = 'xofproj'; try { XU.ofProj = localStorage.getItem(KEY) || ''; } catch { XU.ofProj = ''; }
  const teamOf = () => { const p = (XU.projects || []).find((x) => x.id === XU.ofProj); return p ? new Set(p.team || []) : null; };
  XU.ofBots = () => { const t = teamOf(); return t ? S.bots.filter((b) => t.has(b.slug)) : S.bots; };
  { const a = window.assignment; if (a) window.assignment = function () { const m = a.apply(this, arguments); const t = teamOf(); if (t) for (const k of [...m.keys()]) if (!t.has(k)) m.delete(k); return m; }; }
  const mount = () => {
    const head = document.querySelector('#office .ofhead'); if (!head) return; let sel = document.getElementById('xOfProj');
    const list = (XU.projects || []).filter((p) => p.full && !p.archived);
    if (!sel) { sel = h('select', { id: 'xOfProj', class: 'oftime', 'aria-label': 'Filtrar escritório por projeto', onchange: (e) => { XU.ofProj = e.target.value; try { localStorage.setItem(KEY, XU.ofProj); } catch { /* */ } XU.onOffice?.(); XU.drawDone?.(); } }); head.insertBefore(sel, document.getElementById('ofTime')); }
    if (XU.ofProj && !list.some((p) => p.id === XU.ofProj)) XU.ofProj = '';
    sel.hidden = !list.length; sel.replaceChildren(h('option', { value: '', text: 'Todos os projetos' }), ...list.map((p) => h('option', { value: p.id, text: (p.icon || '') + ' ' + p.name }))); sel.value = XU.ofProj;
  };
  { const o = XU.onProjects; XU.onProjects = function () { o?.apply(this, arguments); mount(); XU.onOffice?.(); XU.drawDone?.(); }; }
  { const o = window.openOffice; if (o) window.openOffice = function () { o.apply(this, arguments); mount(); }; }
}

// ---------- painel do projeto: fecha ao abrir uma conversa ou sair da aba Projetos ----------
{
  const hide = () => { const P = XU.proj; if (!P?.panelId) return; P.panelId = ''; P.data = null; document.getElementById('xProj')?.classList.remove('on'); document.body.classList.remove('xproj-on'); };
  { const o = window.openChat; if (o) window.openChat = function () { hide(); return o.apply(this, arguments); }; }
  { const r = window.renderList; window.renderList = function () { const t = (S.layout?.tabs || []).find((x) => x.id === S.layout?.tab); if (XU.proj?.panelId && t && t.type !== 'projects') hide(); return r.apply(this, arguments); }; }
}

// ---------- navegador do bot dentro da conversa (etapa 1: você vê e controla; o bot ainda não usa) ----------
{
  const BR = (XU.browser = { slug: '', open: false, st: null, q: [], busy: false, timer: 0, poll: 0, wide: false });
  const W = 1280, H = 800;
  const ICO = {
    globe: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z"/></svg>',
    back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    fwd: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    reload: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
    wide: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>',
    power: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v8M6.3 6.8a8 8 0 1 0 11.4 0"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  };
  const ib = (svg, title, run, cls = '') => { const b = h('button', { type: 'button', class: 'xbr-ib ' + cls, title, 'aria-label': title, onclick: run }); b.innerHTML = svg; return b; };
  const nameOf = (slug) => botBy(slug)?.name || slug;
  const chatBots = () => { const c = (S.chats || []).find((x) => x.id === S.cur) || S.chat; return c ? (c.members || []).filter((s) => botBy(s)) : []; };

  const el = {};
  el.title = h('b', { class: 'xbr-t', text: 'Navegador' });
  el.tabs = h('div', { class: 'xbr-tabs' });
  el.url = h('input', { class: 'xbr-url', type: 'text', placeholder: 'Digite um endereço ou pesquise', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Endereço' });
  el.img = h('img', { class: 'xbr-img', alt: 'Tela do navegador', draggable: 'false' });
  el.kb = h('textarea', { class: 'xbr-kb', 'aria-label': 'Teclado do navegador', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', rows: '1' });
  el.ov = h('div', { class: 'xbr-ov' });
  el.agentTxt = h('span', { text: '' });
  el.agentBar = h('div', { class: 'xbr-agent' }, h('span', { class: 'xbr-pulse' }), el.agentTxt, h('span', { style: 'flex:1' }), h('button', { type: 'button', class: 'xb', text: 'Assumir controle', title: 'Para o bot e libera o navegador para você', onclick: () => takeOver() }));
  el.view = h('div', { class: 'xbr-view', tabindex: '-1' }, el.img, el.kb, el.ov);
  el.file = h('input', { type: 'file', hidden: '', 'aria-hidden': 'true' });
  el.chBar = h('div', { class: 'xbr-chooser' }, h('span', { text: 'O site pediu um arquivo.' }), h('span', { style: 'flex:1' }),
    h('button', { type: 'button', class: 'xb p', text: 'Escolher do computador', onclick: () => el.file.click() }), h('button', { type: 'button', class: 'xb', text: 'Cancelar', onclick: () => act({ action: 'cancelchooser' }) }));
  el.dlBar = h('div', { class: 'xbr-dl' });
  el.file.addEventListener('change', async () => {
    const f = el.file.files[0]; el.file.value = ''; if (!f || !BR.slug) return;
    el.chBar.classList.add('busy');
    try {
      const r = await fetch(`/api/browser/${BR.slug}/upload?name=${encodeURIComponent(f.name)}`, { method: 'POST', headers: { 'x-grok': '1' }, body: f, credentials: 'same-origin' });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'não consegui enviar o arquivo');
      XU.toast('Arquivo enviado', f.name, { ms: 2500 }); if (BR.st) BR.st.chooser = null; draw(); setTimeout(refresh, 400);
    } catch (e) { XU.err(e); }
    el.chBar.classList.remove('busy');
  });
  const FOOT0 = 'Você está no controle: clique na página e digite. Para entrar numa conta, faça o login aqui mesmo; a senha fica só com você.';
  el.wideBtn = ib(ICO.wide, 'Ampliar ou reduzir', () => { BR.wide = !BR.wide; apply(); });
  el.pane = h('aside', { id: 'xBr', class: 'xbr', 'aria-label': 'Navegador do bot' },
    h('div', { class: 'xbr-head' }, h('span', { class: 'xbr-dot' }), el.title, h('span', { style: 'flex:1' }), el.wideBtn, ib(ICO.power, 'Encerrar o navegador (as contas continuam conectadas)', () => stop()), ib(ICO.x, 'Fechar o painel', () => hide())),
    el.tabs,
    h('form', { class: 'xbr-nav', onsubmit: (e) => { e.preventDefault(); const u = el.url.value.trim(); if (u) act({ action: 'go', url: u }); el.kb.focus(); } },
      ib(ICO.back, 'Voltar', () => act({ action: 'back' })), ib(ICO.fwd, 'Avançar', () => act({ action: 'forward' })), ib(ICO.reload, 'Recarregar', () => act({ action: 'reload' })), el.url),
    el.agentBar,
    el.chBar,
    el.view,
    el.dlBar, el.file,
    (el.foot = h('div', { class: 'xbr-foot', text: 'Você está no controle: clique na página e digite. Para entrar numa conta, faça o login aqui mesmo; a senha fica só com você.' })));
  document.getElementById('main')?.append(el.pane);

  const apply = () => { const m = document.getElementById('main'); m?.classList.toggle('brOn', BR.open); m?.classList.toggle('brwide', BR.open && BR.wide); document.getElementById('xBrBtn')?.classList.toggle('on', BR.open); el.pane.classList.toggle('on', BR.open); };
  const overlay = (msg, btn) => { el.ov.replaceChildren(); if (!msg) { el.ov.classList.remove('on'); return; } el.ov.classList.add('on'); el.ov.append(h('div', { text: msg }), ...(btn ? [h('button', { type: 'button', class: 'xb p', text: btn.t, onclick: btn.run })] : [])); };

  const draw = () => {
    const s = BR.st; if (!s) return; const tabs = s.tabs || [];
    el.tabs.replaceChildren(...tabs.map((t) => h('div', { class: 'xbr-tab' + (t.active ? ' on' : ''), title: t.url, onclick: () => { if (!t.active) act({ action: 'select', tab: t.id }); } }, h('span', { text: t.title || (t.url === 'about:blank' ? 'Nova aba' : t.url || 'Nova aba') }), tabs.length > 1 ? h('button', { type: 'button', class: 'xbr-x', 'aria-label': 'Fechar aba', onclick: (e) => { e.stopPropagation(); act({ action: 'close', tab: t.id }); } , text: '×' }) : null)), h('button', { type: 'button', class: 'xbr-plus', title: 'Nova aba', 'aria-label': 'Nova aba', text: '+', onclick: () => act({ action: 'newtab' }) }));
    const ag = Boolean(s.agent); el.agentBar.classList.toggle('on', ag); el.agentTxt.textContent = `${nameOf(BR.slug)} está usando o navegador`; el.pane.classList.toggle('agent', ag); el.foot.textContent = ag ? 'O bot está no comando. Para mexer você mesmo, clique em Assumir controle.' : 'Você está no controle: clique na página e digite. Para entrar numa conta, faça o login aqui mesmo; a senha fica só com você.';
    el.chBar.classList.toggle('on', Boolean(s.chooser) && !ag);
    const dl = s.downloads || []; el.dlBar.classList.toggle('on', dl.length > 0);
    el.dlBar.replaceChildren(...(dl.length ? [h('span', { class: 'l', text: 'Baixados:' }), ...dl.slice(0, 4).map((d) => h('a', { class: 'xbr-f', href: `/api/browser/${BR.slug}/download/${encodeURIComponent(d.name)}`, download: d.name, title: `Salvar ${d.name} no seu computador` }, d.name, h('small', { text: ' ' + (d.size > 1048576 ? (d.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(d.size / 1024)) + ' KB') })))] : []));
    if (document.activeElement !== el.url) el.url.value = s.url && s.url !== 'about:blank' ? s.url : '';
  };
  const refresh = async () => {
    if (!BR.open || !BR.slug) return;
    try { const s = await api('GET', `/api/browser/${BR.slug}`); if (!BR.open) return; if (!s.running) { BR.st = null; overlay('O navegador foi encerrado.', { t: 'Abrir de novo', run: () => show(BR.slug) }); return; } BR.st = s; draw(); } catch { /* tenta no próximo ciclo */ }
  };
  const act = async (body) => { if (!BR.slug) return; try { BR.st = await api('POST', `/api/browser/${BR.slug}/act`, body); draw(); } catch (e) { XU.err(e); } };
  const stream = () => { el.img.src = `/api/browser/${BR.slug}/stream?_=${Date.now()}`; };
  el.img.addEventListener('error', () => { if (BR.open && BR.st) overlay('Conexão com o navegador interrompida.', { t: 'Reconectar', run: () => { overlay(''); stream(); } }); });
  el.img.addEventListener('load', () => overlay(''));

  async function show(slug) {
    { const a = document.getElementById('app'); if (!BR.open && a && !isMobile()) { BR.hadPanel = !a.classList.contains('nopanel'); a.classList.add('nopanel'); } }
    BR.slug = slug; BR.open = true; BR.st = null; el.title.textContent = `Navegador de ${nameOf(slug)}`; el.tabs.replaceChildren(); el.url.value = ''; apply(); overlay('Abrindo o navegador…');
    try {
      BR.st = await api('POST', `/api/browser/${slug}/open`, {}); if (!BR.open || BR.slug !== slug) return; draw(); stream();
      clearInterval(BR.poll); BR.poll = setInterval(refresh, 1500); setTimeout(() => el.kb.focus(), 50);
    } catch (e) { hide(); XU.err(e); }
  }
  function hide() { if (BR.open && BR.hadPanel) { document.getElementById('app')?.classList.remove('nopanel'); BR.hadPanel = false; } BR.open = false; clearInterval(BR.poll); el.img.removeAttribute('src'); overlay(''); apply(); }
  async function stop() { const s = BR.slug; hide(); if (s) { try { await api('POST', `/api/browser/${s}/stop`, {}); XU.toast('Navegador encerrado', 'Os logins ficam salvos no perfil do bot.', { ms: 3000 }); } catch (e) { XU.err(e); } } }
  async function takeOver() {
    const c = S.cur; if (!c) return;
    try { await api('POST', `/api/chats/${c}/stop`, {}); XU.toast('Você assumiu', `${nameOf(BR.slug)} foi parado. O navegador é seu.`, { ms: 3000 }); if (BR.st) BR.st.agent = false; draw(); setTimeout(refresh, 600); el.kb.focus(); } catch (e) { XU.err(e); }
  }
  BR.show = show; BR.hide = hide;
  XU.onBrowser = (d) => { if (S.cur !== d.chatId) return; if (!BR.open) show(d.bot).then(() => { if (BR.st) BR.st.agent = true; draw(); }); else if (BR.slug === d.bot) { if (BR.st) BR.st.agent = true; draw(); } };

  // ---------- entrada: mouse, rolagem, teclado ----------
  const pt = (e) => { const r = el.img.getBoundingClientRect(); return { x: Math.max(0, Math.min(W, Math.round((e.clientX - r.left) * W / (r.width || W)))), y: Math.max(0, Math.min(H, Math.round((e.clientY - r.top) * H / (r.height || H)))) }; };
  const mods = (e) => (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
  const send = (ev) => {
    if (BR.st?.agent) return; // o bot está no comando: você assume pelo botão
    const last = BR.q[BR.q.length - 1]; if (ev.t === 'mouse' && ev.type === 'move' && last && last.t === 'mouse' && last.type === 'move') BR.q[BR.q.length - 1] = ev; else BR.q.push(ev);
    if (!BR.timer) BR.timer = setTimeout(flush, 30);
  };
  async function flush() {
    BR.timer = 0; if (BR.busy || !BR.q.length || !BR.open) return; BR.busy = true; const events = BR.q.splice(0, 50);
    try { await api('POST', `/api/browser/${BR.slug}/input`, { events }); if (events.some((e) => e.t === 'mouse' && e.type === 'up')) setTimeout(refresh, 500); } catch { /* navegador fechou: o refresh avisa */ }
    BR.busy = false; if (BR.q.length) BR.timer = setTimeout(flush, 5);
  }
  let down = 0;
  const BTN = ['left', 'middle', 'right'];
  el.view.addEventListener('mousedown', (e) => { e.preventDefault(); el.kb.focus(); down |= 1 << e.button; const p = pt(e); send({ t: 'mouse', type: 'down', button: BTN[e.button] || 'left', buttons: 1 << e.button, x: p.x, y: p.y, mod: mods(e) }); });
  window.addEventListener('mouseup', (e) => { if (!down) return; down &= ~(1 << e.button); if (!BR.open) return; const p = pt(e); send({ t: 'mouse', type: 'up', button: BTN[e.button] || 'left', x: p.x, y: p.y, mod: mods(e) }); });
  el.view.addEventListener('mousemove', (e) => { const p = pt(e); send({ t: 'mouse', type: 'move', x: p.x, y: p.y, pressed: down ? 1 : 0, button: down & 1 ? 'left' : down & 4 ? 'right' : 'left', buttons: down, mod: mods(e) }); });
  el.view.addEventListener('contextmenu', (e) => e.preventDefault());
  el.view.addEventListener('wheel', (e) => { e.preventDefault(); const p = pt(e); const k = e.deltaMode === 1 ? 40 : 1; send({ t: 'wheel', x: p.x, y: p.y, dx: e.deltaX * k, dy: e.deltaY * k, mod: mods(e) }); }, { passive: false });
  let ty = null;
  el.view.addEventListener('touchstart', (e) => { ty = e.touches[0]; }, { passive: true });
  el.view.addEventListener('touchmove', (e) => { if (!ty) return; e.preventDefault(); const t = e.touches[0], p = pt(t); send({ t: 'wheel', x: p.x, y: p.y, dx: ty.clientX - t.clientX, dy: ty.clientY - t.clientY }); ty = t; }, { passive: false });
  el.kb.addEventListener('keydown', (e) => {
    if (e.isComposing || e.key === 'Process' || e.key === 'Dead' || e.key === 'Unidentified') return;
    const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    if (ctrl) {
      if (k === 'v' || k === 'c' || k === 'x') return;
      e.preventDefault(); if (k === 'l') { el.url.focus(); el.url.select(); return; }
      const cmd = { a: 'selectAll', z: 'undo', y: 'redo' }[k]; if (cmd) { const b = { t: 'key', key: e.key, code: e.code, vk: e.keyCode, mod: mods(e), cmd }; send({ ...b, type: 'down' }); send({ ...b, type: 'up' }); } return;
    }
    if (e.key.length === 1) return; // texto comum vai pelo evento "input" (acentos, teclado do celular)
    if (e.key === 'F5' || e.key === 'F12' || e.key === 'Escape' && !BR.open) return;
    e.preventDefault(); send({ t: 'key', type: 'down', key: e.key, code: e.code, vk: e.keyCode, mod: mods(e) });
  });
  el.kb.addEventListener('keyup', (e) => { if (e.key.length === 1 || e.ctrlKey || e.metaKey || e.key === 'Process' || e.key === 'Dead' || e.key === 'Unidentified') return; send({ t: 'key', type: 'up', key: e.key, code: e.code, vk: e.keyCode, mod: mods(e) }); });
  const drain = () => { const t = el.kb.value; el.kb.value = ''; if (t) send({ t: 'text', text: t }); };
  el.kb.addEventListener('input', (e) => { if (!e.isComposing) drain(); });
  el.kb.addEventListener('compositionend', drain);
  el.kb.addEventListener('paste', (e) => { e.preventDefault(); const t = e.clipboardData?.getData('text') || ''; if (t) send({ t: 'text', text: t }); });

  // ---------- botão no cabeçalho da conversa ----------
  const btn = h('button', { class: 'iconbtn', id: 'xBrBtn', type: 'button', title: 'Navegador do bot', 'aria-label': 'Navegador do bot' });
  btn.innerHTML = ICO.globe;
  btn.onclick = () => {
    if (BR.open) { hide(); return; }
    const bs = chatBots(); if (!bs.length) { XU.toast('Abra uma conversa com um bot primeiro'); return; }
    if (bs.length === 1) { show(bs[0]); return; }
    showMenu(btn, [{ info: 'Navegador de qual bot?' }, ...bs.map((s) => ({ label: nameOf(s), run: () => show(s) }))]);
  };
  { const pb = document.getElementById('panelBtn'); pb?.parentNode.insertBefore(btn, pb); }
  { const o = window.openChat; window.openChat = function () { if (BR.open) hide(); return o.apply(this, arguments); }; }
}
