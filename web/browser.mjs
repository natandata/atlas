// Navegador por bot, mostrado ao vivo dentro da conversa.
// Abre um Chrome/Edge/Chromium "invisível" (headless) com o perfil do bot (cookies e logins ficam salvos),
// fala com ele pelo protocolo de depuração (CDP, só em 127.0.0.1) e transmite a tela como vídeo MJPEG.
// Cliques e teclas do painel viram eventos no navegador. Sem dependências: o WebSocket é um cliente mínimo.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { basename, join } from 'node:path';

// ---------- cliente WebSocket mínimo (RFC 6455), só o que o CDP precisa ----------
function wsConnect(urlStr) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr); const key = randomBytes(16).toString('base64');
    const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13' } });
    req.on('error', reject);
    req.on('response', (r) => reject(new Error('handshake recusado: ' + r.statusCode)));
    req.on('upgrade', (res, sock, head) => {
      const ws = { onmessage: null, onclose: null, closed: false };
      let buf = head && head.length ? Buffer.from(head) : Buffer.alloc(0); let frag = [], fragOp = 1;
      const sendFrame = (op, data) => {
        const len = data.length; let hdr;
        if (len < 126) hdr = Buffer.from([0x80 | op, 0x80 | len]);
        else if (len < 65536) { hdr = Buffer.alloc(4); hdr[0] = 0x80 | op; hdr[1] = 0x80 | 126; hdr.writeUInt16BE(len, 2); }
        else { hdr = Buffer.alloc(10); hdr[0] = 0x80 | op; hdr[1] = 0x80 | 127; hdr.writeBigUInt64BE(BigInt(len), 2); }
        const mask = randomBytes(4); const body = Buffer.alloc(len); for (let i = 0; i < len; i++) body[i] = data[i] ^ mask[i & 3];
        try { sock.write(Buffer.concat([hdr, mask, body])); } catch { /* socket fechado */ }
      };
      const parse = () => {
        for (;;) {
          if (buf.length < 2) return;
          const fin = buf[0] & 0x80, op = buf[0] & 15; let len = buf[1] & 127, off = 2;
          if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
          else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
          if (buf.length < off + len) return;
          const payload = buf.subarray(off, off + len); buf = buf.subarray(off + len);
          if (op === 8) { sock.end(); return; }
          if (op === 9) { sendFrame(10, payload); continue; }
          if (op === 10) continue;
          if (op === 1 || op === 2) { frag = [payload]; fragOp = op; } else if (op === 0) frag.push(payload);
          if (fin) { const full = Buffer.concat(frag); frag = []; try { ws.onmessage?.(fragOp === 1 ? full.toString('utf8') : full); } catch (e) { console.error('browser ws:', e.message); } }
        }
      };
      sock.on('data', (d) => { buf = Buffer.concat([buf, d]); parse(); });
      sock.on('close', () => { ws.closed = true; ws.onclose?.(); });
      sock.on('error', () => {});
      ws.send = (s) => sendFrame(1, Buffer.from(s));
      ws.close = () => { try { sock.destroy(); } catch { /* já fechou */ } };
      parse(); resolve(ws);
    });
    req.end();
  });
}

