import { describe, expect, it } from 'vitest';
import { DEFAULT_COMPARE_CHANNEL, buildPair, computeAverages, runStats } from '../src/compare';

const run = (seed: number, messages: number, channel = DEFAULT_COMPARE_CHANNEL) => {
  const pair = buildPair({ seed, messages, channel });
  pair.udp.advance(120_000);
  pair.tcp.advance(120_000);
  return { pair, udp: runStats(pair.udp, messages), tcp: runStats(pair.tcp, messages) };
};

describe('comparação lado a lado', () => {
  it('canal sem defeitos: os dois entregam tudo', () => {
    const { pair, udp, tcp } = run(1, 20, {
      ...DEFAULT_COMPARE_CHANNEL,
      lossProb: 0,
      corruptProb: 0,
      dupProb: 0,
      reorderProb: 0,
    });
    expect(pair.tcpConnected).toBe(true);
    expect(udp.delivered).toBe(20);
    expect(tcp.delivered).toBe(20);
    expect(udp.lostFrames + tcp.lostFrames).toBe(0);
    expect(udp.finished && tcp.finished).toBe(true);
  });

  it('canal ruidoso: o TCP entrega tudo e o UDP não promete nada', () => {
    const results = [1, 2, 3, 4, 5].map((seed) => run(seed, 20));
    for (const r of results) {
      expect(r.tcp.delivered).toBe(20);
      expect(r.tcp.finished).toBe(true);
      expect(r.udp.framesOnWire).toBe(20);
    }
    expect(results.some((r) => r.udp.delivered < 20)).toBe(true);
    expect(results.some((r) => r.tcp.retransmissions > 0)).toBe(true);
  });

  it('o TCP gasta mais quadros que o UDP (handshake, ACKs, retransmissões)', () => {
    const { udp, tcp } = run(7, 20);
    expect(tcp.framesOnWire).toBeGreaterThan(udp.framesOnWire);
  });

  it('é determinístico: mesma seed, mesmas estatísticas', () => {
    expect(run(9, 20).tcp).toEqual(run(9, 20).tcp);
    expect(run(9, 20).udp).toEqual(run(9, 20).udp);
  });

  it('as estatísticas acompanham a simulação enquanto ela roda', () => {
    const pair = buildPair({ seed: 2, messages: 20, channel: DEFAULT_COMPARE_CHANNEL });
    const before = runStats(pair.udp, 20);
    expect(before.delivered).toBe(0);
    expect(before.finished).toBe(false);
    pair.udp.advance(60);
    expect(runStats(pair.udp, 20).framesOnWire).toBeGreaterThan(before.framesOnWire);
  });
});

describe('médias de 20 seeds', () => {
  it('reproduz os números do cenário 10', () => {
    const { udp, tcp } = computeAverages();
    expect(udp.trials).toBe(20);
    expect(tcp.trials).toBe(20);
    expect(tcp.deliveredPct).toBe(100);
    expect(udp.deliveredPct).toBeLessThan(100);
    expect(tcp.totalMsAvg).toBeGreaterThan(udp.totalMsAvg);
    expect(tcp.framesAvg).toBeGreaterThan(udp.framesAvg);
  });
});
