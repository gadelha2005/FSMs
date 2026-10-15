import type { ComparisonMetrics, Summary, Trial } from './compare';
import type { ScenarioResult } from './scenario';

const pad = (text: string, width: number) => text + ' '.repeat(Math.max(0, width - text.length));
const verdict = (passed: boolean) => (passed ? 'APROVADO' : 'REPROVADO');
const passedCount = (r: ScenarioResult) => r.checks.filter((c) => c.passed).length;
const fixed = (value: number, digits = 1) => value.toFixed(digits);

export function formatConsole(results: ScenarioResult[]): string {
  const rows = results.map((r) => [
    String(r.id),
    r.protocol,
    r.title,
    `${passedCount(r)}/${r.checks.length}`,
    verdict(r.passed),
  ]);
  const header = ['#', 'Protocolo', 'Cenário', 'Checks', 'Resultado'];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]!.length)));
  const line = (cells: string[]) =>
    cells
      .map((c, i) => pad(c, widths[i]!))
      .join('  ')
      .trimEnd();

  const out = [line(header), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(line)];

  for (const r of results.filter((x) => !x.passed)) {
    out.push('', `Cenário ${r.id} reprovado:`);
    for (const c of r.checks.filter((x) => !x.passed)) {
      out.push(`  x ${c.description}${c.detail ? ` (${c.detail})` : ''}`);
    }
  }

  const approved = results.filter((r) => r.passed).length;
  out.push('', `${approved} de ${results.length} cenários aprovados`);
  return out.join('\n');
}

function trialRow(label: string, t: Trial): string {
  const r = t.report;
  return `| ${label} | ${r.delivered}/${r.expected} | ${r.lost} | ${r.duplicates} | ${r.outOfOrder} | ${r.inOrder && r.lost === 0 ? 'sim' : 'não'} | ${fixed(t.totalMs, 0)} | ${t.framesOnWire} | ${t.bytesOnWire} |`;
}

function summaryRow(label: string, s: Summary): string {
  return `| ${label} | ${fixed(s.deliveredPct)}% | ${fixed(s.lostAvg)} | ${fixed(s.duplicatesAvg, 2)} | ${fixed(s.outOfOrderAvg, 2)} | ${fixed(s.inOrderPct, 0)}% | ${fixed(s.totalMsAvg, 0)} | ${fixed(s.framesAvg, 0)} | ${fixed(s.bytesAvg, 0)} |`;
}

function comparisonSection(metrics: ComparisonMetrics): string[] {
  const header = [
    '| Protocolo | Entregues | Perdidos | Duplicados | Fora de ordem | Tudo em ordem | Tempo total (ms) | Quadros no canal | Bytes no canal |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  const headerAvg = [
    '| Protocolo | Entregues | Perdidos | Duplicados | Fora de ordem | Tudo em ordem | Tempo total (ms) | Quadros no canal | Bytes no canal |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  return [
    '',
    `Seed principal: ${metrics.seed}. Mesma carga (50 mensagens de 100 bytes) e mesmo canal para os dois protocolos.`,
    '',
    ...header,
    trialRow('UDP', metrics.udp),
    trialRow('TCP', metrics.tcp),
    '',
    `Média de ${metrics.udpSummary.trials} seeds:`,
    '',
    ...headerAvg,
    summaryRow('UDP', metrics.udpSummary),
    summaryRow('TCP', metrics.tcpSummary),
  ];
}

export function toMarkdown(results: ScenarioResult[]): string {
  const out = [
    '# Relatório dos cenários',
    '',
    '| # | Protocolo | Cenário | Checks | Resultado |',
    '|---|---|---|---|---|',
  ];
  for (const r of results) {
    out.push(
      `| ${r.id} | ${r.protocol} | ${r.title} | ${passedCount(r)}/${r.checks.length} | ${verdict(r.passed)} |`,
    );
  }
  const approved = results.filter((r) => r.passed).length;
  out.push('', `**${approved} de ${results.length} cenários aprovados.**`);

  for (const r of results) {
    out.push(
      '',
      `## Cenário ${r.id}: ${r.title}`,
      '',
      `Protocolo: ${r.protocol}. Resultado: **${verdict(r.passed)}**.`,
      '',
      `Esperado: ${r.expected}.`,
      '',
    );
    for (const c of r.checks) {
      out.push(`- [${c.passed ? 'x' : ' '}] ${c.description}${c.detail ? ` (${c.detail})` : ''}`);
    }
    if (r.id === 10) out.push(...comparisonSection(r.metrics as unknown as ComparisonMetrics));
  }
  return out.join('\n') + '\n';
}

export function toJson(results: ScenarioResult[]): string {
  return JSON.stringify(results, null, 2) + '\n';
}
