// Biblioteca de retratos: 60 pessoas em pixel art. Rosto = retrato; escritório = corpo inteiro montado com a cabeça do retrato.
(() => {
  const N = 60, ID = (i) => 'p' + String(i).padStart(2, '0'), VALID = /^p(0[1-9]|[1-5][0-9]|60)$/;
  const AV = { meta: null, img: null, tor: null, bod: null, bodS: null, tries: 0, cache: new Map() };
  const need = () => { if (!AV.meta && !AV.tries) { AV.tries = 1; fetch('/avatars/meta.json').then((r) => r.json()).then((m) => { AV.meta = m.items; }).catch(() => {}); const im = new Image(); im.onload = () => { AV.img = im; }; im.src = '/avatars/heads.png'; const it = new Image(); it.onload = () => { AV.tor = it; }; it.src = '/avatars/torsos.png'; const ib = new Image(); ib.onload = () => { AV.bod = ib; }; ib.src = '/avatars/bodies.png'; const is = new Image(); is.onload = () => { AV.bodS = is; }; is.src = '/avatars/bodies_sit.png'; } };
  need();
  const fallbackId = (seed) => ID((hash(seed) % N) + 1);
  const avId = (slug) => { const b = botBy(slug); if (b && VALID.test(b.avatar || '')) return b.avatar; return fallbackId(slug); };
  window.AVATARS = { drawHead: (g, id, cx, by, sf) => { const hd = headFor(id, OF.k), m = AV.meta?.[id]; if (!hd || !m) return false; const W = hd.W * sf, H = hd.H * sf; g.drawImage(hd.cv, cx - (m.cx / m.hw) * W, by - H, W, H); return true; }, count: N, id: ID, valid: (x) => VALID.test(x || ''), of: avId };

  // retrato (qualquer lugar da interface)
  const _avatarEl = window.avatarEl;
  window.avatarEl = function (color, shape, label, size, withText, look) {
    const id = look && VALID.test(look.avatar || '') ? look.avatar : fallbackId(label || color || 'x');
    const e = h('span', { class: 'bav pav', 'aria-hidden': 'true' }); e.style.width = e.style.height = size + 'px';
    const im = h('img', { src: `/avatars/${id}.png`, alt: '', draggable: 'false', loading: 'lazy' }); e.append(im); return e;
  };
  const _styleOf = window.styleOf;
  window.styleOf = function (slug) { const st = _styleOf(slug); st.avatar = avId(slug); return st; };

  // seletor no editor de bot
  function freeId() { const used = new Set(S.bots.filter((b) => b.slug !== S.editing).map((b) => b.avatar)); for (let i = 1; i <= N; i++) if (!used.has(ID(i))) return ID(i); return ID(1); }
  let built = false;
  function build() {
    const prev = $('bPrev'); if (!prev) return;
    for (const id of ['bColors', 'bShapes', 'bFaces', 'bMouths', 'bAccs']) { const el = $(id); if (!el) continue; const lb = el.previousElementSibling; if (lb?.classList.contains('opt-l')) lb.style.setProperty('display', 'none', 'important'); el.style.setProperty('display', 'none', 'important'); }
    const lab = h('div', { class: 'opt-l', text: 'Foto do agente (60 pessoas)' }), grid = h('div', { id: 'bAvs', class: 'avgrid', role: 'listbox', 'aria-label': 'Foto do agente' });
    prev.after(lab, grid); built = true;
  }
  const _renderPick = window.renderPick;
  window.renderPick = function () {
    if (!built) build();
    const D = S.draft; if (!VALID.test(D.avatar || '')) D.avatar = S.editing ? avId(S.editing) : freeId();
    $('bPrev').replaceChildren(window.avatarEl(D.color, D.shape, $('bName').value || 'Bot', 96, true, D));
    const grid = $('bAvs'); if (!grid) return; grid.replaceChildren();
    const taken = new Map(S.bots.filter((b) => b.slug !== S.editing && b.avatar).map((b) => [b.avatar, b.name]));
    for (let i = 1; i <= N; i++) {
      const id = ID(i), on = D.avatar === id, who = taken.get(id);
      const btn = h('button', { class: 'avb' + (on ? ' on' : ''), type: 'button', role: 'option', 'aria-selected': String(on), title: who ? `Em uso: ${who}` : `Foto ${i}`, 'aria-label': `Foto ${i}${who ? ' (em uso por ' + who + ')' : ''}`, onclick: () => { D.avatar = id; window.renderPick(); } }, h('img', { src: `/avatars/${id}.png`, alt: '', draggable: 'false', loading: 'lazy' }));
      if (who) btn.classList.add('used');
      grid.append(btn);
    }
  };
  { const nm = $('bName'); if (nm) { nm.removeEventListener('input', _renderPick); nm.addEventListener('input', () => window.renderPick()); } }
  // salvar: manda o avatar junto do formulário do bot
  const _api = window.api;
  window.api = function (method, path, body) {
    if ((method === 'POST' || method === 'PUT') && /^\/api\/bots(\/[^/]+)?$/.test(path) && body && 'persona' in body && 'name' in body && S.draft && VALID.test(S.draft.avatar || '')) body = { ...body, avatar: S.draft.avatar };
    return _api(method, path, body);
  };

  // ---------- escritório: corpo inteiro com a cabeça do retrato ----------
  function headFor(id, k) {
    const m = AV.meta?.[id]; if (!m || !AV.img) return null;
    const key = id + '|' + Math.round(k * 10); let c = AV.cache.get(key); if (c) return c;
    const W = 10, w = Math.max(1, Math.round(W * k)), hh = Math.max(1, Math.round(m.hh * w / m.hw));
    c = document.createElement('canvas'); c.width = w; c.height = hh; const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(AV.img, m.ax, m.ay, m.hw, m.hh, 0, 0, w, hh);
    c = { cv: c, W, H: hh / k }; AV.cache.set(key, c); return c;
  }
  function torsoFor(id, k) {
    const m = AV.meta?.[id]; if (!m || !AV.tor || m.tx == null) return null;
    const key = 't' + id + '|' + Math.round(k * 10); let c = AV.cache.get(key); if (c) return c;
    const w = Math.max(1, Math.round(10 * k)), hh = Math.max(1, Math.round(9 * k));
    c = document.createElement('canvas'); c.width = w; c.height = hh; const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(AV.tor, m.tx, m.ty, 100, 90, 0, 0, w, hh); AV.cache.set(key, c); return c;
  }
  const dark = (hex, f) => { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.round((n >> 16) * f)},${Math.round(((n >> 8) & 255) * f)},${Math.round((n & 255) * f)})`; };
  const idOf = (o, idx) => (o.slug ? avId(o.slug) : ID(((Math.abs(idx | 0) * 7 + 11) % N) + 1));
  const proceduralPerson = function (g, x, y, col, hair, busy, t, idx, o) {
    o = o || {}; need();
    const id = idOf(o, idx), m = AV.meta?.[id] || { skin: '#f1c9a0', shirt: col, hair, pants: '#2c3550', shoe: '#1d1d22' };
    const shirt = m.shirt, skin = m.skin, pants = m.pants, shoe = m.shoe;
    const R = (a, b, w, hh, c) => { g.fillStyle = c; g.fillRect(Math.round(a), Math.round(b), w, hh); };
    const walking = o.pose === 'walk', ph = walking ? Math.floor(t / 150 + idx) % 2 : 0, bob = walking && ph ? 1 : 0;
    const sit = o.pose === 'read' ? 4 : 0, yy = y - bob + sit, f = o.face || 0;
    g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(x, y, 5, 2.2, 0, 0, 7); g.fill();
    if (!sit) {
      if (walking) { R(x - 3, y - (ph ? 5 : 4), 2, ph ? 4 : 3, pants); R(x + 1, y - (ph ? 4 : 5), 2, ph ? 3 : 4, pants); R(x - 3, y - (ph ? 1 : 0) - 1, 2, 1, shoe); R(x + 1, y - (ph ? 0 : 1) - 1, 2, 1, shoe); }
      else { R(x - 3, y - 5, 2, 4, pants); R(x + 1, y - 5, 2, 4, pants); R(x - 3, y - 5, 1, 4, 'rgba(0,0,0,.2)'); R(x + 1, y - 5, 1, 4, 'rgba(0,0,0,.2)'); R(x - 3, y - 1, 2, 1, shoe); R(x + 1, y - 1, 2, 1, shoe); }
    } else { R(x - 3, y - 3, 6, 2, pants); R(x - 3, y - 1, 2, 1, shoe); R(x + 1, y - 1, 2, 1, shoe); }
    let arm = busy ? (Math.floor(t / 220 + idx) % 2) : 0; if (o.pose === 'pong') arm = Math.floor(t / 500 + idx) % 2; if (walking) arm = ph; if (o.pose === 'talk') arm = Math.floor(t / 420 + idx) % 2;
    let la = 0, ra = 0; if (o.pose === 'make' || o.pose === 'pick') ra = 3; if (o.pose === 'throw') ra = Math.min(6, Math.round(((o.p || 0) * 9))); if (o.pose === 'drink') ra = 5; if (o.hold === 'cup' || o.hold === 'book') ra = 2;
    const tc = torsoFor(id, OF.k);
    if (tc) g.drawImage(tc, Math.round(x - 5), Math.round(yy - 14), 10, 9); else { R(x - 3, yy - 14, 6, 9, shirt); R(x - 3, yy - 14, 6, 2, 'rgba(255,255,255,.22)'); }
    R(x - 3, yy - 6, 6, 1, '#1b1b20'); // cinto
    const sd = dark(shirt, 0.82), sc = dark(shirt, 0.9);
    R(x - 5, yy - 13 - arm - la, 2, 6, shirt); R(x - 5, yy - 13 - arm - la, 1, 6, sd); R(x - 5, yy - 8 - arm - la, 2, 1, sc);
    R(x + 3, yy - 13 - (1 - arm) - ra, 2, 6, shirt); R(x + 4, yy - 13 - (1 - arm) - ra, 1, 6, sd); R(x + 3, yy - 8 - (1 - arm) - ra, 2, 1, sc);
    R(x - 5, yy - 7 - arm - la, 2, 2, skin); R(x + 3, yy - 7 - (1 - arm) - ra, 2, 2, skin);
    R(x - 1, yy - 15, 2, 2, dark(skin, 0.82)); // pescoço
    const hdim = headFor(id, OF.k), ex = f > 0 ? 1 : f < 0 ? -1 : 0; let topY;
    if (hdim) { const m2 = AV.meta[id], hx0 = Math.round(x - (m2.cx != null ? m2.cx / m2.hw * hdim.W : hdim.W / 2)), hy0 = Math.round(yy - 13 - hdim.H); g.drawImage(hdim.cv, hx0, hy0, hdim.W, hdim.H); topY = hy0; }
    else { R(x - 4, yy - 22, 8, 8, skin); R(x - 5, yy - 24, 10, 4, m.hair || hair); topY = yy - 24; }
    const hx = x + 3, hy = yy - 7 - (1 - arm) - ra;
    if (o.hold === 'cup') { R(hx, hy - 3, 3, 4, '#fff'); R(hx, hy - 3, 3, 1, '#7a4a21'); }
    else if (o.hold === 'book') { R(hx - 1, hy - 4, 4, 6, '#c0392b'); R(hx - 1, hy - 4, 1, 6, '#7b241c'); }
    else if (o.hold === 'ball') R(hx, hy - 2, 3, 3, '#f4f4f4');
    else if (o.hold === 'paddle') { R(hx + 1, hy - 5, 4, 5, '#d94141'); R(hx + 2, hy, 1, 3, '#8a5a3a'); }
    if (o.pose === 'drink') { R(x + 1, yy - 17, 3, 4, '#fff'); R(x + 1, yy - 17, 3, 1, '#7a4a21'); }
    if (o.pose === 'read') { R(x - 6, yy - 11, 12, 6, '#fdfdfd'); R(x - 6, yy - 11, 12, 1, '#d6d6d6'); R(x - 1, yy - 11, 1, 6, '#9aa3ad'); R(x - 7, yy - 6, 14, 1, '#c0392b'); }
    return { top: topY };
  };

  // ---------- corpo inteiro em pixel art (folha de corpos), proporção natural ----------
  const BU = 28 / 168; // unidades do escritório por pixel do sprite (altura ≈ 25)
  function bodyFor(id, k, sitting) {
    const m = AV.meta?.[id]; const atlas = sitting ? AV.bodS : AV.bod; if (!m || !atlas || m.bx == null) return null;
    const key = (sitting ? 's' : 'b') + id + '|' + Math.round(k * 10); let c = AV.cache.get(key); if (c) return c;
    const W = m.bw * BU, H = m.bh * BU, w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(atlas, m.bx, m.by, m.bw, m.bh, 0, 0, w, h);
    // cor da calça e do sapato (para as pernas dobradas quando sentado)
    const px = (fx0, fx1, fy0, fy1) => { try { const d = x.getImageData(Math.floor(w * fx0), Math.floor(h * fy0), Math.max(1, Math.floor(w * (fx1 - fx0))), Math.max(1, Math.floor(h * (fy1 - fy0)))).data; let r = [], g2 = [], b = []; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r.push(d[i]); g2.push(d[i + 1]); b.push(d[i + 2]); } const md = (a) => a.sort((p, q) => p - q)[a.length >> 1] || 40; return `rgb(${md(r)},${md(g2)},${md(b)})`; } catch (e) { return '#2c3550'; } };
    c = { cv, W, H, pants: px(.3, .7, .66, .76), shoe: px(.2, .8, .955, .995) }; AV.cache.set(key, c); return c;
  }
  window.person = function (g, x, y, col, hair, busy, t, idx, o) {
    o = o || {}; need();
    const id = idOf(o, idx), bd = bodyFor(id, OF.k);
    if (!bd) return proceduralPerson(g, x, y, col, hair, busy, t, idx, o);
    const m = AV.meta[id], R = (a, b, w, hh, c) => { g.fillStyle = c; g.fillRect(Math.round(a), Math.round(b), w, hh); };
    const walking = o.pose === 'walk', ph = walking ? (o.ph != null ? o.ph : Math.floor(t / 150 + idx) % 2) : 0, bob = walking && ph ? 1 : 0;
    const sit = o.pose === 'read' ? 4 : 0, f = o.face || 0;
    g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(x, y, 5, 2.2, 0, 0, 7); g.fill();
    const dx = Math.round(x - bd.W / 2);
    const flip = f < 0; // vira para onde está indo (antes espelhava a cada passo)
    g.save(); if (flip) { g.translate(Math.round(x), 0); g.scale(-1, 1); g.translate(-Math.round(x), 0); }
    let topY;
    const seated = !!o.seat && !walking && (!o.pose || o.pose === 'stand') && !o.hold, bs = seated ? bodyFor(id, OF.k, true) : null;
    if (bs) { const dy = y - bs.H; g.drawImage(bs.cv, dx, dy, bs.W, bs.H); topY = dy; }
    else if (!sit) { const dy = y - bob - bd.H; g.drawImage(bd.cv, dx, dy, bd.W, bd.H); topY = dy; }
    else {
      const cut = .56, sh = bd.cv.height * cut, hh = bd.H * cut, dy = y - 3 - hh; // só o tronco; as pernas viram "sentado"
      g.drawImage(bd.cv, 0, 0, bd.cv.width, sh, dx, dy, bd.W, hh); topY = dy;
      R(x - 3, y - 4, 6, 2, bd.pants); R(x - 3, y - 2, 2, 1, bd.shoe); R(x + 1, y - 2, 2, 1, bd.shoe);
    }
    g.restore();
    // braço levantado (arremessar, preparar, beber, segurar)
    let ra = 0; if (o.pose === 'make' || o.pose === 'pick') ra = 3; if (o.pose === 'throw') ra = Math.min(6, Math.round(((o.p || 0) * 9))); if (o.pose === 'drink') ra = 5; if (o.hold === 'cup' || o.hold === 'book') ra = 2;
    const handY = y - (sit ? 9 : 11) - ra - sit * 0;
    if (ra) { R(x + 3, handY, 2, 6, m.sleeve || m.shirt); R(x + 3, handY - 1, 2, 2, m.skin); }
    const hx = x + 3, hy = handY + 2;
    if (o.hold === 'cup') { R(hx, hy - 3, 3, 4, '#fff'); R(hx, hy - 3, 3, 1, '#7a4a21'); }
    else if (o.hold === 'book') { R(hx - 1, hy - 4, 4, 6, '#c0392b'); R(hx - 1, hy - 4, 1, 6, '#7b241c'); }
    else if (o.hold === 'ball') R(hx, hy - 2, 3, 3, '#f4f4f4');
    else if (o.hold === 'paddle') { R(hx + 1, hy - 5, 4, 5, '#d94141'); R(hx + 2, hy, 1, 3, '#8a5a3a'); }
    if (o.pose === 'drink') { R(x + 1, topY + 7, 3, 4, '#fff'); R(x + 1, topY + 7, 3, 1, '#7a4a21'); }
    if (o.pose === 'read') { R(x - 6, y - 15, 12, 6, '#fdfdfd'); R(x - 6, y - 15, 12, 1, '#d6d6d6'); R(x - 1, y - 15, 1, 6, '#9aa3ad'); R(x - 7, y - 10, 14, 1, '#c0392b'); }
    return { top: topY };
  };
})();
