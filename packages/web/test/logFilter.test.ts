import { describe, expect, it } from 'vitest';
import type { LogEntry } from '@fsms/scenarios';
import { DEFAULT_FILTER, filterLog, isDefaultFilter, isIssue, toggle } from '../src/logFilter';

const entry = (partial: Partial<LogEntry>): LogEntry => ({
  id: 1,
  time: 0,
  host: 'A',
  layer: 'conexão',
  kind: 'transition',
  from: 'CLOSED',
  event: 'APP_ACTIVE_OPEN',
  actions: ['sendSegment'],
  to: 'SYN_SENT',
  ...partial,
});

const log: LogEntry[] = [
  entry({ id: 1 }),
  entry({ id: 2, host: 'B', from: 'LISTEN', event: 'RCV_SEGMENT', to: 'SYN_RCVD' }),
  entry({
    id: 3,
    layer: 'remetente',
    event: 'ACK_DUP',
    from: 'SENDING',
    to: 'SENDING',
    actions: ['inc'],
  }),
  entry({ id: 4, event: 'TIMEOUT_RETX', from: 'SYN_SENT', to: 'SYN_SENT' }),
  entry({ id: 5, kind: 'rejected', event: 'APP_SEND', from: 'CLOSED', to: 'CLOSED', actions: [] }),
  entry({
    id: 6,
    layer: 'remetente',
    event: 'TIMEOUT',
    from: 'SENDING',
    to: 'SENDING',
    actions: ['retransmitBase', 'startTimer'],
  }),
];

const ids = (rows: LogEntry[]) => rows.map((r) => r.id);

describe('filterLog', () => {
  it('sem filtros devolve tudo', () => {
    expect(filterLog(log, DEFAULT_FILTER)).toHaveLength(log.length);
    expect(isDefaultFilter(DEFAULT_FILTER)).toBe(true);
  });

  it('filtra por host e por camada', () => {
    expect(ids(filterLog(log, { ...DEFAULT_FILTER, hosts: ['B'] }))).toEqual([2]);
    expect(ids(filterLog(log, { ...DEFAULT_FILTER, layers: ['remetente'] }))).toEqual([3, 6]);
    expect(filterLog(log, { ...DEFAULT_FILTER, hosts: [] })).toEqual([]);
  });

  it('só problemas: timeout, ACK duplicado, rejeitado e retransmissão', () => {
    const rows = filterLog(log, { ...DEFAULT_FILTER, onlyIssues: true });
    expect(ids(rows)).toEqual([3, 4, 5, 6]);
    expect(isIssue(log[0]!)).toBe(false);
  });

  it('busca em qualquer coluna, sem diferenciar maiúsculas', () => {
    expect(ids(filterLog(log, { ...DEFAULT_FILTER, query: 'listen' }))).toEqual([2]);
    expect(ids(filterLog(log, { ...DEFAULT_FILTER, query: '  retransmitbase ' }))).toEqual([6]);
    expect(filterLog(log, { ...DEFAULT_FILTER, query: 'xyz' })).toEqual([]);
  });

  it('combina os filtros', () => {
    const rows = filterLog(log, {
      ...DEFAULT_FILTER,
      layers: ['remetente'],
      onlyIssues: true,
      query: 'timeout',
    });
    expect(ids(rows)).toEqual([6]);
    expect(isDefaultFilter({ ...DEFAULT_FILTER, query: 'x' })).toBe(false);
  });
});

describe('toggle', () => {
  it('liga e desliga um valor sem alterar a lista original', () => {
    const base = ['A', 'B'];
    expect(toggle(base, 'A')).toEqual(['B']);
    expect(toggle(['B'], 'A')).toEqual(['B', 'A']);
    expect(base).toEqual(['A', 'B']);
  });
});
