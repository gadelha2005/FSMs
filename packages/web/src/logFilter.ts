import type { HostName, LogEntry, LogLayer } from '@fsms/scenarios';

export interface LogFilter {
  hosts: HostName[];
  layers: LogLayer[];
  query: string;
  onlyIssues: boolean;
}

export const ALL_HOSTS: HostName[] = ['A', 'B'];
export const ALL_LAYERS: LogLayer[] = ['conexão', 'remetente', 'UDP'];

export const DEFAULT_FILTER: LogFilter = {
  hosts: ALL_HOSTS,
  layers: ALL_LAYERS,
  query: '',
  onlyIssues: false,
};

const ISSUE_EVENTS = new Set(['TIMEOUT', 'TIMEOUT_RETX', 'ACK_DUP']);

export function isIssue(entry: LogEntry): boolean {
  return (
    entry.kind === 'rejected' ||
    ISSUE_EVENTS.has(entry.event) ||
    entry.actions.includes('retransmitBase')
  );
}

function haystack(entry: LogEntry): string {
  return [entry.host, entry.layer, entry.from, entry.event, entry.to, ...entry.actions]
    .join(' ')
    .toLowerCase();
}

export function filterLog(log: readonly LogEntry[], filter: LogFilter): LogEntry[] {
  const query = filter.query.trim().toLowerCase();
  return log.filter(
    (entry) =>
      filter.hosts.includes(entry.host) &&
      filter.layers.includes(entry.layer) &&
      (!filter.onlyIssues || isIssue(entry)) &&
      (query === '' || haystack(entry).includes(query)),
  );
}

export function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function isDefaultFilter(filter: LogFilter): boolean {
  return (
    filter.hosts.length === ALL_HOSTS.length &&
    filter.layers.length === ALL_LAYERS.length &&
    filter.query === '' &&
    !filter.onlyIssues
  );
}
