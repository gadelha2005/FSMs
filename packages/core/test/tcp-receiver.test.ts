import { describe, expect, it } from 'vitest';
import { TcpReceiver } from '../src';

const bytes = (...values: number[]) => Uint8Array.from(values);

function build(rcvNxt = 1000) {
  const connection = { rcvNxt };
  const state = { now: 0 };
  const receiver = new TcpReceiver(connection, () => state.now);
  return { connection, receiver, state };
}

describe('TcpReceiver: ACK cumulativo', () => {
  it('segmento na ordem é entregue e o ACK avança', () => {
    const { connection, receiver } = build();
    const r = receiver.onData(1000, bytes(1, 2, 3));
    expect(r).toMatchObject({ kind: 'in-order', ack: 1003 });
    expect(connection.rcvNxt).toBe(1003);
    expect([...receiver.delivered]).toEqual([1, 2, 3]);
  });

  it('segmento fora de ordem fica no buffer e o ACK repete o último em ordem', () => {
    const { connection, receiver } = build();
    receiver.onData(1000, bytes(1, 2));
    const r = receiver.onData(1004, bytes(5, 6));
    expect(r).toMatchObject({ kind: 'out-of-order', ack: 1002 });
    expect(connection.rcvNxt).toBe(1002);
    expect(receiver.buffered).toBe(1);
    expect([...receiver.delivered]).toEqual([1, 2]);
  });

  it('quando o buraco é preenchido, o buffer é esvaziado e o ACK salta', () => {
    const { connection, receiver } = build();
    receiver.onData(1000, bytes(1, 2));
    receiver.onData(1004, bytes(5, 6));
    receiver.onData(1006, bytes(7, 8));
    const r = receiver.onData(1002, bytes(3, 4));
    expect(r).toMatchObject({ kind: 'in-order', ack: 1008 });
    expect(connection.rcvNxt).toBe(1008);
    expect(receiver.buffered).toBe(0);
    expect([...receiver.delivered]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('segmento repetido é marcado como duplicado e não é entregue de novo', () => {
    const { receiver } = build();
    receiver.onData(1000, bytes(1, 2));
    const r = receiver.onData(1000, bytes(1, 2));
    expect(r).toMatchObject({ kind: 'duplicate', ack: 1002 });
    expect([...receiver.delivered]).toEqual([1, 2]);
  });

  it('o mesmo segmento fora de ordem duas vezes ocupa uma só posição no buffer', () => {
    const { receiver } = build();
    receiver.onData(1004, bytes(5, 6));
    receiver.onData(1004, bytes(5, 6));
    expect(receiver.buffered).toBe(1);
  });

  it('o log registra tempo, seq, tamanho, tipo e ack de cada chegada', () => {
    const { receiver, state } = build();
    receiver.onData(1000, bytes(1));
    state.now = 1;
    receiver.onData(1005, bytes(9));
    expect(receiver.log).toEqual([
      { time: 0, seq: 1000, length: 1, kind: 'in-order', ack: 1001 },
      { time: 1, seq: 1005, length: 1, kind: 'out-of-order', ack: 1001 },
    ]);
  });

  it('deliveries registra quando cada bloco foi entregue à aplicação', () => {
    const { receiver, state } = build();
    receiver.onData(1002, bytes(3, 4));
    state.now = 5;
    receiver.onData(1000, bytes(1, 2));
    expect(receiver.deliveries).toEqual([
      { time: 5, seq: 1000, length: 2 },
      { time: 5, seq: 1002, length: 2 },
    ]);
  });
});