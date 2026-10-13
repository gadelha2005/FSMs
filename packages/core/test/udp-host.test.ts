import { describe, expect, it } from 'vitest';
import {
  Channel,
  Scheduler,
  UdpHost,
  analyzeDelivery,
  createRng,
  packId,
  unpackId,
  type ChannelParams,
  type FsmTrace,
} from '../src';
import udpDefinition from '../../definitions/udp.json';

function build(seed = 1, params: Partial<ChannelParams> = {}) {
  const scheduler = new Scheduler();
  const channel = new Channel(scheduler, createRng(seed), params);
  const a = new UdpHost({ name: 'A', port: 5000, scheduler, channel, definition: udpDefinition });
  const b = new UdpHost({ name: 'B', port: 53, scheduler, channel, definition: udpDefinition });
  return { scheduler, channel, a, b };
}

const text = (s: string) => new TextEncoder().encode(s);

describe('UdpHost: FSM de estado único', () => {
  it('o estado é sempre READY, com as 3 respostas ao RCV_DATAGRAM', () => {
    const { a } = build();
    expect(a.fsm.definition.states).toEqual(['READY']);
    expect(a.fsm.state).toBe('READY');
  });

  it('envio e recepção ficam no mesmo estado e contam nos contadores', () => {
    const { scheduler, a, b } = build();
    a.send('B', 53, text('oi'));
    scheduler.runAll();
    expect(a.fsm.state).toBe('READY');
    expect(b.fsm.state).toBe('READY');
    expect(a.fsm.context.sent).toBe(1);
    expect(b.fsm.context.delivered).toBe(1);
  });

  it('registra transições com tempo virtual', () => {
    const { scheduler, a, b } = build(1, { delayMin: 30, delayMax: 30 });
    const traces: FsmTrace[] = [];
    b.fsm.subscribe((t) => traces.push(t));
    a.send('B', 53, text('oi'));
    scheduler.runAll();
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ kind: 'transition', time: 30, from: 'READY', to: 'READY' });
  });
});

describe('UdpHost: entrega e descarte', () => {
  it('entrega o payload à aplicação com portas e origem', () => {
    const { scheduler, a, b } = build();
    a.send('B', 53, text('ola'));
    scheduler.runAll();
    expect(b.received).toHaveLength(1);
    expect(b.received[0]).toMatchObject({ from: 'A', srcPort: 5000, dstPort: 53 });
    expect(new TextDecoder().decode(b.received[0]!.payload)).toBe('ola');
  });

  it('descarta datagrama corrompido sem avisar o remetente', () => {
    const { scheduler, channel, a, b } = build();
    const sentByB: unknown[] = [];
    channel.subscribe((e) => e.kind === 'sent' && e.frame.from === 'B' && sentByB.push(e));
    channel.addRule({ match: { n: 1 }, action: 'corrupt' });
    a.send('B', 53, text('dados importantes'), { n: 1 });
    scheduler.runAll();
    expect(b.received).toHaveLength(0);
    expect(b.discarded).toHaveLength(1);
    expect(['checksum', 'length']).toContain(b.discarded[0]!.reason);
    expect(b.fsm.context.discarded).toBe(1);
    expect(sentByB).toHaveLength(0);
    expect(a.received).toHaveLength(0);
  });

  it('descarta em silêncio datagrama para uma porta sem aplicação', () => {
    const { scheduler, channel, a, b } = build();
    let replies = 0;
    channel.subscribe((e) => e.kind === 'sent' && e.frame.from === 'B' && replies++);
    a.send('B', 9999, text('ninguém ouve'));
    scheduler.runAll();
    expect(b.received).toHaveLength(0);
    expect(b.discarded).toEqual([expect.objectContaining({ reason: 'port', from: 'A' })]);
    expect(replies).toBe(0);
  });

  it('o meta do frame descreve o datagrama para a GUI', () => {
    const { channel, a } = build();
    const metas: Record<string, unknown>[] = [];
    channel.subscribe((e) => e.kind === 'sent' && metas.push(e.frame.meta));
    a.send('B', 53, text('abc'), { n: 7 });
    expect(metas[0]).toMatchObject({
      protocol: 'UDP',
      srcPort: 5000,
      dstPort: 53,
      length: 11,
      n: 7,
    });
  });
});

describe('UdpHost: perda, duplicação e reordenação chegam à aplicação sem correção', () => {
  const ids = Array.from({ length: 20 }, (_, i) => i + 1);

  function run(params: Partial<ChannelParams>, seed = 3) {
    const { scheduler, a, b } = build(seed, params);
    ids.forEach((id, i) => scheduler.after(i * 5, () => a.send('B', 53, packId(id))));
    scheduler.runAll();
    return analyzeDelivery(
      ids,
      b.received.map((r) => unpackId(r.payload)),
    );
  }

  it('perda: os perdidos nunca aparecem', () => {
    const report = run({ lossProb: 0.4 });
    expect(report.lost).toBeGreaterThan(0);
    expect(report.delivered + report.lost).toBe(20);
  });

  it('duplicação: a aplicação recebe o mesmo datagrama duas vezes', () => {
    const report = run({ dupProb: 1 });
    expect(report.duplicates).toBe(20);
    expect(report.delivered).toBe(20);
  });

  it('reordenação: a aplicação recebe fora de ordem', () => {
    const report = run({ reorderProb: 0.5, delayMin: 5, delayMax: 40 });
    expect(report.inOrder).toBe(false);
    expect(report.delivered).toBe(20);
  });
});
