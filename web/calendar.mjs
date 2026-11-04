// Calendário de entregas por projeto: datas/horas no horário do Natan e do cliente + leitura completa de um chat
// do WhatsApp exportado (.txt ou .zip) para mapear os compromissos de entrega. Tudo guardado no projeto (projects.json).
import { inflateRawSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';

const hex = (n = 4) => randomBytes(n).toString('hex');
export const MY_TZ = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
export const validTz = (tz) => { try { new Intl.DateTimeFormat('en', { timeZone: String(tz) }); return Boolean(tz); } catch { return false; } };
const D_RE = /^\d{4}-\d{2}-\d{2}$/, T_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const validDate = (s) => { if (!D_RE.test(s)) return false; const d = new Date(s + 'T12:00:00Z'); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; };

// ---- fusos: converte "data + hora no fuso X" em instante UTC (sem bibliotecas) ----
function offsetMs(utc, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(utc)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(utc / 1000) * 1000;
}
export function zonedToUtc(date, time, tz) {
  const [y, m, d] = date.split('-').map(Number); const [H, M] = (time || '00:00').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, H, M); let t = guess - offsetMs(guess, tz); t = guess - offsetMs(t, tz); return t;
}

// ---- WhatsApp: lê o .txt exportado (Android e iPhone, pt/en) ----
const INVIS = /[‎‏‪- ⁦-⁩﻿]/g;
const L1 = /^\[?(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*([AaPp]\.?[Mm]\.?)?\]?\s*(?:-\s+)?(.*)$/;
export function parseWhatsApp(raw) {
  const lines = String(raw).replace(/\r/g, '').replace(INVIS, ' ').split('\n');
  const heads = []; let dayFirst = 0, monthFirst = 0;
  for (const ln of lines) { const m = L1.exec(ln); if (!m) { heads.push(null); continue; } heads.push(m); if (+m[1] > 12) dayFirst++; if (+m[2] > 12) monthFirst++; }
  const dmy = monthFirst <= dayFirst; // padrão brasileiro: dia/mês
  const out = [];
  lines.forEach((ln, i) => {
    const m = heads[i];
    if (m) {
      let [, a, b, y, H, M, ap, rest] = m; let d = dmy ? +a : +b, mo = dmy ? +b : +a; y = +y; if (y < 100) y += 2000; H = +H;
      if (ap) { const pm = /p/i.test(ap); if (pm && H < 12) H += 12; if (!pm && H === 12) H = 0; }
      if (mo < 1 || mo > 12 || d < 1 || d > 31) { if (out.length) out[out.length - 1].text += '\n' + ln.trim(); return; }
      const ts = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; const hm = `${String(H).padStart(2, '0')}:${M}`;
      const k = rest.indexOf(': '); const who = k > 0 && k < 60 ? rest.slice(0, k).trim() : ''; const text = (k > 0 && k < 60 ? rest.slice(k + 2) : rest).trim();
      out.push({ d: ts, t: hm, who, text });
    } else if (out.length && ln.trim()) out[out.length - 1].text += '\n' + ln.trim();
  });
  return out;
}

// ---- .zip mínimo (a exportação do WhatsApp com mídia vem em zip): acha o _chat.txt ----
export function txtFromZip(buf) {
  let e = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('zip inválido');
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16); let best = null;
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24), nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nl).toString('utf8'); p += 46 + nl + el + cl;
    if (/\.txt$/i.test(name) && !/\//.test(name.replace(/^\.\//, '')) || /_chat\.txt$/i.test(name) || /\.txt$/i.test(name)) { if (!best || /chat/i.test(name) || usize > best.usize) best = { name, method, csize, usize, off }; }
  }
  if (!best) throw new Error('não achei o arquivo de texto da conversa dentro do zip');
  const lo = best.off; const nl = buf.readUInt16LE(lo + 26), el = buf.readUInt16LE(lo + 28); const data = buf.subarray(lo + 30 + nl + el, lo + 30 + nl + el + best.csize);
  const txt = best.method === 0 ? data : inflateRawSync(data); return txt.toString('utf8');
}

