import type { ChannelEvent } from '@fsms/core';
import { buildResult, check, type Scenario } from './scenario';
import { buildTcpBench, sentFrames, wire, type TcpBench } from './tcp-bench';

const history = (states: string[]): string => states.join(' > ');

function finalReport(bench: TcpBench, events: ChannelEvent[]) {
  return {
    historyA: bench.a.stateHistory,
    historyB: bench.b.stateHistory,
    wire: wire(events),
    endTime: bench.scheduler.now,
  };
}

const scenario1Info = {
  id: 1,
  protocol: 'TCP',
  title: 'Handshake de três vias',
  expected: 'Ambos chegam a ESTABLISHED com seq/ack consistentes e 3 segmentos',
} as const;

export const scenario1: Scenario = {
  ...scenario1Info,
  run() {
    const bench = buildTcpBench();
    const { a, b, scheduler, events } = bench;
    b.listen();
    scheduler.at(10, () => a.connect('B', 80));
    scheduler.runAll();

    const frames = sentFrames(events);
    const [syn, synAck, ack] = frames;

    return buildResult(
      scenario1Info,
      [
        check(
          'A passa por CLOSED > SYN_SENT > ESTABLISHED',
          history(a.stateHistory) === 'CLOSED > SYN_SENT > ESTABLISHED',
          history(a.stateHistory),
        ),
        check(
          'B passa por CLOSED > LISTEN > SYN_RCVD > ESTABLISHED',
          history(b.stateHistory) === 'CLOSED > LISTEN > SYN_RCVD > ESTABLISHED',
          history(b.stateHistory),
        ),
        check('exatamente 3 segmentos trafegam', frames.length === 3, `${frames.length}`),
        check(
          '1º segmento é SYN de A com seq = ISS de A',
          syn?.meta.from === 'A' &&
            JSON.stringify(syn.meta.flags) === '["SYN"]' &&
            syn.meta.seq === 1000,
        ),
        check(
          '2º segmento é SYN+ACK de B com ack = ISS de A + 1',
          synAck?.meta.from === 'B' &&
            JSON.stringify(synAck.meta.flags) === '["SYN","ACK"]' &&
            synAck.meta.seq === 5000 &&
            synAck.meta.ack === 1001,
        ),
        check(
          '3º segmento é ACK de A com seq = ISS de A + 1 e ack = ISS de B + 1',
          ack?.meta.from === 'A' &&
            JSON.stringify(ack.meta.flags) === '["ACK"]' &&
            ack.meta.seq === 1001 &&
            ack.meta.ack === 5001,
        ),
        check('nenhum segmento foi retransmitido', frames.length === 3),
        check('nenhum segmento foi descartado', a.discarded.length + b.discarded.length === 0),
      ],
      finalReport(bench, events),
    );
  },
};

const scenario2Info = {
  id: 2,
  protocol: 'TCP',
  title: 'Perda do SYN',
  expected: 'A retransmite o SYN após o RTO e o handshake completa',
} as const;

export const scenario2: Scenario = {
  ...scenario2Info,
  run() {
    const rto = 1000;
    const bench = buildTcpBench({ rto });
    const { a, b, channel, scheduler, events } = bench;
    channel.addRule({ match: { from: 'A', flags: ['SYN'] }, action: 'drop', nth: 1 });
    b.listen();
    const connectAt = 10;
    scheduler.at(connectAt, () => a.connect('B', 80));
    scheduler.runAll();

    const syns = sentFrames(events).filter(
      (f) => f.meta.from === 'A' && f.meta.flags?.toString() === 'SYN',
    );
    const lost = events.filter((e) => e.kind === 'lost');
    const retxAt = events.find((e) => e.kind === 'sent' && e.frame.id === syns[1]?.id)?.time;

    return buildResult(
      scenario2Info,
      [
        check('o canal perdeu exatamente 1 segmento', lost.length === 1, `${lost.length}`),
        check('A enviou o SYN duas vezes', syns.length === 2, `${syns.length}`),
        check(
          'a retransmissão usa o mesmo número de sequência',
          syns[0]?.meta.seq === syns[1]?.meta.seq,
        ),
        check(
          'a retransmissão ocorre exatamente um RTO depois',
          retxAt === connectAt + rto,
          `${retxAt}`,
        ),
        check('A termina em ESTABLISHED', a.state === 'ESTABLISHED', a.state),
        check('B termina em ESTABLISHED', b.state === 'ESTABLISHED', b.state),
        check(
          'A registrou um TIMEOUT_RETX',
          a.traces.filter((t) => t.kind === 'transition' && t.event === 'TIMEOUT_RETX').length ===
            1,
        ),
      ],
      finalReport(bench, events),
    );
  },
};

