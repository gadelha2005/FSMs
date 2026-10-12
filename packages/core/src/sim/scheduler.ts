import { MinHeap } from './heap';

export type TimerId = number;

interface ScheduledEvent {
  id: TimerId;
  time: number;
  seq: number;
  fn: () => void;
  label: string;
  cancelled: boolean;
}

export class Scheduler {
  private clock = 0;
  private nextId = 1;
  private nextSeq = 0;
  private readonly queue = new MinHeap<ScheduledEvent>((a, b) => a.time - b.time || a.seq - b.seq);
  private readonly byId = new Map<TimerId, ScheduledEvent>();

  get now(): number {
    return this.clock;
  }

  get pending(): number {
    return this.byId.size;
  }

  get nextEventTime(): number | undefined {
    this.dropCancelledOnTop();
    return this.queue.peek()?.time;
  }

  at(time: number, fn: () => void, label = ''): TimerId {
    if (!Number.isFinite(time)) throw new RangeError(`Instante inválido: ${time}`);
    if (time < this.clock) {
      throw new RangeError(`Não dá para agendar no passado (time=${time}, now=${this.clock})`);
    }
    const event: ScheduledEvent = {
      id: this.nextId++,
      time,
      seq: this.nextSeq++,
      fn,
      label,
      cancelled: false,
    };
    this.queue.push(event);
    this.byId.set(event.id, event);
    return event.id;
  }

  after(delay: number, fn: () => void, label = ''): TimerId {
    if (delay < 0) throw new RangeError(`Atraso negativo: ${delay}`);
    return this.at(this.clock + delay, fn, label);
  }

  cancel(id: TimerId): boolean {
    const event = this.byId.get(id);
    if (!event) return false;
    event.cancelled = true;
    this.byId.delete(id);
    return true;
  }

  step(): boolean {
    this.dropCancelledOnTop();
    const event = this.queue.pop();
    if (!event) return false;
    this.byId.delete(event.id);
    this.clock = event.time;
    event.fn();
    return true;
  }

  runUntil(time: number): void {
    if (time < this.clock) throw new RangeError(`runUntil no passado (${time} < ${this.clock})`);
    for (;;) {
      const next = this.nextEventTime;
      if (next === undefined || next > time) break;
      this.step();
    }
    this.clock = time;
  }

  runAll(maxEvents = 100_000): number {
    let count = 0;
    while (this.step()) {
      if (++count >= maxEvents) {
        throw new Error(`runAll passou de ${maxEvents} eventos: possível loop infinito de timers`);
      }
    }
    return count;
  }

  private dropCancelledOnTop(): void {
    while (this.queue.peek()?.cancelled) this.queue.pop();
  }
}
