// Extras da Central, parte 2: Tarefas, Clientes, Custos, Memória, Sistema e Rotinas.
'use strict';
const xbtn = (text, run, cls = '') => h('button', { class: 'xb ' + cls, type: 'button', text, onclick: run });
const STAT = { queued: ['Na fila', 'warn'], running: ['Rodando', 'ok'], ok: ['Concluída', ''], error: ['Falhou', 'bad'], stopped: ['Parada', ''], cancelled: ['Cancelada', ''], interrupted: ['Interrompida', 'bad'] };

// ---------- Tarefas ----------
XU.refreshTasks = async () => {
  try { const r = await api('GET', '/api/tasks?limit=80'); XU.tasks = new Map(r.tasks.map((t) => [t.id, t])); for (const t of r.active) XU.tasks.set(t.id, t); XU.queue = r.queue; XU.waiting = r.waiting || []; XU.badge(); XU.onTasks?.(); XU.onOffice?.(); } catch { /* servidor antigo */ }
};
XU.onTasks = () => { XU.badge(); const d = document.getElementById('xTasks'); if (d?.open) XU.paintTasks(); };
XU.paintTasks = () => {
  const d = document.getElementById('xTasks'); if (!d) return;
  const all = [...XU.tasks.values()].sort((a, b) => (b.queuedAt || 0) - (a.queuedAt || 0));
  const act = all.filter((t) => t.status === 'running' || t.status === 'queued'), hist = all.filter((t) => !(t.status === 'running' || t.status === 'queued')).slice(0, 40);
  const nodes = [];
  if (XU.waiting.length) {
    nodes.push(h('div', { class: 'xd-sec', text: `Aguardando você (${XU.waiting.length})` }));
    for (const w of XU.waiting) nodes.push(h('div', { class: 'xrow' }, h('div', { class: 'm' }, h('div', { class: 'n', text: `${nameOf(w.from)} · ${w.chatTitle}` }), h('div', { class: 's', style: 'white-space:normal', text: w.text })),
      w.kind === 'approve' ? xbtn('Aprovar', async () => { try { await api('POST', `/api/chats/${w.chat}/messages`, { text: 'Aprovado. Pode seguir.' }); XU.toast('Aprovação enviada', nameOf(w.from) + ' vai seguir.', { ms: 3000 }); setTimeout(XU.refreshTasks, 800); } catch (e) { XU.err(e); } }, 'p') : null,
      xbtn('Abrir', () => { d.close(); XU.jump(w.chat, w.mid); })));
  }
  nodes.push(h('div', { class: 'xd-sec', text: `Em andamento e na fila (${act.length})` + (XU.queue ? ` · ${XU.queue} aguardando vaga` : '') }));
  if (!act.length) nodes.push(h('div', { class: 'xnone', text: 'Nenhuma tarefa agora.' }));
  for (const t of act) nodes.push(h('div', { class: 'xrow' }, h('div', { class: 'm' }, h('div', { class: 'n', text: `${nameOf(t.bot)} · ${t.label || 'tarefa'}` }), h('div', { class: 's', text: `${t.chatTitle}${t.project ? ' · ' + XU.projName(t.project) : ''} · ${t.status === 'running' ? 'há ' + XU.dur(Date.now() - (t.startedAt || t.queuedAt)) : 'na fila há ' + XU.dur(Date.now() - t.queuedAt)}` })),
    h('span', { class: 'xchip ' + STAT[t.status][1], text: STAT[t.status][0] }),
    xbtn('Cancelar', async () => { try { await api('POST', `/api/tasks/${t.id}/cancel`, {}); } catch (e) { XU.err(e); } }, 'd'), xbtn('Abrir', () => { d.close(); openChat(t.chat); })));
  nodes.push(h('div', { class: 'xd-sec', text: 'Histórico' }));
  if (!hist.length) nodes.push(h('div', { class: 'xnone', text: 'Ainda vazio.' }));
  for (const t of hist) nodes.push(h('div', { class: 'xrow' }, h('div', { class: 'm' }, h('div', { class: 'n', text: `${nameOf(t.bot)} · ${t.label || 'tarefa'}` }), h('div', { class: 's', text: `${XU.when(t.queuedAt)} · ${t.endedAt && t.startedAt ? XU.dur(t.endedAt - t.startedAt) : ''}${t.error ? ' · ' + t.error : ''}` })),
    h('span', { class: 'xchip ' + STAT[t.status][1], text: STAT[t.status][0] }), t.repeatable ? xbtn('Repetir', async () => { try { await api('POST', `/api/tasks/${t.id}/repeat`, {}); XU.toast('Tarefa reenviada', '', { ms: 2500 }); } catch (e) { XU.err(e); } }) : null, xbtn('Abrir', () => { d.close(); openChat(t.chat); })));
  d.set(h('div', { class: 'xd-body' }, ...nodes));
};
XU.tasksDlg = async () => { const d = XU.open('xTasks', 'Tarefas e aprovações', 'O que os bots estão fazendo, o que espera por você e o histórico', 'wide'); d.set(h('div', { class: 'xd-body' }, h('div', { class: 'xnone', text: 'Carregando…' }))); await XU.refreshTasks(); XU.paintTasks(); };
setInterval(() => { const d = document.getElementById('xTasks'); if (d?.open) XU.paintTasks(); }, 5000);
XU.refreshTasks();

