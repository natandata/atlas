// Abas no topo (estilo navegador) + "Autorizo o acesso à pasta [link do Drive]" no chat.
(() => {
  const TYPES = { agents: 'Agentes', chats: 'Grupos', projects: 'Projetos', all: 'Tudo' };
  const DRIVE_RE = /https:\/\/drive\.google\.com\/[^\s)\]>"'<]+/i, AUTH_RE = /(autoriz|liber|permit|dou acesso|d[oe]u acesso)/i;
  const tid = () => 't' + Math.random().toString(36).slice(2, 8);
  const lay = () => S.layout || (S.layout = {});
  function tabsOf() {
    const l = lay();
    if (!Array.isArray(l.tabs) || !l.tabs.length) { l.tabs = [{ id: 'agentes', name: 'Agentes', type: 'agents', project: '' }, { id: 'conversas', name: 'Grupos', type: 'chats', project: '' }, { id: 'projetos', name: 'Projetos', type: 'projects', project: '' }]; l.tab = l.tab || 'agentes'; }
    for (const t of l.tabs) if (t.type === 'chats' && t.name === 'Conversas') t.name = 'Grupos'; // renomeada
    if (!l.tabs.some((t) => t.id === l.tab)) l.tab = l.tabs[0].id;
    return l.tabs;
  }
  const active = () => tabsOf().find((t) => t.id === lay().tab) || tabsOf()[0];
  const keep = (c, t) => !t || (t.type === 'agents' ? c.type === 'direct' : t.type === 'chats' ? c.type !== 'direct' : t.type === 'projects' ? (t.project ? c.project === t.project : Boolean(c.project)) : true);
  const save = () => { try { saveLayout(); } catch { /* ainda carregando */ } };

  let bar = null, dragId = null;
  function mount() {
    if (bar) return; bar = document.createElement('div'); bar.id = 'xTabs'; bar.setAttribute('role', 'tablist'); bar.setAttribute('aria-label', 'Abas');
    document.body.prepend(bar); document.documentElement.classList.add('has-tabs');
  }
  function move(id, to) { const a = tabsOf(), i = a.findIndex((t) => t.id === id); if (i < 0) return; const j = Math.max(0, Math.min(a.length - 1, to)); const [t] = a.splice(i, 1); a.splice(j, 0, t); save(); render(); }
  function rename(t) { const n = prompt('Nome da aba:', t.name); if (n && n.trim()) { t.name = n.trim().slice(0, 24); save(); render(); } }
  function close(t) { const a = tabsOf(); if (a.length <= 1) { alert('Mantenha pelo menos uma aba.'); return; } const i = a.indexOf(t); a.splice(i, 1); if (lay().tab === t.id) lay().tab = a[Math.max(0, i - 1)].id; save(); render(); renderList(); }
  function select(t) { lay().tab = t.id; save(); render(); renderList(); }
  function tabMenu(anchor, t) {
    const a = tabsOf(), i = a.indexOf(t);
    showMenu(anchor, [{ label: 'Renomear', run: () => rename(t) }, ...(i > 0 ? [{ label: 'Mover para a esquerda', run: () => move(t.id, i - 1) }] : []), ...(i < a.length - 1 ? [{ label: 'Mover para a direita', run: () => move(t.id, i + 1) }] : []), { sep: true }, { label: 'Fechar aba', run: () => close(t) }], 'below');
  }
  function addMenu(anchor) {
    const mk = (type, project, label) => ({ label, run: () => { const n = prompt('Nome da aba:', label); if (n === null) return; const t = { id: tid(), name: (n.trim() || label).slice(0, 24), type, project: project || '' }; if (tabsOf().length >= 12) { alert('Máximo de 12 abas.'); return; } tabsOf().push(t); lay().tab = t.id; save(); render(); renderList(); } });
    const pr = (window.XU?.projects || []).map((p) => mk('projects', p.id, p.name));
    showMenu(anchor, [mk('agents', '', 'Agentes'), mk('chats', '', 'Grupos'), mk('projects', '', 'Projetos'), mk('all', '', 'Tudo'), ...(pr.length ? [{ sep: true }, ...pr] : [])], 'below');
  }
  function render() {
    mount(); const act = active(); bar.replaceChildren();
    for (const t of tabsOf()) {
      const on = t.id === act.id;
      const b = h('div', { class: 'xtab' + (on ? ' on' : ''), role: 'tab', 'aria-selected': String(on), tabindex: '0', draggable: 'true', 'data-menu': '', title: 'Clique para abrir · duplo clique para renomear · arraste para ordenar' },
        h('span', { class: 'xt-n', text: t.name }), h('button', { class: 'xt-x', type: 'button', 'aria-label': 'Fechar aba ' + t.name, title: 'Fechar aba', text: '×', onclick: (e) => { e.stopPropagation(); close(t); } }));
      b.onclick = () => { if (on) tabMenu(b, t); else select(t); };
      b.ondblclick = (e) => { e.preventDefault(); rename(t); };
      b.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); on ? tabMenu(b, t) : select(t); } };
      b.oncontextmenu = (e) => { e.preventDefault(); tabMenu(b, t); };
      b.ondragstart = (e) => { dragId = t.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', t.id); } catch { /* */ } b.classList.add('drag'); };
      b.ondragend = () => { dragId = null; b.classList.remove('drag'); };
      b.ondragover = (e) => { if (dragId && dragId !== t.id) { e.preventDefault(); b.classList.add('over'); } };
      b.ondragleave = () => b.classList.remove('over');
      b.ondrop = (e) => { e.preventDefault(); b.classList.remove('over'); if (dragId && dragId !== t.id) move(dragId, tabsOf().findIndex((x) => x.id === t.id)); };
      bar.append(b);
    }
    const add = h('button', { class: 'xt-add', type: 'button', title: 'Nova aba', 'data-menu': '', 'aria-label': 'Nova aba', text: '+' }); add.onclick = () => addMenu(add); bar.append(add);
  }
  // filtra a lista lateral pela aba ativa
  const _renderList = window.renderList;
  window.renderList = function () {
    const full = S.chats, t = active(); render();
    S.chats = full.filter((c) => keep(c, t));
    try { return _renderList.apply(this, arguments); } finally { S.chats = full; }
  };

  // ---------- botão "cliente": pasta do Drive ----------
  const driveOf = (id) => (window.XU?.projects || []).find((p) => p.id === id)?.driveUrl || '';
  async function saveDrive(chat, url) {
    let pid = chat.project;
    if (pid) { const p = XU.projects.find((x) => x.id === pid); await api('PUT', `/api/projects/${pid}`, { name: p?.name, driveUrl: url }); }
    else {
      const r = await api('POST', '/api/projects', { name: String(chat.title || 'Cliente').slice(0, 40), driveUrl: url }); pid = r.id;
      await api('PUT', `/api/chats/${chat.id}/project`, { project: pid }); chat.project = pid; if (S.chat?.id === chat.id) S.chat.project = pid;
    }
    await XU.loadProjects(); XU.chip();
  }
  function patchChip() {
    const X = window.XU; if (!X || X._tabsPatched) return !!X?._tabsPatched; X._tabsPatched = true;
    const orig = X.chip;
    X.chip = function () {
      orig.apply(this, arguments); const c = document.getElementById('xProjChip'); if (!c || !S.chat) return;
      const pr = X.projects.find((p) => p.id === S.chat.project); if (pr?.driveUrl) c.textContent = '● ' + pr.name + ' · 📁';
      c.setAttribute('data-menu', ''); c.title = pr?.driveUrl ? 'Cliente e pasta do Drive desta conversa' : 'Cliente desta conversa (clique para trocar ou colar o link da pasta do Drive)';
      c.onclick = () => {
        const chat = S.chat, url = driveOf(chat.project);
        showMenu(c, [
          ...(url ? [{ label: '📁 Abrir pasta do Drive', run: () => window.open(url, '_blank', 'noopener') }] : []),
          { label: url ? 'Trocar link da pasta do Drive…' : 'Colar link da pasta do Drive…', run: async () => { const v = prompt('Link da pasta do cliente no Google Drive:', url || ''); if (!v || !DRIVE_RE.test(v)) { if (v) alert('Cole um link que comece com https://drive.google.com/'); return; } try { await saveDrive(chat, v.match(DRIVE_RE)[0]); X.toast('Pasta do Drive salva', 'O link ficou no botão do cliente desta conversa.'); } catch (e) { X.err(e); } } },
          { sep: true },
          ...X.projects.map((p) => ({ label: (chat.project === p.id ? '✓ ' : '') + p.name, run: () => X.assign(p.id) })),
          ...(chat.project ? [{ label: 'Tirar cliente', run: () => X.assign('') }] : []),
          { label: 'Gerenciar clientes…', run: () => X.clientsDlg() },
        ], 'below');
      };
    };
    X.chip(); return true;
  }
  // "Autorizo o acesso a esta pasta [link]" na mensagem
  const _api = window.api;
  window.api = async function (method, path, body) {
    const r = await _api(method, path, body); let mm;
    if (method === 'POST' && body?.text && (mm = path.match(/^\/api\/chats\/([a-z0-9-]+)\/messages$/)) && AUTH_RE.test(body.text)) {
      const u = body.text.match(DRIVE_RE)?.[0]; const chat = S.chats.find((c) => c.id === mm[1]);
      if (u && chat && window.XU) saveDrive(chat, u.replace(/[.,;:!?]+$/, '')).then(() => XU.toast('Pasta do Drive conectada', 'O link entrou no botão do cliente desta conversa.')).catch((e) => XU.err(e));
    }
    return r;
  };
  let n = 0; const iv = setInterval(() => { if (patchChip() || ++n > 100) clearInterval(iv); }, 100);
  render();
})();
