// Calendário de entregas do projeto: datas e horas no seu fuso e no do cliente, quando foi pedido e quando foi entregue,
// e leitura completa de um chat do WhatsApp exportado (o Atlas lê tudo e sugere as entregas; você confirma).
(() => {
  const XU = window.XU; if (!XU) return;
  const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const ZONES = [['Europe/London', 'Londres (Reino Unido)'], ['Europe/Lisbon', 'Lisboa'], ['Europe/Paris', 'Paris / Europa Central'], ['Europe/Vienna', 'Viena'], ['Europe/Amsterdam', 'Amsterdã'], ['America/New_York', 'Nova York / Costa Leste (EUA)'], ['America/Chicago', 'Chicago (EUA)'], ['America/Denver', 'Denver (EUA)'], ['America/Los_Angeles', 'Los Angeles (EUA)'], ['America/Mexico_City', 'Cidade do México'], ['Australia/Sydney', 'Sydney (Austrália)'], ['Australia/Melbourne', 'Melbourne (Austrália)'], ['America/Sao_Paulo', 'São Paulo / Brasília'], ['Asia/Dubai', 'Dubai'], ['UTC', 'UTC']];
  const zoneName = (z) => (ZONES.find((x) => x[0] === z) || [z, (z || '').split('/').pop().replace(/_/g, ' ')])[1];
  const pad = (n) => String(n).padStart(2, '0');
  const offsetMs = (utc, tz) => { const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); const p = Object.fromEntries(f.formatToParts(new Date(utc)).map((x) => [x.type, x.value])); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(utc / 1000) * 1000; };
  const zoned = (date, time, tz) => { const [y, m, d] = date.split('-').map(Number); const [H, M] = (time || '00:00').split(':').map(Number); const g = Date.UTC(y, m - 1, d, H, M); let t = g - offsetMs(g, tz); t = g - offsetMs(t, tz); return t; };
  const dayLabel = (date) => { const [y, m, d] = date.split('-').map(Number); return `${WD[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()]}, ${pad(d)}/${pad(m)}`; };
  const fmtAt = (at, tz) => new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at)).replace(/\./g, '').replace(',', ',');
  const fmtYmd = (date, time) => (date ? `${dayLabel(date)}${time ? ' ' + time : ''}` : '—');

  const S = { p: null, data: null, month: new Date(), day: '', poll: 0, sel: new Set(), open: false };
  const api2 = (m, path, body) => api(m, path, body);

  // quando vence (instante): com hora = o `at`; só data = fim do dia no fuso em que foi dita
  const dueAt = (e, d) => e.at ?? zoned(e.date, '23:59', e.tz === 'client' && d.tz ? d.tz : d.myTz);
  const timesOf = (e, d) => {
    if (!e.time || e.at == null) return h('span', { class: 'xt', text: dayLabel(e.date) + ' (sem hora)' });
    const rows = []; const same = !d.tz || d.tz === d.myTz;
    if (d.tz && !same) rows.push(h('span', { class: 'xt c', title: 'Horário do cliente' }, h('i', { text: 'Cliente' }), ' ' + fmtAt(e.at, d.tz) + ' · ' + zoneName(d.tz)));
    rows.push(h('span', { class: 'xt m', title: 'Seu horário' }, h('i', { text: 'Você' }), ' ' + fmtAt(e.at, d.myTz) + (same ? '' : ' · ' + zoneName(d.myTz))));
    return h('span', { class: 'xtt' }, ...rows);
  };
  const doneInfo = (e, d) => {
    if (!e.doneDate) return null;
    const doneAt = zoned(e.doneDate, e.doneTime || '23:59', d.myTz); const due = dueAt(e, d); const diff = doneAt - due;
    const txt = !e.doneTime && !e.time ? '' : diff <= 0 ? 'no prazo' : `${Math.max(1, Math.round(diff / 3600000))}h de atraso`;
    return { txt, late: diff > 0 && (e.time || e.doneTime) };
  };

  async function load() { try { S.data = await api('GET', `/api/projects/${S.p.id}/calendar`); } catch (e) { XU.err?.(e); } return S.data; }

  function pollJob() {
    clearInterval(S.poll); S.poll = setInterval(async () => { if (!S.open) return clearInterval(S.poll); await load(); render(); if (!S.data?.job?.running) clearInterval(S.poll); }, 1800);
  }

  async function importFile(file) {
    if (!file) return;
    if (file.size > 40 * 1024 * 1024) { XU.toast('Arquivo grande demais', 'Máximo 40 MB. Exporte o chat “sem mídia” no WhatsApp.'); return; }
    try {
      const r = await fetch(`/api/projects/${S.p.id}/chat-import?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'x-grok': '1', 'content-type': 'application/octet-stream' }, body: file, credentials: 'same-origin' });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'não consegui enviar o arquivo');
      XU.toast('Lendo o chat', `${j.messages} mensagens (${j.from} a ${j.to}). Pode continuar usando a Central.`);
      await load(); render(); pollJob();
    } catch (e) { XU.toast('Não consegui ler o chat', e.message); }
  }

  const bt = (text, run, cls = '') => h('button', { class: 'xb ' + cls, type: 'button', text, onclick: run });

  // ---- formulário de entrega ----
  function editForm(e) {
    const d = S.data; const ed = XU.open('xCalEd', e ? 'Editar entrega' : 'Nova entrega', `Projeto “${S.p.name}”`, 'narrow');
    const f = {
      title: h('input', { type: 'text', maxlength: 120, value: e?.title || '', placeholder: 'Ex.: Vídeo 3 do lançamento' }),
      date: h('input', { type: 'date', value: e?.date || '' }), time: h('input', { type: 'time', value: e?.time || '' }),
      tz: h('select', {}, h('option', { value: 'client', text: d.tz ? `Horário do cliente (${zoneName(d.tz)})` : 'Horário do cliente (defina o fuso do cliente)' }), h('option', { value: 'mine', text: `Meu horário (${zoneName(d.myTz)})` })),
      status: h('select', {}, h('option', { value: 'pendente', text: 'Pendente' }), h('option', { value: 'entregue', text: 'Entregue' })),
      ad: h('input', { type: 'date', value: e?.askedDate || '' }), at: h('input', { type: 'time', value: e?.askedTime || '' }),
      dd: h('input', { type: 'date', value: e?.doneDate || '' }), dt: h('input', { type: 'time', value: e?.doneTime || '' }),
      who: h('input', { type: 'text', maxlength: 60, value: e?.who || '', placeholder: 'Quem faz (opcional)' }), note: h('textarea', { rows: 2, maxlength: 400, placeholder: 'Observações' }),
    };
    f.tz.value = e?.tz === 'mine' || !d.tz ? (e ? e.tz : (d.tz ? 'client' : 'mine')) : 'client'; if (!d.tz && f.tz.value === 'client') f.tz.value = 'mine';
    f.status.value = e?.status || 'pendente'; f.note.value = e?.note || '';
    const row = (l, ...el) => h('label', { class: 'xf' }, h('span', { text: l }), ...el);
    ed.set(h('div', { class: 'xd-body' }, row('O que será entregue', f.title),
      h('div', { class: 'xrow2' }, row('Prazo (data)', f.date), row('Hora do prazo', f.time)), row('A hora do prazo está em…', f.tz),
      h('div', { class: 'xrow2' }, row('Solicitada em (data)', f.ad), row('Hora', f.at)), h('div', { class: 'xrow2' }, row('Entregue em (data)', f.dd), row('Hora', f.dt)),
      row('Situação', f.status), row('Responsável', f.who), row('Observações', f.note),
      e?.quote ? h('div', { class: 'xph', text: 'No chat: “' + e.quote + '”' }) : null),
    h('div', { class: 'xd-bar' }, e ? bt('Excluir', async () => { if (!confirm('Excluir esta entrega do calendário?')) return; try { S.data = await api('DELETE', `/api/projects/${S.p.id}/deliveries/${e.id}`); ed.close(); render(); XU.refreshPanel?.(); } catch (x) { XU.toast('Não consegui excluir', x.message); } }) : null, h('span', { style: 'flex:1' }), bt('Cancelar', () => ed.close()),
      bt('Salvar', async () => {
        const body = { title: f.title.value.trim(), date: f.date.value, time: f.time.value, tz: f.tz.value, status: f.status.value, askedDate: f.ad.value, askedTime: f.at.value, doneDate: f.dd.value, doneTime: f.dt.value, who: f.who.value.trim(), note: f.note.value.trim() };
        if (body.doneDate && body.status === 'pendente') body.status = 'entregue';
        try { S.data = e ? await api('PUT', `/api/projects/${S.p.id}/deliveries/${e.id}`, body) : await api('POST', `/api/projects/${S.p.id}/deliveries`, body); ed.close(); render(); XU.refreshPanel?.(); } catch (x) { XU.toast('Não consegui salvar', x.message); }
      }, 'p')));
    if (!ed.open) ed.showModal();
  }

  function tzPicker() {
    const d = S.data; const sel = h('select', { 'aria-label': 'Fuso do cliente' }, h('option', { value: '', text: 'Não definido' }), ...ZONES.map((z) => h('option', { value: z[0], text: z[1] })), h('option', { value: '__o', text: 'Outro…' }));
    if (d.tz && !ZONES.some((z) => z[0] === d.tz)) sel.insertBefore(h('option', { value: d.tz, text: d.tz }), sel.lastChild); sel.value = d.tz || '';
    sel.onchange = async () => { let v = sel.value; if (v === '__o') { v = (prompt('Fuso do cliente (formato Continente/Cidade, ex.: Europe/London):', '') || '').trim(); if (!v) { sel.value = d.tz || ''; return; } }
      try { S.data = await api('PUT', `/api/projects/${S.p.id}/calendar`, { tz: v }); render(); XU.refreshPanel?.(); } catch (e) { XU.toast('Fuso inválido', e.message); sel.value = d.tz || ''; } };
    return sel;
  }

  // ---- mês ----
  function monthGrid() {
    const d = S.data; const y = S.month.getFullYear(), m = S.month.getMonth(); const first = new Date(y, m, 1); const days = new Date(y, m + 1, 0).getDate(); const today = new Date().toLocaleDateString('sv');
    const by = {}; const add = (date, kind, e) => { (by[date] ||= []).push({ kind, e }); };
    for (const e of d.deliveries) { add(e.date, e.status === 'entregue' ? 'done-due' : 'due', e); if (e.askedDate) add(e.askedDate, 'ask', e); if (e.doneDate) add(e.doneDate, 'done', e); }
    const cells = []; for (let i = 0; i < first.getDay(); i++) cells.push(h('div', { class: 'xcd off' }));
    for (let n = 1; n <= days; n++) {
      const date = `${y}-${pad(m + 1)}-${pad(n)}`; const it = by[date] || [];
      cells.push(h('button', { type: 'button', class: 'xcd' + (date === today ? ' today' : '') + (S.day === date ? ' sel' : ''), onclick: () => { S.day = S.day === date ? '' : date; render(); } }, h('b', { text: String(n) }),
        h('span', { class: 'dots' }, ...it.slice(0, 6).map((x) => h('i', { class: x.kind, title: x.kind === 'ask' ? 'Solicitada: ' + x.e.title : x.kind === 'done' ? 'Entregue: ' + x.e.title : 'Prazo: ' + x.e.title })))));
    }
    return h('div', { class: 'xcal-m' }, h('div', { class: 'xcal-mh' }, bt('‹', () => { S.month = new Date(y, m - 1, 1); render(); }), h('b', { text: `${MONTHS[m]} ${y}` }), bt('›', () => { S.month = new Date(y, m + 1, 1); render(); }), bt('Hoje', () => { S.month = new Date(); S.day = ''; render(); })),
      h('div', { class: 'xcal-g' }, ...WD.map((w) => h('span', { class: 'wd', text: w })), ...cells),
      h('div', { class: 'xcal-lg' }, h('span', {}, h('i', { class: 'due' }), 'Prazo'), h('span', {}, h('i', { class: 'ask' }), 'Solicitada'), h('span', {}, h('i', { class: 'done' }), 'Entregue')));
  }

  function deliveryRow(e) {
    const d = S.data; const di = doneInfo(e, d); const over = e.status !== 'entregue' && dueAt(e, d) < Date.now();
    return h('div', { class: 'xcr-row' + (e.status === 'entregue' ? ' ok' : '') + (over ? ' late' : '') },
      h('div', { class: 'a' }, h('b', { text: e.title }), e.source === 'whatsapp' ? h('span', { class: 'xtag', text: 'do chat' }) : null, e.status === 'entregue' ? h('span', { class: 'xtag g', text: 'Entregue' }) : over ? h('span', { class: 'xtag r', text: 'Atrasada' }) : h('span', { class: 'xtag', text: 'Pendente' })),
      h('div', { class: 'l' }, h('span', { class: 'k', text: 'Prazo' }), timesOf(e, d)),
      h('div', { class: 'l' }, h('span', { class: 'k', text: 'Solicitada' }), h('span', { class: 'xt', text: fmtYmd(e.askedDate, e.askedTime) })),
      h('div', { class: 'l' }, h('span', { class: 'k', text: 'Entregue' }), h('span', { class: 'xt', text: fmtYmd(e.doneDate, e.doneTime) }), di?.txt ? h('span', { class: 'xtag ' + (di.late ? 'r' : 'g'), text: di.txt }) : null),
      e.quote ? h('div', { class: 'q', text: '“' + e.quote + '”' }) : null,
      h('div', { class: 'b' }, bt('Editar', () => editForm(e)), e.status !== 'entregue' ? bt('Marcar entregue', async () => { const t = new Date(); try { S.data = await api('PUT', `/api/projects/${S.p.id}/deliveries/${e.id}`, { status: 'entregue', doneDate: e.doneDate || t.toLocaleDateString('sv'), doneTime: e.doneTime || `${pad(t.getHours())}:${pad(t.getMinutes())}` }); render(); XU.refreshPanel?.(); } catch (x) { XU.toast('Não consegui', x.message); } }) : null));
  }

  function proposals() {
    const d = S.data; if (!d.proposed.length) return null; for (const q of d.proposed) if (!S.sel.has('x' + q.id) && !S.sel.has(q.id) && !S.seen?.has(q.id)) { (S.seen ||= new Set()).add(q.id); S.sel.add(q.id); }
    const rows = d.proposed.map((q) => {
      const chk = h('input', { type: 'checkbox', ...(S.sel.has(q.id) ? { checked: '' } : {}), onchange: (ev) => { if (ev.target.checked) S.sel.add(q.id); else S.sel.delete(q.id); upd(); } });
      const at = q.time ? zoned(q.date, q.time, q.tz === 'client' && d.tz ? d.tz : d.myTz) : null;
      return h('label', { class: 'xprop' }, chk, h('span', { class: 'm' }, h('b', { text: q.title }), h('span', { class: 's', text: `Prazo: ${at != null ? (d.tz && d.tz !== d.myTz ? fmtAt(at, d.tz) + ' (cliente) = ' : '') + fmtAt(at, d.myTz) + ' (você)' : dayLabel(q.date)}` }),
        h('span', { class: 's', text: `Solicitada: ${fmtYmd(q.askedDate, q.askedTime)} · Entregue: ${fmtYmd(q.doneDate, q.doneTime)}` }), q.quote ? h('span', { class: 'q', text: '“' + q.quote + '”' }) : null));
    });
    const add = bt('', async () => { const ids = [...S.sel].filter((id) => d.proposed.some((q) => q.id === id)); try { S.data = await api('POST', `/api/projects/${S.p.id}/deliveries/accept`, { ids }); XU.toast('Entregas adicionadas', `${ids.length} no calendário.`); render(); XU.refreshPanel?.(); } catch (e) { XU.toast('Não consegui adicionar', e.message); } }, 'p');
    const upd = () => { const n = d.proposed.filter((q) => S.sel.has(q.id)).length; add.textContent = `Adicionar ${n} ao calendário`; add.disabled = !n; }; upd();
    const imp = d.lastImport;
    return h('div', { class: 'xcal-prop' }, h('div', { class: 'xph-h' }, h('b', { text: `Encontrei ${d.proposed.length} entrega(s) no chat` }), imp ? h('span', { class: 's', text: ` · ${imp.messages} mensagens, de ${imp.from} a ${imp.to}${imp.skipped ? ` · as ${imp.skipped} partes mais antigas ficaram de fora` : ''}` }) : null),
      h('div', { class: 'xph', text: 'Confira e desmarque o que não for entrega. Depois de adicionar, você pode ajustar datas e horas em Editar.' }), ...rows,
      h('div', { class: 'xd-bar2' }, bt('Marcar todas', () => { d.proposed.forEach((q) => S.sel.add(q.id)); render(); }), bt('Descartar sugestões', async () => { try { S.data = await api('POST', `/api/projects/${S.p.id}/deliveries/accept`, { ids: [], discardRest: true }); render(); } catch (e) { XU.toast('Erro', e.message); } }), h('span', { style: 'flex:1' }), add));
  }

  function render() {
    const dlg = document.getElementById('xCal'); if (!dlg || !S.data) return; const d = S.data; const j = d.job;
    const body = dlg.querySelector('.xd-body'); const keep = body ? body.scrollTop : 0;
    const file = h('input', { type: 'file', accept: '.txt,.zip,text/plain,application/zip', hidden: '', onchange: (ev) => { importFile(ev.target.files[0]); ev.target.value = ''; } });
    const jobBox = j && (j.running || j.step === 'erro') ? h('div', { class: 'xcal-job' + (j.step === 'erro' ? ' err' : '') }, j.step === 'erro' ? h('span', { text: 'Não consegui ler o chat: ' + j.error }) : h('span', { text: `Lendo o chat${j.name ? ' “' + j.name + '”' : ''}: parte ${Math.min(j.done + 1, j.total || 1)} de ${j.total || '…'} · ${j.found} menção(ões) de entrega até agora` }),
      j.running ? h('div', { class: 'xpb big' }, h('i', { style: `width:${j.total ? Math.round((j.done / j.total) * 100) : 5}%` })) : null, j.running ? bt('Parar', async () => { S.data = await api('DELETE', `/api/projects/${S.p.id}/calendar/job`); render(); }) : null) : null;
    let list = d.deliveries; if (S.day) list = list.filter((e) => e.date === S.day || e.askedDate === S.day || e.doneDate === S.day);
    const open = d.deliveries.filter((e) => e.status !== 'entregue').length;
    const tzbox = h('label', { class: 'xf xcal-tz' }, h('span', { text: 'Fuso do cliente' }), tzPicker(), h('span', { class: 's', text: `Seu fuso: ${zoneName(d.myTz)}` }));
    const nb = h('div', { class: 'xd-body xcal' },
      h('div', { class: 'xcal-top' }, tzbox, h('div', { class: 'b' }, bt('+ Entrega', () => editForm(null), 'p'), bt('Importar chat do WhatsApp', () => file.click()), file)),
      d.tz ? null : h('div', { class: 'xph', text: 'Escolha o fuso do cliente para ver cada horário nos dois fusos (o seu e o dele).' }),
      jobBox, proposals(),
      h('div', { class: 'xcal-cols' }, monthGrid(), h('div', { class: 'xcal-l' }, h('div', { class: 'xph-h' }, h('b', { text: S.day ? `Dia ${dayLabel(S.day)}` : 'Todas as entregas' }), h('span', { class: 's', text: ` · ${open} em aberto de ${d.deliveries.length}` }), S.day ? bt('Ver todas', () => { S.day = ''; render(); }) : null),
        list.length ? h('div', {}, ...list.map(deliveryRow)) : h('div', { class: 'xph', text: d.deliveries.length ? 'Nada neste dia.' : 'Nenhuma entrega ainda. Adicione uma ou importe o chat do WhatsApp do cliente (Exportar conversa, em .txt ou .zip).' }))));
    dlg.querySelector('.xd-slot').replaceChildren(nb); nb.scrollTop = keep;
  }

  XU.calOpen = async (p) => {
    S.p = p; S.open = true; S.day = ''; S.month = new Date(); S.sel = new Set(); S.seen = new Set();
    const dlg = XU.open('xCal', `Calendário de entregas · ${p.name}`, 'Prazos nos dois fusos, quando cada entrega foi pedida e quando foi entregue.', 'wide');
    dlg.set(h('div', { class: 'xd-body' }, h('div', { class: 'xph', text: 'Carregando…' }))); dlg.addEventListener('close', () => { S.open = false; clearInterval(S.poll); }, { once: true });
    if (!dlg.open) dlg.showModal(); await load(); render(); if (S.data?.job?.running) pollJob();
  };

  // ---- card na página do projeto ----
  XU.calCard = (D, p, card) => {
    const c = D.calendar || {}; const fmtN = (n) => String(n);
    const next = (c.next || []).map((e) => { const zone = e.tz === 'client' && c.tz ? c.tz : c.myTz; return h('div', { class: 'xcal-nx' }, h('b', { text: e.title }), h('span', { class: 's', text: e.at != null ? `${fmtAt(e.at, c.myTz)}${c.tz && c.tz !== c.myTz ? ' (você) · ' + fmtAt(e.at, c.tz) + ' (cliente)' : ''}` : dayLabel(e.date) })); });
    const body = h('div', {}, h('div', { class: 'xubig' }, h('b', { text: fmtN(c.open || 0) }), h('span', { text: ' entrega(s) em aberto' + (c.late ? ` · ${c.late} atrasada(s)` : '') })),
      next.length ? h('div', {}, ...next) : h('div', { class: 'xph', text: c.total ? 'Nenhuma entrega futura agendada.' : 'Sem entregas no calendário. Abra e importe o chat do WhatsApp do cliente.' }),
      c.proposed ? h('div', { class: 'xph', text: `${c.proposed} sugestão(ões) do chat aguardando a sua conferência.` }) : null,
      c.job ? h('div', { class: 'xph', text: 'Lendo o chat do WhatsApp…' }) : null);
    return card('Calendário', c.total || 0, body, [h('button', { class: 'xb', type: 'button', text: 'Abrir', onclick: () => XU.calOpen(p) })]);
  };
})();