// ---------- Clientes (projetos) ----------
XU.onProjects = () => { XU.chip?.(); const d = document.getElementById('xClients'); if (d?.open && !d.editing) XU.paintClients(); };
XU.clientsDlg = async () => { await XU.loadProjects(); const d = XU.open('xClients', 'Clientes', 'Cada cliente pode ter regras, memória e pasta no Drive. Os bots recebem isso nas conversas ligadas a ele.', 'wide'); d.editing = false; XU.paintClients(); };
XU.paintClients = () => {
  const d = document.getElementById('xClients'); if (!d) return;
  d.set(h('div', { class: 'xd-body' }, ...XU.projects.map((p) => h('div', { class: 'xrow' }, h('i', { class: 'xdot', style: `background:${p.color}` }), h('div', { class: 'm' }, h('div', { class: 'n', text: p.name }), h('div', { class: 's', text: `${p.chats?.length || 0} conversa(s)${p.driveFolder ? ' · Drive: ' + p.driveFolder : ''}` })), p.driveUrl ? h('a', { class: 'xb', href: p.driveUrl, target: '_blank', rel: 'noopener', text: 'Abrir no Drive' }) : null, xbtn('Editar', () => XU.editClient(p)), xbtn('Entregas', () => { d.close(); XU.deliveries({ project: p.id }); }))),
    !XU.projects.length ? h('div', { class: 'xnone', text: 'Nenhum cliente ainda.' }) : null), h('div', { class: 'xd-bar' }, xbtn('+ Novo cliente', () => XU.editClient(null), 'p')));
};
XU.editClient = (p) => {
  const d = document.getElementById('xClients'); d.editing = true;
  const f = { name: h('input', { type: 'text', value: p?.name || '', maxlength: 40, placeholder: 'Ex.: Sophie | W-Wellness' }), color: h('input', { type: 'color', value: p?.color || '#4f8cff' }), drive: h('input', { type: 'text', value: p?.driveFolder || '', placeholder: 'Ex.: Sophie | UK' }), url: h('input', { type: 'url', value: p?.driveUrl || '', placeholder: 'Cole aqui o link da pasta: https://drive.google.com/drive/folders/…' }),
    rules: h('textarea', { rows: 5, placeholder: 'Regras fixas deste cliente (estilo, o que nunca fazer, formato de entrega…)' }), mem: h('textarea', { rows: 5, placeholder: 'Memória: fatos que os bots devem lembrar sobre este cliente' }) };
  f.rules.value = p?.rules || ''; f.mem.value = p?.memory || '';
  const row = (l, el) => h('label', { class: 'xf' }, h('span', { text: l }), el);
  const save = async () => { const b = { name: f.name.value.trim(), color: f.color.value, driveFolder: f.drive.value.trim(), driveUrl: f.url.value.trim(), rules: f.rules.value, memory: f.mem.value }; try { if (p) await api('PUT', `/api/projects/${p.id}`, b); else await api('POST', '/api/projects', b); await XU.loadProjects(); d.editing = false; XU.paintClients(); XU.toast('Cliente salvo', b.name, { ms: 2500 }); } catch (e) { XU.err(e); } };
  const del = async () => { if (!(await XU.confirm('Apagar cliente?', 'As conversas não são apagadas, só deixam de ter este cliente.', 'Apagar', true))) return; try { await api('DELETE', `/api/projects/${p.id}`); await XU.loadProjects(); d.editing = false; XU.paintClients(); } catch (e) { XU.err(e); } };
  d.set(h('div', { class: 'xd-body' }, row('Nome', f.name), row('Cor', f.color), row('Link da pasta do cliente no Google Drive', f.url), row('Nome da pasta para os envios (caminho dentro do seu Drive)', f.drive), h('div', { class: 'xs', style: 'font-size:12px;color:var(--muted);margin:-6px 0 8px', text: 'O link serve para abrir a pasta com um clique. O nome/caminho é o que a Central usa para copiar os arquivos (ex.: Sophie | UK).' }), row('Regras', f.rules), row('Memória', f.mem)),
    h('div', { class: 'xd-bar' }, p ? xbtn('Apagar', del, 'd') : null, h('span', { style: 'flex:1' }), xbtn('Voltar', () => { d.editing = false; XU.paintClients(); }), xbtn('Salvar', save, 'p')));
};
// chip do cliente no cabeçalho da conversa
XU.chip = () => {
  const sub = document.getElementById('hsub'); if (!sub) return; let c = document.getElementById('xProjChip');
  if (!S.chat) { c?.remove(); return; }
  if (!c) { c = h('button', { id: 'xProjChip', class: 'xproj', type: 'button', title: 'Cliente desta conversa (clique para trocar)' }); sub.after(c); }
  const pr = XU.projects.find((p) => p.id === S.chat.project);
  c.textContent = pr ? '● ' + pr.name : '+ cliente'; c.style.setProperty('--pc', pr?.color || 'var(--muted)'); c.classList.toggle('none', !pr);
  c.onclick = (e) => { showMenu(c, [...XU.projects.map((p) => ({ label: (S.chat.project === p.id ? '✓ ' : '') + p.name, run: () => XU.assign(p.id) })), { sep: true }, ...(S.chat.project ? [{ label: 'Tirar cliente', run: () => XU.assign('') }] : []), { label: 'Gerenciar clientes…', run: () => XU.clientsDlg() }], 'below'); };
};
XU.assign = async (id) => { try { await api('PUT', `/api/chats/${S.chat.id}/project`, { project: id }); S.chat.project = id; XU.chip(); } catch (e) { XU.err(e); } };
{ const r = window.renderHead; if (r) window.renderHead = function () { r.apply(this, arguments); XU.chip(); }; }

