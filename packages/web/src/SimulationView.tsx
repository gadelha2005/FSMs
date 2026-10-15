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
import { PresetPicker } from './components/PresetPicker';
import { ProtocolSelector } from './components/ProtocolSelector';
import { SetupPanel } from './components/SetupPanel';
import { SequenceDiagram } from './diagram/SequenceDiagram';
import { StateDiagram } from './diagram/StateDiagram';
import { nextStepHint } from './guide';
import { applyPreset, type Preset } from './presets';
import { useClock } from './sim/useClock';
import { useSimulationVersion } from './sim/useSimulation';

export function SimulationView() {
  const [protocol, setProtocol] = useState<ProtocolName>('TCP');
  const [seed, setSeed] = useState(1);
  const [tcp, setTcp] = useState<TcpSettings>(DEFAULT_TCP_SETTINGS);
  const [speed, setSpeed] = useState(1);
  const [running, setRunning] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [activePreset, setActivePreset] = useState<Preset | null>(null);
  const channelRef = useRef<Partial<ChannelParams>>({});
  const presetRef = useRef<Preset | null>(null);

  const sim = useMemo(() => {
    const created = new Simulation({ protocol, seed, tcp, channel: channelRef.current });
    if (presetRef.current) applyPreset(created, presetRef.current);
    return created;
  }, [protocol, seed, tcp, resetKey]);

  useSimulationVersion(sim);
  useClock(sim, running, speed);

  const restart = useCallback(() => {
    setRunning(false);
    setResetKey((k) => k + 1);
  }, []);

  const forgetPreset = () => {
    presetRef.current = null;
    setActivePreset(null);
  };

  const changeProtocol = (next: ProtocolName) => {
    setRunning(false);
    forgetPreset();
    setProtocol(next);
  };

  const loadPreset = (preset: Preset) => {
    setRunning(false);
    presetRef.current = preset;
    setActivePreset(preset);
    channelRef.current = { ...preset.channel };
    setProtocol(preset.protocol);
    setSeed(preset.seed);
    setTcp({ ...DEFAULT_TCP_SETTINGS, ...preset.tcp });
    setResetKey((k) => k + 1);
  };

  const changeChannel = (partial: Partial<ChannelParams>) => {
    channelRef.current = { ...channelRef.current, ...partial };
  };

  return (
    <div className="view">
      <div className="subbar">
        <ProtocolSelector value={protocol} onChange={changeProtocol} />
      </div>
      <div className="layout">
        <aside className="sidebar">
          <PresetPicker active={activePreset} onLoad={loadPreset} />
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
              forgetPreset();
              setSeed(value);
            }}
            onTcp={(value) => {
              setRunning(false);
              forgetPreset();
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
          <StateDiagram sim={sim} />
          <SequenceDiagram sim={sim} />
          <LogTable sim={sim} />
        </main>
      </div>
    </div>
  );
}
