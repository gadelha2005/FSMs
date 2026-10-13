import { useEffect, useRef } from 'react';
import type { Simulation } from '@fsms/scenarios';
import { formatTime } from '../format';

interface Props {
  sim: Simulation;
}

export function LogTable({ sim }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const total = sim.log.length;

  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [total]);

  return (
    <section className="panel log" aria-labelledby="log-title">
      <h2 id="log-title">
        Log <span className="muted small">({total} transições)</span>
      </h2>
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
            {sim.log.map((entry, index) => (
              <tr
                key={entry.id}
                className={
                  [
                    entry.kind === 'rejected' ? 'rejected' : '',
                    entry.event === 'TIMEOUT' ? 'timeout' : '',
                    index === total - 1 ? 'latest' : '',
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
            {total === 0 && (
              <tr>
                <td colSpan={7} className="muted empty">
                  Nenhuma transição ainda. Use os botões de Aplicação e inicie a simulação.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}