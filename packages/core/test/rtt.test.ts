import { describe, expect, it } from 'vitest';
import { RTT_ALPHA, RTT_BETA, backoffTimeout, updateRtt, type RttState } from '../src';

const fresh: RttState = { estRtt: 0, devRtt: 0, timeout: 1000, rttSamples: 0 };

describe('estimativa de RTT', () => {
  it('as constantes são as do livro: alpha 0,125 e beta 0,25', () => {
    expect(RTT_ALPHA).toBe(0.125);
    expect(RTT_BETA).toBe(0.25);
  });

  it('a primeira amostra inicializa: Est = amostra, Dev = amostra/2, Timeout = Est + 4 Dev', () => {
    const s = updateRtt(fresh, 100, 0);
    expect(s).toEqual({ estRtt: 100, devRtt: 50, timeout: 300, rttSamples: 1 });
  });

  it('amostras seguintes usam as médias móveis 0,875/0,125 e 0,75/0,25', () => {
    const first = updateRtt(fresh, 100, 0);
    const second = updateRtt(first, 200, 0);
    expect(second.devRtt).toBeCloseTo(0.75 * 50 + 0.25 * 100, 10);
    expect(second.estRtt).toBeCloseTo(0.875 * 100 + 0.125 * 200, 10);
    expect(second.timeout).toBeCloseTo(second.estRtt + 4 * second.devRtt, 10);
    expect(second.rttSamples).toBe(2);
  });

  it('o DevRTT usa o EstimatedRTT anterior à atualização', () => {
    const first = updateRtt(fresh, 100, 0);
    const second = updateRtt(first, 140, 0);
    expect(second.devRtt).toBeCloseTo(0.75 * 50 + 0.25 * Math.abs(140 - 100), 10);
  });

  it('amostras constantes fazem o DevRTT cair e o Timeout se aproximar do RTT', () => {
    let s = updateRtt(fresh, 40, 0);
    for (let i = 0; i < 60; i++) s = updateRtt(s, 40, 0);
    expect(s.estRtt).toBeCloseTo(40, 6);
    expect(s.devRtt).toBeLessThan(0.001);
    expect(s.timeout).toBeCloseTo(40, 2);
  });

  it('o Timeout nunca fica abaixo do mínimo', () => {
    const s = updateRtt(updateRtt(fresh, 10, 200), 10, 200);
    expect(s.timeout).toBe(200);
  });

  it('não muda o estado recebido e recusa amostra negativa', () => {
    const before = { ...fresh };
    updateRtt(fresh, 50, 0);
    expect(fresh).toEqual(before);
    expect(() => updateRtt(fresh, -1, 0)).toThrow(/negativa/);
  });

  it('backoff dobra o timeout até o teto', () => {
    expect(backoffTimeout(1000, 60000)).toBe(2000);
    expect(backoffTimeout(40000, 60000)).toBe(60000);
    expect(backoffTimeout(60000, 60000)).toBe(60000);
  });
});
