import type { HostName, LogEntry, LogLayer } from '@fsms/scenarios';
import { edgeId } from './fsmGraph';

export interface TraceSummary {
  last?: LogEntry;
  taken: Set<string>;
  visited: Set<string>;
}

export function summarizeTrace(
  log: readonly LogEntry[],
  host: HostName,
  layer: LogLayer,
  initial: string,
): TraceSummary {
  const taken = new Set<string>();
  const visited = new Set<string>([initial]);
  let last: LogEntry | undefined;
  for (const entry of log) {
    if (entry.host !== host || entry.layer !== layer || entry.kind !== 'transition') continue;
    taken.add(edgeId(entry.from, entry.to));
    visited.add(entry.from);
    visited.add(entry.to);
    last = entry;
  }
  return { last, taken, visited };
}
