import { describe, expect, it } from 'vitest';
import {
  COMPARISON_SEEDS,
  MESSAGES,
  NOISY_CHANNEL,
  runTcpTrial,
  runUdpTrial,
  scenario10,
  summarize,
  type Trial,
} from '../src';

describe('cenário 10: UDP × TCP', () => {
  const result = scenario10.run();
  for (const c of result.checks) {
    it(c.description, () => {
      expect(c.passed, c.detail).toBe(true);
    });
  }
  it('resultado geral: aprovado', () => {
    expect(result.passed).toBe(true);
  });
  it('é reproduzível', () => {
    expect(scenario10.run().metrics).toEqual(result.metrics);
  });
});

describe('tentativas de comparação', () => {
  it('as duas tentativas usam o mesmo canal e a mesma carga', () => {
    expect(NOISY_CHANNEL.lossProb).toBeGreaterThan(0);
    const udp = runUdpTrial(3);
    const tcp = runTcpTrial(3);
    expect(udp.report.expected).toBe(MESSAGES);
    expect(tcp.report.expected).toBe(MESSAGES);
  });

  it('em canal perfeito os dois entregam tudo em ordem', () => {
    const perfect = { delayMin: 20, delayMax: 20 };
    for (const t of [runUdpTrial(1, perfect), runTcpTrial(1, perfect)]) {
      expect(t.report.delivered).toBe(MESSAGES);
      expect(t.report.inOrder).toBe(true);
      expect(t.report.duplicates).toBe(0);
    }
  });

  it('em canal perfeito o TCP usa mais quadros que o UDP só por causa dos ACKs e do handshake', () => {
    const perfect = { delayMin: 20, delayMax: 20 };
    const udp = runUdpTrial(1, perfect);
    const tcp = runTcpTrial(1, perfect);
    expect(udp.framesOnWire).toBe(MESSAGES);
    expect(tcp.framesOnWire).toBe(MESSAGES + MESSAGES + 3);
  });

  it('o TCP entrega tudo em ordem em todas as seeds de comparação', () => {
    for (const seed of COMPARISON_SEEDS) {
      const t = runTcpTrial(seed);
      expect(t.completed, `seed ${seed}`).toBe(true);
      expect(t.report.delivered, `seed ${seed}`).toBe(MESSAGES);
      expect(t.report.inOrder, `seed ${seed}`).toBe(true);
    }
  });

  it('a mesma seed reproduz a mesma tentativa', () => {
    expect(runUdpTrial(7)).toEqual(runUdpTrial(7));
    expect(runTcpTrial(7)).toEqual(runTcpTrial(7));
  });

  it('summarize calcula médias e porcentagens', () => {
    const base: Trial = {
      protocol: 'UDP',
      seed: 1,
      completed: true,
      report: { expected: 10, delivered: 8, lost: 2, duplicates: 1, outOfOrder: 3, inOrder: false },
      totalMs: 100,
      transferMs: 100,
      framesOnWire: 10,
      bytesOnWire: 1000,
    };
    const perfect: Trial = {
      ...base,
      report: { expected: 10, delivered: 10, lost: 0, duplicates: 0, outOfOrder: 0, inOrder: true },
      totalMs: 300,
      framesOnWire: 30,
    };
    const s = summarize([base, perfect]);
    expect(s.deliveredPct).toBe(90);
    expect(s.lostAvg).toBe(1);
    expect(s.duplicatesAvg).toBe(0.5);
    expect(s.outOfOrderAvg).toBe(1.5);
    expect(s.inOrderPct).toBe(50);
    expect(s.totalMsAvg).toBe(200);
    expect(s.framesAvg).toBe(20);
  });
});
