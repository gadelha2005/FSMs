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
} from './segment';

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

  private readonly scheduler: Scheduler;
  private readonly channel: Channel;
  private readonly timers = new Map<string, TimerId>();
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

  close(): void {
    this.fsm.dispatch({ type: 'APP_CLOSE' });
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