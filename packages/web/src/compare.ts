import { DEFAULT_CHANNEL_PARAMS, type ChannelParams } from '@fsms/core';
import {
  COMPARISON_SEEDS,
  NOISY_CHANNEL,
  Simulation,
  runTcpTrial,
  runUdpTrial,
  summarize,
  type Summary,
} from '@fsms/scenarios';

export const MESSAGE_SIZE = 100;
export const SEND_INTERVAL = 10;
export const DEFAULT_COMPARE_CHANNEL: ChannelParams = {
  ...DEFAULT_CHANNEL_PARAMS,
  ...NOISY_CHANNEL,
};

export interface PairOptions {
  seed: number;
  messages: number;
  channel: Partial<ChannelParams>;
}

export interface Pair {
  udp: Simulation;
  tcp: Simulation;
  tcpConnected: boolean;
}

export function buildPair({ seed, messages, channel }: PairOptions): Pair {
  const udp = new Simulation({ protocol: 'UDP', seed, channel });
  for (let i = 0; i < messages; i++) {
    udp.scheduler.at(i * SEND_INTERVAL, () => {
      udp.command({ type: 'datagram', host: 'A' });
    });
  }

  const tcp = new Simulation({ protocol: 'TCP', seed, channel });
  tcp.command({ type: 'listen', host: 'B' });
  tcp.command({ type: 'connect', host: 'A' });
  let guard = 0;
  while (tcp.hosts().A.state !== 'ESTABLISHED' && guard++ < 100_000) {
    if (!tcp.step()) break;
  }
  const tcpConnected = tcp.hosts().A.state === 'ESTABLISHED';
  if (tcpConnected) tcp.command({ type: 'send', host: 'A', bytes: messages * MESSAGE_SIZE });

  return { udp, tcp, tcpConnected };
}

export interface RunStats {
  delivered: number;
  expected: number;
  framesOnWire: number;
  lostFrames: number;
  duplicatedFrames: number;
  retransmissions: number;
  timeMs: number;
  finished: boolean;
}

function detail(sim: Simulation, label: string): number {
  return Number(sim.hosts().B.details.find((d) => d.label === label)?.value ?? 0);
}

export function runStats(sim: Simulation, expected: number): RunStats {
  let framesOnWire = 0;
  let lostFrames = 0;
  let duplicatedFrames = 0;
  let retransmissions = 0;
  for (const event of sim.channelEvents) {
    if (event.kind === 'sent') {
      framesOnWire++;
      const retx = event.frame.meta.retx;
      if (retx === 'timeout' || retx === 'fast') retransmissions++;
    } else if (event.kind === 'lost') lostFrames++;
    else if (event.kind === 'duplicated') duplicatedFrames++;
  }
  const delivered =
    sim.protocol === 'UDP'
      ? detail(sim, 'Entregues à aplicação')
      : Math.min(expected, Math.floor(detail(sim, 'Bytes entregues à aplicação') / MESSAGE_SIZE));
  return {
    delivered,
    expected,
    framesOnWire,
    lostFrames,
    duplicatedFrames,
    retransmissions,
    timeMs: sim.now,
    finished: sim.idle,
  };
}

export interface Averages {
  udp: Summary;
  tcp: Summary;
}

export function computeAverages(channel: Partial<ChannelParams> = NOISY_CHANNEL): Averages {
  return {
    udp: summarize(COMPARISON_SEEDS.map((seed) => runUdpTrial(seed, channel))),
    tcp: summarize(COMPARISON_SEEDS.map((seed) => runTcpTrial(seed, channel))),
  };
}
