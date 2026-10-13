import { FsmEngine, type FsmTrace } from '../../engine/fsm-engine';
import type { Scheduler, TimerId } from '../../sim/scheduler';
import { backoffTimeout, updateRtt } from './rtt';

export type TransmissionKind = 'new' | 'timeout' | 'fast';

export interface Transmission {
  time: number;
  seq: number;
  length: number;
  kind: TransmissionKind;
  timeoutAt?: number;
}

export interface SenderContext extends Record<string, unknown> {
  sendBase: number;
  nextSeq: number;
  pending: number;
  dupAckCount: number;
  retries: number;
  maxRetries: number;
  estRtt: number;
  devRtt: number;
  timeout: number;
  initialTimeout: number;
  rttSamples: number;
  minTimeout: number;
  maxTimeout: number;
  mss: number;
  windowBytes: number;
}

export interface SenderConnection {
  sndNxt: number;
}

export interface TcpSenderOptions {
  scheduler: Scheduler;
  definition: unknown;
  connection: SenderConnection;
  transmit: (seq: number, payload: Uint8Array, kind: TransmissionKind) => void;
  rto?: number;
  mss?: number;
  windowSegments?: number;
  maxRetries?: number;
  minTimeout?: number;
  maxTimeout?: number;
}

interface Outstanding {
  seq: number;
  payload: Uint8Array;
  sentAt: number;
  retransmitted: boolean;
}

export class TcpSender {
  readonly fsm: FsmEngine<SenderContext>;
  readonly transmissions: Transmission[] = [];
  readonly traces: FsmTrace[] = [];

  private readonly scheduler: Scheduler;
  private readonly connection: SenderConnection;
  private readonly transmit: TcpSenderOptions['transmit'];
  private readonly outstanding = new Map<number, Outstanding>();
  private data = new Uint8Array();
  private offset = 0;
  private timer: TimerId | null = null;
  private deadline: number | null = null;

  constructor(options: TcpSenderOptions) {
    this.scheduler = options.scheduler;
    this.connection = options.connection;
    this.transmit = options.transmit;

    const mss = options.mss ?? 100;
    const context: SenderContext = {
      sendBase: 0,
      nextSeq: 0,
      pending: 0,
      dupAckCount: 0,
      retries: 0,
      maxRetries: options.maxRetries ?? 5,
      estRtt: 0,
      devRtt: 0,
      timeout: options.rto ?? 1000,
      initialTimeout: options.rto ?? 1000,
      rttSamples: 0,
      minTimeout: options.minTimeout ?? 200,
      maxTimeout: options.maxTimeout ?? 60_000,
      mss,
      windowBytes: mss * (options.windowSegments ?? 5),
    };

    this.fsm = new FsmEngine<SenderContext>(options.definition, {
      context,
      clock: () => this.scheduler.now,
      actions: {
        sendWindow: ({ ctx }) => this.sendWindow(ctx),
        retransmitBase: ({ ctx, params }) => this.retransmitBase(ctx, String(params.reason)),
        sampleRtt: ({ ctx, event }) => this.sampleRtt(ctx, Number(event.payload?.ack)),
        advance: ({ ctx, event }) => this.advance(ctx, Number(event.payload?.ack)),
        resetBackoff: ({ ctx }) => {
          ctx.timeout =
            ctx.rttSamples > 0
              ? Math.max(ctx.minTimeout, ctx.estRtt + 4 * ctx.devRtt)
              : ctx.initialTimeout;
        },
        backoff: ({ ctx }) => {
          ctx.timeout = backoffTimeout(ctx.timeout, ctx.maxTimeout);
        },
        startTimer: ({ ctx }) => this.startTimer(ctx),
        stopTimer: () => this.stopTimer(),
      },
    });

    this.fsm.subscribe((trace) => this.traces.push(trace));
  }

  get state(): string {
    return this.fsm.state;
  }

  get busy(): boolean {
    return this.fsm.state === 'SENDING';
  }

