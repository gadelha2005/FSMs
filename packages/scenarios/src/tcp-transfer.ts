import { buildResult, check, type Scenario } from './scenario';
import { buildTcpBench, sentFrames, wire } from './tcp-bench';

const scenario6Info = {
  id: 6,
  protocol: 'TCP',
  title: 'Retransmissão rápida com perda de 1 entre 10 segmentos',
  expected:
    '3 ACKs duplicados disparam a retransmissão antes do timer, e os 10 segmentos chegam em ordem',
} as const;

export const scenario6: Scenario = {
  ...scenario6Info,
  run() {
    const mss = 100;
    const total = 10;
    const bench = buildTcpBench({ msl: 500, mss, windowSegments: 5 });
    const { a, b, channel, scheduler, events } = bench;
    const data = Uint8Array.from({ length: mss * total }, (_, i) => (i * 7 + 3) % 251);
    const lostSeq = 1001 + 2 * mss;

    channel.addRule({ match: { from: 'A', kind: 'data' }, action: 'drop', nth: 3 });
    b.listen();
    scheduler.at(10, () => a.connect('B', 80));
    scheduler.at(200, () => a.send(data));
    scheduler.runAll();
    a.close();
    scheduler.runUntil(scheduler.now + 100);
    b.close();
    scheduler.runAll();

    const sender = a.sender!;
    const transmissions = sender.transmissions;
    const fresh = transmissions.filter((t) => t.kind === 'new');
    const fast = transmissions.filter((t) => t.kind === 'fast');
    const byTimeout = transmissions.filter((t) => t.kind === 'timeout');
    const lost = events.flatMap((e) => (e.kind === 'lost' ? [e.frame] : []));
    const acksForLost = sentFrames(events).filter(
      (f) => f.meta.from === 'B' && f.meta.kind === 'ack' && f.meta.ack === lostSeq,
    );
    const dupAcks = Math.max(0, acksForLost.length - 1);
    const dupTraces = sender.traces.filter((t) => t.kind === 'transition' && t.event === 'ACK_DUP');
    const fastIndex = dupTraces.findIndex(
      (t) => t.kind === 'transition' && t.actions.includes('retransmitBase'),
    );
    const dupEventsBeforeFast = fastIndex + 1;
    const fastTx = fast[0];
    const saved = fastTx?.timeoutAt === undefined ? undefined : fastTx.timeoutAt - fastTx.time;
    const delivered = b.receiver.delivered;
    const inOrder = delivered.length === data.length && delivered.every((v, i) => v === data[i]);
    const fin = sentFrames(events).find(
      (f) => f.meta.from === 'A' && (f.meta.flags as string[]).includes('FIN'),
    );
    const ctx = sender.fsm.context;

    return buildResult(
      scenario6Info,
      [
        check(
          'o canal perdeu exatamente 1 segmento, o 3º de dados de A',
          lost.length === 1 && lost[0]?.meta.seq === lostSeq,
          `${lost.length} perdido(s), seq=${String(lost[0]?.meta.seq)}`,
        ),
        check(
          'A enviou os 10 segmentos pela primeira vez',
          fresh.length === total,
          `${fresh.length}`,
        ),
        check(
          'B enviou pelo menos 3 ACKs duplicados pedindo o segmento perdido',
          dupAcks >= 3,
          `${dupAcks} duplicados com ack=${lostSeq}`,
        ),
        check(
          'a retransmissão ocorre no 3º ACK duplicado',
          fast.length === 1 && fast[0]?.seq === lostSeq && dupEventsBeforeFast === 3,
          `${dupEventsBeforeFast} ACKs duplicados até a retransmissão`,
        ),
        check('nenhuma retransmissão foi causada por timeout', byTimeout.length === 0),
        check(
          'a retransmissão rápida acontece antes do instante em que o timer estouraria',
          saved !== undefined && saved > 0,
          `economia de ${saved} ms virtuais`,
        ),
        check(
          'os 10 segmentos foram entregues em ordem, sem lacunas',
          inOrder,
          `${delivered.length} bytes`,
        ),
        check(
          'A termina com tudo confirmado (IDLE, SendBase = próximo seq)',
          sender.state === 'IDLE' && ctx.sendBase === 1001 + data.length,
          `${sender.state}, SendBase=${ctx.sendBase}`,
        ),
        check(
          'o RTT estimado fica perto do RTT real do canal (40 ms)',
          ctx.rttSamples > 0 && ctx.estRtt >= 40 && ctx.estRtt <= 60,
          `EstimatedRTT=${ctx.estRtt.toFixed(1)}, DevRTT=${ctx.devRtt.toFixed(1)}, TimeoutInterval=${ctx.timeout.toFixed(1)}`,
        ),
        check(
          'depois da transferência o encerramento usa seq = ISS + 1 + dados',
          fin?.meta.seq === 1001 + data.length && a.state === 'CLOSED' && b.state === 'CLOSED',
          `FIN seq=${String(fin?.meta.seq)}, A=${a.state}, B=${b.state}`,
        ),
      ],
      {
        dupAcks,
        fastRetransmitAt: fastTx?.time,
        timeoutWouldFireAt: fastTx?.timeoutAt,
        economiaMs: saved,
        estRtt: ctx.estRtt,
        devRtt: ctx.devRtt,
        timeoutInterval: ctx.timeout,
        wire: wire(events),
      },
    );
  },
};

export const tcpTransferScenarios: Scenario[] = [scenario6];