// ---------- Custos e limites ----------
XU.costsDlg = async () => {
  const d = XU.open('xCosts', 'Custos e limites', 'Uso diário por bot (chamadas) e limites da sua assinatura', 'wide'); d.set(h('div', { class: 'xd-body' }, h('div', { class: 'xnone', text: 'Carregando…' })));
  let r; try { r = await api('GET', '/api/usage'); } catch (e) { d.set(h('div', { class: 'xd-body' }, h('div', { class: 'xnone', text: e.message }))); return; }
  const nodes = []; const pl = r.plan;
  const meter = (l, x) => x ? h('div', { class: 'xmeter' }, h('div', { class: 'l' }, h('span', { text: l }), h('b', { text: x.pct + '%' })), h('div', { class: 'tr' }, h('i', { class: x.pct >= 95 ? 'bad' : x.pct >= 80 ? 'warn' : '', style: `width:${Math.min(100, x.pct)}%` })), x.reset ? h('div', { class: 's', text: 'Renova ' + XU.when(new Date(x.reset).getTime()) }) : null) : null;
  if (pl) nodes.push(h('div', { class: 'xd-sec', text: 'Assinatura do Claude' }), meter('Sessão de 5 horas', pl.session), meter('Semana', pl.week));
  const max = Math.max(1, ...r.days.map((x) => x.calls)); const names = r.bots.map((b) => b.slug);
  nodes.push(h('div', { class: 'xd-sec', text: `Chamadas por dia (hoje: ${r.today.calls})` }));
  nodes.push(h('div', { class: 'xbars', role: 'img', 'aria-label': 'Gráfico de chamadas por dia' }, ...r.days.map((x) => h('div', { class: 'b', title: `${x.date}: ${x.calls} chamadas` }, h('i', { style: `height:${Math.max(2, Math.round(x.calls / max * 100))}%` }), h('span', { text: x.date.slice(8) })))));
  const tot = Object.entries(r.total).sort((a, b) => b[1] - a[1]); const tmax = Math.max(1, tot[0]?.[1] || 1);
  nodes.push(h('div', { class: 'xd-sec', text: 'Por bot (30 dias)' }));
  for (const [slug, n] of tot) { const cap = r.bots.find((b) => b.slug === slug)?.cap; const td = r.today.byBot[slug] || 0; nodes.push(h('div', { class: 'xrow' }, h('div', { class: 'm' }, h('div', { class: 'n', text: nameOf(slug) }), h('div', { class: 'tr', style: 'height:6px;margin-top:4px' }, h('i', { style: `width:${Math.round(n / tmax * 100)}%` }))), h('span', { class: 'xchip', text: `${n} no total` }), h('span', { class: 'xchip' + (cap && td >= cap ? ' bad' : ''), text: `hoje ${td}${cap ? '/' + cap : ''}` }))); }
  if (!tot.length) nodes.push(h('div', { class: 'xnone', text: 'Sem dados ainda.' }));
  d.set(h('div', { class: 'xd-body' }, ...nodes));
};

