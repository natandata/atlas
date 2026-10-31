import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Composio: se COMPOSIO_MCP_URL estiver no .env, todo bot ganha acesso às ferramentas conectadas na sua conta.
let composioFile = null;
function composioConfig() {
  const url = process.env.COMPOSIO_MCP_URL;
  if (!url || !/^https:\/\//.test(url)) return null;
  if (!composioFile) {
    const server = { type: 'http', url };
    const key = process.env.COMPOSIO_API_KEY;
    // chaves ck_… (consumer) vão em x-consumer-api-key; sem isso o Composio cai no login OAuth e fica "pendente de autorização"
    if (key) server.headers = /^ck_/.test(key) ? { 'x-consumer-api-key': key } : { 'x-api-key': key };
    composioFile = join(tmpdir(), 'central-composio-mcp.json');
    writeFileSync(composioFile, JSON.stringify({ mcpServers: { composio: server } }), { mode: 0o600 });
  }
  return composioFile;
}

const SAFE_LIST = /^[A-Za-z0-9_,*.\-]*$/;
const SAFE_MODEL = /^[A-Za-z0-9_.\-]+$/;

// Se onEvent for passado, usa o modo de streaming (stream-json) e chama onEvent a cada evento
// (ferramenta usada, etc.) para mostrar a atividade ao vivo. Sem onEvent, usa o modo json de sempre.
// Navegador (Playwright MCP): perfil persistente por bot, para as contas ficarem logadas entre tarefas.
export const blotatoReady = () => Boolean(process.env.BLOTATO_API_KEY);
function mcpConfigFor({ composio, browserDir, blotato }) {
  const servers = {};
  if (blotato && process.env.BLOTATO_API_KEY) servers.blotato = { type: 'http', url: 'https://mcp.blotato.com/mcp', headers: { 'blotato-api-key': process.env.BLOTATO_API_KEY.trim() } };
  const base = composio === false ? null : composioConfig();
  if (base) { try { Object.assign(servers, JSON.parse(readFileSync(base, 'utf8')).mcpServers); } catch { /* sem composio */ } }
  if (browserDir) {
    const args = ['@playwright/mcp@0.0.83', '--user-data-dir', browserDir];
    if (process.env.BROWSER_HEADLESS === '1') args.push('--headless');
    servers.playwright = process.platform === 'win32' ? { command: 'cmd', args: ['/c', 'npx', '-y', ...args] } : { command: 'npx', args: ['-y', ...args] };
  }
  if (!Object.keys(servers).length) return null;
  const f = join(tmpdir(), `central-mcp-${createHash('sha1').update(JSON.stringify(servers)).digest('hex').slice(0, 12)}.json`);
  writeFileSync(f, JSON.stringify({ mcpServers: servers }), { mode: 0o600 });
  return f;
}

// Para o processo e tudo o que ele abriu (no Windows o claude roda dentro de um cmd.exe)
export function killTree(child) {
  child.stopped = true;
  try {
    if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    else child.kill('SIGTERM');
  } catch { /* já encerrou */ }
}

function runOnce({ prompt, sessionId, cwd, model, allowedTools, timeoutMs, command, onEvent, advanced, commands, composio, blotato, chrome, browserDir, register }) {
  return new Promise((resolve, reject) => {
    if (model && !SAFE_MODEL.test(model)) return reject(new Error('CLAUDE_MODEL inválido'));
    if (allowedTools && !SAFE_LIST.test(allowedTools)) return reject(new Error('ALLOWED_TOOLS inválido'));

    const stream = typeof onEvent === 'function';

    // dontAsk: tudo que não está em --allowedTools é negado (nada de pedir permissão).
    // strict-mcp-config: ignora os servidores MCP da sua conta (mais rápido e mais seguro).
    const args = ['-p', '--output-format', stream ? 'stream-json' : 'json', '--permission-mode', 'dontAsk', '--strict-mcp-config'];
    if (stream) args.push('--verbose');
    // Bots comuns: sem Bash/Write/Edit. Bots "avançados" (ex.: editor de vídeo) ganham só o que o settings.json do bot libera.
    args.push('--disallowedTools', advanced ? 'NotebookEdit' : 'Bash,Write,Edit,NotebookEdit');
    if (model) args.push('--model', model);
    if (chrome) args.push('--chrome'); // Claude in Chrome: usa o Chrome real do Natan, com as contas já logadas
    const mcp = mcpConfigFor({ composio, browserDir, blotato });
    if (mcp) args.push('--mcp-config', mcp);
    const allow = [allowedTools, mcp && (composio !== false && composioConfig()) ? 'mcp__composio' : '', mcp && blotato && process.env.BLOTATO_API_KEY ? 'mcp__blotato' : '', chrome ? 'mcp__claude-in-chrome' : ''].filter(Boolean).join(',');
    // bots avançados: as regras também vão direto na linha de comando (não dependem só do .claude/settings.json)
    const extra = advanced ? ['Skill', 'Write', 'Edit', ...(commands || []).filter((c) => /^[a-z0-9_.-]{1,30}$/.test(c)).map((c) => `Bash(${c}:*)`)] : [];
    const allowAll = [allow, ...extra].filter(Boolean).join(',');
    if (allowAll) args.push('--allowedTools', allowAll);
    if (sessionId) args.push('--resume', sessionId);

    // No Windows o "claude" costuma ser um .cmd, que precisa de shell.
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === 'win32',
      windowsHide: true,
    });
    try { if (register) register(child); } catch { /* registro nunca derruba a resposta */ }

    let out = '';
    let err = '';
    let buf = '';
    let final = null;
    const handleLine = (line) => {
      line = line.trim();
      if (!line) return;
      let ev;
      try { ev = JSON.parse(line); } catch { return; }
      if (ev && ev.type === 'result') final = ev;
      else { try { onEvent(ev); } catch { /* a atividade nunca pode derrubar a resposta */ } }
    };
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('tempo esgotado'));
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      out += d;
      if (!stream) return;
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { handleLine(buf.slice(0, i)); buf = buf.slice(i + 1); }
    });
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(e.code === 'ENOENT' ? 'comando "claude" não encontrado' : e.message));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (child.stopped) return reject(Object.assign(new Error('parado pelo usuário'), { stopped: true }));
      let data = null;
      if (stream) {
        handleLine(buf);
        data = final;
      } else {
        try {
          data = JSON.parse(out);
        } catch {
          /* saída não era JSON */
        }
      }
      if (data && typeof data.result === 'string' && !data.is_error) {
        return resolve({ text: data.result.trim(), sessionId: data.session_id || sessionId });
      }
      const detail = (data && data.result) || err.trim() || out.trim() || `código ${code}`;
      reject(new Error(String(detail).slice(0, 300)));
    });

    child.stdin.on('error', () => {});
    child.stdin.end(prompt);
  });
}

// Pergunta ao Claude Code. Se a sessão salva não existir mais, tenta de novo do zero.
// Se o modo de streaming falhar por incompatibilidade da versão, tenta de novo sem ele.
export async function askClaude(opts) {
  const base = { command: process.env.CLAUDE_BIN || 'claude', timeoutMs: 180000, ...opts };
  const attempt = async (o) => {
    try {
      return await runOnce(o);
    } catch (e) {
      if (o.onEvent && /stream-json|verbose|unknown option|invalid|código \d+/i.test(e.message)) {
        return runOnce({ ...o, onEvent: undefined });
      }
      throw e;
    }
  };
  try {
    return await attempt(base);
  } catch (e) {
    if (base.sessionId && e.message !== 'tempo esgotado' && !e.stopped) {
      return attempt({ ...base, sessionId: undefined });
    }
    throw e;
  }
}
