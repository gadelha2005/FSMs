import { describe, expect, it } from 'vitest';
import { scenario8, scenario9, udpScenarios } from '../src';

describe('cenários UDP', () => {
  for (const scenario of udpScenarios) {
    describe(`Cenário ${scenario.id}: ${scenario.title}`, () => {
      const result = scenario.run();
      for (const c of result.checks) {
        it(c.description, () => {
          expect(c.passed, c.detail).toBe(true);
        });
      }
      it('resultado geral: aprovado', () => {
        expect(result.passed).toBe(true);
      });
    });
  }

  it('o cenário 8 é reproduzível com a mesma seed', () => {
    expect(scenario8.run().metrics).toEqual(scenario8.run().metrics);
  });

  it('o cenário 9 também', () => {
    expect(scenario9.run().metrics).toEqual(scenario9.run().metrics);
  });
});