// ---------- Memória ----------
XU.memoryDlg = async () => {
  const d = XU.open('xMem', 'Memória', 'O que os bots e os clientes devem lembrar. Você pode editar à vontade.', 'wide'); d.set(h('div', { class: 'xd-body' }, h('div', { class: 'xnone', text: 'Carregando…' })));
  let r; try { r = await api('GET', '/api/memory'); } catch (e) { XU.err(e); return; }
  let tab = 'bot'; const body = h('div', { class: 'xd-body' }); const tabs = h('div', { class: 'xtabs' });
  const paint = () => {
    for (const b of tabs.children) b.classList.toggle('on', b.dataset.k === tab);
    const list = tab === 'bot' ? r.bots.map((x) => ({ id: x.slug, name: x.name, memory: x.memory })) : r.projects;
    body.replaceChildren(...list.map((x) => { const ta = h('textarea', { rows: 4, class: 'xmem', 'aria-label': 'Memória de ' + x.name }); ta.value = x.memory || ''; return h('div', { class: 'xf' }, h('span', { text: x.name }), ta, h('div', { style: 'text-align:right' }, xbtn('Salvar', async () => { try { await api('PUT', `/api/memory/${tab}/${x.id}`, { memory: ta.value }); x.memory = ta.value; XU.toast('Memória salva', x.name, { ms: 2200 }); } catch (e) { XU.err(e); } }, 'p'))); }), !list.length ? h('div', { class: 'xnone', text: 'Nada aqui ainda.' }) : null);
  };
  for (const [k, t] of [['bot', 'Bots'], ['project', 'Clientes']]) { const b = h('button', { type: 'button', class: 'xb', text: t, onclick: () => { tab = k; paint(); } }); b.dataset.k = k; tabs.append(b); }
  d.set(h('div', { class: 'xd-body', style: 'padding-bottom:0' }, tabs), body); paint();
};