const W = 1280, H = 800;
const UP_MAX = 200 * 1024 * 1024;
// avisa o Atlas quando alguém (o bot ou você) mexe de verdade numa aba: assim o painel acompanha a aba em uso
const ACT_JS = `(()=>{if(window.__atl)return;window.__atl=1;const f=()=>{try{window.atlasAct('1')}catch(e){}};for(const t of ['mousedown','keydown','wheel','input','change'])addEventListener(t,e=>{if(e.isTrusted)f()},true)})()`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findChrome() {
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files', pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', la = process.env.LOCALAPPDATA || '';
  const cands = [process.env.CHROME_PATH,
    join(pf, 'Google\\Chrome\\Application\\chrome.exe'), join(pf86, 'Google\\Chrome\\Application\\chrome.exe'), la && join(la, 'Google\\Chrome\\Application\\chrome.exe'),
    join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe'), join(pf, 'Microsoft\\Edge\\Application\\msedge.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  for (const c of cands) { try { await stat(c); return c; } catch { /* próximo */ } }
  return null;
}

export function createBrowser({ profileDir, httpErr, bots }) {
  const sessions = new Map(); // slug -> sessão
  const dlDir = (slug) => join(profileDir(slug), '..', 'browser-downloads');
  const upDir = (slug) => join(profileDir(slug), '..', 'browser-uploads');
  const IDLE_MS = Math.max(1, Number(process.env.BROWSER_IDLE_MIN || 10)) * 60_000;

  function normUrl(raw) {
    const t = String(raw || '').trim(); if (!t) throw httpErr(400, 'digite um endereço');
    if (/^about:blank$/i.test(t)) return t;
    if (/^https?:\/\//i.test(t)) return t;
    if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^[\w.-]+:\d+(\/|$)/.test(t)) throw httpErr(400, 'só endereços http e https');
    if (/^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/\S*)?$/i.test(t)) return 'https://' + t;
    return 'https://www.google.com/search?q=' + encodeURIComponent(t);
  }

  async function launch(slug) {
    const exe = await findChrome();
    if (!exe) throw httpErr(400, 'Não achei o Google Chrome (ou Edge) neste computador. Instale o Chrome ou defina CHROME_PATH no .env.');
    const dir = profileDir(slug); await mkdir(dir, { recursive: true });
    const pidFile = join(dir, '.atlas-pid');
    try { const old = Number((await readFile(pidFile, 'utf8')).trim()); if (old > 0) { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(old), '/T', '/F'], { windowsHide: true }); else process.kill(old, 'SIGTERM'); await sleep(600); } } catch { /* sem processo antigo */ }
    await rm(join(dir, 'DevToolsActivePort'), { force: true });
    const args = [`--user-data-dir=${dir}`, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--headless=new', '--no-first-run', '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled', '--disable-features=Translate,MediaRouter', '--hide-scrollbars', '--mute-audio', '--lang=pt-BR', `--window-size=${W},${H}`, 'about:blank'];
    if (process.platform === 'linux' && process.getuid?.() === 0) args.unshift('--no-sandbox');
    const proc = spawn(exe, args, { stdio: 'ignore', windowsHide: true });
    let exited = false; proc.on('exit', () => { exited = true; }); proc.on('error', () => { exited = true; });
    if (proc.pid) await writeFile(pidFile, String(proc.pid)).catch(() => {});
    let port = 0, path = '';
    for (let i = 0; i < 100 && !port; i++) {
      if (exited) throw httpErr(500, 'O navegador fechou ao abrir. Se o perfil deste bot está aberto em outra janela do Chrome, feche-a e tente de novo.');
      try { const t = (await readFile(join(dir, 'DevToolsActivePort'), 'utf8')).split('\n'); if (t[0] && t[1]) { port = Number(t[0]); path = t[1].trim(); } } catch { /* ainda subindo */ }
      if (!port) await sleep(150);
    }
    if (!port) { try { proc.kill(); } catch { /* */ } throw httpErr(500, 'O navegador não respondeu a tempo.'); }
    return { proc, port, path };
  }

  async function start(slug) {
    if (!bots.has(slug)) throw httpErr(404, 'bot não encontrado');
    const cur = sessions.get(slug); if (cur) { await cur.ready; if (!cur.dead) return cur; }
    const s = { slug, viewers: new Set(), tabs: new Map(), active: '', last: null, lastViewer: Date.now(), nextId: 1, pending: new Map(), dead: false, sessOf: new Map() };
    sessions.set(slug, s);
    s.ready = (async () => {
      const { proc, port, path } = await launch(slug); s.proc = proc; s.port = port; s.holds = 0;
      proc.on('exit', () => { kill(slug, true); });
      s.ws = await wsConnect(`ws://127.0.0.1:${port}${path}`);
      s.ws.onclose = () => { if (!s.dead) kill(slug, true); };
      s.ws.onmessage = (m) => onMsg(s, m);
      await call(s, 'Target.setDiscoverTargets', { discover: true });
      const { targetInfos } = await call(s, 'Target.getTargets');
      const first = targetInfos.find((t) => t.type === 'page');
      for (const t of targetInfos) if (t.type === 'page') s.tabs.set(t.targetId, { id: t.targetId, title: t.title || '', url: t.url || '' });
      await setDownloads(s);
      if (first) await activate(s, first.targetId); else { const r = await call(s, 'Target.createTarget', { url: 'about:blank' }); await activate(s, r.targetId); }
      for (const t of targetInfos) if (t.type === 'page' && t.targetId !== s.active) ensure(s, t.targetId).catch(() => {});
    })();
    try { await s.ready; } catch (e) { kill(slug); throw e; }
    return s;
  }

  function call(s, method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      if (s.dead || s.ws?.closed) return reject(httpErr(409, 'o navegador foi fechado'));
      const id = s.nextId++; const t = setTimeout(() => { s.pending.delete(id); reject(new Error(`${method}: sem resposta`)); }, 15000);
      s.pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
      s.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  function onMsg(s, raw) {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.id) { const p = s.pending.get(m.id); if (p) { s.pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result || {}); } return; }
    const e = m.method, pr = m.params || {};
    if (e === 'Page.screencastFrame') {
      call(s, 'Page.screencastFrameAck', { sessionId: pr.sessionId }, m.sessionId).catch(() => {});
      if (m.sessionId !== s.sess) return;
      const buf = Buffer.from(pr.data, 'base64'); s.last = buf; pushFrame(s, buf); return;
    }
    if (e === 'Runtime.bindingCalled' && pr.name === 'atlasAct') { follow(s, tabOf(s, m.sessionId)); return; }
    if (e === 'Page.frameNavigated' && !pr.frame?.parentId && !/^about:/.test(pr.frame?.url || '')) { follow(s, tabOf(s, m.sessionId)); return; }
    if (e === 'Page.fileChooserOpened') {
      const id = tabOf(s, m.sessionId); if (!id || id !== s.active || (s.holds || 0) > 0) return;
      s.chooser = { sess: m.sessionId, node: pr.backendNodeId, multiple: pr.mode === 'selectMultiple', at: Date.now() }; return;
    }
    if (e === 'Page.javascriptDialogOpening') { call(s, 'Page.handleJavaScriptDialog', { accept: pr.type === 'alert' || pr.type === 'beforeunload' }, m.sessionId).catch(() => {}); return; }
    if (e === 'Target.targetCreated' || e === 'Target.targetInfoChanged') {
      const t = pr.targetInfo; if (t.type !== 'page') return;
      const had = s.tabs.has(t.targetId); const tab = s.tabs.get(t.targetId) || { id: t.targetId, title: '', url: '' };
      tab.title = t.title || ''; tab.url = t.url || ''; s.tabs.set(t.targetId, tab);
      if (!had && e === 'Target.targetCreated' && s.active) activate(s, t.targetId).catch(() => {});
      else if (!had && !s.dead) ensure(s, t.targetId).catch(() => {});
      return;
    }
    if (e === 'Target.targetDestroyed') {
      s.tabs.delete(pr.targetId); s.sessOf.delete(pr.targetId);
      if (s.active === pr.targetId) { s.active = ''; s.sess = ''; const next = [...s.tabs.keys()].pop(); if (next) activate(s, next).catch(() => {}); else call(s, 'Target.createTarget', { url: 'about:blank' }).then((r) => activate(s, r.targetId)).catch(() => {}); }
    }
  }

  function pushFrame(s, buf) {
    const head = Buffer.from(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${buf.length}\r\n\r\n`);
    for (const res of s.viewers) { if (res.writableNeedDrain) continue; try { res.write(head); res.write(buf); res.write('\r\n'); } catch { /* viewer saiu */ } }
  }

  const tabOf = (s, sess) => { if (!sess) return ''; for (const [t, x] of s.sessOf) if (x === sess) return t; return ''; };
  // quem estiver mexendo numa aba (o bot) puxa o painel para ela
  function follow(s, id) {
    if (!id || id === s.active || !s.tabs.has(id) || (s.holds || 0) < 1 || s.switching) return;
    if (Date.now() - (s.lastSwitch || 0) < 600) return;
    s.lastSwitch = Date.now(); s.switching = true; activate(s, id).catch(() => {}).finally(() => { s.switching = false; });
  }
  async function setDownloads(s) {
    await mkdir(dlDir(s.slug), { recursive: true }).catch(() => {});
    await call(s, 'Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir(s.slug), eventsEnabled: true }).catch(() => {});
  }
  async function setIntercept(s, on) {
    for (const sess of s.sessOf.values()) call(s, 'Page.setInterceptFileChooserDialog', { enabled: on }, sess).catch(() => {});
  }
  async function ensure(s, targetId) {
    let sess = s.sessOf.get(targetId);
    if (sess) return sess;
    const r = await call(s, 'Target.attachToTarget', { targetId, flatten: true }); sess = r.sessionId; s.sessOf.set(targetId, sess);
    await call(s, 'Page.enable', {}, sess);
    await call(s, 'Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false }, sess);
    const ua = (await call(s, 'Browser.getVersion')).userAgent.replace(/Headless/g, '');
    await call(s, 'Emulation.setUserAgentOverride', { userAgent: ua, acceptLanguage: 'pt-BR,pt;q=0.9,en;q=0.8' }, sess).catch(() => {});
    await call(s, 'Runtime.enable', {}, sess).catch(() => {});
    await call(s, 'Runtime.addBinding', { name: 'atlasAct' }, sess).catch(() => {});
    await call(s, 'Page.addScriptToEvaluateOnNewDocument', { source: ACT_JS }, sess).catch(() => {});
    call(s, 'Runtime.evaluate', { expression: ACT_JS }, sess).catch(() => {});
    if (!(s.holds > 0)) call(s, 'Page.setInterceptFileChooserDialog', { enabled: true }, sess).catch(() => {});
    return sess;
  }
  async function activate(s, targetId) {
    if (s.sess) call(s, 'Page.stopScreencast', {}, s.sess).catch(() => {});
    const sess = await ensure(s, targetId);
    s.active = targetId; s.sess = sess; s.last = null; s.chooser = null;
    await call(s, 'Target.activateTarget', { targetId }).catch(() => {});
    await call(s, 'Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: W, maxHeight: H, everyNthFrame: 1 }, sess);
  }

  function kill(slug, fromExit) {
    const s = sessions.get(slug); if (!s || s.dead) return; s.dead = true; sessions.delete(slug);
    for (const res of s.viewers) { try { res.end(); } catch { /* */ } } s.viewers.clear();
    for (const p of s.pending.values()) p.reject(new Error('fechado')); s.pending.clear();
    try { s.ws?.close(); } catch { /* */ }
    if (!fromExit && s.proc?.pid) { try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(s.proc.pid), '/T', '/F'], { windowsHide: true }); else s.proc.kill('SIGTERM'); } catch { /* */ } }
  }

  // contas conectadas ficam salvas: cookies "de sessão" (que o Chrome jogaria fora ao fechar) viram duráveis,
  // e o fechamento normal é gracioso para o Chrome gravar tudo no perfil
  const KEEP_S = 90 * 86400;
  async function persistCookies(s) {
    if (s.dead || s.ws?.closed) return;
    const { cookies } = await call(s, 'Storage.getCookies', {});
    const sess = (cookies || []).filter((c) => c.session).map((c) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, ...(c.partitionKey ? { partitionKey: c.partitionKey } : {}), expires: Math.floor(Date.now() / 1000) + KEEP_S }));
    if (sess.length) await call(s, 'Storage.setCookies', { cookies: sess });
  }
  async function closeGracefully(slug) {
    const s = sessions.get(slug); if (!s || s.dead) return;
    try {
      await Promise.race([persistCookies(s), sleep(2500)]);
      const exited = new Promise((r) => s.proc.once('exit', r));
      s.ws.send(JSON.stringify({ id: s.nextId++, method: 'Browser.close' }));
      await Promise.race([exited, sleep(4000)]);
    } catch { /* cai no kill abaixo */ }
    kill(slug);
  }
  const cookieTimer = setInterval(() => { for (const s of sessions.values()) persistCookies(s).catch(() => {}); }, 20_000); cookieTimer.unref?.();

  const status = async (slug) => {
    const s = sessions.get(slug);
    if (!s || s.dead) return { running: false, w: W, h: H, downloads: [] };
    // o título muda sem aviso em páginas de aplicativo: lê direto da página ativa
    if (s.active && s.sess) { try { const r = await Promise.race([call(s, 'Runtime.evaluate', { expression: 'document.title + "\\n" + location.href', returnByValue: true }, s.sess), sleep(700).then(() => null)]); const v = r?.result?.value; if (typeof v === 'string') { const a = s.tabs.get(s.active); if (a) { const i = v.indexOf('\n'); a.title = v.slice(0, i); if (/^https?:|^about:/.test(v.slice(i + 1))) a.url = v.slice(i + 1); } } } catch { /* mantém o último */ } }
    const tabs = [...s.tabs.values()].map((t) => ({ id: t.id, title: t.title, url: t.url, active: t.id === s.active }));
    const a = s.tabs.get(s.active);
    if (s.chooser && Date.now() - s.chooser.at > 120_000) s.chooser = null;
    let downloads = []; try { downloads = (await Promise.all((await readdir(dlDir(slug))).filter((n) => !/\.(crdownload|tmp)$/i.test(n)).map(async (n) => { const st = await stat(join(dlDir(slug), n)).catch(() => null); return st?.isFile() ? { name: n, size: st.size, at: st.mtimeMs } : null; }))).filter(Boolean).sort((x, y) => y.at - x.at).slice(0, 8); } catch { /* sem pasta ainda */ }
    return { running: true, w: W, h: H, url: a?.url || '', title: a?.title || '', tabs, agent: (s.holds || 0) > 0, chooser: s.chooser ? { multiple: s.chooser.multiple } : null, downloads };
  };

  // ---------- entrada: mouse e teclado ----------
  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  async function input(s, ev) {
    const sess = s.sess; if (!sess) return;
    const mod = num(ev.mod) & 15;
    switch (ev.t) {
      case 'mouse': {
        const type = { move: 'mouseMoved', down: 'mousePressed', up: 'mouseReleased' }[ev.type]; if (!type) return;
        const button = ['left', 'middle', 'right'].includes(ev.button) ? ev.button : 'none';
        return call(s, 'Input.dispatchMouseEvent', { type, x: num(ev.x), y: num(ev.y), button: type === 'mouseMoved' ? (ev.pressed ? button : 'none') : button, buttons: num(ev.buttons) & 7, clickCount: type === 'mouseMoved' ? 0 : 1, modifiers: mod }, sess);
      }
      case 'wheel': return call(s, 'Input.dispatchMouseEvent', { type: 'mouseWheel', x: num(ev.x), y: num(ev.y), deltaX: Math.max(-2000, Math.min(2000, num(ev.dx))), deltaY: Math.max(-2000, Math.min(2000, num(ev.dy))), modifiers: mod }, sess);
      case 'text': { const t = String(ev.text || '').slice(0, 5000); if (t) return call(s, 'Input.insertText', { text: t }, sess); return; }
      case 'key': {
        const key = String(ev.key || '').slice(0, 20); if (!key) return;
        const text = key === 'Enter' ? '\r' : key === 'Tab' ? '\t' : '';
        const cmds = ev.cmd && ['selectAll', 'undo', 'redo'].includes(ev.cmd) ? [ev.cmd] : undefined;
        const p = { key, code: String(ev.code || '').slice(0, 20), windowsVirtualKeyCode: num(ev.vk), nativeVirtualKeyCode: num(ev.vk), modifiers: mod, ...(cmds ? { commands: cmds } : {}) };
        if (ev.type === 'up') return call(s, 'Input.dispatchKeyEvent', { type: 'keyUp', ...p }, sess);
        return call(s, 'Input.dispatchKeyEvent', text ? { type: 'keyDown', text, unmodifiedText: text, ...p } : { type: 'rawKeyDown', ...p }, sess);
      }
      default:
    }
  }

  async function act(s, body) {
    const sess = s.sess;
    switch (body.action) {
      case 'go': await call(s, 'Page.navigate', { url: normUrl(body.url) }, sess); break;
      case 'reload': await call(s, 'Page.reload', {}, sess); break;
      case 'back': case 'forward': {
        const h = await call(s, 'Page.getNavigationHistory', {}, sess); const i = h.currentIndex + (body.action === 'back' ? -1 : 1);
        if (h.entries[i]) await call(s, 'Page.navigateToHistoryEntry', { entryId: h.entries[i].id }, sess); break;
      }
      case 'newtab': { const r = await call(s, 'Target.createTarget', { url: 'about:blank' }); s.tabs.set(r.targetId, s.tabs.get(r.targetId) || { id: r.targetId, title: '', url: 'about:blank' }); await activate(s, r.targetId); break; }
      case 'select': { const id = String(body.tab || ''); if (s.tabs.has(id) && id !== s.active) await activate(s, id); break; }
      case 'close': { const id = String(body.tab || ''); if (s.tabs.has(id)) await call(s, 'Target.closeTarget', { targetId: id }); break; }
      case 'cancelchooser': { const c = s.chooser; s.chooser = null; if (c) await call(s, 'DOM.setFileInputFiles', { files: [], backendNodeId: c.node }, c.sess).catch(() => {}); break; }
      default: throw httpErr(400, 'ação inválida');
    }
  }

  const idleTimer = setInterval(() => { for (const [slug, s] of sessions) if (!s.viewers.size && !s.holds && Date.now() - s.lastViewer > IDLE_MS) closeGracefully(slug); }, 30_000); idleTimer.unref?.();
  process.on('exit', () => { for (const slug of [...sessions.keys()]) kill(slug); });

  async function route(m, p, body) {
    let mm;
    if ((mm = p.match(/^\/api\/browser\/([a-z0-9-]+)(?:\/(open|stop|input|act))?$/))) {
      const slug = mm[1], what = mm[2] || '';
      if (m === 'GET' && !what) return status(slug);
      if (m === 'POST' && what === 'open') { const s = await start(slug); s.lastViewer = Date.now(); return status(slug); }
      if (m === 'POST' && what === 'stop') { await closeGracefully(slug); return { ok: true }; }
      if (m === 'POST' && what === 'input') {
        const s = sessions.get(slug); if (!s || s.dead) throw httpErr(409, 'navegador fechado'); s.lastViewer = Date.now();
        const evs = Array.isArray(body.events) ? body.events.slice(0, 60) : [];
        for (const ev of evs) await input(s, ev).catch(() => {});
        return { ok: true };
      }
      if (m === 'POST' && what === 'act') { const s = sessions.get(slug); if (!s || s.dead) throw httpErr(409, 'navegador fechado'); s.lastViewer = Date.now(); await act(s, body); return status(slug); }
    }
    return undefined;
  }

  const jsonOut = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); return true; };
  async function receiveUpload(req, res, slug, rawName) {
    const s = sessions.get(slug); if (!s || s.dead) return jsonOut(res, 409, { error: 'navegador fechado' });
    const c = s.chooser; if (!c) return jsonOut(res, 409, { error: 'nenhum site está pedindo arquivo agora' });
    const name = basename(String(rawName || 'arquivo')).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 120) || 'arquivo';
    const len = Number(req.headers['content-length'] || 0); if (len > UP_MAX) return jsonOut(res, 413, { error: 'arquivo maior que 200 MB' });
    await mkdir(upDir(slug), { recursive: true });
    const dest = join(upDir(slug), `${Date.now().toString(36)}-${name}`); let n = 0;
    try {
      await pipeline(req, async function* (src) { for await (const ch of src) { n += ch.length; if (n > UP_MAX) throw new Error('arquivo maior que 200 MB'); yield ch; } }, createWriteStream(dest));
      await call(s, 'DOM.setFileInputFiles', { files: [dest], backendNodeId: c.node }, c.sess);
    } catch (e) { await rm(dest, { force: true }).catch(() => {}); return jsonOut(res, 400, { error: 'não consegui enviar o arquivo: ' + e.message }); }
    s.chooser = null; s.lastViewer = Date.now();
    return jsonOut(res, 200, { ok: true, name });
  }
  async function sendDownload(res, slug, rawName) {
    const name = basename(rawName); const f = join(dlDir(slug), name);
    const st = await stat(f).catch(() => null); if (!st?.isFile()) return jsonOut(res, 404, { error: 'arquivo não encontrado' });
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': st.size, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' });
    createReadStream(f).pipe(res); return true;
  }

  // GET /api/browser/:slug/stream  (vídeo MJPEG: <img src=...>)
  async function raw(req, res, url) {
    let um;
    if (req.method === 'POST' && (um = url.pathname.match(/^\/api\/browser\/([a-z0-9-]+)\/upload$/))) return receiveUpload(req, res, um[1], url.searchParams.get('name'));
    if (req.method === 'GET' && (um = url.pathname.match(/^\/api\/browser\/([a-z0-9-]+)\/download\/(.+)$/))) return sendDownload(res, um[1], decodeURIComponent(um[2]));
    if (req.method !== 'GET') return false; const mm = url.pathname.match(/^\/api\/browser\/([a-z0-9-]+)\/stream$/); if (!mm) return false;
    const s = sessions.get(mm[1]); if (!s || s.dead) throw httpErr(409, 'navegador fechado: abra de novo');
    res.writeHead(200, { 'content-type': 'multipart/x-mixed-replace; boundary=frame', 'cache-control': 'no-store, no-cache', connection: 'keep-alive', 'x-content-type-options': 'nosniff' });
    s.viewers.add(res); s.lastViewer = Date.now();
    if (s.last) pushFrame({ viewers: new Set([res]) }, s.last);
    const done = () => { s.viewers.delete(res); s.lastViewer = Date.now(); }; req.on('close', done); res.on('error', done);
    return true;
  }

  // o bot vai usar o navegador: abre (se preciso), mantém aberto enquanto ele trabalha e devolve o endereço de conexão
  async function hold(slug) {
    const s = await start(slug); s.holds = (s.holds || 0) + 1; let done = false; s.chooser = null;
    setIntercept(s, false); // com o bot no comando, quem trata o seletor de arquivos é ele
    return { cdp: `http://127.0.0.1:${s.port}`, release: () => { if (done) return; done = true; s.holds = Math.max(0, (s.holds || 1) - 1); s.lastViewer = Date.now(); if (!s.holds && !s.dead) { setIntercept(s, true); setDownloads(s).catch(() => {}); } } };
  }

  return { route, raw, hold, stop: (slug) => kill(slug), status, has: (slug) => sessions.has(slug) };
}
