import type { Simulation } from '@fsms/scenarios';
import { formatTime } from '../format';

export const SPEEDS = [0.25, 0.5, 1, 2, 5, 10, 50, 200];

interface Props {
  sim: Simulation;
  running: boolean;
  speed: number;
  onToggle: () => void;
  onSpeed: (speed: number) => void;
  onReset: () => void;
}

export function Controls({ sim, running, speed, onToggle, onSpeed, onReset }: Props) {
  const next = sim.nextEventTime;
  return (
    <section className="panel" aria-labelledby="controls-title">
      <h2 id="controls-title">Controles</h2>
      <p className="clock" aria-live="off">
        t = <strong>{formatTime(sim.now)}</strong> ms <span className="muted">(tempo virtual)</span>
      </p>
      <p className="muted small">
        {next === undefined
          ? 'Nenhum evento agendado.'
          : `Próximo evento em t = ${formatTime(next)} ms.`}
      </p>
      <div className="row">
        <button type="button" className="primary" onClick={onToggle}>
          {running ? 'Pausar' : 'Iniciar'}
        </button>
        <button
          type="button"
          onClick={() => sim.step()}
          disabled={running || sim.idle}
          title={sim.idle ? 'Não há eventos agendados' : 'Executa só o próximo evento'}
        >
          Passo
        </button>
        <button type="button" onClick={onReset}>
          Reset
        </button>
      </div>
      <label className="field">
        <span>Velocidade</span>
        <select value={speed} onChange={(e) => onSpeed(Number(e.target.value))}>
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
