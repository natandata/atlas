#!/usr/bin/env node
// Claude falso para a central: simula coordenador (delega), resultados e respostas simples.
// Aceita os dois formatos: json (padrão) e stream-json (com um evento de ferramenta de mentira).
import { basename, join } from 'node:path';
import { writeFileSync, existsSync } from 'node:fs';
const stream = process.argv.includes('stream-json');
let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  const bot = basename(process.cwd());
  const session_id = 'sess-' + bot;
  const emit = (result, is_error = false) => {
    if (stream) {
      console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id }));
      console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'WebSearch', input: { query: 'teste ' + bot } }] } }));
      console.log(JSON.stringify({ type: 'result', subtype: is_error ? 'error' : 'success', result, session_id, is_error }));
    } else console.log(JSON.stringify({ result, session_id, is_error }));
  };
  let result;
  if (input.includes('Resultados dos bots')) result = `FINAL(${(input.match(/^### @/gm) || []).length})`;
  else if (input.includes('Você é o coordenador')) result = 'Vou delegar.\n@pesquisador: buscar dados\n@escritor: redigir texto';
  else if (input.includes('DEMORAR')) { setTimeout(() => emit('demorou'), 30000); return; }
  else if (input.includes('FALHAR')) { emit('falha simulada', true); process.exit(1); }
  else if (input.includes('ECO-NOTAS')) { const mi = process.argv.indexOf('--model'); result = `model=${mi > 0 ? process.argv[mi + 1] : 'padrao'}\n${input}`; }
  else if (input.includes('Pasta de saída') && /\((video|image|audio|file),/.test(input)) {
    const dir = /Pasta de saída[^:]*: (.+)/.exec(input)[1].trim();
    writeFileSync(join(dir, 'final.mp4'), 'fake-video-bytes');
    const att = /\n- (.+?) \((video|image|audio|file),/.exec(input);
    result = `Editei ${att ? 'o anexo (' + (existsSync(att[1]) ? 'lido' : 'sumiu') + ')' : 'sem anexo'}; skill ${input.includes('Skills instaladas') ? 'ativa' : 'nenhuma'}.`;
  } else result = `**${bot}** respondeu`;
  if (input.includes('XMARK')) result += ' [[DRIVE: Teste/Sub]]';
  emit(result);
});
