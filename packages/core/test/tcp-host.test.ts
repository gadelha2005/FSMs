import { describe, expect, it } from 'vitest';
import {
  Channel,
  Scheduler,
  TcpHost,
  createRng,
  decodeSegment,
  encodeSegment,
  flagsFromNames,
  type ChannelEvent,
  type SentFrame,
} from '../src';
import tcpDefinition from '../../definitions/tcp-connection.json';

interface Options {
  rto?: number;
  msl?: number;
  maxRetries?: number;
}

function build(options: Options = {}) {
  const scheduler = new Scheduler();
  const channel = new Channel(scheduler, createRng(1), { delayMin: 20, delayMax: 20 });
  const events: ChannelEvent[] = [];
  channel.subscribe((e) => events.push(e));
  const shared = { scheduler, channel, definition: tcpDefinition, ...options };
  const a = new TcpHost({ name: 'A', port: 1234, iss: 1000, ...shared });
  const b = new TcpHost({ name: 'B', port: 80, iss: 5000, ...shared });
  const sent = (): SentFrame[] => events.flatMap((e) => (e.kind === 'sent' ? [e.frame] : []));
  const labels = (): string[] => sent().map((f) => `${f.meta.from}:${String(f.meta.label)}`);
  return { scheduler, channel, a, b, events, sent, labels };
}

describe('TcpHost: handshake', () => {
  it('estados iniciais: CLOSED', () => {
    const { a, b } = build();
    expect(a.state).toBe('CLOSED');
    expect(b.state).toBe('CLOSED');
  });

  it('listen coloca em LISTEN e connect em SYN_SENT, antes de qualquer entrega', () => {
    const { a, b } = build();
    b.listen();
    a.connect('B', 80);
    expect(b.state).toBe('LISTEN');
    expect(a.state).toBe('SYN_SENT');
  });

  it('os segmentos no fio são segmentos TCP reais e válidos', () => {
    const { a, b, scheduler, sent } = build();
    b.listen();
    a.connect('B', 80);
    scheduler.runAll();
    const decoded = sent().map((f) => decodeSegment(f.bytes));
    expect(decoded.every((d) => d.ok)).toBe(true);
    const [syn, synAck, ack] = decoded.map((d) => (d.ok ? d.segment : undefined));
    expect(syn).toMatchObject({ srcPort: 1234, dstPort: 80, seq: 1000, flags: { syn: true } });
    expect(synAck).toMatchObject({ seq: 5000, ack: 1001, flags: { syn: true, ack: true } });
    expect(ack).toMatchObject({ seq: 1001, ack: 5001, flags: { ack: true, syn: false } });
  });

  it('SYN recebido em SYN_RCVD (duplicado) reenvia o SYN+ACK sem mudar de estado', () => {
    const { a, b, channel, scheduler, labels } = build({ rto: 1000 });
    channel.addRule({ match: { from: 'B', flags: ['SYN', 'ACK'] }, action: 'drop', nth: 1 });
    b.listen();
    a.connect('B', 80);
    scheduler.runUntil(1100);
    expect(labels().filter((l) => l.startsWith('B:SYN-ACK')).length).toBeGreaterThanOrEqual(2);
    expect(a.state).toBe('ESTABLISHED');
  });

  it('simultaneous open: os dois conectam ao mesmo tempo e ambos chegam a ESTABLISHED', () => {
    const { a, b, scheduler } = build();
    a.connect('B', 80);
    b.connect('A', 1234);
    scheduler.runAll();
    expect(a.state).toBe('ESTABLISHED');
    expect(b.state).toBe('ESTABLISHED');
    expect(a.stateHistory).toContain('SYN_RCVD');
    expect(b.stateHistory).toContain('SYN_RCVD');
  });
});

describe('TcpHost: retransmissão e desistência', () => {
  it('sem resposta nenhuma, envia o SYN 1 + maxRetries vezes e desiste em CLOSED', () => {
    const { a, channel, scheduler, sent } = build({ rto: 100, maxRetries: 3 });
    channel.addRule({ match: { from: 'A' }, action: 'drop', count: 100 });
    a.connect('B', 80);
    scheduler.runAll();
    expect(sent().filter((f) => f.meta.from === 'A').length).toBe(4);
    expect(a.state).toBe('CLOSED');
    expect(a.stateHistory).toEqual(['CLOSED', 'SYN_SENT', 'CLOSED']);
  });

  it('o lado passivo em SYN_RCVD sem ACK desiste e volta para LISTEN', () => {
    const { a, b, channel, scheduler } = build({ rto: 100, maxRetries: 2 });
    channel.addRule({ match: { from: 'A', flags: ['ACK'] }, action: 'drop', count: 100 });
    b.listen();
    a.connect('B', 80);
    scheduler.runUntil(5000);
    expect(b.stateHistory).toEqual(['CLOSED', 'LISTEN', 'SYN_RCVD', 'LISTEN']);
  });
});

