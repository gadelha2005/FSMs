import type { HostInfo, Simulation } from '@fsms/scenarios';
import { STATE_HELP } from '../guide';

interface Props {
  sim: Simulation;
}

function HostCard({ info, port }: { info: HostInfo; port: number }) {
  return (
    <article className="card" aria-label={`Host ${info.name}`}>
      <header className="card-head">
        <h3>
          Host {info.name} <span className="muted small">porta {port}</span>
        </h3>
        <span className={`state state-${info.state}`}>{info.state}</span>
      </header>
      <p className="small muted">{STATE_HELP[info.state] ?? ''}</p>
      {info.senderState && (
        <p className="small">
          Remetente: <span className="badge">{info.senderState}</span>
        </p>
      )}
      <dl className="details">
        {info.details.map((d) => (
          <div key={d.label}>
            <dt>{d.label}</dt>
            <dd>{d.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function HostCards({ sim }: Props) {
  const hosts = sim.hosts();
  return (
    <section className="cards" aria-label="Estado dos hosts">
      <HostCard info={hosts.A} port={1234} />
      <HostCard info={hosts.B} port={80} />
    </section>
  );
}