// ---------- Sistema: backup, GitHub, novidades ----------
XU.systemDlg = async () => {
  const d = XU.open('xSys', 'Sistema', 'Versão, novidades, backup e GitHub', 'wide'); d.set(h('div', { class: 'xd-body' }, h('div', { class: 'xnone', text: 'Carregando…' })));
  let a; try { a = await api('GET', '/api/about'); } catch (e) { XU.err(e); return; }
  const gh = a.github || {}; const nodes = [];
  nodes.push(h('div', { class: 'xd-sec', text: 'Versão' }), h('div', { class: 'xrow' }, h('div', { class: 'm' }, h('div', { class: 'n', text: 'Atlas ' + a.version }), h('div', { class: 's', text: 'No ar desde ' + XU.when(a.startedAt) })), xbtn('↻ Reiniciar', () => { d.close(); XU.restart(); })));
  const upd = h('div', { class: 'xrow' }, h('div', { class: 'm' }, h('div', { class: 's', text: 'Verificando atualizações no GitHub…' }))); nodes.push(upd);
  api('GET', '/api/update').then((u) => { upd.replaceChildren(h('div', { class: 'm' }, h('div', { class: 's', style: 'white-space:normal', text: !u.checked ? 'Não foi possível verificar atualizações (sem internet ou repositório).' : u.behind ? `Há uma versão mais nova no GitHub: ${u.sha} · ${u.message}` : 'Você está na versão mais recente do GitHub.' }))); }).catch(() => {});
  nodes.push(h('div', { class: 'xd-sec', text: 'Novidades' }));
  for (const c of a.changelog || []) nodes.push(h('div', { class: 'xf' }, h('b', { text: `${c.version}${c.date ? ' · ' + c.date : ''}` }), h('ul', { style: 'margin:4px 0 0 18px;padding:0;font-size:13px' }, ...(c.items || []).map((i) => h('li', { text: i })))));
  nodes.push(h('div', { class: 'xd-sec', text: 'Backup' }));
  nodes.push(h('div', { class: 'xrow' }, h('div', { class: 'm' }, h('div', { class: 'n', text: 'Backup automático toda madrugada' }), h('div', { class: 's', text: `${(a.backups || []).length} backup(s) guardado(s). Último: ${a.backups?.[0] ? a.backups[0].name : '—'}` })),
    (() => { const cb = h('input', { type: 'checkbox', 'aria-label': 'Backup automático' }); cb.checked = Boolean(a.autoBackup); cb.onchange = () => api('PUT', '/api/github', { autoBackup: cb.checked }).catch(XU.err); return cb; })(),
    xbtn('Fazer agora', async (e) => { e.target.disabled = true; try { const r = await api('POST', '/api/backup', {}); XU.toast('Backup criado', r.name, { ms: 4000 }); XU.systemDlg(); } catch (x) { XU.err(x); e.target.disabled = false; } })));
  nodes.push(h('div', { class: 'xd-sec', text: 'GitHub' }));
  const repo = h('input', { type: 'text', value: gh.repo || '', 'aria-label': 'Repositório', placeholder: 'dono/repositório' });
  nodes.push(h('div', { class: 'xf' }, h('span', { text: 'Repositório' }), repo));
  nodes.push(h('div', { class: 'xrow' }, h('div', { class: 'm' }, h('div', { class: 'n', text: 'Enviar automaticamente toda madrugada' }), h('div', { class: 's', style: 'white-space:normal', text: gh.lastResult ? `Último envio: ${XU.when(gh.lastPush)} · ${gh.lastResult}` + (gh.lastError ? ' · ' + gh.lastError : '') : 'Nunca enviado. Precisa do git logado neste PC.' })),
    (() => { const cb = h('input', { type: 'checkbox', 'aria-label': 'Enviar automaticamente' }); cb.checked = Boolean(gh.auto); cb.onchange = () => api('PUT', '/api/github', { auto: cb.checked, repo: repo.value }).catch(XU.err); return cb; })(),
    xbtn('Enviar agora', async (e) => { e.target.disabled = true; try { await api('PUT', '/api/github', { repo: repo.value }); const r = await api('POST', '/api/github/push', {}); XU.toast(r.ok === false ? 'Falha no envio' : 'Enviado ao GitHub', r.note || r.error || '', { level: r.ok === false ? 'error' : '', ms: 8000 }); XU.systemDlg(); } catch (x) { XU.err(x); e.target.disabled = false; } }, 'p')));
  nodes.push(h('div', { class: 'xd-sec', text: 'Acessibilidade' }), h('div', { class: 'xrow' }, xbtn('Texto: trocar tamanho', () => XU.setFz((XU.fz() + 1) % 3)), xbtn('Alto contraste', () => XU.setContrast(document.documentElement.dataset.contrast !== 'high')), xbtn('Atalhos', () => XU.shortcuts())));
  d.set(h('div', { class: 'xd-body' }, ...nodes));
};
// "Novidades" ao subir de versão
(async () => { try { const a = await api('GET', '/api/about'); const seen = store.get('xver'); store.set('xver', a.version); if (seen && seen !== a.version) { const c = a.changelog?.[0]; XU.toast(`Atlas atualizado para ${a.version}`, (c?.items || []).slice(0, 3).join(' · '), { ms: 15000, actions: [{ label: 'Ver novidades', run: () => XU.systemDlg() }] }); } } catch { /* servidor antigo */ } })();

// ---------- Rotinas: próxima execução, último resultado ----------
{ const rr = window.renderRoutines; if (rr) window.renderRoutines = function () {
  rr.apply(this, arguments); const box = document.getElementById('rts'); if (!box) return;
  const c = S.chat; const list = S.routines.filter((r) => !c ? true : c.type === 'group' ? c.members.includes(r.bot) : r.bot === c.members[0]);
  [...box.querySelectorAll('.rt')].forEach((el, i) => { const r = list[i]; if (!r) return; const m = el.querySelector('.m'); if (!m) return;
    const parts = []; if (r.enabled && r.next) parts.push('Próxima: ' + XU.when(r.next)); if (r.lastRun) parts.push('Última: ' + XU.when(r.lastRun));
    if (parts.length) m.append(h('div', { class: 'xs', text: parts.join(' · ') }));
    if (r.lastResult) m.append(h('div', { class: 'xs ' + (r.lastResult.ok ? 'ok' : 'bad'), text: r.lastResult.ok ? '✓ Última execução sem erros' : '! Falhou: ' + (r.lastResult.text || 'veja a conversa') })); });
}; }
