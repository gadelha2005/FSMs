import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatConsole, toJson, toMarkdown } from './report';
import { runAll } from './runner';

const results = runAll();
console.log(formatConsole(results));

if (!process.argv.includes('--no-write')) {
  const dir = fileURLToPath(new URL('../../../docs/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}relatorio-cenarios.md`, toMarkdown(results));
  writeFileSync(`${dir}relatorio-cenarios.json`, toJson(results));
  console.log('\nRelatórios gravados em docs/relatorio-cenarios.md e docs/relatorio-cenarios.json');
}

process.exitCode = results.every((r) => r.passed) ? 0 : 1;