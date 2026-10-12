import { describe, expect, it } from 'vitest';
import {
  Channel,
  Scheduler,
  createRng,
  type ChannelEvent,
  type ChannelParams,
  type Frame,
  type SentFrame,
} from '../src';

interface Setup {
  scheduler: Scheduler;
  channel: Channel;
  events: ChannelEvent[];
  received: { time: number; frame: SentFrame }[];
}

function setup(seed = 1, params: Partial<ChannelParams> = {}): Setup {
  const scheduler = new Scheduler();
  const channel = new Channel(scheduler, createRng(seed), params);
  const events: ChannelEvent[] = [];
  const received: Setup['received'] = [];
  channel.subscribe((e) => events.push(e));
  channel.attach('B', (frame) => received.push({ time: scheduler.now, frame }));
  channel.attach('A', () => {});
  return { scheduler, channel, events, received };
}

function frame(n: number, meta: Record<string, unknown> = {}): Frame {
  return { from: 'A', to: 'B', bytes: new Uint8Array([n, n, n, n]), meta: { n, ...meta } };
}

function kinds(events: ChannelEvent[]): string[] {
  return events.map((e) => e.kind);
}

function bitDiff(a: Uint8Array, b: Uint8Array): number {
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    let x = a[i]! ^ b[i]!;
    while (x) {
      diff += x & 1;
      x >>= 1;
    }
  }
  return diff;
}

function fates(count: number, seed: number, configure?: (c: Channel) => void): string[] {
  const { scheduler, channel, events } = setup(seed, { lossProb: 0.3, dupProb: 0.2 });
  configure?.(channel);
  for (let n = 1; n <= count; n++) channel.send(frame(n));
  scheduler.runAll();
  const byN = new Map<number, string[]>();
  for (const e of events) {
    const n = e.frame.meta.n as number;
    byN.set(n, [...(byN.get(n) ?? []), e.kind]);
  }
  return [...byN.entries()].sort((a, b) => a[0] - b[0]).map(([n, k]) => `${n}:${k.join(',')}`);
}

describe('Channel: entrega e atraso', () => {
  it('entrega ao destino certo depois do atraso configurado', () => {
    const { scheduler, channel, received } = setup(1, { delayMin: 40, delayMax: 40 });
    channel.send(frame(1));
    expect(received).toHaveLength(0);
    scheduler.runAll();
    expect(received).toHaveLength(1);
    expect(received[0]!.time).toBe(40);
  });

  it('o atraso fica sempre entre delayMin e delayMax', () => {
    const { scheduler, channel, received } = setup(3, { delayMin: 20, delayMax: 80 });
    for (let n = 0; n < 200; n++) channel.send(frame(n));
    scheduler.runAll();
    expect(received).toHaveLength(200);
    for (const r of received) {
      expect(r.time).toBeGreaterThanOrEqual(20);
      expect(r.time).toBeLessThanOrEqual(80);
    }
  });

  it('emite sent e delivered, nessa ordem', () => {
    const { scheduler, channel, events } = setup();
    channel.send(frame(1));
    scheduler.runAll();
    expect(kinds(events)).toEqual(['sent', 'delivered']);
  });

  it('lança erro ao enviar para um destino que não foi conectado', () => {
    const { channel } = setup();
    expect(() => channel.send({ ...frame(1), to: 'Z' })).toThrow(/"Z" não está conectado/);
  });
});

