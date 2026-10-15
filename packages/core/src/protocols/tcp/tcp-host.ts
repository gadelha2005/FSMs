import jsonLogic from 'json-logic-js';
import type { Channel, SentFrame } from '../../channel/channel';
import { FsmEngine, type FsmEvent, type FsmTrace } from '../../engine/fsm-engine';
import type { Scheduler, TimerId } from '../../sim/scheduler';
import {
  decodeSegment,
  encodeSegment,
  flagNames,
  flagsFromNames,
  segmentLength,
  type TcpDecodeFailure,
  type TcpSegment,
} from './segment';
import { TcpReceiver } from './receiver';
import { TcpSender, type TransmissionKind } from './sender';

const RECEIVE_STATES = new Set(['ESTABLISHED', 'FIN_WAIT_1', 'FIN_WAIT_2']);
const SEND_STATES = new Set(['ESTABLISHED', 'CLOSE_WAIT']);

export interface TcpContext extends Record<string, unknown> {
  iss: number;
  irs: number;
  sndNxt: number;
  rcvNxt: number;
  retries: number;
  maxRetries: number;
  rto: number;
  msl: number;
  passive: boolean;
}

export interface TcpHostOptions {
  name: string;
  port: number;
  scheduler: Scheduler;
  channel: Channel;
  definition: unknown;
  iss?: number;
  rto?: number;
  msl?: number;
  maxRetries?: number;
  senderDefinition?: unknown;
  mss?: number;
  windowSegments?: number;
  minTimeout?: number;
}

export interface TcpDiscard {
  time: number;
  from: string;
  reason: TcpDecodeFailure | 'port';
}

interface Remote {
  host: string;
  port: number;
}

export class TcpHost {
  readonly name: string;
  readonly port: number;
  readonly fsm: FsmEngine<TcpContext>;
  readonly discarded: TcpDiscard[] = [];
  readonly stateHistory: string[];
  readonly traces: FsmTrace[] = [];
  readonly receiver: TcpReceiver;
  readonly sender?: TcpSender;

  private readonly scheduler: Scheduler;
  private readonly channel: Channel;
  private readonly timers = new Map<string, TimerId>();
  private readonly context: TcpContext;
  private remote: Remote | null = null;

  constructor(options: TcpHostOptions) {
    this.name = options.name;
    this.port = options.port;
    this.scheduler = options.scheduler;
    this.channel = options.channel;

    const context: TcpContext = {
      iss: options.iss ?? 1000,
      irs: 0,
      sndNxt: options.iss ?? 1000,
      rcvNxt: 0,
      retries: 0,
      maxRetries: options.maxRetries ?? 5,
      rto: options.rto ?? 1000,
      msl: options.msl ?? 30_000,
      passive: false,
    };

    this.context = context;
    this.fsm = new FsmEngine<TcpContext>(options.definition, {
      context,
      clock: () => this.scheduler.now,
      actions: {
        sendSegment: ({ ctx, event, params }) => {
          const data = { ctx, event: event.payload ?? {} };
          const evaluate = (rule: unknown): number => Number(jsonLogic.apply(rule as object, data));
          const reply = params.reply === true;
          const target = reply
            ? { host: String(event.payload?.from), port: Number(event.payload?.srcPort) }
            : this.remote;
          if (!target) throw new Error(`${this.name}: sem destino para enviar o segmento`);

          const flags = flagsFromNames(params.flags as string[]);
          const seq = evaluate(params.seq);
          const ack = params.ack === undefined ? 0 : evaluate(params.ack);
          const bytes = encodeSegment({
            srcPort: this.port,
            dstPort: target.port,
            seq,
            ack,
            flags,
            window: 65535,
            payload: new Uint8Array(),
          });
          const names = flagNames(flags);
          this.channel.send({
            from: this.name,
            to: target.host,
            bytes,
            meta: {
              protocol: 'TCP',
              from: this.name,
              to: target.host,
              flags: names,
              seq,
              ack,
              srcPort: this.port,
              dstPort: target.port,
              length: 0,
              label: `${names.join('-')} seq=${seq}${flags.ack ? ` ack=${ack}` : ''}`,
            },
          });
        },
        bindPeer: ({ event }) => {
          this.remote = {
            host: String(event.payload?.from),
            port: Number(event.payload?.srcPort),
          };
        },
        startTimer: ({ ctx, event, params }) => {
          const name = String(params.timer);
          this.cancelTimer(name);
          const ms = Number(
            jsonLogic.apply(params.ms as object, { ctx, event: event.payload ?? {} }),
          );
          const id = this.scheduler.after(
            ms,
            () => {
              this.timers.delete(name);
              this.fsm.dispatch({ type: String(params.event) });
            },
            `tcp:${this.name}:${name}`,
          );
          this.timers.set(name, id);
        },
        stopTimer: ({ params }) => this.cancelTimer(String(params.timer)),
      },
    });

    this.stateHistory = [this.fsm.state];
    this.fsm.subscribe((trace) => {
      this.traces.push(trace);
      if (trace.kind === 'transition' && trace.to !== this.stateHistory.at(-1)) {
        this.stateHistory.push(trace.to);
      }
    });

    this.receiver = new TcpReceiver(context, () => this.scheduler.now);
    if (options.senderDefinition) {
      this.sender = new TcpSender({
        scheduler: this.scheduler,
        definition: options.senderDefinition,
        connection: context,
        transmit: (seq, payload, kind) => this.transmitData(seq, payload, kind),
        rto: options.rto,
        mss: options.mss,
        windowSegments: options.windowSegments,
        maxRetries: options.maxRetries,
        minTimeout: options.minTimeout,
      });
    }

    this.channel.attach(this.name, (frame) => this.onFrame(frame));
  }

