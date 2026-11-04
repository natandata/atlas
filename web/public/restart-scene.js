// Reiniciar a Central em segundo plano + cutscene de carregamento:
// os agentes vão para casa de ônibus, a noite cai, amanhece e eles voltam ao escritório.
(() => {
  const W = 400, H = 225, SW = 158; // mundo virtual; SW = calçada (pés dos agentes)
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t), easeOut = (t) => 1 - (1 - t) * (1 - t), easeIn = (t) => t * t;
  const seg = (st, a, b) => clamp((st - a) / (b - a));
  const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const mix = (a, b, t) => { const x = hex(a), y = hex(b); return `rgb(${Math.round(lerp(x[0], y[0], t))},${Math.round(lerp(x[1], y[1], t))},${Math.round(lerp(x[2], y[2], t))})`; };
  const mixArr = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
  const rgb = (a) => `rgb(${a[0]},${a[1]},${a[2]})`;
  const HOUSE = ['#e9a8a0', '#a8c8e9', '#f1d38a', '#b5dca6', '#d3b0e8', '#f0b98a', '#9fd8d0', '#e8a8c8', '#c9c9a0', '#a8b0e8'];

  // noite (0 = dia, 1 = noite fechada) e "calor" (laranja do pôr/nascer do sol) ao longo da cutscene
  const NIGHT = [[0, 0.06], [0.1, 0.12], [0.2, 0.6], [0.28, 1], [0.6, 1], [0.68, 0.5], [0.76, 0.1], [0.84, 0], [1, 0]];
  const night = (st) => { for (let i = 1; i < NIGHT.length; i++) if (st <= NIGHT[i][0]) { const a = NIGHT[i - 1], b = NIGHT[i]; return lerp(a[1], b[1], (st - a[0]) / (b[0] - a[0])); } return 0; };
  const warm = (st) => Math.max(0, 0.55 * (1 - st / 0.12), 0.9 * (1 - Math.abs(st - 0.17) / 0.1), 0.9 * (1 - Math.abs(st - 0.67) / 0.09));

  let ov = null, cv = null, g = null, raf = 0, K = 3, st = 0, t0 = 0, last = 0, ready = false, readyAt = 0, EST = 22000, agents = [], done = false, before = null, fade = 0, fin = 0;

  function mkAgents() {
    const bots = (S.bots || []).slice(0, 10);
    agents = bots.map((b, i) => ({ slug: b.slug, id: AVATARS.of(b.slug), i, hair: '#222' }));
    if (!agents.length) agents = [{ slug: 'x', id: 'p01', i: 0, hair: '#222' }];
  }
  const N = () => agents.length;

  // ---------- peças ----------
  function rect(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function sky(n, wm, st2) {
    const day = [[126, 200, 255], [216, 240, 255]], dusk = [[92, 70, 140], [255, 178, 110]], nig = [[8, 11, 36], [28, 42, 92]];
    let top = mixArr(day[0], nig[0], n), bot = mixArr(day[1], nig[1], n);
    top = mixArr(top, dusk[0], wm * 0.8); bot = mixArr(bot, dusk[1], wm);
    const gr = g.createLinearGradient(0, 0, 0, 170); gr.addColorStop(0, rgb(top)); gr.addColorStop(1, rgb(bot)); g.fillStyle = gr; g.fillRect(0, 0, W, 190);
    if (ov) ov.style.background = rgb(top);
    if (n > 0.25) { g.fillStyle = `rgba(255,255,255,${(n - 0.25) * 0.9})`; for (let i = 0; i < 46; i++) { const x = (i * 97 + 13) % W, y = (i * 53 + 7) % 100, tw = 0.5 + 0.5 * Math.sin(performance.now() / 400 + i); if (tw > 0.35) g.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1); } }
    // sol e lua
    const sunA = seg(st2, 0, 0.26); let sx, sy, sv = false;
    if (st2 < 0.28) { sx = 300 + sunA * 60; sy = 60 + sunA * 125; sv = true; } else if (st2 > 0.6) { const a = seg(st2, 0.6, 1); sx = 50 + a * 110; sy = 185 - a * 135; sv = true; }
    if (sv) { const gl = g.createRadialGradient(sx, sy, 2, sx, sy, 34); gl.addColorStop(0, 'rgba(255,230,150,.9)'); gl.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gl; g.fillRect(sx - 36, sy - 36, 72, 72); g.fillStyle = '#ffe9a0'; g.beginPath(); g.arc(sx, sy, 9, 0, 7); g.fill(); }
    if (n > 0.4) { const mx = 120 + st2 * 150, my = 34 + Math.abs(st2 - 0.5) * 40; g.fillStyle = `rgba(240,244,255,${clamp((n - 0.4) * 2)})`; g.beginPath(); g.arc(mx, my, 9, 0, 7); g.fill(); g.fillStyle = rgb(mixArr(top, [28, 42, 92], 0.7)); g.beginPath(); g.arc(mx + 4, my - 2, 8, 0, 7); g.fill(); }
    // nuvens
    const tt = performance.now() / 1000; g.fillStyle = `rgba(255,255,255,${0.75 * (1 - n * 0.8)})`;
    for (let i = 0; i < 4; i++) { const cx = ((i * 130 + tt * (4 + i)) % (W + 80)) - 40, cy = 24 + i * 17; rect(cx, cy, 34, 6, g.fillStyle); rect(cx + 6, cy - 4, 20, 5, g.fillStyle); }
  }
  function ground(kind) {
    // fundo (colinas) + calçada + rua
    g.fillStyle = '#7fae7a'; g.beginPath(); g.moveTo(0, 150); for (let x = 0; x <= W; x += 20) g.lineTo(x, 128 + Math.sin(x / 38 + (kind === 'house' ? 2 : 0)) * 9); g.lineTo(W, 160); g.lineTo(0, 160); g.fill();
    rect(0, 154, W, 10, '#c9c4b8'); rect(0, 163, W, 3, '#a59f93');          // calçada
    rect(0, 166, W, 26, '#4a4e57');                                          // rua
    for (let x = -10; x < W; x += 28) rect(x, 178, 14, 2, '#d9d6c4');
    rect(0, 192, W, 33, '#5f8f58');                                          // grama
    for (let x = 6; x < W; x += 34) { rect(x, 200 + (x % 3) * 6, 5, 3, '#6fa166'); }
  }
  function tree(x, y, s = 1) { rect(x - 2 * s, y - 14 * s, 4 * s, 14 * s, '#6b4a2b'); g.fillStyle = '#3f8a46'; g.beginPath(); g.arc(x, y - 22 * s, 11 * s, 0, 7); g.fill(); g.fillStyle = '#4fa257'; g.beginPath(); g.arc(x - 4 * s, y - 25 * s, 6 * s, 0, 7); g.fill(); }
  const lit = []; // janelas acesas desenhadas depois da película noturna
  function office(n, st2, lights) {
    rect(30, 44, 160, 114, '#8e98a8'); rect(30, 44, 160, 6, '#707a8b'); rect(30, 150, 160, 8, '#6d7686');
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) { const x = 40 + c * 25, y = 58 + r * 30; rect(x, y, 16, 20, '#2b3550'); lit.push([x, y, 16, 20, lights ? 1 : 0.0]); }
    rect(100, 130, 20, 28, '#3b2f2a'); rect(103, 134, 14, 24, '#5a4638'); lit.push([103, 134, 14, 24, 0.7 * (lights || 0)]);
    rect(88, 28, 44, 14, '#26304a'); g.fillStyle = '#ffd86b'; g.font = 'bold 9px system-ui, monospace'; g.textAlign = 'center'; g.fillText('ATLAS', 110, 38);
    tree(215, SW + 2, 1.1); tree(18, SW + 2, 1);
    // ponto de ônibus
    rect(238, 104, 3, 54, '#59626f'); rect(228, 100, 24, 10, '#2a62c4'); g.fillStyle = '#fff'; g.font = 'bold 7px system-ui'; g.fillText('ÔNIBUS', 240, 107);
    rect(250, 128, 40, 3, '#59626f'); rect(250, 131, 3, 27, '#59626f'); rect(287, 131, 3, 27, '#59626f'); rect(250, 148, 40, 3, '#8a6a43');
  }
  function houses(n, st2, state) {
    const hw = Math.min(52, Math.floor(310 / Math.max(N(), 1))), x0 = 8;
    agents.forEach((a, i) => {
      const x = x0 + i * hw, w = hw - 5, cx = x + w / 2; a.hx = cx;
      rect(x, 102, w, 56, HOUSE[i % HOUSE.length]); rect(x, 150, w, 8, 'rgba(0,0,0,.14)');
      g.fillStyle = '#7a4a3b'; g.beginPath(); g.moveTo(x - 3, 102); g.lineTo(cx, 86); g.lineTo(x + w + 3, 102); g.fill();
      rect(cx - 5, 140, 10, 18, '#6b4a2b'); rect(cx + 2, 150, 1.5, 1.5, '#ffd86b');
      const wx = cx - 7, wy = 112; rect(wx - 1, wy - 1, 16, 16, '#f4f1ea'); rect(wx, wy, 14, 14, '#26304a');
      const l = state(i); a.win = l; // l: 0 apagada, 1 acesa, 2 dormindo
      if (l === 1) lit.push([wx, wy, 14, 14, 1]);
      if (l === 2) { lit.push([wx, wy, 14, 14, 0.25]); }
      a.wx = wx; a.wy = wy;
    });
    tree(330, SW + 2, 1.1);
    rect(338, 104, 3, 54, '#59626f'); rect(328, 100, 24, 10, '#2a62c4'); g.fillStyle = '#fff'; g.font = 'bold 7px system-ui'; g.textAlign = 'center'; g.fillText('ÔNIBUS', 340, 107);
  }
  function bus(x, y, pass, n) {
    rect(x - 29, y - 21, 58, 17, '#f2b632'); rect(x - 29, y - 9, 58, 3, '#d99a1c'); rect(x - 29, y - 21, 58, 2, '#ffd66b'); rect(x - 29, y - 6, 58, 2, '#8b5e1a');
    for (let j = 0; j < 5; j++) { const wx = x - 20 + j * 10; rect(wx, y - 18, 8, 7, '#25324c'); if (pass[j]) AVATARS.drawHead(g, pass[j], wx + 4, y - 11, 0.5); rect(wx, y - 18, 8, 1, 'rgba(255,255,255,.35)'); }
    rect(x - 29, y - 18, 7, 11, '#25324c'); rect(x - 27, y - 16, 3, 9, '#3a4a6c');
    for (const wx of [x - 19, x + 17]) { g.fillStyle = '#16171b'; g.beginPath(); g.arc(wx, y - 3, 4.6, 0, 7); g.fill(); g.fillStyle = '#9aa0ab'; g.beginPath(); g.arc(wx, y - 3, 1.8, 0, 7); g.fill(); }
    rect(x - 30, y - 9, 2, 3, n > 0.3 ? '#fff6b0' : '#e8dca0'); rect(x + 28, y - 10, 2, 3, '#d33');
    if (n > 0.3) lit.push([x - 40, y - 12, 12, 8, 0.0, 'beam']);
  }
  const busX = (u, stopX, from) => u < 0 ? from : lerp(from, stopX, easeOut(clamp(u)));

  // ---------- cena por tempo ----------
  function frame(now) {
    raf = requestAnimationFrame(frame); const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    const elapsed = now - t0;
    // avança a cutscene: espera o servidor voltar na "noite"; acelera se voltou antes
    let rate = 1 / EST; const hold = !ready && st >= 0.6;
    if (ready && st < 0.42) rate *= 2.4;
    if (!hold) st = Math.min(1, st + dt * 1000 * rate);
    if (window.__st != null) st = window.__st; // gancho de teste visual
    if (st >= 1 && !done) { done = true; finish(); }
    OF.k = K; g.setTransform(K, 0, 0, K, 0, 0); g.imageSmoothingEnabled = false; lit.length = 0;
    const n = night(st), wm = warm(st);
    sky(n, wm, st);
    const inOffice1 = st < 0.19, inHouse = st >= 0.19 && st < 0.81, inOffice2 = st >= 0.81;
    const pos = [], busesToDraw = [], stag = stag_(), KP = 0.00032;
    const wake = 0.60;
    if (inOffice1 || inOffice2) {
      ground('office');
      const lights = inOffice2 ? clamp(seg(st, 0.9, 0.96)) * 0.8 + 0.2 : clamp(seg(st, 0.05, 0.16)) * 0.9;
      office(n, st, lights);
      const doorX = 110, stopX = 246; const pass = [];
      if (inOffice1) {
        const arrive = seg(st, 0.06, 0.10), leave = seg(st, 0.14, 0.18); const bx = leave > 0 ? lerp(268, -70, easeIn(leave)) : busX(arrive, 268, 470);
        agents.forEach((a, i) => {
          const sT = 0.004 + i * stag, q = 236 - i * Math.min(9, 70 / N()), dur = Math.abs(q - doorX) * KP, p = clamp((st - sT) / dur), bT = Math.max(0.10, sT + dur) + 0.003 + i * stag * 0.6, bp = clamp((st - bT) / 0.012);
          if (st < sT) return;
          if (st >= bT + 0.012) { pass.push(a.id); return; }
          if (st >= bT) { pos.push({ a, x: lerp(q, stopX, ease(bp)), y: SW, pose: 'walk' }); return; }
          pos.push({ a, x: lerp(doorX, q, ease(p)), y: SW, pose: p < 1 ? 'walk' : 'stand' });
        });
        busesToDraw.push({ x: bx, pass: pass.slice(0, 5) });
      } else {
        const arrive = seg(st, 0.82, 0.86), leave = seg(st, 0.90, 0.94); const bx = leave > 0 ? lerp(268, -70, easeIn(leave)) : busX(arrive, 268, 470);
        agents.forEach((a, i) => {
          const sT = 0.865 + i * stag, dur = (stopX - doorX) * KP, p = clamp((st - sT) / dur);
          if (st < sT) { pass.push(a.id); return; }
          if (p >= 1) return;
          pos.push({ a, x: lerp(stopX, doorX, ease(p)), y: SW, pose: 'walk' });
        });
        busesToDraw.push({ x: bx, pass: pass.slice(0, 5) });
      }
    } else {
      ground('house');
      const stopX = 336, houseN = N();
      const hwid = Math.min(52, Math.floor(310 / Math.max(houseN, 1)));
      agents.forEach((a, i) => { a.hx = 8 + i * hwid + (hwid - 5) / 2; });
      const enterT = (a, i) => 0.245 + i * stag + Math.abs(stopX - a.hx) * KP;
      houses(n, st, (i) => { const a = agents[i], e = enterT(a, i); if (st < e) return 0; if (st < e + 0.03) return 1; if (st < wake) return 2; if (st < 0.62 + i * stag) return 1; return 0; });
      const first = st < 0.5, pass = [];
      const arr1 = seg(st, 0.20, 0.24), lv1 = seg(st, 0.28, 0.32), arr2 = seg(st, 0.66, 0.70), lv2 = seg(st, 0.76, 0.80);
      const bx = first ? (lv1 > 0 ? lerp(362, -70, easeIn(lv1)) : busX(arr1, 362, 470)) : (lv2 > 0 ? lerp(362, -70, easeIn(lv2)) : busX(arr2, 362, 470));
      agents.forEach((a, i) => {
        const d = Math.abs(stopX - a.hx) * KP;
        if (first) {
          const sT = 0.245 + i * stag, p = clamp((st - sT) / d);
          if (st < sT) { pass.push(a.id); return; }
          if (p >= 1) return;
          pos.push({ a, x: lerp(stopX, a.hx, ease(p)), y: SW, pose: 'walk' });
        } else {
          const sT = 0.62 + i * stag, p = clamp((st - sT) / d);
          if (st < sT) return;
          if (p < 1) { pos.push({ a, x: lerp(a.hx, stopX, ease(p)), y: SW, pose: 'walk' }); return; }
          if (st < 0.71) pos.push({ a, x: stopX - 4 - (i % 3) * 5, y: SW, pose: 'stand' }); else pass.push(a.id);
        }
      });
      busesToDraw.push({ x: bx, pass: pass.slice(0, 5) });
    }
    for (const b of busesToDraw) bus(b.x, 186, b.pass, n);
    pos.sort((p, q) => p.y - q.y);
    for (const q of pos) { person(g, q.x, q.y, '#3b82f6', q.a.hair, false, now, q.a.i * 3, { pose: q.pose, slug: q.a.slug, face: -1 }); }
    // película noturna + luzes
    if (n > 0.02) { g.fillStyle = `rgba(8,12,48,${0.5 * n})`; g.fillRect(0, 0, W, H); }
    for (const l of lit) {
      if (l[5] === 'beam') { if (n > 0.3) { const gr = g.createLinearGradient(l[0] + 12, 0, l[0] - 26, 0); gr.addColorStop(0, `rgba(255,240,170,${0.35 * n})`); gr.addColorStop(1, 'rgba(255,240,170,0)'); g.fillStyle = gr; g.fillRect(l[0] - 26, l[1] - 2, 38, 14); } continue; }
      const a = l[4] * (0.35 + 0.65 * Math.max(n, wm * 0.6)); if (a <= 0.01) continue; rect(l[0], l[1], l[2], l[3], `rgba(255,214,120,${Math.min(1, a * 1.2)})`);
    }
    // dorminhocos (depois da película para ficarem visíveis)
    if (inHouse) {
      for (const a of agents) if (a.win === 2) {
        rect(a.wx, a.wy + 9, 14, 5, '#5a6bb0'); AVATARS.drawHead(g, a.id, a.wx + 7, a.wy + 11, 0.85);
        const tt = performance.now() / 700 + a.i; for (let z = 0; z < 2; z++) { const f = ((tt + z * 0.5) % 1); g.fillStyle = `rgba(255,255,255,${1 - f})`; g.font = `bold ${6 + z * 2}px system-ui`; g.textAlign = 'left'; g.fillText('z', a.wx + 14 + f * 6 + z * 3, a.wy - 2 - f * 12 - z * 5); }
      }
    }
    // fade preto entre cenas
    const fa = Math.max(st < 0.19 ? seg(st, 0.17, 0.19) : 0, st >= 0.19 && st < 0.215 ? 1 - seg(st, 0.19, 0.215) : 0, st < 0.81 ? seg(st, 0.79, 0.81) * (st > 0.7 ? 1 : 0) : 0, st >= 0.81 && st < 0.835 ? 1 - seg(st, 0.81, 0.835) : 0);
    if (fa > 0) { g.fillStyle = `rgba(6,8,24,${fa})`; g.fillRect(0, 0, W, H); }
    // título final
    if (st > 0.94) { const a = seg(st, 0.94, 0.97); g.fillStyle = `rgba(0,0,0,${0.45 * a})`; g.fillRect(0, 88, W, 34); g.fillStyle = `rgba(255,255,255,${a})`; g.font = 'bold 16px system-ui'; g.textAlign = 'center'; g.fillText('Bom dia! Central no ar', W / 2, 111); }
    // barra
    const pct = hold ? Math.min(98, Math.round(st * 100)) : Math.round(st * 100);
    const fill = $('xsFill'); if (fill) fill.style.width = (hold ? Math.min(98, st * 100) : st * 100) + '%';
    const eta = $('xsEta'); if (eta) { const left = hold ? null : Math.max(0, Math.round((1 - st) * EST / 1000)); eta.textContent = hold ? 'Quase lá… ' + pct + '%' : (left > 0 ? `${pct}% · ~${left}s` : pct + '%'); }
    if (!ready && elapsed > 90000 && !ov.classList.contains('late')) { ov.classList.add('late'); $('xsMsg').textContent = 'A Central está demorando. Se não voltar, abra o reiniciar-central.bat na pasta do Atlas — esta tela sai sozinha quando ela estiver no ar.'; }
  }
  const stag_ = () => 0.025 / Math.max(N(), 1);

  function resize() {
    if (!cv) return; K = Math.max(1.5, Math.min(innerWidth / W, (innerHeight - 72) / H)); cv.width = Math.round(W * K); cv.height = Math.round(H * K); cv.style.width = cv.width + 'px'; cv.style.height = cv.height + 'px'; AVATARS_CLEAR();
  }
  const AVATARS_CLEAR = () => { /* cabeças são cacheadas por escala */ };
  async function poll() {
    if (done) return;
    try { const r = await fetch('/api/about', { cache: 'no-store' }); if (r.ok) { const j = await r.json(); if (before == null ? performance.now() - t0 > 3500 : j.startedAt !== before) { if (!ready) { ready = true; readyAt = performance.now() - t0; try { localStorage.setItem('atlasRestartMs', String(Math.round(clamp(readyAt / 0.6, 16000, 45000)))); } catch { /* */ } } return; } } } catch { /* ainda reiniciando */ }
    setTimeout(poll, 700);
  }
  function finish() { setTimeout(() => { XU.hardReload ? XU.hardReload() : location.reload(); }, 700); }

  function start() {
    mkAgents(); try { EST = clamp(Number(localStorage.getItem('atlasRestartMs')) || 22000, 16000, 45000); } catch { EST = 22000; }
    ov = h('div', { id: 'xScene', role: 'alert', 'aria-live': 'polite' }, h('div', { class: 'xs-wrap' }, h('canvas', { id: 'xsCv' })),
      h('div', { class: 'xs-bar' }, h('div', { class: 'xs-t' }, h('b', { text: 'Reiniciando a Central…' }), h('span', { id: 'xsEta', text: '0%' })), h('div', { class: 'xs-tr' }, h('i', { id: 'xsFill' })), h('div', { class: 'xs-m', id: 'xsMsg', text: 'Os agentes foram para casa descansar. A página recarrega sozinha quando a Central voltar.' })));
    document.body.append(ov); cv = $('xsCv'); g = cv.getContext('2d'); resize(); addEventListener('resize', resize);
    t0 = performance.now(); last = 0; st = 0; ready = false; done = false; raf = requestAnimationFrame(frame);
  }

  XU.restart = async () => {
    const active = [...XU.tasks.values()].filter((t) => t.status === 'running' || t.status === 'queued').length;
    const ok = await XU.confirm('Reiniciar a Central?', active ? `${active} tarefa${active > 1 ? 's' : ''} em andamento ${active > 1 ? 'serão interrompidas' : 'será interrompida'}. As conversas continuam salvas.` : 'A Central reinicia em segundo plano e a página recarrega sozinha. As conversas continuam salvas.', 'Reiniciar');
    if (!ok) return;
    try { before = (await api('GET', '/api/about')).startedAt; } catch { before = null; }
    try { await api('POST', '/api/restart', {}); } catch (e) { XU.err(e); return; }
    start(); setTimeout(poll, 1500);
  };
})();
