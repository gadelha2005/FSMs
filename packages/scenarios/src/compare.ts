import {
  analyzeDelivery,
  packId,
  unpackId,
  type ChannelEvent,
  type ChannelParams,
  type DeliveryReport,
} from '@fsms/core';
import { buildResult, check, type Scenario } from './scenario';
import { buildTcpBench } from './tcp-bench';
import { buildUdpBench } from './udp';

export const NOISY_CHANNEL: Partial<ChannelParams> = {
  lossProb: 0.1,
  corruptProb: 0.02,
  dupProb: 0.03,
  reorderProb: 0.15,
  delayMin: 20,
  delayMax: 40,
};

export const MESSAGES = 50;
export const MESSAGE_SIZE = 100;
export const SEND_INTERVAL = 10;
export const COMPARISON_SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

export interface Trial {
  protocol: 'UDP' | 'TCP';
  seed: number;
  completed: boolean;
  report: DeliveryReport;
  totalMs: number;
  transferMs: number;
  framesOnWire: number;
  bytesOnWire: number;
}

function message(id: number): Uint8Array {
  const bytes = new Uint8Array(MESSAGE_SIZE);
  bytes.set(packId(id));
  for (let i = 4; i < MESSAGE_SIZE; i++) bytes[i] = (id * 31 + i) % 256;
  return bytes;
}

function wireTotals(events: ChannelEvent[]): { frames: number; bytes: number } {
  let frames = 0;
  let bytes = 0;
  for (const e of events) {
    if (e.kind === 'sent') {
      frames++;
      bytes += e.frame.bytes.length;
    }
  }
  return { frames, bytes };
}

export function runUdpTrial(seed: number, params: Partial<ChannelParams> = NOISY_CHANNEL): Trial {
  const ids = Array.from({ length: MESSAGES }, (_, i) => i + 1);
  const { scheduler, a, b, events } = buildUdpBench(seed, params);
  ids.forEach((id, i) =>
    scheduler.at(i * SEND_INTERVAL, () => a.send('B', 53, message(id), { id })),
  );
  scheduler.runAll();

  const received = b.received.map((r) => unpackId(r.payload));
  const lastDelivery = b.received.reduce((t, r) => Math.max(t, r.time), 0);
  const wire = wireTotals(events);

  return {
    protocol: 'UDP',
    seed,
    completed: true,
    report: analyzeDelivery(ids, received),
    totalMs: lastDelivery,
    transferMs: lastDelivery,
    framesOnWire: wire.frames,
    bytesOnWire: wire.bytes,
  };
}

export function runTcpTrial(seed: number, params: Partial<ChannelParams> = NOISY_CHANNEL): Trial {
  const ids = Array.from({ length: MESSAGES }, (_, i) => i + 1);
  const { scheduler, a, b, events } = buildTcpBench({ seed, channel: params, maxRetries: 12 });

  b.listen();
  a.connect('B', 80);
  let guard = 0;
  while (a.state !== 'ESTABLISHED' && guard++ < 100_000) {
    if (!scheduler.step()) break;
  }

  const connectedAt = scheduler.now;
  const established = a.state === 'ESTABLISHED';
  if (established) {
    const data = new Uint8Array(MESSAGES * MESSAGE_SIZE);
    ids.forEach((id, i) => data.set(message(id), i * MESSAGE_SIZE));
    a.send(data);
  }
  scheduler.runAll();

  const delivered = b.receiver.delivered;
  const received: number[] = [];
  for (let offset = 0; offset + MESSAGE_SIZE <= delivered.length; offset += MESSAGE_SIZE) {
    received.push(unpackId(delivered.subarray(offset, offset + MESSAGE_SIZE)));
  }
  const lastDelivery = b.receiver.deliveries.reduce((t, d) => Math.max(t, d.time), 0);
  const wire = wireTotals(events);

  return {
    protocol: 'TCP',
    seed,
    completed: established && a.sender?.state === 'IDLE',
    report: analyzeDelivery(ids, received),
    totalMs: lastDelivery,
    transferMs: Math.max(0, lastDelivery - connectedAt),
    framesOnWire: wire.frames,
    bytesOnWire: wire.bytes,
  };
}