  send(data: Uint8Array): void {
    if (this.fsm.state === 'FAILED') throw new Error('O remetente desistiu da transferência');
    const ctx = this.fsm.context;

    if (this.fsm.state === 'IDLE') {
      ctx.sendBase = this.connection.sndNxt;
      ctx.nextSeq = this.connection.sndNxt;
      this.data = data.slice();
      this.offset = 0;
    } else {
      const joined = new Uint8Array(this.data.length + data.length);
      joined.set(this.data);
      joined.set(data, this.data.length);
      this.data = joined;
    }
    ctx.pending = this.data.length - this.offset;
    this.fsm.dispatch({ type: 'APP_SEND' });
  }

  onAck(ack: number): boolean {
    if (!this.busy) return false;
    const ctx = this.fsm.context;
    if (ack > ctx.nextSeq) return false;
    if (ack > ctx.sendBase) {
      this.fsm.dispatch({ type: 'ACK_NEW', payload: { ack } });
    } else if (ack === ctx.sendBase) {
      this.fsm.dispatch({ type: 'ACK_DUP', payload: { ack } });
    }
    return true;
  }

  private sendWindow(ctx: SenderContext): void {
    while (this.offset < this.data.length && ctx.nextSeq - ctx.sendBase < ctx.windowBytes) {
      const length = Math.min(ctx.mss, this.data.length - this.offset);
      const payload = this.data.slice(this.offset, this.offset + length);
      const seq = ctx.nextSeq;

      this.outstanding.set(seq, {
        seq,
        payload,
        sentAt: this.scheduler.now,
        retransmitted: false,
      });
      this.record(seq, length, 'new');
      this.transmit(seq, payload, 'new');

      ctx.nextSeq += length;
      this.offset += length;
      this.connection.sndNxt = ctx.nextSeq;
    }
    ctx.pending = this.data.length - this.offset;
  }

  private retransmitBase(ctx: SenderContext, reason: string): void {
    const segment = this.outstanding.get(ctx.sendBase);
    if (!segment) throw new Error(`Nenhum segmento pendente em seq=${ctx.sendBase}`);
    const kind: TransmissionKind = reason === 'fast' ? 'fast' : 'timeout';

    segment.retransmitted = true;
    segment.sentAt = this.scheduler.now;
    this.record(segment.seq, segment.payload.length, kind, this.deadline ?? undefined);
    this.transmit(segment.seq, segment.payload, kind);
  }

  private sampleRtt(ctx: SenderContext, ack: number): void {
    let last: Outstanding | undefined;
    for (const segment of this.outstanding.values()) {
      if (segment.seq + segment.payload.length > ack) continue;
      if (segment.retransmitted) return;
      last = segment;
    }
    if (!last) return;

    const next = updateRtt(ctx, this.scheduler.now - last.sentAt, ctx.minTimeout);
    ctx.estRtt = next.estRtt;
    ctx.devRtt = next.devRtt;
    ctx.timeout = next.timeout;
    ctx.rttSamples = next.rttSamples;
  }

  private advance(ctx: SenderContext, ack: number): void {
    for (const [seq, segment] of this.outstanding) {
      if (seq + segment.payload.length <= ack) this.outstanding.delete(seq);
    }
    ctx.sendBase = ack;
  }

  private startTimer(ctx: SenderContext): void {
    this.stopTimer();
    this.deadline = this.scheduler.now + ctx.timeout;
    this.timer = this.scheduler.after(
      ctx.timeout,
      () => {
        this.timer = null;
        this.fsm.dispatch({ type: 'TIMEOUT' });
      },
      'tcp:sender:retx',
    );
  }

  private stopTimer(): void {
    if (this.timer !== null) this.scheduler.cancel(this.timer);
    this.timer = null;
    this.deadline = null;
  }

  private record(seq: number, length: number, kind: TransmissionKind, timeoutAt?: number): void {
    this.transmissions.push({
      time: this.scheduler.now,
      seq,
      length,
      kind,
      ...(timeoutAt === undefined ? {} : { timeoutAt }),
    });
  }
}