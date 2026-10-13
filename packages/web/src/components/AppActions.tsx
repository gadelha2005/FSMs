import { useState } from 'react';
import type { Command, HostName, Simulation } from '@fsms/scenarios';
import {
  closeAvailability,
  connectAvailability,
  listenAvailability,
  sendAvailability,
  type Availability,
} from '../guide';

interface Props {
  sim: Simulation;
}

const hosts: HostName[] = ['A', 'B'];

export function AppActions({ sim }: Props) {
  const [bytes, setBytes] = useState(1000);
  const [error, setError] = useState<string | null>(null);

  const run = (command: Command) => {
    const result = sim.command(command);
    setError(result.ok ? null : (result.error ?? 'Erro desconhecido'));
  };

  const hostInfo = sim.hosts();

  const action = (label: string, availability: Availability, command: Command) => (
    <button
      type="button"
      disabled={!availability.enabled}
      title={availability.reason}
      onClick={() => run(command)}
    >
      {label}
    </button>
  );

  return (
    <section className="panel" aria-labelledby="actions-title">
      <h2 id="actions-title">Aplicação</h2>
      {sim.protocol === 'TCP' ? (
        <>
          <label className="field">
            <span>Bytes por envio</span>
            <input
              type="number"
              min={1}
              max={100000}
              value={bytes}
              onChange={(e) => setBytes(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          {hosts.map((host) => (
            <div key={host} className="host-actions">
              <h3>Host {host}</h3>
              <div className="row wrap">
                {action('Abrir porta', listenAvailability(hostInfo[host]), {
                  type: 'listen',
                  host,
                })}
                {action('Conectar', connectAvailability(hostInfo[host]), { type: 'connect', host })}
                {action('Enviar dados', sendAvailability(hostInfo[host]), {
                  type: 'send',
                  host,
                  bytes,
                })}
                {action('Fechar', closeAvailability(hostInfo[host]), { type: 'close', host })}
              </div>
            </div>
          ))}
        </>
      ) : (
        <div className="row wrap">
          {hosts.map((host) => (
            <button key={host} type="button" onClick={() => run({ type: 'datagram', host })}>
              Enviar de {host} para {host === 'A' ? 'B' : 'A'}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}