export interface Summary {
  trials: number;
  deliveredPct: number;
  lostAvg: number;
  duplicatesAvg: number;
  outOfOrderAvg: number;
  inOrderPct: number;
  totalMsAvg: number;
  framesAvg: number;
  bytesAvg: number;
}

export function summarize(trials: Trial[]): Summary {
  const n = trials.length;
  const mean = (pick: (t: Trial) => number) => trials.reduce((sum, t) => sum + pick(t), 0) / n;
  return {
    trials: n,
    deliveredPct: mean((t) => (100 * t.report.delivered) / t.report.expected),
    lostAvg: mean((t) => t.report.lost),
    duplicatesAvg: mean((t) => t.report.duplicates),
    outOfOrderAvg: mean((t) => t.report.outOfOrder),
    inOrderPct: mean((t) => (t.report.inOrder && t.report.lost === 0 ? 100 : 0)),
    totalMsAvg: mean((t) => t.totalMs),
    framesAvg: mean((t) => t.framesOnWire),
    bytesAvg: mean((t) => t.bytesOnWire),
  };
}

const scenario10Info = {
  id: 10,
  protocol: 'UDP vs TCP',
  title: 'Mesma carga, mesmo canal ruidoso',
  expected: 'Relatório comparando entregues, perdidos, duplicados, em ordem e tempo total',
} as const;

export const MAIN_SEED = 10;

export interface ComparisonMetrics {
  seed: number;
  udp: Trial;
  tcp: Trial;
  udpSummary: Summary;
  tcpSummary: Summary;
}

export const scenario10: Scenario = {
  ...scenario10Info,
  run() {
    const udp = runUdpTrial(MAIN_SEED);
    const tcp = runTcpTrial(MAIN_SEED);
    const udpAll = COMPARISON_SEEDS.map((seed) => runUdpTrial(seed));
    const tcpAll = COMPARISON_SEEDS.map((seed) => runTcpTrial(seed));
    const udpSummary = summarize(udpAll);
    const tcpSummary = summarize(tcpAll);

    return buildResult(
      scenario10Info,
      [
        check(
          'TCP entregou 100% das mensagens, em ordem e sem duplicados (seed principal)',
          tcp.completed &&
            tcp.report.delivered === MESSAGES &&
            tcp.report.inOrder &&
            tcp.report.duplicates === 0,
          `${tcp.report.delivered}/${MESSAGES}, duplicados ${tcp.report.duplicates}`,
        ),
        check(
          'TCP entregou 100% em ordem nas 20 seeds',
          tcpAll.every(
            (t) =>
              t.completed &&
              t.report.delivered === MESSAGES &&
              t.report.inOrder &&
              t.report.duplicates === 0,
          ),
          `${tcpSummary.inOrderPct}% das seeds`,
        ),
        check(
          'UDP perdeu mensagens na seed principal',
          udp.report.lost > 0,
          `${udp.report.lost} perdidas de ${MESSAGES}`,
        ),
        check(
          'UDP entrega menos de 100% das mensagens em média nas 20 seeds',
          udpSummary.deliveredPct < 100,
          `${udpSummary.deliveredPct.toFixed(1)}% entregues em média`,
        ),
        check(
          'o UDP entregou duplicados e fora de ordem ao menos uma vez nas 20 seeds',
          udpAll.some((t) => t.report.duplicates > 0) &&
            udpAll.some((t) => t.report.outOfOrder > 0),
          `duplicados em média ${udpSummary.duplicatesAvg.toFixed(2)}, fora de ordem ${udpSummary.outOfOrderAvg.toFixed(2)}`,
        ),
        check(
          'o preço da confiabilidade: o TCP usa mais quadros no canal do que o UDP',
          tcpSummary.framesAvg > udpSummary.framesAvg,
          `TCP ${tcpSummary.framesAvg.toFixed(0)} contra UDP ${udpSummary.framesAvg.toFixed(0)} quadros em média`,
        ),
        check(
          'o preço do tempo: o TCP leva mais tempo para entregar tudo',
          tcpSummary.totalMsAvg > udpSummary.totalMsAvg,
          `TCP ${tcpSummary.totalMsAvg.toFixed(0)} ms contra UDP ${udpSummary.totalMsAvg.toFixed(0)} ms em média`,
        ),
      ],
      { seed: MAIN_SEED, udp, tcp, udpSummary, tcpSummary } satisfies ComparisonMetrics,
    );
  },
};
