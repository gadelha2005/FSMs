import {
  Channel,
  Scheduler,
  TcpHost,
  createRng,
  type ChannelEvent,
  type ChannelParams,
  type SentFrame,
} from '@fsms/core';
import tcpDefinition from '../../definitions/tcp-connection.json';
import senderDefinition from '../../definitions/tcp-sender.json';

export interface TcpBench {
  scheduler: Scheduler;
  channel: Channel;
  a: TcpHost;
  b: TcpHost;
  events: ChannelEvent[];
}

export interface TcpBenchOptions {
  seed?: number;
  channel?: Partial<ChannelParams>;
  rto?: number;
  rtoB?: number;
  msl?: number;
  maxRetries?: number;
  mss?: number;
  windowSegments?: number;
  minTimeout?: number;
}

export function buildTcpBench(options: TcpBenchOptions = {}): TcpBench {
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
    mss: options.mss,
    windowSegments: options.windowSegments,
    minTimeout: options.minTimeout,
    rto: options.rto,
    msl: options.msl,
    maxRetries: options.maxRetries,
  };
  const a = new TcpHost({ name: 'A', port: 1234, iss: 1000, ...shared });
  const b = new TcpHost({
    name: 'B',
    port: 80,
    iss: 5000,
    ...shared,
    rto: options.rtoB ?? options.rto,
  });
  return { scheduler, channel, a, b, events };
}

export function sentFrames(events: ChannelEvent[]): SentFrame[] {
  return events.flatMap((e) => (e.kind === 'sent' ? [e.frame] : []));
}

export function wire(events: ChannelEvent[]): string[] {
  return sentFrames(events).map((f) => `${f.meta.from}:${String(f.meta.label)}`);
}
