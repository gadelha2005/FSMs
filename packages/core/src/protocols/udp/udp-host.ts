import type { Channel, SentFrame } from '../../channel/channel';
import { FsmEngine } from '../../engine/fsm-engine';
import type { Scheduler } from '../../sim/scheduler';
import { decodeDatagram, encodeDatagram, type DecodeFailure } from './datagram';

export interface UdpReceived {
  time: number;
  from: string;
  srcPort: number;
  dstPort: number;
  payload: Uint8Array;
}

export type UdpDiscardReason = DecodeFailure | 'port';

export interface UdpDiscard {
  time: number;
  from: string;
  reason: UdpDiscardReason;
}

export interface UdpCounters extends Record<string, unknown> {
  sent: number;
  delivered: number;
  discarded: number;
}

export interface UdpHostOptions {
  name: string;
  port: number;
  scheduler: Scheduler;
  channel: Channel;
  definition: unknown;
}

export class UdpHost {
  readonly name: string;
  readonly port: number;
  readonly received: UdpReceived[] = [];
  readonly discarded: UdpDiscard[] = [];
  readonly fsm: FsmEngine<UdpCounters>;

  private readonly scheduler: Scheduler;
  private readonly channel: Channel;

  constructor(options: UdpHostOptions) {
    this.name = options.name;
    this.port = options.port;
    this.scheduler = options.scheduler;
    this.channel = options.channel;

    this.fsm = new FsmEngine<UdpCounters>(options.definition, {
      context: { sent: 0, delivered: 0, discarded: 0 },
      clock: () => this.scheduler.now,
      actions: {
        sendDatagram: ({ event }) => {
          const { to, dstPort, payload, meta } = event.payload as {
            to: string;
            dstPort: number;
            payload: Uint8Array;
            meta: Record<string, unknown>;
          };
          const bytes = encodeDatagram({ srcPort: this.port, dstPort, payload });
          this.channel.send({
            from: this.name,
            to,
            bytes,
            meta: { ...meta, protocol: 'UDP', srcPort: this.port, dstPort, length: bytes.length },
          });
        },
        deliverToApp: ({ event }) => {
          const { from, datagram } = event.payload as {
            from: string;
            datagram: { srcPort: number; dstPort: number; payload: Uint8Array };
          };
          this.received.push({ time: this.scheduler.now, from, ...datagram });
        },
        discard: ({ event }) => {
          const { from, reason } = event.payload as { from: string; reason: UdpDiscardReason };
          this.discarded.push({ time: this.scheduler.now, from, reason });
        },
      },
    });

    this.channel.attach(this.name, (frame) => this.onFrame(frame));
  }

  send(to: string, dstPort: number, payload: Uint8Array, meta: Record<string, unknown> = {}): void {
    this.fsm.dispatch({ type: 'APP_SEND', payload: { to, dstPort, payload, meta } });
  }

  private onFrame(frame: SentFrame): void {
    const decoded = decodeDatagram(frame.bytes);
    if (!decoded.ok) {
      this.fsm.dispatch({
        type: 'RCV_DATAGRAM',
        payload: { from: frame.from, valid: false, portOk: false, reason: decoded.reason },
      });
      return;
    }
    const portOk = decoded.datagram.dstPort === this.port;
    this.fsm.dispatch({
      type: 'RCV_DATAGRAM',
      payload: {
        from: frame.from,
        valid: true,
        portOk,
        reason: 'port',
        datagram: decoded.datagram,
      },
    });
  }
}