  get state(): string {
    return this.fsm.state;
  }

  listen(): void {
    this.fsm.dispatch({ type: 'APP_PASSIVE_OPEN' });
  }

  connect(host: string, port: number): void {
    this.remote = { host, port };
    this.fsm.dispatch({ type: 'APP_ACTIVE_OPEN' });
  }

  send(data: Uint8Array): void {
    if (!this.sender)
      throw new Error(`${this.name}: sem definição do remetente (senderDefinition)`);
    if (!SEND_STATES.has(this.fsm.state)) {
      throw new Error(
        `${this.name}: send() exige conexão estabelecida, estado atual ${this.fsm.state}`,
      );
    }
    this.sender.send(data);
  }

  close(): void {
    this.fsm.dispatch({ type: 'APP_CLOSE' });
  }

  private transmitData(seq: number, payload: Uint8Array, kind: TransmissionKind): void {
    const target = this.remote;
    if (!target) throw new Error(`${this.name}: sem destino para enviar dados`);
    const ack = this.context.rcvNxt;
    const bytes = encodeSegment({
      srcPort: this.port,
      dstPort: target.port,
      seq,
      ack,
      flags: flagsFromNames(['ACK']),
      window: 65535,
      payload,
    });
    this.channel.send({
      from: this.name,
      to: target.host,
      bytes,
      meta: {
        protocol: 'TCP',
        from: this.name,
        to: target.host,
        flags: ['ACK'],
        seq,
        ack,
        srcPort: this.port,
        dstPort: target.port,
        length: payload.length,
        kind: 'data',
        retx: kind,
        label: `DATA seq=${seq} len=${payload.length}${kind === 'new' ? '' : ` (${kind})`}`,
      },
    });
  }

  private sendDataAck(): void {
    const target = this.remote;
    if (!target) return;
    const seq = this.context.sndNxt;
    const ack = this.context.rcvNxt;
    const bytes = encodeSegment({
      srcPort: this.port,
      dstPort: target.port,
      seq,
      ack,
      flags: flagsFromNames(['ACK']),
      window: 65535,
      payload: new Uint8Array(),
    });
    this.channel.send({
      from: this.name,
      to: target.host,
      bytes,
      meta: {
        protocol: 'TCP',
        from: this.name,
        to: target.host,
        flags: ['ACK'],
        seq,
        ack,
        srcPort: this.port,
        dstPort: target.port,
        length: 0,
        kind: 'ack',
        label: `ACK seq=${seq} ack=${ack}`,
      },
    });
  }

  private routeTransfer(segment: TcpSegment): boolean {
    const { flags, payload } = segment;
    if (flags.syn || flags.fin || flags.rst) return false;

    if (payload.length > 0) {
      if (!RECEIVE_STATES.has(this.fsm.state)) return false;
      this.receiver.onData(segment.seq, payload);
      this.sendDataAck();
      return true;
    }
    if (flags.ack && this.sender) return this.sender.onAck(segment.ack);
    return false;
  }

  private cancelTimer(name: string): void {
    const id = this.timers.get(name);
    if (id !== undefined) this.scheduler.cancel(id);
    this.timers.delete(name);
  }

  private onFrame(frame: SentFrame): void {
    const decoded = decodeSegment(frame.bytes);
    if (!decoded.ok) {
      this.discarded.push({ time: this.scheduler.now, from: frame.from, reason: decoded.reason });
      return;
    }
    const { segment } = decoded;
    if (segment.dstPort !== this.port) {
      this.discarded.push({ time: this.scheduler.now, from: frame.from, reason: 'port' });
      return;
    }

    if (this.routeTransfer(segment)) return;

    const event: FsmEvent = {
      type: 'RCV_SEGMENT',
      payload: {
        from: frame.from,
        srcPort: segment.srcPort,
        syn: segment.flags.syn,
        ack: segment.flags.ack,
        fin: segment.flags.fin,
        rst: segment.flags.rst,
        seq: segment.seq,
        ackNum: segment.ack,
        segLen: segmentLength(segment),
        length: segment.payload.length,
      },
    };
    this.fsm.dispatch(event);
  }
}
