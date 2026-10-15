import { useState } from 'react';
import { CompareView } from './CompareView';
import { SimulationView } from './SimulationView';

type Tab = 'sim' | 'compare';

const tabs: { id: Tab; label: string }[] = [
  { id: 'sim', label: 'Simulação' },
  { id: 'compare', label: 'Comparação UDP × TCP' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('sim');

  return (
    <div className="app">
      <header className="topbar">
        <h1>Simulador de FSMs: UDP e TCP</h1>
        <div className="segmented" role="tablist" aria-label="Telas">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'segment active' : 'segment'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>
      {tab === 'sim' ? <SimulationView /> : <CompareView />}
    </div>
  );
}
