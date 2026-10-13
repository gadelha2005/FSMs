import type { ChannelParams } from '@fsms/core';
import type { Simulation } from '@fsms/scenarios';

interface Props {
  sim: Simulation;
  onChange: (partial: Partial<ChannelParams>) => void;
}

interface ProbabilityField {
  key: 'lossProb' | 'corruptProb' | 'dupProb' | 'reorderProb';
  label: string;
}

const probabilities: ProbabilityField[] = [
  { key: 'lossProb', label: 'Perda' },
  { key: 'corruptProb', label: 'Corrupção de bits' },
  { key: 'dupProb', label: 'Duplicação' },
  { key: 'reorderProb', label: 'Reordenação' },
];

export function ChannelPanel({ sim, onChange }: Props) {
  const params = sim.channelParams;

  const update = (partial: Partial<ChannelParams>) => {
    const merged = { ...partial };
    if (merged.delayMin !== undefined && merged.delayMin > params.delayMax) {
      merged.delayMax = merged.delayMin;
    }
    if (merged.delayMax !== undefined && merged.delayMax < params.delayMin) {
      merged.delayMin = merged.delayMax;
    }
    sim.setChannelParams(merged);
    onChange(merged);
  };

  return (
    <section className="panel" aria-labelledby="channel-title">
      <h2 id="channel-title">Canal</h2>
      {probabilities.map(({ key, label }) => (
        <label key={key} className="field slider">
          <span>
            {label}: <strong>{Math.round(params[key] * 100)}%</strong>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(params[key] * 100)}
            onChange={(e) => update({ [key]: Number(e.target.value) / 100 })}
          />
        </label>
      ))}
      <label className="field slider">
        <span>
          Atraso mínimo: <strong>{params.delayMin} ms</strong>
        </span>
        <input
          type="range"
          min={0}
          max={500}
          step={5}
          value={params.delayMin}
          onChange={(e) => update({ delayMin: Number(e.target.value) })}
        />
      </label>
      <label className="field slider">
        <span>
          Atraso máximo: <strong>{params.delayMax} ms</strong>
        </span>
        <input
          type="range"
          min={0}
          max={500}
          step={5}
          value={params.delayMax}
          onChange={(e) => update({ delayMax: Number(e.target.value) })}
        />
      </label>
      <div className="row">
        <button type="button" onClick={() => sim.dropNext()}>
          Descartar o próximo segmento
        </button>
        {sim.pendingDrops > 0 && <span className="badge warn">{sim.pendingDrops} na fila</span>}
      </div>
    </section>
  );
}