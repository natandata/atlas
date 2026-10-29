#!/usr/bin/env node
// Claude falso para testes: registra os argumentos e devolve um JSON no formato do Claude Code.
import { appendFileSync } from 'node:fs';
let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  appendFileSync(process.env.FAKE_LOG, JSON.stringify(process.argv.slice(2)) + '\n');
  if (input.includes('FALHAR')) { console.log(JSON.stringify({ is_error: true, result: 'falha simulada' })); process.exit(1); }
  const resumed = process.argv.includes('--resume');
  const long = input.includes('LONGO') ? '\n' + 'x'.repeat(5000) : '';
  console.log(JSON.stringify({ result: `eco: ${input}${resumed ? ' (retomada)' : ''}${long}`, session_id: 'sess-1', is_error: false }));
});