const scenario3Info = {
  id: 3,
  protocol: 'TCP',
  title: 'Perda do SYN+ACK',
  expected: 'A retransmite o SYN, B reenvia o SYN+ACK e o handshake completa',
} as const;

export const scenario3: Scenario = {
  ...scenario3Info,
  run() {
    const bench = buildTcpBench({ rto: 1000, rtoB: 1500 });
    const { a, b, channel, scheduler, events } = bench;
    channel.addRule({ match: { from: 'B', flags: ['SYN', 'ACK'] }, action: 'drop', nth: 1 });
    b.listen();
    scheduler.at(10, () => a.connect('B', 80));
    scheduler.runAll();

    const frames = sentFrames(events);
    const syns = frames.filter((f) => f.meta.label?.toString().startsWith('SYN seq'));
    const synAcks = frames.filter((f) => f.meta.label?.toString().startsWith('SYN-ACK'));
    const lost = events.filter((e) => e.kind === 'lost');
    const lostFrame = lost[0]?.kind === 'lost' ? lost[0].frame : undefined;

    return buildResult(
      scenario3Info,
      [
        check(
          'o segmento perdido é o primeiro SYN+ACK de B',
          lost.length === 1 && lostFrame?.meta.from === 'B',
          `${lost.length}`,
        ),
        check('A enviou o SYN duas vezes', syns.length === 2, `${syns.length}`),
        check('B enviou o SYN+ACK duas vezes', synAcks.length === 2, `${synAcks.length}`),
        check(
          'B passou por SYN_RCVD ao receber o SYN duplicado sem mudar de estado',
          b.traces.some(
            (t) => t.kind === 'transition' && t.from === 'SYN_RCVD' && t.to === 'SYN_RCVD',
          ),
        ),
        check('A termina em ESTABLISHED', a.state === 'ESTABLISHED', a.state),
        check('B termina em ESTABLISHED', b.state === 'ESTABLISHED', b.state),
        check(
          'o SYN+ACK reenviado tem os mesmos seq e ack do original',
          synAcks[0]?.meta.seq === synAcks[1]?.meta.seq &&
            synAcks[0]?.meta.ack === synAcks[1]?.meta.ack,
        ),
      ],
      finalReport(bench, events),
    );
  },
};

const scenario4Info = {
  id: 4,
  protocol: 'TCP',
  title: 'Encerramento normal',
  expected: 'Passa por FIN_WAIT_1, FIN_WAIT_2, TIME_WAIT e CLOSE_WAIT, LAST_ACK',
} as const;

export const scenario4: Scenario = {
  ...scenario4Info,
  run() {
    const msl = 500;
    const bench = buildTcpBench({ msl });
    const { a, b, scheduler, events } = bench;
    b.listen();
    scheduler.at(10, () => a.connect('B', 80));
    scheduler.at(200, () => a.close());
    scheduler.at(500, () => b.close());
    scheduler.runAll();

    const enteredTimeWait = a.traces.find((t) => t.kind === 'transition' && t.to === 'TIME_WAIT');
    const leftTimeWait = a.traces.find((t) => t.kind === 'transition' && t.from === 'TIME_WAIT');
    const twDuration =
      enteredTimeWait && leftTimeWait ? leftTimeWait.time - enteredTimeWait.time : undefined;

    return buildResult(
      scenario4Info,
      [
        check(
          'A: ESTABLISHED > FIN_WAIT_1 > FIN_WAIT_2 > TIME_WAIT > CLOSED',
          history(a.stateHistory.slice(2)) ===
            'ESTABLISHED > FIN_WAIT_1 > FIN_WAIT_2 > TIME_WAIT > CLOSED',
          history(a.stateHistory),
        ),
        check(
          'B: ESTABLISHED > CLOSE_WAIT > LAST_ACK > CLOSED',
          history(b.stateHistory.slice(3)) === 'ESTABLISHED > CLOSE_WAIT > LAST_ACK > CLOSED',
          history(b.stateHistory),
        ),
        check(
          'TIME_WAIT dura exatamente 2 x MSL',
          twDuration === 2 * msl,
          `${twDuration} ms (2 x ${msl})`,
        ),
        check(
          'o encerramento usa 4 segmentos (FIN, ACK, FIN, ACK)',
          sentFrames(events).length === 7,
          wire(events).slice(3).join(' | '),
        ),
        check('ambos terminam em CLOSED', a.state === 'CLOSED' && b.state === 'CLOSED'),
      ],
      finalReport(bench, events),
    );
  },
};