describe('Channel: perda', () => {
  it('lossProb=1 perde tudo e lossProb=0 não perde nada', () => {
    const all = setup(1, { lossProb: 1 });
    const none = setup(1, { lossProb: 0 });
    for (let n = 0; n < 50; n++) {
      all.channel.send(frame(n));
      none.channel.send(frame(n));
    }
    all.scheduler.runAll();
    none.scheduler.runAll();
    expect(all.received).toHaveLength(0);
    expect(none.received).toHaveLength(50);
  });

  it('lossProb=0.3 perde perto de 30% em 2000 envios', () => {
    const { scheduler, channel, received } = setup(7, { lossProb: 0.3 });
    for (let n = 0; n < 2000; n++) channel.send(frame(n));
    scheduler.runAll();
    const lossRate = 1 - received.length / 2000;
    expect(lossRate).toBeGreaterThan(0.27);
    expect(lossRate).toBeLessThan(0.33);
  });

  it('um frame perdido gera sent e lost (motivo random) e nunca delivered', () => {
    const { scheduler, channel, events } = setup(1, { lossProb: 1 });
    channel.send(frame(1));
    scheduler.runAll();
    expect(kinds(events)).toEqual(['sent', 'lost']);
    expect(events[1]).toMatchObject({ kind: 'lost', reason: 'random' });
  });

  it('dropNext descarta exatamente o próximo frame e depois volta ao normal', () => {
    const { scheduler, channel, events, received } = setup();
    channel.dropNext();
    expect(channel.pendingManualDrops).toBe(1);
    channel.send(frame(1));
    channel.send(frame(2));
    scheduler.runAll();
    expect(received.map((r) => r.frame.meta.n)).toEqual([2]);
    expect(events.find((e) => e.kind === 'lost')).toMatchObject({ reason: 'manual' });
    expect(channel.pendingManualDrops).toBe(0);
  });

  it('dropNext(3) descarta três frames seguidos', () => {
    const { scheduler, channel, received } = setup();
    channel.dropNext(3);
    for (let n = 1; n <= 5; n++) channel.send(frame(n));
    scheduler.runAll();
    expect(received.map((r) => r.frame.meta.n)).toEqual([4, 5]);
  });
});

describe('Channel: regras determinísticas', () => {
  it('descarta só o 1º SYN; a retransmissão passa', () => {
    const { scheduler, channel, events, received } = setup();
    channel.addRule({ match: { flags: ['SYN'] }, action: 'drop', nth: 1 });
    channel.send(frame(1, { flags: ['SYN'] }));
    scheduler.after(1000, () => channel.send(frame(2, { flags: ['SYN'] })));
    scheduler.runAll();
    expect(received.map((r) => r.frame.meta.n)).toEqual([2]);
    expect(events.find((e) => e.kind === 'lost')).toMatchObject({ reason: 'rule' });
  });

  it('só considera frames cujo meta bate com a regra', () => {
    const { scheduler, channel, received } = setup();
    channel.addRule({ match: { seq: 3000 }, action: 'drop' });
    channel.send(frame(1, { seq: 1000 }));
    channel.send(frame(2, { seq: 3000 }));
    channel.send(frame(3, { seq: 4000 }));
    scheduler.runAll();
    expect(received.map((r) => r.frame.meta.n)).toEqual([1, 3]);
  });

  it('nth e count escolhem quais ocorrências descartar', () => {
    const { scheduler, channel, received } = setup();
    channel.addRule({ match: { kind: 'data' }, action: 'drop', nth: 2, count: 2 });
    for (let n = 1; n <= 5; n++) channel.send(frame(n, { kind: 'data' }));
    scheduler.runAll();
    expect(received.map((r) => r.frame.meta.n)).toEqual([1, 4, 5]);
  });

  it('a ação corrupt entrega o frame com exatamente 1 bit trocado, sem alterar o original', () => {
    const { scheduler, channel, events, received } = setup();
    channel.addRule({ match: { n: 1 }, action: 'corrupt' });
    const original = frame(1);
    const copy = original.bytes.slice();
    channel.send(original);
    scheduler.runAll();
    expect(original.bytes).toEqual(copy);
    expect(bitDiff(received[0]!.frame.bytes, copy)).toBe(1);
    expect(received[0]!.frame.corrupted).toBe(true);
    expect(kinds(events)).toEqual(['sent', 'corrupted', 'delivered']);
  });

  it('a ação duplicate entrega duas cópias', () => {
    const { scheduler, channel, received } = setup();
    channel.addRule({ match: { n: 1 }, action: 'duplicate' });
    channel.send(frame(1));
    scheduler.runAll();
    expect(received).toHaveLength(2);
  });

  it('clearRules remove as regras', () => {
    const { scheduler, channel, received } = setup();
    channel.addRule({ match: {}, action: 'drop', count: 100 });
    channel.clearRules();
    channel.send(frame(1));
    scheduler.runAll();
    expect(received).toHaveLength(1);
  });
});

