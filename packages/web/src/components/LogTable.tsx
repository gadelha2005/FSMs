import { useEffect, useRef, useState } from 'react';
import type { HostName, LogLayer, Simulation } from '@fsms/scenarios';
import { formatTime } from '../format';
import {
  ALL_HOSTS,
  ALL_LAYERS,
  DEFAULT_FILTER,
  filterLog,
  isDefaultFilter,
  toggle,
  type LogFilter,
} from '../logFilter';

interface Props {
  sim: Simulation;
}

const isTimeout = (event: string) => event === 'TIMEOUT' || event === 'TIMEOUT_RETX';

export function LogTable({ sim }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<LogFilter>(DEFAULT_FILTER);
  const total = sim.log.length;
  const rows = filterLog(sim.log, filter);
  const layers: LogLayer[] = sim.protocol === 'TCP' ? ['conexão', 'remetente'] : ['UDP'];

  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows.length]);

  const update = (partial: Partial<LogFilter>) => setFilter((f) => ({ ...f, ...partial }));

  return (
    <section className="panel log" aria-labelledby="log-title">
      <h2 id="log-title">
        Log{' '}
        <span className="muted small">
          ({rows.length === total ? `${total} transições` : `${rows.length} de ${total} transições`}
          )
        </span>
      </h2>
      <div className="filters" role="group" aria-label="Filtros do log">
        {ALL_HOSTS.map((host: HostName) => (
          <label key={host} className="check">
            <input
              type="checkbox"
              checked={filter.hosts.includes(host)}
              onChange={() => update({ hosts: toggle(filter.hosts, host) })}
            />
            Host {host}
          </label>
        ))}
        {ALL_LAYERS.filter((l) => layers.includes(l)).map((layer) => (
          <label key={layer} className="check">
            <input
              type="checkbox"
              checked={filter.layers.includes(layer)}
              onChange={() => update({ layers: toggle(filter.layers, layer) })}
            />
            {layer}
          </label>
        ))}
        <label className="check">
          <input
            type="checkbox"
            checked={filter.onlyIssues}
            onChange={() => update({ onlyIssues: !filter.onlyIssues })}
          />
          Só timeouts, ACKs duplicados e rejeitados
        </label>
        <input
          type="search"
          className="search"
          placeholder="Buscar (estado, evento, ação)"
          aria-label="Buscar no log"
          value={filter.query}
          onChange={(e) => update({ query: e.target.value })}
        />
        {!isDefaultFilter(filter) && (
          <button type="button" onClick={() => setFilter(DEFAULT_FILTER)}>
            Limpar filtros
          </button>
        )}
      </div>
      <div className="table-box" ref={box} tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th>t (ms)</th>
              <th>Host</th>
              <th>Camada</th>
              <th>Estado anterior</th>
              <th>Evento</th>
              <th>Ações</th>
              <th>Novo estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry, index) => (
              <tr
                key={entry.id}
                className={
                  [
                    entry.kind === 'rejected' ? 'rejected' : '',
                    isTimeout(entry.event) ? 'timeout' : '',
                    index === rows.length - 1 ? 'latest' : '',
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
                title={entry.note}
              >
                <td className="num">{formatTime(entry.time)}</td>
                <td>{entry.host}</td>
                <td>{entry.layer}</td>
                <td>{entry.from}</td>
                <td>{entry.event}</td>
                <td className="actions">
                  {entry.kind === 'rejected' ? 'rejeitado' : entry.actions.join(', ') || '-'}
                </td>
                <td>
                  <span className={`state state-${entry.to}`}>{entry.to}</span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="muted empty">
                  {total === 0
                    ? 'Nenhuma transição ainda. Use os botões de Aplicação e inicie a simulação.'
                    : 'Nenhuma transição passa pelos filtros escolhidos.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