const scenario5Info = {
  id: 5,
  protocol: 'TCP',
  title: 'Encerramento simultâneo',
  expected: 'Ambos passam por FIN_WAIT_1, CLOSING e TIME_WAIT',
} as const;

export const scenario5: Scenario = {
  ...scenario5Info,
  run() {
    const bench = buildTcpBench({ msl: 500 });
    const { a, b, scheduler, events } = bench;
    b.listen();
    scheduler.at(10, () => a.connect('B', 80));
    scheduler.at(200, () => {
      a.close();
      b.close();
    });
    scheduler.runAll();

    const expected = 'ESTABLISHED > FIN_WAIT_1 > CLOSING > TIME_WAIT > CLOSED';
    return buildResult(
      scenario5Info,
      [
        check(
          'A: ESTABLISHED > FIN_WAIT_1 > CLOSING > TIME_WAIT > CLOSED',
          history(a.stateHistory.slice(2)) === expected,
          history(a.stateHistory),
        ),
        check(
          'B: ESTABLISHED > FIN_WAIT_1 > CLOSING > TIME_WAIT > CLOSED',
          history(b.stateHistory.slice(3)) === expected,
          history(b.stateHistory),
        ),
        check(
          'cada lado enviou seu FIN sem esperar o do outro',
          sentFrames(events).filter((f) => (f.meta.flags as string[]).includes('FIN')).length === 2,
        ),
        check('ambos terminam em CLOSED', a.state === 'CLOSED' && b.state === 'CLOSED'),
      ],
      finalReport(bench, events),
    );
  },
};

const scenario7Info = {
  id: 7,
  protocol: 'TCP',
  title: 'Conexão a uma porta fechada',
  expected: 'B responde RST+ACK e A volta a CLOSED sem retransmitir',
} as const;

export const scenario7: Scenario = {
  ...scenario7Info,
  run() {
    const bench = buildTcpBench();
    const { a, b, scheduler, events } = bench;
    scheduler.at(10, () => a.connect('B', 80));
    scheduler.runAll();

    const frames = sentFrames(events);
    const rst = frames[1];

    return buildResult(
      scenario7Info,
      [
        check(
          'A passa por CLOSED > SYN_SENT > CLOSED',
          history(a.stateHistory) === 'CLOSED > SYN_SENT > CLOSED',
          history(a.stateHistory),
        ),
        check(
          'B permanece em CLOSED',
          history(b.stateHistory) === 'CLOSED',
          history(b.stateHistory),
        ),
        check('apenas 2 segmentos trafegam (SYN e RST)', frames.length === 2, `${frames.length}`),
        check(
          'a resposta é RST+ACK com ack = ISS de A + 1',
          rst?.meta.from === 'B' &&
            JSON.stringify(rst.meta.flags) === '["RST","ACK"]' &&
            rst.meta.ack === 1001,
        ),
        check('o SYN não é retransmitido', frames.filter((f) => f.meta.from === 'A').length === 1),
      ],
      finalReport(bench, events),
    );
  },
};

export const tcpConnectionScenarios: Scenario[] = [
  scenario1,
  scenario2,
  scenario3,
  scenario4,
  scenario5,
  scenario7,
];