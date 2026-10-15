export type ReceiveKind = 'in-order' | 'out-of-order' | 'duplicate';

export interface ReceiveRecord {
  time: number;
  seq: number;
  length: number;
  kind: ReceiveKind;
  ack: number;
}

export interface Delivery {
  time: number;
  seq: number;
  length: number;
}

export interface ReceiverConnection {
  rcvNxt: number;
}

export class TcpReceiver {
  readonly log: ReceiveRecord[] = [];
  readonly deliveries: Delivery[] = [];

  private readonly buffer = new Map<number, Uint8Array>();
  private readonly chunks: Uint8Array[] = [];

  constructor(
    private readonly connection: ReceiverConnection,
    private readonly clock: () => number,
  ) {}

  get delivered(): Uint8Array {
    const total = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  }

  get buffered(): number {
    return this.buffer.size;
  }

  onData(seq: number, payload: Uint8Array): ReceiveRecord {
    let kind: ReceiveKind;

    if (seq === this.connection.rcvNxt) {
      kind = 'in-order';
      this.deliver(payload);
      let next = this.buffer.get(this.connection.rcvNxt);
      while (next) {
        this.buffer.delete(this.connection.rcvNxt);
        this.deliver(next);
        next = this.buffer.get(this.connection.rcvNxt);
      }
    } else if (seq > this.connection.rcvNxt) {
      kind = 'out-of-order';
      if (!this.buffer.has(seq)) this.buffer.set(seq, payload);
    } else {
      kind = 'duplicate';
    }

    const record: ReceiveRecord = {
      time: this.clock(),
      seq,
      length: payload.length,
      kind,
      ack: this.connection.rcvNxt,
    };
    this.log.push(record);
    return record;
  }

  private deliver(payload: Uint8Array): void {
    this.deliveries.push({
      time: this.clock(),
      seq: this.connection.rcvNxt,
      length: payload.length,
    });
    this.chunks.push(payload);
    this.connection.rcvNxt += payload.length;
  }
}
