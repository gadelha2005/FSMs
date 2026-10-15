import { describe, expect, it } from 'vitest';
import {
  allScenarios,
  formatConsole,
  runAll,
  runScenario,
  toJson,
  toMarkdown,
  type Scenario,
} from '../src';

describe('executor de cenários', () => {
  it('registra os 10 cenários obrigatórios, na ordem de 1 a 10', () => {
    expect(allScenarios.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('os 10 cenários passam', () => {
    const results = runAll();
    expect(results.filter((r) => !r.passed).map((r) => r.id)).toEqual([]);
  });

  it('um cenário que lança exceção vira reprovado, sem derrubar os outros', () => {
    const broken: Scenario = {
      id: 99,
      protocol: 'TCP',
      title: 'Quebrado',
      expected: 'nada',
      run() {
        throw new Error('falha de propósito');
      },
    };
    const results = runAll([broken, allScenarios[0]!]);
    expect(results[0]!.passed).toBe(false);
    expect(results[0]!.checks[0]!.detail).toBe('falha de propósito');
    expect(results[1]!.passed).toBe(true);
    expect(runScenario(broken).passed).toBe(false);
  });
});

describe('relatórios', () => {
  const results = runAll();

  it('a tabela do console lista cada cenário com o resultado', () => {
    const text = formatConsole(results);
    expect(text.split('\n').filter((l) => l.includes('APROVADO')).length).toBe(10);
    expect(text).toContain('10 de 10 cenários aprovados');
    expect(text.split('\n').every((l) => l === l.trimEnd())).toBe(true);
  });

  it('o console mostra o motivo quando um cenário reprova', () => {
    const failing = runAll([
      {
        id: 50,
        protocol: 'UDP',
        title: 'Falha',
        expected: 'x',
        run: () => {
          throw new Error('quebrou aqui');
        },
      },
    ]);
    const text = formatConsole(failing);
    expect(text).toContain('REPROVADO');
    expect(text).toContain('quebrou aqui');
    expect(text).toContain('0 de 1 cenários aprovados');
  });

  it('o markdown tem a tabela-resumo, uma seção por cenário e a comparação do cenário 10', () => {
    const md = toMarkdown(results);
    expect(md).toContain('# Relatório dos cenários');
    expect((md.match(/^## Cenário /gm) ?? []).length).toBe(10);
    expect(md).toContain('| UDP |');
    expect(md).toContain('| TCP |');
    expect(md).toContain('Média de 20 seeds');
  });

  it('o markdown e o json são reproduzíveis', () => {
    expect(toMarkdown(runAll())).toBe(toMarkdown(results));
    expect(toJson(runAll())).toBe(toJson(results));
  });

  it('o json é válido e traz os 10 resultados', () => {
    const parsed = JSON.parse(toJson(results)) as { id: number; passed: boolean }[];
    expect(parsed.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(parsed.every((r) => r.passed)).toBe(true);
  });
});
