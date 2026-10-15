import { useState } from 'react';
import { PRESETS, findPreset, type Preset } from '../presets';

interface Props {
  active: Preset | null;
  onLoad: (preset: Preset) => void;
}

export function PresetPicker({ active, onLoad }: Props) {
  const [choice, setChoice] = useState(active?.id ?? PRESETS[0]!.id);
  const selected = findPreset(choice) ?? PRESETS[0]!;

  return (
    <section className="panel" aria-labelledby="preset-title">
      <h2 id="preset-title">Cenários prontos</h2>
      <label className="field">
        <span>Cenário do trabalho</span>
        <select value={choice} onChange={(e) => setChoice(Number(e.target.value))}>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id}. {p.title}
            </option>
          ))}
        </select>
      </label>
      <p className="small">{selected.summary}</p>
      <p className="muted small">
        <strong>O que observar:</strong> {selected.watch}
      </p>
      <button type="button" className="primary" onClick={() => onLoad(selected)}>
        Carregar cenário {selected.id}
      </button>
      {active && (
        <p className="muted small">
          Carregado: {active.id}. {active.title}. O botão Reset repete este cenário.
        </p>
      )}
      <p className="muted small">O cenário 10 (UDP × TCP) está na aba Comparação.</p>
    </section>
  );
}
