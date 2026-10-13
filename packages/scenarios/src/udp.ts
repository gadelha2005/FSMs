import {
  Channel,
  Scheduler,
  UdpHost,
  analyzeDelivery,
  createRng,
  packId,
  unpackId,
  type ChannelEvent,
  type ChannelParams,
} from '@fsms/core';
import udpDefinition from '../../definitions/udp.json';
import { buildResult, check, type Scenario } from './scenario';

interface UdpBench {
  scheduler: Scheduler;
  channel: Channel;
  a: UdpHost;
  b: UdpHost;
  events: ChannelEvent[];
}

export function buildUdpBench(seed: number, params: Partial<ChannelParams> = {}): UdpBench {
  const scheduler = new Scheduler();
  const channel = new Channel(scheduler, createRng(seed), params);
  const events: ChannelEvent[] = [];
  channel.subscribe((e) => events.push(e));
  const a = new UdpHost({ name: 'A', port: 5000, scheduler, channel, definition: udpDefinition });
  const b = new UdpHost({ name: 'B', port: 53, scheduler, channel, definition: udpDefinition });
  return { scheduler, channel, a, b, events };
}

export function sentFrom(events: ChannelEvent[], host: string): number {
  return events.filter((e) => e.kind === 'sent' && e.frame.from === host).length;
}

const scenario8Info = {
  id: 8,
  protocol: 'UDP',
  title: '20 datagramas com 30% de perda',
  expected: 'Perdidos não são recuperados e nenhuma retransmissão ocorre',
} as const;

export const scenario8: Scenario = {
  ...scenario8Info,
  run() {
    const total = 20;
    const ids = Array.from({ length: total }, (_, i) => i + 1);
    const { scheduler, a, b, events } = buildUdpBench(8, { lossProb: 0.3 });

    ids.forEach((id, i) => scheduler.after(i * 10, () => a.send('B', 53, packId(id), { id })));
    scheduler.runAll();

    const received = b.received.map((r) => unpackId(r.payload));
    const report = analyzeDelivery(ids, received);
    const lostByChannel = events.filter((e) => e.kind === 'lost').length;
    const sentByA = sentFrom(events, 'A');

    return buildResult(
      scenario8Info,
      [
        check('houve perda de datagramas', report.lost > 0, `${report.lost} perdidos`),
        check(
          'entregues + perdidos = 20',
          report.delivered + report.lost === total,
          `${report.delivered} + ${report.lost}`,
        ),
        check(
          'o canal perdeu exatamente os que a aplicação não recebeu',
          lostByChannel === report.lost,
          `canal: ${lostByChannel}, aplicação: ${report.lost}`,
        ),
        check(
          'nenhuma retransmissão: A enviou 20 frames, nem um a mais',
          sentByA === total,
          `${sentByA}`,
        ),
        check('nenhum datagrama chegou duas vezes', report.duplicates === 0),
        check(
          'B não enviou nada de volta (sem ACK, sem aviso de perda)',
          sentFrom(events, 'B') === 0,
        ),
      ],
      { ...report, sentByA },
    );
  },
};

const scenario9Info = {
  id: 9,
  protocol: 'UDP',
  title: 'Datagrama com checksum corrompido',
  expected: 'Descartado pelo receptor, sem notificação',
} as const;

export const scenario9: Scenario = {
  ...scenario9Info,
  run() {
    const ids = [1, 2, 3];
    const { scheduler, channel, a, b, events } = buildUdpBench(9);
    channel.addRule({ match: { id: 2 }, action: 'corrupt' });

    ids.forEach((id, i) => scheduler.after(i * 10, () => a.send('B', 53, packId(id), { id })));
    scheduler.runAll();

    const received = b.received.map((r) => unpackId(r.payload));
    const corrupted = events.filter((e) => e.kind === 'corrupted').length;
    const discard = b.discarded[0];

    return buildResult(
      scenario9Info,
      [
        check('o canal corrompeu exatamente 1 datagrama', corrupted === 1, `${corrupted}`),
        check(
          'B descartou exatamente 1 datagrama',
          b.discarded.length === 1,
          `${b.discarded.length}`,
        ),
        check(
          'o motivo do descarte é integridade (checksum ou comprimento)',
          discard !== undefined && (discard.reason === 'checksum' || discard.reason === 'length'),
          discard?.reason,
        ),
        check('a aplicação não recebeu o datagrama 2', !received.includes(2)),
        check('os datagramas 1 e 3 foram entregues', received.join() === '1,3', received.join()),
        check('B não enviou nada de volta (sem notificação)', sentFrom(events, 'B') === 0),
        check('A não recebeu nada', a.received.length === 0 && a.discarded.length === 0),
      ],
      { received, discardReason: discard?.reason },
    );
  },
};

export const udpScenarios: Scenario[] = [scenario8, scenario9];
