import {
  Channel,
  Scheduler,
  TcpHost,
  UdpHost,
  createRng,
  type ChannelEvent,
  type ChannelParams,
  type FsmTrace,
} from '@fsms/core';
import tcpDefinition from '../../definitions/tcp-connection.json';
import senderDefinition from '../../definitions/tcp-sender.json';
import udpDefinition from '../../definitions/udp.json';

export type ProtocolName = 'UDP' | 'TCP';
export type HostName = 'A' | 'B';
export type LogLayer = 'UDP' | 'conexão' | 'remetente';

export interface LogEntry {
  id: number;
  time: number;
  host: HostName;
  layer: LogLayer;
  kind: 'transition' | 'rejected';
  from: string;
  event: string;
  actions: string[];
  to: string;
  note?: string;
}

export interface TcpSettings {
  msl: number;
  rto: number;
}

export interface SimulationOptions {
  protocol: ProtocolName;
  seed: number;
  channel?: Partial<ChannelParams>;
  tcp?: Partial<TcpSettings>;
}

export type Command =
  | { type: 'listen'; host: HostName }
  | { type: 'connect'; host: HostName }
  | { type: 'send'; host: HostName; bytes: number }
  | { type: 'close'; host: HostName }
  | { type: 'datagram'; host: HostName };

export interface CommandResult {
  ok: boolean;
  error?: string;
}

export interface HostInfo {
  name: HostName;
  state: string;
  senderState?: string;
  details: { label: string; value: string }[];
}

export const DEFAULT_TCP_SETTINGS: TcpSettings = { msl: 5000, rto: 1000 };

const ports: Record<HostName, number> = { A: 1234, B: 80 };
const other = (host: HostName): HostName => (host === 'A' ? 'B' : 'A');

export class Simulation {
  readonly protocol: ProtocolName;
  readonly seed: number;
  readonly scheduler = new Scheduler();
  readonly channel: Channel;
  readonly log: LogEntry[] = [];
  readonly channelEvents: ChannelEvent[] = [];
  readonly tcp: Record<HostName, TcpHost> | null;
  readonly udp: Record<HostName, UdpHost> | null;

  private version = 0;
  private logId = 1;
  private datagramCount = 0;
  private readonly listeners = new Set<() => void>();

  constructor(options: SimulationOptions) {
    this.protocol = options.protocol;
    this.seed = options.seed;
    this.channel = new Channel(this.scheduler, createRng(options.seed), {
      delayMin: 20,
      delayMax: 60,
      ...options.channel,
    });
    this.channel.subscribe((event) => this.channelEvents.push(event));

    if (options.protocol === 'TCP') {
      const settings = { ...DEFAULT_TCP_SETTINGS, ...options.tcp };
      const make = (name: HostName, iss: number) =>
        new TcpHost({
          name,
          port: ports[name],
          scheduler: this.scheduler,
          channel: this.channel,
          definition: tcpDefinition,
          senderDefinition,
          iss,
          msl: settings.msl,
          rto: settings.rto,
          maxRetries: 8,
        });
      const hosts = { A: make('A', 1000), B: make('B', 5000) };
      this.tcp = hosts;
      this.udp = null;
      for (const name of ['A', 'B'] as const) {
        hosts[name].fsm.subscribe((trace) => this.record(name, 'conexão', trace));
        hosts[name].sender?.fsm.subscribe((trace) => this.record(name, 'remetente', trace));
      }
    } else {
      const make = (name: HostName) =>
        new UdpHost({
          name,
          port: ports[name],
          scheduler: this.scheduler,
          channel: this.channel,
          definition: udpDefinition,
        });
      const hosts = { A: make('A'), B: make('B') };
      this.udp = hosts;
      this.tcp = null;
      for (const name of ['A', 'B'] as const) {
        hosts[name].fsm.subscribe((trace) => this.record(name, 'UDP', trace));
      }
    }
  }

  get now(): number {
    return this.scheduler.now;
  }

