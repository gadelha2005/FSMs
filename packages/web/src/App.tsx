import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChannelParams } from '@fsms/core';
import {
  DEFAULT_TCP_SETTINGS,
  Simulation,
  type ProtocolName,
  type TcpSettings,
} from '@fsms/scenarios';
import { AppActions } from './components/AppActions';
import { ChannelPanel } from './components/ChannelPanel';
import { Controls } from './components/Controls';
import { HostCards } from './components/HostCards';
import { LogTable } from './components/LogTable';
import { ProtocolSelector } from './components/ProtocolSelector';
import { SetupPanel } from './components/SetupPanel';
import { nextStepHint } from './guide';
import { useClock } from './sim/useClock';
import { useSimulationVersion } from './sim/useSimulation';

export function App() {
  const [protocol, setProtocol] = useState<ProtocolName>('TCP');
  const [seed, setSeed] = useState(1);
  const [tcp, setTcp] = useState<TcpSettings>(DEFAULT_TCP_SETTINGS);
  const [speed, setSpeed] = useState(1);
  const [running, setRunning] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const channelRef = useRef<Partial<ChannelParams>>({});

  const sim = useMemo(
    () => new Simulation({ protocol, seed, tcp, channel: channelRef.current }),
    [protocol, seed, tcp, resetKey],
  );

  useSimulationVersion(sim);
  useClock(sim, running, speed);

  const restart = useCallback(() => {
    setRunning(false);
    setResetKey((k) => k + 1);
  }, []);

  const changeProtocol = (next: ProtocolName) => {
    setRunning(false);
    setProtocol(next);
  };

  const changeChannel = (partial: Partial<ChannelParams>) => {
    channelRef.current = { ...channelRef.current, ...partial };
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>Simulador de FSMs: UDP e TCP</h1>
        <ProtocolSelector value={protocol} onChange={changeProtocol} />
      </header>
      <div className="layout">
        <aside className="sidebar">
          <Controls
            sim={sim}
            running={running}
            speed={speed}
            onToggle={() => setRunning((r) => !r)}
            onSpeed={setSpeed}
            onReset={restart}
          />
          <AppActions key={`${protocol}-${seed}-${resetKey}`} sim={sim} />
          <ChannelPanel sim={sim} onChange={changeChannel} />
          <SetupPanel
            protocol={protocol}
            seed={seed}
            tcp={tcp}
            onSeed={(value) => {
              setRunning(false);
              setSeed(value);
            }}
            onTcp={(value) => {
              setRunning(false);
              setTcp(value);
            }}
          />
        </aside>
        <main className="content">
          {protocol === 'TCP' && (
            <p className="hint" role="status">
              {nextStepHint(sim.hosts(), sim.idle)}
            </p>
          )}
          <HostCards sim={sim} />
          <LogTable sim={sim} />
        </main>
      </div>
    </div>
  );
}