describe('TcpHost: encerramento', () => {
  function established(options: Options = {}) {
    const ctx = build(options);
    ctx.b.listen();
    ctx.a.connect('B', 80);
    ctx.scheduler.runAll();
    return ctx;
  }

  it('TIME_WAIT dura exatamente 2 x MSL', () => {
    const { a, b, scheduler } = established({ msl: 300 });
    a.close();
    scheduler.runUntil(scheduler.now + 40);
    expect(a.state).toBe('FIN_WAIT_2');
    b.close();
    scheduler.runAll();
    const enter = a.traces.find((t) => t.kind === 'transition' && t.to === 'TIME_WAIT');
    const leave = a.traces.find((t) => t.kind === 'transition' && t.from === 'TIME_WAIT');
    expect(enter).toBeDefined();
    expect(leave!.time - enter!.time).toBe(600);
  });

  it('FIN retransmitido em TIME_WAIT é reconfirmado e o temporizador reinicia', () => {
    const { a, b, channel, scheduler } = established({ msl: 300, rto: 100 });
    channel.addRule({ match: { from: 'A', flags: ['ACK'] }, action: 'drop', nth: 1 });
    a.close();
    scheduler.runUntil(scheduler.now + 40);
    b.close();
    scheduler.runAll();
    const twEvents = a.traces.filter(
      (t) => t.kind === 'transition' && t.from === 'TIME_WAIT' && t.to === 'TIME_WAIT',
    );
    const enter = a.traces.find((t) => t.kind === 'transition' && t.to === 'TIME_WAIT');
    const leave = a.traces.find(
      (t) => t.kind === 'transition' && t.from === 'TIME_WAIT' && t.to === 'CLOSED',
    );
    expect(twEvents.length).toBeGreaterThanOrEqual(1);
    expect(leave!.time - enter!.time).toBeGreaterThan(600);
    expect(a.state).toBe('CLOSED');
    expect(b.state).toBe('CLOSED');
  });

  it('close() em CLOSED é rejeitado, sem lançar exceção', () => {
    const { a } = build();
    a.close();
    expect(a.state).toBe('CLOSED');
    expect(a.traces.some((t) => t.kind === 'rejected')).toBe(true);
  });
});

describe('TcpHost: RST e descarte', () => {
  it('RST em ESTABLISHED derruba a conexão para CLOSED', () => {
    const { a, b, channel, scheduler } = build();
    b.listen();
    a.connect('B', 80);
    scheduler.runAll();
    const rst = encodeSegment({
      srcPort: 80,
      dstPort: 1234,
      seq: 5001,
      ack: 1001,
      flags: flagsFromNames(['RST', 'ACK']),
      window: 0,
      payload: new Uint8Array(),
    });
    channel.send({ from: 'B', to: 'A', bytes: rst, meta: { from: 'B', flags: ['RST', 'ACK'] } });
    scheduler.runAll();
    expect(a.state).toBe('CLOSED');
  });

  it('segmento corrompido é descartado em silêncio e o handshake se recupera', () => {
    const { a, b, channel, scheduler } = build({ rto: 200 });
    channel.addRule({ match: { from: 'A', flags: ['SYN'] }, action: 'corrupt', nth: 1 });
    b.listen();
    a.connect('B', 80);
    scheduler.runAll();
    expect(b.discarded.length).toBe(1);
    expect(b.discarded[0]!.reason).toMatch(/checksum|malformed/);
    expect(a.state).toBe('ESTABLISHED');
    expect(b.state).toBe('ESTABLISHED');
  });

  it('segmento para outra porta é descartado com motivo "port"', () => {
    const { a, channel, scheduler } = build();
    const bytes = encodeSegment({
      srcPort: 80,
      dstPort: 9999,
      seq: 1,
      ack: 0,
      flags: flagsFromNames(['SYN']),
      window: 0,
      payload: new Uint8Array(),
    });
    channel.send({ from: 'B', to: 'A', bytes, meta: { from: 'B' } });
    scheduler.runAll();
    expect(a.discarded[0]?.reason).toBe('port');
    expect(a.state).toBe('CLOSED');
  });

  it('sempre com a mesma seed, a trilha é idêntica', () => {
    const run = () => {
      const { a, b, scheduler, labels } = build();
      b.listen();
      a.connect('B', 80);
      scheduler.runAll();
      return labels();
    };
    expect(run()).toEqual(run());
  });
});