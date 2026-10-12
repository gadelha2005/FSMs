import type { Rng } from '../sim/rng';
import type { Scheduler } from '../sim/scheduler';
import { DEFAULT_CHANNEL_PARAMS, validateParams, type ChannelParams } from './params';

export interface Frame {
  from: string;
  to: string;
  bytes: Uint8Array;
  meta: Record<string, unknown>;
}

export interface SentFrame extends Frame {
  id: number;
  copyOf?: number;
  corrupted: boolean;
}

export type LossReason = 'random' | 'rule' | 'manual';

export type ChannelEvent =
  | { kind: 'sent'; time: number; frame: SentFrame }
  | { kind: 'lost'; time: number; frame: SentFrame; reason: LossReason }
  | { kind: 'corrupted'; time: number; frame: SentFrame }
  | { kind: 'duplicated'; time: number; frame: SentFrame }
  | { kind: 'delivered'; time: number; frame: SentFrame; sentAt: number };

export interface FaultRule {
  match: Record<string, unknown>;
  action: 'drop' | 'corrupt' | 'duplicate';
  nth?: number;
  count?: number;
}

interface RuleState {
  rule: FaultRule;
  seen: number;
}

export type FrameHandler = (frame: SentFrame) => void;

export class Channel {
  private params: ChannelParams;
  private nextFrameId = 1;
  private manualDrops = 0;
  private readonly handlers = new Map<string, FrameHandler>();
  private readonly listeners = new Set<(event: ChannelEvent) => void>();
  private rules: RuleState[] = [];

  constructor(
    private readonly scheduler: Scheduler,
    private readonly rng: Rng,
    params: Partial<ChannelParams> = {},
  ) {
    this.params = validateParams({ ...DEFAULT_CHANNEL_PARAMS, ...params });
  }

  get currentParams(): ChannelParams {
    return { ...this.params };
  }

  get pendingManualDrops(): number {
    return this.manualDrops;
  }

  setParams(partial: Partial<ChannelParams>): void {
    this.params = validateParams({ ...this.params, ...partial });
  }

  attach(host: string, handler: FrameHandler): void {
    this.handlers.set(host, handler);
  }

  subscribe(listener: (event: ChannelEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dropNext(count = 1): void {
    this.manualDrops += count;
  }

  addRule(rule: FaultRule): void {
    this.rules.push({ rule, seen: 0 });
  }

  clearRules(): void {
    this.rules = [];
  }

  send(frame: Frame): void {
    if (!this.handlers.has(frame.to)) {
      throw new Error(`Canal: destino "${frame.to}" não está conectado (use attach)`);
    }

    const rolls = {
      loss: this.rng.next(),
      corrupt: this.rng.next(),
      dup: this.rng.next(),
      reorder: this.rng.next(),
      delay: this.rng.int(this.params.delayMin, this.params.delayMax),
      bit: this.rng.next(),
      dupDelay: this.rng.int(this.params.delayMin, this.params.delayMax),
    };

    const sent: SentFrame = { ...frame, id: this.nextFrameId++, corrupted: false };
    this.emit({ kind: 'sent', time: this.scheduler.now, frame: sent });

    const actions = this.evaluateRules(frame.meta);

    if (this.manualDrops > 0) {
      this.manualDrops--;
      this.emit({ kind: 'lost', time: this.scheduler.now, frame: sent, reason: 'manual' });
      return;
    }
    if (actions.has('drop')) {
      this.emit({ kind: 'lost', time: this.scheduler.now, frame: sent, reason: 'rule' });
      return;
    }
    if (rolls.loss < this.params.lossProb) {
      this.emit({ kind: 'lost', time: this.scheduler.now, frame: sent, reason: 'random' });
      return;
    }

    let delivered = sent;
    if (actions.has('corrupt') || rolls.corrupt < this.params.corruptProb) {
      delivered = this.corrupt(sent, rolls.bit);
      if (delivered.corrupted) {
        this.emit({ kind: 'corrupted', time: this.scheduler.now, frame: delivered });
      }
    }

    let delay = rolls.delay;
    if (rolls.reorder < this.params.reorderProb) delay += Math.max(this.params.delayMax, 1);
    this.scheduleDelivery(delivered, delay);

    if (actions.has('duplicate') || rolls.dup < this.params.dupProb) {
      const copy: SentFrame = {
        ...delivered,
        id: this.nextFrameId++,
        copyOf: sent.id,
        bytes: delivered.bytes.slice(),
      };
      this.emit({ kind: 'duplicated', time: this.scheduler.now, frame: copy });
      this.scheduleDelivery(copy, rolls.dupDelay);
    }
  }

  private scheduleDelivery(frame: SentFrame, delay: number): void {
    const sentAt = this.scheduler.now;
    this.scheduler.after(
      delay,
      () => {
        this.emit({ kind: 'delivered', time: this.scheduler.now, frame, sentAt });
        this.handlers.get(frame.to)!(frame);
      },
      `deliver#${frame.id}`,
    );
  }

  private corrupt(frame: SentFrame, bitRoll: number): SentFrame {
    if (frame.bytes.length === 0) return frame;
    const bytes = frame.bytes.slice();
    const bit = Math.floor(bitRoll * bytes.length * 8);
    bytes[bit >> 3] = bytes[bit >> 3]! ^ (1 << (bit & 7));
    return { ...frame, bytes, corrupted: true };
  }

  private evaluateRules(meta: Record<string, unknown>): Set<FaultRule['action']> {
    const actions = new Set<FaultRule['action']>();
    for (const state of this.rules) {
      if (!matches(meta, state.rule.match)) continue;
      state.seen++;
      const first = state.rule.nth ?? 1;
      const last = first + (state.rule.count ?? 1) - 1;
      if (state.seen >= first && state.seen <= last) actions.add(state.rule.action);
    }
    return actions;
  }

  private emit(event: ChannelEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function matches(meta: Record<string, unknown>, match: Record<string, unknown>): boolean {
  return Object.entries(match).every(
    ([key, value]) => JSON.stringify(meta[key]) === JSON.stringify(value),
  );
}