describe('Channel: corrupção, duplicação e reordenação', () => {
  it('corruptProb=1 troca exatamente 1 bit em cada frame', () => {
    const { scheduler, channel, received } = setup(5, { corruptProb: 1 });
    for (let n = 1; n <= 100; n++) channel.send(frame(n));
    scheduler.runAll();
    expect(received).toHaveLength(100);
    for (const r of received) {
      const n = r.frame.meta.n as number;
      expect(bitDiff(r.frame.bytes, new Uint8Array([n, n, n, n]))).toBe(1);
    }
  });

  it('dupProb=1 entrega duas vezes, com ids diferentes e copyOf apontando o original', () => {
    const { scheduler, channel, received } = setup(1, { dupProb: 1 });
    channel.send(frame(1));
    scheduler.runAll();
    expect(received).toHaveLength(2);
    const ids = received.map((r) => r.frame.id);
    expect(new Set(ids).size).toBe(2);
    const copy = received.find((r) => r.frame.copyOf !== undefined)!;
    expect(copy.frame.copyOf).toBe(Math.min(...ids));
    expect(copy.frame.bytes).toEqual(
      received.find((r) => r.frame.copyOf === undefined)!.frame.bytes,
    );
  });

  it('reorderProb=1 faz um frame chegar depois de outro enviado mais tarde', () => {
    const { scheduler, channel, received } = setup(1, { delayMin: 10, delayMax: 10 });
    channel.setParams({ reorderProb: 1 });
    channel.send(frame(1));
    channel.setParams({ reorderProb: 0 });
    channel.send(frame(2));
    scheduler.runAll();
    expect(received.map((r) => r.frame.meta.n)).toEqual([2, 1]);
  });

  it('sem reordenação e com atraso fixo, a ordem de chegada é a de envio', () => {
    const { scheduler, channel, received } = setup(1, { delayMin: 25, delayMax: 25 });
    for (let n = 1; n <= 20; n++) channel.send(frame(n));
    scheduler.runAll();
    expect(received.map((r) => r.frame.meta.n)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });
});

describe('Channel: determinismo', () => {
  it('mesma seed gera exatamente o mesmo registro de eventos', () => {
    const run = (seed: number) => {
      const { scheduler, channel, events } = setup(seed, {
        lossProb: 0.2,
        corruptProb: 0.2,
        dupProb: 0.2,
        reorderProb: 0.2,
        delayMin: 5,
        delayMax: 60,
      });
      for (let n = 1; n <= 100; n++) channel.send(frame(n));
      scheduler.runAll();
      return JSON.stringify(events, (_, v) => (v instanceof Uint8Array ? Array.from(v) : v));
    };
    expect(run(99)).toBe(run(99));
    expect(run(99)).not.toBe(run(100));
  });

  it('adicionar uma regra não muda o destino dos outros frames (sorteios fixos por frame)', () => {
    const without = fates(200, 5);
    const withRule = fates(200, 5, (c) => c.addRule({ match: { n: 3 }, action: 'drop' }));
    const differing = without
      .map((line, i) => (line === withRule[i] ? null : i + 1))
      .filter((n) => n !== null);
    expect(differing.every((n) => n === 3)).toBe(true);
  });
});

describe('Channel: parâmetros', () => {
  it('setParams mescla parcialmente e currentParams devolve uma cópia', () => {
    const { channel } = setup();
    channel.setParams({ lossProb: 0.5 });
    const params = channel.currentParams;
    expect(params.lossProb).toBe(0.5);
    expect(params.delayMin).toBe(10);
    params.lossProb = 0;
    expect(channel.currentParams.lossProb).toBe(0.5);
  });

  it('rejeita probabilidades fora de 0..1 e atrasos incoerentes', () => {
    const { channel } = setup();
    expect(() => channel.setParams({ lossProb: 1.5 })).toThrow(RangeError);
    expect(() => channel.setParams({ dupProb: -0.1 })).toThrow(RangeError);
    expect(() => channel.setParams({ delayMin: 50, delayMax: 10 })).toThrow(RangeError);
    expect(() => channel.setParams({ delayMin: -1 })).toThrow(RangeError);
    expect(() => new Channel(new Scheduler(), createRng(1), { lossProb: 2 })).toThrow(RangeError);
  });

  it('subscribe devolve uma função que cancela a assinatura', () => {
    const { scheduler, channel } = setup();
    let count = 0;
    const off = channel.subscribe(() => count++);
    channel.send(frame(1));
    off();
    channel.send(frame(2));
    scheduler.runAll();
    expect(count).toBe(1);
  });
});
