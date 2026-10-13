import type { ProtocolName, TcpSettings } from '@fsms/scenarios';

interface Props {
  protocol: ProtocolName;
  seed: number;
  tcp: TcpSettings;
  onSeed: (seed: number) => void;
  onTcp: (settings: TcpSettings) => void;
}

export function SetupPanel({ protocol, seed, tcp, onSeed, onTcp }: Props) {
  return (
    <section className="panel" aria-labelledby="setup-title">
      <h2 id="setup-title">Simulação</h2>
      <label className="field">
        <span>Seed (reinicia a simulação)</span>
        <input
          type="number"
          min={0}
          step={1}
          value={seed}
          onChange={(e) => onSeed(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        />
      </label>
      {protocol === 'TCP' && (
        <>
          <label className="field">
            <span>MSL (ms; TIME_WAIT = 2 × MSL)</span>
            <input
              type="number"
              min={10}
              step={100}
              value={tcp.msl}
              onChange={(e) => onTcp({ ...tcp, msl: Math.max(10, Number(e.target.value) || 10) })}
            />
          </label>
          <label className="field">
            <span>Timeout inicial de retransmissão (ms)</span>
            <input
              type="number"
              min={10}
              step={100}
              value={tcp.rto}
              onChange={(e) => onTcp({ ...tcp, rto: Math.max(10, Number(e.target.value) || 10) })}
            />
          </label>
        </>
      )}
    </section>
  );
}