  get idle(): boolean {
    return this.scheduler.pending === 0;
  }

  get nextEventTime(): number | undefined {
    return this.scheduler.nextEventTime;
  }

  get channelParams(): ChannelParams {
    return this.channel.currentParams;
  }

  get pendingDrops(): number {
    return this.channel.pendingManualDrops;
  }

  getVersion(): number {
    return this.version;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  advance(ms: number): void {
    if (ms <= 0) return;
    this.scheduler.runUntil(this.scheduler.now + ms);
    this.changed();
  }

  step(): boolean {
    const ran = this.scheduler.step();
    if (ran) this.changed();
    return ran;
  }

  setChannelParams(partial: Partial<ChannelParams>): void {
    this.channel.setParams(partial);
    this.changed();
  }

  dropNext(): void {
    this.channel.dropNext();
    this.changed();
  }

  command(command: Command): CommandResult {
    try {
      this.execute(command);
      this.changed();
      return { ok: true };
    } catch (error) {
      this.changed();
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  hosts(): Record<HostName, HostInfo> {
    return { A: this.infoOf('A'), B: this.infoOf('B') };
  }

  private execute(command: Command): void {
    if (command.type === 'datagram') {
      const udp = this.udp;
      if (!udp) throw new Error('Datagramas só existem no modo UDP');
      const n = ++this.datagramCount;
      const text = new TextEncoder().encode(`mensagem ${n}`);
      udp[command.host].send(other(command.host), ports[other(command.host)], text, {
        id: n,
        from: command.host,
        label: `DGRAM #${n}`,
      });
      return;
    }

    const tcp = this.tcp;
    if (!tcp) throw new Error('Comandos de conexão só existem no modo TCP');
    const host = tcp[command.host];
    switch (command.type) {
      case 'listen':
        host.listen();
        break;
      case 'connect':
        host.connect(other(command.host), ports[other(command.host)]);
        break;
      case 'send':
        host.send(Uint8Array.from({ length: command.bytes }, (_, i) => i % 251));
        break;
      case 'close':
        host.close();
        break;
    }
  }

  private record(host: HostName, layer: LogLayer, trace: FsmTrace): void {
    if (trace.kind === 'transition') {
      this.log.push({
        id: this.logId++,
        time: trace.time,
        host,
        layer,
        kind: 'transition',
        from: trace.from,
        event: trace.event,
        actions: trace.actions,
        to: trace.to,
      });
    } else {
      this.log.push({
        id: this.logId++,
        time: trace.time,
        host,
        layer,
        kind: 'rejected',
        from: trace.state,
        event: trace.event,
        actions: [],
        to: trace.state,
        note: trace.reason,
      });
    }
  }

  private infoOf(name: HostName): HostInfo {
    if (this.tcp) {
      const host = this.tcp[name];
      const ctx = host.fsm.context;
      const sender = host.sender;
      const rtt = sender?.fsm.context;
      return {
        name,
        state: host.state,
        senderState: sender?.state,
        details: [
          { label: 'Próximo seq a enviar', value: String(ctx.sndNxt) },
          { label: 'Próximo seq esperado', value: String(ctx.rcvNxt) },
          { label: 'Bytes entregues à aplicação', value: String(host.receiver.delivered.length) },
          {
            label: 'EstimatedRTT',
            value: rtt && rtt.rttSamples > 0 ? `${rtt.estRtt.toFixed(1)} ms` : '-',
          },
          { label: 'TimeoutInterval', value: rtt ? `${rtt.timeout.toFixed(0)} ms` : '-' },
          { label: 'Segmentos descartados', value: String(host.discarded.length) },
        ],
      };
    }
    const host = this.udp![name];
    const counters = host.fsm.context;
    return {
      name,
      state: host.fsm.state,
      details: [
        { label: 'Enviados', value: String(counters.sent) },
        { label: 'Entregues à aplicação', value: String(counters.delivered) },
        { label: 'Descartados (checksum)', value: String(counters.discarded) },
      ],
    };
  }

  private changed(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }
}