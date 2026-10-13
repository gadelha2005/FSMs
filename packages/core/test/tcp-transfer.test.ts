import { describe, expect, it } from 'vitest';
import {
  Channel,
  Scheduler,
  TcpHost,
  createRng,
  type ChannelEvent,
  type ChannelParams,
} from '../src';
import tcpDefinition from '../../definitions/tcp-connection.json';
import senderDefinition from '../../definitions/tcp-sender.json';

interface Options {
  seed?: number;
  channel?: Partial<ChannelParams>;
  rto?: number;
  maxRetries?: number;
  mss?: number;
  windowSegments?: number;
  minTimeout?: number;
}

function build(options: Options = {}) {
  const scheduler = new Scheduler();
  const channel = new Channel(scheduler, createRng(options.seed ?? 1), {
    delayMin: 20,
    delayMax: 20,
    ...options.channel,
  });
  const events: ChannelEvent[] = [];
  channel.subscribe((e) => events.push(e));
  const shared = {
    scheduler,
    channel,
    definition: tcpDefinition,
    senderDefinition,
    rto: options.rto,
    maxRetries: options.maxRetries,
    mss: options.mss ?? 100,
    windowSegments: options.windowSegments,
    minTimeout: options.minTimeout,
  };
  const a = new TcpHost({ name: 'A', port: 1234, iss: 1000, ...shared });
  const b = new TcpHost({ name: 'B', port: 80, iss: 5000, ...shared });
  b.listen();
  a.connect('B', 80);
  scheduler.runUntil(100);
  return { scheduler, channel, a, b, events };
}

const pattern = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 13 + 5) % 256);
const same = (x: Uint8Array, y: Uint8Array) =>
  x.length === y.length && x.every((v, i) => v === y[i]);

describe('TcpSender: transferência sem falhas', () => {
  it('send() só é aceito com a conexão estabelecida', () => {
    const scheduler = new Scheduler();
    const channel = new Channel(scheduler, createRng(1));
    const a = new TcpHost({
      name: 'A',
      port: 1,
      scheduler,
      channel,
      definition: tcpDefinition,
      senderDefinition,
    });
    expect(() => a.send(pattern(10))).toThrow(/estabelecida/);
  });

  it('send() sem senderDefinition é recusado com mensagem clara', () => {
    const scheduler = new Scheduler();
    const channel = new Channel(scheduler, createRng(1));
    const a = new TcpHost({ name: 'A', port: 1, scheduler, channel, definition: tcpDefinition });
    expect(() => a.send(pattern(10))).toThrow(/senderDefinition/);
  });

  it('entrega tudo em ordem e volta a IDLE com SendBase = NextSeqNum', () => {
    const { a, b, scheduler } = build();
    const data = pattern(1000);
    a.send(data);
    scheduler.runAll();
    expect(same(b.receiver.delivered, data)).toBe(true);
    expect(a.sender!.state).toBe('IDLE');
    expect(a.sender!.fsm.context.sendBase).toBe(2001);
    expect(a.sender!.fsm.context.nextSeq).toBe(2001);
  });

  it('o último segmento pode ser menor que o MSS', () => {
    const { a, b, scheduler } = build();
    const data = pattern(250);
    a.send(data);
    scheduler.runAll();
    expect(a.sender!.transmissions.map((t) => t.length)).toEqual([100, 100, 50]);
    expect(same(b.receiver.delivered, data)).toBe(true);
  });

  it('a janela fixa limita os segmentos em voo a 5 x MSS', () => {
    const { a, scheduler } = build({ windowSegments: 5 });
    a.send(pattern(1000));
    const first = a.sender!.transmissions.filter((t) => t.time === scheduler.now);
    expect(first.length).toBe(5);
    expect(a.sender!.fsm.context.nextSeq - a.sender!.fsm.context.sendBase).toBe(500);
  });

  it('send() durante uma transferência acrescenta dados à fila', () => {
    const { a, b, scheduler } = build();
    const first = pattern(300);
    const second = pattern(200);
    a.send(first);
    a.send(second);
    scheduler.runAll();
    const all = new Uint8Array([...first, ...second]);
    expect(same(b.receiver.delivered, all)).toBe(true);
  });

  it('a primeira amostra de RTT é o RTT real do canal (40 ms)', () => {
    const { a, scheduler } = build();
    a.send(pattern(100));
    scheduler.runAll();
    const ctx = a.sender!.fsm.context;
    expect(ctx.rttSamples).toBe(1);
    expect(ctx.estRtt).toBe(40);
    expect(ctx.devRtt).toBe(20);
    expect(ctx.timeout).toBe(200);
  });

  it('o FIN depois da transferência usa os números de sequência corretos', () => {
    const { a, b, scheduler, events } = build();
    a.send(pattern(300));
    scheduler.runAll();
    a.close();
    scheduler.runUntil(scheduler.now + 100);
    b.close();
    scheduler.runAll();
    const fin = events.find(
      (e) =>
        e.kind === 'sent' &&
        e.frame.meta.from === 'A' &&
        (e.frame.meta.flags as string[]).includes('FIN'),
    );
    expect(fin?.kind === 'sent' && fin.frame.meta).toMatchObject({ seq: 1301, ack: 5001 });
    expect(a.state).toBe('CLOSED');
    expect(b.state).toBe('CLOSED');
  });
});