export function createCalendar(D) {
  const { getProjects, saveProjects, ask, httpErr, clip, broadcast, setBusyNote } = D;
  const jobs = new Map(); // projeto -> andamento da leitura do chat
  const find = (id) => { const pr = getProjects().find((x) => x.id === id); if (!pr) throw httpErr(404, 'projeto não encontrado'); return pr; };
  const clientTz = (pr) => (validTz(pr.tz) ? pr.tz : '');

  function cleanDelivery(b, pr, old = {}) {
    const title = clip(String(b.title ?? old.title ?? '').trim(), 120); if (!title) throw httpErr(400, 'dê um título à entrega');
    const date = String(b.date ?? old.date ?? ''); if (!validDate(date)) throw httpErr(400, 'data inválida');
    const timeRaw = String(b.time ?? old.time ?? '').trim(); if (timeRaw && !T_RE.test(timeRaw)) throw httpErr(400, 'hora inválida (use HH:MM)');
    const ctz = clientTz(pr); const tzWho = (b.tz ?? old.tz) === 'mine' || !ctz ? 'mine' : 'client';
    const zone = tzWho === 'client' ? ctz : MY_TZ();
    return {
      id: old.id || 'e-' + hex(4), title, date, time: timeRaw, tz: tzWho, at: timeRaw ? zonedToUtc(date, timeRaw, zone) : null,
      askedDate: validDate(String(b.askedDate ?? old.askedDate ?? '')) ? String(b.askedDate ?? old.askedDate) : '', askedTime: T_RE.test(String(b.askedTime ?? old.askedTime ?? '')) ? String(b.askedTime ?? old.askedTime) : '',
      doneDate: validDate(String(b.doneDate ?? old.doneDate ?? '')) ? String(b.doneDate ?? old.doneDate) : '', doneTime: T_RE.test(String(b.doneTime ?? old.doneTime ?? '')) ? String(b.doneTime ?? old.doneTime) : '',
      status: ['pendente', 'entregue'].includes(b.status ?? old.status) ? (b.status ?? old.status) : 'pendente',
      who: clip(String(b.who ?? old.who ?? '').trim(), 60), note: clip(String(b.note ?? old.note ?? '').trim(), 400), quote: clip(String(b.quote ?? old.quote ?? '').trim(), 300),
      source: old.source || (b.source === 'whatsapp' ? 'whatsapp' : 'manual'), created: old.created || Date.now(),
    };
  }
  // ao mudar o fuso do cliente, recalcula os instantes
  const recompute = (pr) => { for (const e of pr.deliveries || []) { const zone = e.tz === 'client' && clientTz(pr) ? clientTz(pr) : MY_TZ(); if (e.tz === 'client' && !clientTz(pr)) e.tz = 'mine'; e.at = e.time ? zonedToUtc(e.date, e.time, zone) : null; } };

  function view(pr) {
    const j = jobs.get(pr.id);
    return { tz: clientTz(pr), myTz: MY_TZ(), deliveries: [...(pr.deliveries || [])].sort((a, b) => (a.at ?? zonedToUtc(a.date, '23:59', MY_TZ())) - (b.at ?? zonedToUtc(b.date, '23:59', MY_TZ()))), proposed: pr.calProposed || [], job: j ? { ...j } : null, lastImport: pr.calImport || null };
  }

  // ---- análise do chat ----
  const CHUNK = 26000, MAX_CHUNKS = 90;
  function chunksOf(msgs) {
    const lines = msgs.map((m) => `${m.d} ${m.t} ${m.who ? m.who + ': ' : ''}${clip(m.text.replace(/\n+/g, ' / '), 700)}`);
    const chunks = []; let cur = [], len = 0;
    for (const ln of lines) { if (len + ln.length > CHUNK && cur.length) { chunks.push(cur.join('\n')); cur = cur.slice(-12); len = cur.join('\n').length; } cur.push(ln); len += ln.length + 1; }
    if (cur.length) chunks.push(cur.join('\n')); return chunks;
  }
  const jsonOf = (t) => { const a = String(t).indexOf('{'), b = String(t).lastIndexOf('}'); if (a < 0 || b <= a) return null; try { return JSON.parse(String(t).slice(a, b + 1)); } catch { return null; } };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const PROMPT = (pr, chunk, i, n, today) => `Você lê um trecho (${i + 1} de ${n}) de uma conversa de WhatsApp entre o Natan (dono de uma agência que EDITA e ENTREGA material) e o cliente "${pr.client || pr.name}". Cada linha começa com a data e a hora em que a mensagem foi enviada. Hoje é ${today}.\n\n` +
    `Tarefa: liste TODOS os compromissos de entrega que aparecem neste trecho (vídeos, edições, artes, posts, relatórios, revisões, etc.): o que deve ser entregue, o prazo (data e, se houver, hora) combinado, pedido ou prometido, e se já foi entregue.\n` +
    `Regras:\n- Resolva datas relativas ("amanhã", "sexta", "até o fim da semana") usando a data da mensagem em que aparecem. Datas em formato de calendário completo AAAA-MM-DD.\n- Só inclua itens com uma data de prazo clara ou que possam ser deduzidos com segurança. Não invente datas nem horas: se não há hora dita, deixe "hora" vazio.\n- "fuso": "cliente" se o horário foi dito pelo cliente (horário dele); "natan" se foi o Natan quem disse o horário no horário dele; vazio se não há hora.\n- "status": "entregue" se neste trecho há confirmação de que foi entregue/enviado/aprovado; "pendente" se não; use o que o trecho mostra.\n- "pedido_em"/"pedido_hora": data e hora (exatamente como na linha da conversa) da mensagem em que a entrega foi SOLICITADA ou combinada pela primeira vez.\n- "entregue_em"/"entregue_hora": data e hora da mensagem em que a entrega foi feita (arquivo/link enviado, "segue o vídeo", "entregue") ou aprovada; vazio se ainda não foi entregue neste trecho.\n- "trecho": a frase original curta (até 140 caracteres) que sustenta a entrega.\n- Se não houver nenhuma entrega no trecho, devolva uma lista vazia.\n\n` +
    `Responda SOMENTE com JSON, sem texto fora dele, neste formato:\n{"entregas":[{"titulo":"","data":"AAAA-MM-DD","hora":"HH:MM","fuso":"cliente|natan|","pedido_em":"AAAA-MM-DD","pedido_hora":"HH:MM","entregue_em":"AAAA-MM-DD","entregue_hora":"HH:MM","status":"pendente|entregue","responsavel":"","trecho":""}]}\n\n--- CONVERSA ---\n${chunk}`;

  async function analyze(pr, msgs, fileName) {
    const job = { running: true, step: 'lendo', done: 0, total: 0, found: 0, started: Date.now(), error: '', skipped: 0, name: fileName };
    jobs.set(pr.id, job); const today = new Date().toLocaleDateString('sv');
    try {
      let chunks = chunksOf(msgs); job.total = chunks.length;
      if (chunks.length > MAX_CHUNKS) { job.skipped = chunks.length - MAX_CHUNKS; chunks = chunks.slice(-MAX_CHUNKS); job.total = chunks.length; }
      const found = []; let idx = 0; job.step = 'analisando';
      const worker = async () => {
        while (idx < chunks.length && job.running) {
          const i = idx++; let r = null;
          for (let t = 0; t < 2 && !r; t++) { try { r = jsonOf(await ask(PROMPT(pr, chunks[i], i, chunks.length, today), 'haiku')); } catch (e) { job.error = e.message; } }
          if (r && Array.isArray(r.entregas)) { for (const x of r.entregas) found.push({ ...x, _c: i }); job.error = ''; }
          job.done++; job.found = found.length;
        }
      };
      await Promise.all([worker(), worker()]);
      if (!job.done) throw new Error(job.error || 'nenhum trecho foi analisado');
      // junta repetidas: mesma entrega citada em vários dias vira uma só (vale o prazo mais recente combinado e o status mais avançado)
      job.step = 'organizando'; const map = new Map();
      for (const x of found) {
        const title = clip(String(x.titulo || '').trim(), 120), date = String(x.data || ''); if (!title || !validDate(date)) continue;
        const key = norm(title).split(' ').slice(0, 5).join(' '); const prev = map.get(key);
        const time = T_RE.test(String(x.hora || '')) ? x.hora : '';
        const okd = (v) => (validDate(String(v || '')) ? String(v) : ''), okt = (v) => (T_RE.test(String(v || '')) ? String(v) : '');
        const item = { title, date, time, tz: x.fuso === 'natan' ? 'mine' : 'client', who: clip(String(x.responsavel || ''), 60), quote: clip(String(x.trecho || ''), 300), asked: okd(x.pedido_em), askedDate: okd(x.pedido_em), askedTime: okd(x.pedido_em) ? okt(x.pedido_hora) : '', doneDate: okd(x.entregue_em), doneTime: okd(x.entregue_em) ? okt(x.entregue_hora) : '' };
        item.status = item.doneDate || x.status === 'entregue' ? 'entregue' : 'pendente';
        if (!prev) { map.set(key, item); continue; }
        const later = item.asked > prev.asked || (item.asked === prev.asked && item.date >= prev.date);
        const merged = later ? { ...item } : { ...prev }; merged.status = prev.status === 'entregue' || item.status === 'entregue' ? 'entregue' : 'pendente';
        if (!merged.time) merged.time = prev.time || item.time;
        const firstAsk = [prev, item].filter((v) => v.askedDate).sort((a, b) => (a.askedDate + (a.askedTime || '')).localeCompare(b.askedDate + (b.askedTime || '')))[0]; merged.askedDate = firstAsk?.askedDate || ''; merged.askedTime = firstAsk?.askedTime || '';
        const lastDone = [prev, item].filter((v) => v.doneDate).sort((a, b) => (b.doneDate + (b.doneTime || '')).localeCompare(a.doneDate + (a.doneTime || '')))[0]; merged.doneDate = lastDone?.doneDate || ''; merged.doneTime = lastDone?.doneTime || '';
        merged.asked = merged.askedDate; map.set(key, merged);
      }
      let list = [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).slice(0, 300);
      const have = new Set((pr.deliveries || []).map((e) => norm(e.title) + '|' + e.date));
      list = list.filter((x) => !have.has(norm(x.title) + '|' + x.date)).map((x) => ({ id: 'q-' + hex(3), ...x }));
      pr.calProposed = list; pr.calImport = { at: Date.now(), name: fileName, messages: msgs.length, chunks: job.total, skipped: job.skipped, found: list.length, from: msgs[0]?.d || '', to: msgs[msgs.length - 1]?.d || '' };
      await saveProjects(); job.step = 'pronto';
    } catch (e) { job.error = e.message; job.step = 'erro'; }
    job.running = false; job.finished = Date.now(); broadcast?.({ type: 'calendar', project: pr.id });
  }

  async function route(m, p, body) {
    let mm;
    if (m === 'GET' && (mm = p.match(/^\/api\/projects\/(p-[a-f0-9]+)\/calendar$/))) return view(find(mm[1]));
    if (m === 'PUT' && (mm = p.match(/^\/api\/projects\/(p-[a-f0-9]+)\/calendar$/))) {
      const pr = find(mm[1]); const tz = String(body.tz || '').trim();
      if (tz && !validTz(tz)) throw httpErr(400, 'fuso inválido (exemplo: Europe/London)'); pr.tz = tz; recompute(pr); await saveProjects(); return view(pr);
    }
    if (m === 'POST' && (mm = p.match(/^\/api\/projects\/(p-[a-f0-9]+)\/deliveries$/))) {
      const pr = find(mm[1]); pr.deliveries ||= []; if (pr.deliveries.length >= 600) throw httpErr(400, 'limite de 600 entregas por projeto');
      pr.deliveries.push(cleanDelivery(body, pr)); await saveProjects(); return view(pr);
    }
    if (m === 'POST' && (mm = p.match(/^\/api\/projects\/(p-[a-f0-9]+)\/deliveries\/accept$/))) { // confirma as sugestões lidas do chat
      const pr = find(mm[1]); pr.deliveries ||= []; const ids = new Set((Array.isArray(body.ids) ? body.ids : []).map(String)); const edits = body.edits && typeof body.edits === 'object' ? body.edits : {};
      for (const q of pr.calProposed || []) if (ids.has(q.id)) { if (pr.deliveries.length >= 600) break; pr.deliveries.push(cleanDelivery({ ...q, ...(edits[q.id] || {}), source: 'whatsapp' }, pr)); }
      pr.calProposed = (pr.calProposed || []).filter((q) => !ids.has(q.id)); if (body.discardRest) pr.calProposed = []; await saveProjects(); return view(pr);
    }
    if ((m === 'PUT' || m === 'DELETE') && (mm = p.match(/^\/api\/projects\/(p-[a-f0-9]+)\/deliveries\/(e-[a-f0-9]+)$/))) {
      const pr = find(mm[1]); const i = (pr.deliveries || []).findIndex((e) => e.id === mm[2]); if (i < 0) throw httpErr(404, 'entrega não encontrada');
      if (m === 'DELETE') pr.deliveries.splice(i, 1); else pr.deliveries[i] = cleanDelivery(body, pr, pr.deliveries[i]);
      await saveProjects(); return view(pr);
    }
    if (m === 'DELETE' && (mm = p.match(/^\/api\/projects\/(p-[a-f0-9]+)\/calendar\/job$/))) { const pr = find(mm[1]); const j = jobs.get(pr.id); if (j) { j.running = false; j.step = 'parado'; } return view(pr); }
    return undefined;
  }

  // envio do arquivo exportado (corpo bruto, até 40 MB): começa a leitura em segundo plano
  async function raw(req, res, url, send) {
    const mm = url.pathname.match(/^\/api\/projects\/(p-[a-f0-9]+)\/chat-import$/); if (!mm || req.method !== 'POST') return false;
    const pr = find(mm[1]); if (jobs.get(pr.id)?.running) throw httpErr(409, 'já estou lendo um chat deste projeto');
    const max = 40 * 1024 * 1024; const len = Number(req.headers['content-length'] || 0); if (len > max) throw httpErr(413, 'arquivo grande demais (máximo 40 MB; exporte o chat "sem mídia")');
    const chunks = []; let size = 0; for await (const ch of req) { size += ch.length; if (size > max) throw httpErr(413, 'arquivo grande demais (máximo 40 MB; exporte o chat "sem mídia")'); chunks.push(ch); }
    const buf = Buffer.concat(chunks); const name = clip(String(url.searchParams.get('name') || 'chat.txt'), 120);
    let text; try { text = buf.subarray(0, 4).toString('hex') === '504b0304' ? txtFromZip(buf) : buf.toString('utf8'); } catch (e) { throw httpErr(400, e.message); }
    const msgs = parseWhatsApp(text); if (msgs.length < 3) throw httpErr(400, 'não reconheci mensagens de WhatsApp nesse arquivo (use "Exportar conversa" no WhatsApp, em .txt ou .zip)');
    analyze(pr, msgs, name).catch(() => {});
    send(res, 200, { started: true, messages: msgs.length, from: msgs[0].d, to: msgs[msgs.length - 1].d }); return true;
  }

  const summary = (pr) => { const now = Date.now(); const ds = pr.deliveries || []; const open = ds.filter((e) => e.status !== 'entregue'); const key = (e) => e.at ?? zonedToUtc(e.date, '23:59', MY_TZ()); return { total: ds.length, open: open.length, late: open.filter((e) => key(e) < now).length, next: open.filter((e) => key(e) >= now).sort((a, b) => key(a) - key(b)).slice(0, 4), tz: clientTz(pr), myTz: MY_TZ(), proposed: (pr.calProposed || []).length, job: jobs.get(pr.id)?.running || false }; };
  return { route, raw, summary, view };
}
