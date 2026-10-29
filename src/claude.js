import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Composio: se COMPOSIO_MCP_URL estiver no .env, todo bot ganha acesso às ferramentas conectadas na sua conta.
let composioFile = null;
function composioConfig() {
  const url = process.env.COMPOSIO_MCP_URL;
  if (!url || !/^https:\/\//.test(url)) return null;
  if (!composioFile) {
    const server = { type: 'http', url };
    if (process.env.COMPOSIO_API_KEY) server.headers = { 'x-api-key': process.env.COMPOSIO_API_KEY };
    composioFile = join(tmpdir(), 'central-composio-mcp.json');
    writeFileSync(composioFile, JSON.stringify({ mcpServers: { composio: server } }), { mode: 0o600 });
  }
  return composioFile;
}

const SAFE_LIST = /^[A-Za-z0-9_,*.\-]*$/;
const SAFE_MODEL = /^[A-Za-z0-9_.\-]+$/;

// Se onEvent for passado, usa o modo de streaming (stream-json) e chama onEvent a cada evento
// (ferramenta usada, etc.) para mostrar a atividade ao vivo. Sem onEvent, usa o modo json de sempre.
function runOnce({ prompt, sessionId, cwd, model, allowedTools, timeoutMs, command, onEvent, advanced, composio }) {
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
    const mcp = composio === false ? null : composioConfig();
    if (mcp) args.push('--mcp-config', mcp);
    const allow = [allowedTools, mcp ? 'mcp__composio' : ''].filter(Boolean).join(',');
    if (allow) args.push('--allowedTools', allow);
    if (sessionId) args.push('--resume', sessionId);

    // No Windows o "claude" costuma ser um .cmd, que precisa de shell.
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === 'win32',
      windowsHide: true,
    });

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
    if (base.sessionId && e.message !== 'tempo esgotado') {
      return attempt({ ...base, sessionId: undefined });
    }
    throw e;
  }
}