describe('TcpSender: perdas', () => {
  it('perda do único segmento: sem ACKs duplicados, só o timeout recupera', () => {
    const { a, b, channel, scheduler } = build();
    channel.addRule({ match: { from: 'A', kind: 'data' }, action: 'drop', nth: 1 });
    a.send(pattern(100));
    scheduler.runAll();
    const tx = a.sender!.transmissions;
    expect(tx.map((t) => t.kind)).toEqual(['new', 'timeout']);
    expect(same(b.receiver.delivered, pattern(100))).toBe(true);
    expect(tx[1]!.time - tx[0]!.time).toBe(1000);
  });

  it('o timeout dobra a cada novo estouro (backoff)', () => {
    const { a, channel, scheduler } = build({ maxRetries: 3 });
    channel.addRule({ match: { from: 'A', kind: 'data' }, action: 'drop', nth: 1, count: 100 });
    a.send(pattern(100));
    scheduler.runAll();
    const times = a.sender!.transmissions.map((t) => t.time);
    expect(times.length).toBe(4);
    expect(times[1]! - times[0]!).toBe(1000);
    expect(times[2]! - times[1]!).toBe(2000);
    expect(times[3]! - times[2]!).toBe(4000);
  });

  it('um ACK novo desfaz o backoff e o timeout volta ao valor base', () => {
    const { a, channel, scheduler } = build();
    channel.addRule({ match: { from: 'A', kind: 'data' }, action: 'drop', nth: 1, count: 2 });
    a.send(pattern(100));
    scheduler.runAll();
    const tx = a.sender!.transmissions;
    expect(tx.map((t) => t.kind)).toEqual(['new', 'timeout', 'timeout']);
    expect(tx[2]!.time - tx[1]!.time).toBe(2000);
    expect(a.sender!.fsm.context.timeout).toBe(1000);
  });

  it('ACK que cobre um segmento retransmitido não gera amostra, mesmo com segmentos novos junto', () => {
    const { a, channel, scheduler } = build();
    channel.addRule({ match: { from: 'A', kind: 'data' }, action: 'drop', nth: 1 });
    a.send(pattern(300));
    scheduler.runAll();
    expect(a.sender!.fsm.context.rttSamples).toBe(0);
  });

  it('depois de maxRetries estouros, o remetente desiste em FAILED', () => {
    const { a, channel, scheduler } = build({ maxRetries: 2 });
    channel.addRule({ match: { from: 'A', kind: 'data' }, action: 'drop', nth: 1, count: 100 });
    a.send(pattern(100));
    scheduler.runAll();
    expect(a.sender!.state).toBe('FAILED');
    expect(() => a.send(pattern(10))).toThrow(/desistiu/);
  });

  it('Karn: segmento retransmitido não gera amostra de RTT', () => {
    const { a, channel, scheduler } = build();
    channel.addRule({ match: { from: 'A', kind: 'data' }, action: 'drop', nth: 1 });
    a.send(pattern(100));
    scheduler.runAll();
    expect(a.sender!.fsm.context.rttSamples).toBe(0);
  });

  it('o ACK cumulativo após o preenchimento do buraco confirma vários segmentos de uma vez', () => {
    const { a, b, channel, scheduler } = build();
    channel.addRule({ match: { from: 'A', kind: 'data' }, action: 'drop', nth: 1 });
    a.send(pattern(300));
    scheduler.runAll();
    const acks = b.receiver.log.map((r) => r.ack);
    expect(Math.max(...acks)).toBe(1301);
    expect(b.receiver.log.some((r) => r.kind === 'out-of-order')).toBe(true);
    expect(same(b.receiver.delivered, pattern(300))).toBe(true);
  });

  it('ACKs duplicados além do terceiro não disparam novas retransmissões rápidas', () => {
    const { a, channel, scheduler } = build({ windowSegments: 10 });
    channel.addRule({ match: { from: 'A', kind: 'data' }, action: 'drop', nth: 1 });
    a.send(pattern(1000));
    scheduler.runAll();
    const fast = a.sender!.transmissions.filter((t) => t.kind === 'fast');
    expect(fast.length).toBe(1);
  });

  it('segmento de dados corrompido é descartado pelo checksum e recuperado', () => {
    const { a, b, channel, scheduler } = build();
    channel.addRule({ match: { from: 'A', kind: 'data' }, action: 'corrupt', nth: 1 });
    a.send(pattern(100));
    scheduler.runAll();
    expect(b.discarded.length).toBe(1);
    expect(same(b.receiver.delivered, pattern(100))).toBe(true);
  });

  it('segmento de dados duplicado pelo canal não duplica a entrega', () => {
    const { a, b, channel, scheduler } = build();
    channel.addRule({ match: { from: 'A', kind: 'data' }, action: 'duplicate', nth: 1 });
    a.send(pattern(300));
    scheduler.runAll();
    expect(same(b.receiver.delivered, pattern(300))).toBe(true);
    expect(b.receiver.log.some((r) => r.kind === 'duplicate')).toBe(true);
  });
});

describe('TcpSender: canal ruim aleatório', () => {
  const noisy: Partial<ChannelParams> = {
    lossProb: 0.2,
    corruptProb: 0.05,
    dupProb: 0.05,
    reorderProb: 0.2,
  };

  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`seed ${seed}: 20% de perda, 5% de corrupção e reordenação ainda entregam tudo em ordem`, () => {
      const { a, b, channel, scheduler } = build({ seed, maxRetries: 12 });
      expect(a.state).toBe('ESTABLISHED');
      channel.setParams(noisy);
      const data = pattern(3000);
      a.send(data);
      scheduler.runAll();
      expect(a.sender!.state).toBe('IDLE');
      expect(same(b.receiver.delivered, data)).toBe(true);
    });
  }

  it('a mesma seed produz exatamente as mesmas transmissões', () => {
    const run = () => {
      const { a, channel, scheduler } = build({ seed: 3, maxRetries: 12 });
      channel.setParams({ lossProb: 0.2 });
      a.send(pattern(2000));
      scheduler.runAll();
      return a.sender!.transmissions;
    };
    expect(run()).toEqual(run());
  });
});