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
  const act = [...XU.tasks.values()]; const rows = S.bots.map((b) => { const run = act.find((t) => t.bot === b.slug && t.status === 'running'), q = act.filter((t) => t.bot === b.slug && t.status === 'queued').length; const a = XU.lastAct[b.slug];
    return h('button', { class: 'xot' + (run ? ' run' : ''), type: 'button', onclick: () => openBotSide?.(b.slug), title: 'Abrir ' + b.name }, h('i', { class: 'dot' + (run ? ' on' : '') }), h('b', { text: b.name }), h('span', { text: run ? `${run.label || 'trabalhando'} · ${XU.dur(Date.now() - (run.startedAt || run.queuedAt))}` : q ? `${q} na fila` : 'livre' }), run && a ? h('small', { text: a.text }) : null); });
  box.replaceChildren(h('div', { class: 'ttl', text: `Equipe agora${XU.queue ? ' · ' + XU.queue + ' aguardando vaga' : ''}` }), ...rows);
};
setInterval(XU.onOffice, 3000);
{ const o = window.openOffice; if (o) window.openOffice = function () { o(); setTimeout(XU.onOffice, 50); XU.refreshTasks?.(); }; }
