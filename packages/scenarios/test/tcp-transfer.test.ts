import { describe, expect, it } from 'vitest';
import { tcpTransferScenarios } from '../src';

describe('cenários TCP de transferência', () => {
  for (const scenario of tcpTransferScenarios) {
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
      it('é reproduzível', () => {
        expect(scenario.run().metrics).toEqual(result.metrics);
      });
    });
  }
});
