import type { ChannelEvent } from '@fsms/core';
import type { HostName, LogEntry } from '@fsms/scenarios';

export type ArrowKind = 'normal' | 'retx-timeout' | 'retx-fast';
export type Outcome = 'delivered' | 'lost' | 'in-flight';
export type LossReason = 'random' | 'rule' | 'manual';

export interface Arrow {
  id: number;
  from: HostName;
  to: HostName;
  sentAt: number;
  arriveAt?: number;
  outcome: Outcome;
  label: string;
  kind: ArrowKind;
  corrupted: boolean;
  duplicate: boolean;
  lossReason?: LossReason;
}

export const ROW_MIN = 20;
export const ROW_MAX = 64;
export const ROW_TOP = 44;
export const TIME_SCALE = 0.35;
export const LOST_DROP = 24;
export const LOST_FRACTION = 0.58;

function retxKind(meta: Record<string, unknown>): ArrowKind | undefined {
  if (meta.retx === 'timeout') return 'retx-timeout';
  if (meta.retx === 'fast') return 'retx-fast';
  return undefined;
}

function isHandshakeFrame(meta: Record<string, unknown>): boolean {
  const flags = meta.flags;
  return Array.isArray(flags) && (flags.includes('SYN') || flags.includes('FIN'));
}

export function buildArrows(events: readonly ChannelEvent[]): Arrow[] {
  const arrows = new Map<number, Arrow>();
  const seenControl = new Set<string>();

  for (const event of events) {
    const frame = event.frame;
    if (event.kind === 'sent') {
      const meta = frame.meta;
      const label = String(meta.label ?? '');
      let kind = retxKind(meta) ?? 'normal';
      if (kind === 'normal' && isHandshakeFrame(meta)) {
        const key = `${frame.from}|${label}`;
        if (seenControl.has(key)) kind = 'retx-timeout';
        seenControl.add(key);
      }
      arrows.set(frame.id, {
        id: frame.id,
        from: frame.from as HostName,
        to: frame.to as HostName,
        sentAt: event.time,
        outcome: 'in-flight',
        label,
        kind,
        corrupted: false,
        duplicate: false,
      });
    } else if (event.kind === 'lost') {
      const arrow = arrows.get(frame.id);
      if (arrow) {
        arrow.outcome = 'lost';
        arrow.lossReason = event.reason;
      }
    } else if (event.kind === 'corrupted') {
      const arrow = arrows.get(frame.id);
      if (arrow) arrow.corrupted = true;
    } else if (event.kind === 'duplicated') {
      const original = frame.copyOf === undefined ? undefined : arrows.get(frame.copyOf);
      arrows.set(frame.id, {
        id: frame.id,
        from: frame.from as HostName,
        to: frame.to as HostName,
        sentAt: event.time,
        outcome: 'in-flight',
        label: original?.label ?? String(frame.meta.label ?? ''),
        kind: original?.kind ?? 'normal',
        corrupted: original?.corrupted ?? false,
        duplicate: true,
      });
    } else {
      const arrow = arrows.get(frame.id);
      if (arrow) {
        arrow.arriveAt = event.time;
        arrow.outcome = 'delivered';
      }
    }
  }
  return [...arrows.values()];
}

export interface PlacedArrow extends Arrow {
  y1: number;
  y2: number;
  towardsB: boolean;
}

export interface Tick {
  y: number;
  time: number;
}

export interface StateTag {
  host: HostName;
  y: number;
  text: string;
}

export interface SequenceLayout {
  arrows: PlacedArrow[];
  ticks: Tick[];
  tags: StateTag[];
  height: number;
}

interface Point {
  time: number;
  order: number;
  arrow: Arrow;
  end: boolean;
}

export function layoutSequence(
  arrows: readonly Arrow[],
  log: readonly LogEntry[] = [],
): SequenceLayout {
  const points: Point[] = [];
  for (const arrow of arrows) {
    points.push({ time: arrow.sentAt, order: arrow.id, arrow, end: false });
    if (arrow.outcome === 'delivered' && arrow.arriveAt !== undefined) {
      points.push({ time: arrow.arriveAt, order: arrow.id, arrow, end: true });
    }
  }
  points.sort((p, q) => p.time - q.time || Number(p.end) - Number(q.end) || p.order - q.order);

  const startY = new Map<number, number>();
  const endY = new Map<number, number>();
  const ticks: Tick[] = [];
  const rows: { time: number; y: number }[] = [];
  let y = ROW_TOP;
  let previous: number | undefined;
  for (const point of points) {
    if (previous !== undefined) {
      const dt = point.time - previous;
      y += dt === 0 ? ROW_MIN : Math.min(ROW_MAX, Math.max(ROW_MIN, dt * TIME_SCALE));
    }
    if (point.time !== previous) ticks.push({ y, time: point.time });
    (point.end ? endY : startY).set(point.arrow.id, y);
    rows.push({ time: point.time, y });
    previous = point.time;
  }

  const placed: PlacedArrow[] = arrows.map((arrow) => {
    const y1 = startY.get(arrow.id)!;
    const y2 =
      arrow.outcome === 'delivered' ? (endY.get(arrow.id) ?? y1 + LOST_DROP) : y1 + LOST_DROP;
    return { ...arrow, y1, y2, towardsB: arrow.to === 'B' };
  });

  const yAt = (time: number): number => {
    const row = rows.find((r) => r.time >= time);
    return row ? row.y : (rows[rows.length - 1]?.y ?? ROW_TOP) + ROW_MIN;
  };

  const tags: StateTag[] = [];
  const lastTagY: Record<HostName, number> = { A: -Infinity, B: -Infinity };
  for (const entry of log) {
    if (entry.layer !== 'conexão' || entry.kind !== 'transition' || entry.from === entry.to) {
      continue;
    }
    const tagY = Math.max(yAt(entry.time), lastTagY[entry.host] + 14);
    lastTagY[entry.host] = tagY;
    tags.push({ host: entry.host, y: tagY, text: entry.to });
  }

  const lastY = Math.max(
    rows[rows.length - 1]?.y ?? ROW_TOP,
    ...placed.map((a) => a.y2),
    ...tags.map((t) => t.y),
  );
  return { arrows: placed, ticks, tags, height: lastY + 40 };
}

export function describeArrow(arrow: Arrow): string {
  const parts = [`${arrow.from} → ${arrow.to}: ${arrow.label}`];
  if (arrow.kind === 'retx-timeout') parts.push('retransmissão por timeout');
  if (arrow.kind === 'retx-fast') parts.push('retransmissão rápida');
  if (arrow.duplicate) parts.push('cópia duplicada pelo canal');
  if (arrow.corrupted) parts.push('corrompido no canal');
  if (arrow.outcome === 'lost') parts.push(`perdido (${arrow.lossReason ?? 'canal'})`);
  if (arrow.outcome === 'in-flight') parts.push('ainda em trânsito');
  return parts.join(', ');
}
