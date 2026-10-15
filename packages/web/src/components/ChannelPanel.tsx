import type { ChannelParams } from '@fsms/core';
import type { Simulation } from '@fsms/scenarios';
import { ChannelSliders } from './ChannelSliders';

interface Props {
  sim: Simulation;
  onChange: (partial: Partial<ChannelParams>) => void;
}

export function ChannelPanel({ sim, onChange }: Props) {
  const update = (partial: Partial<ChannelParams>) => {
    sim.setChannelParams(partial);
    onChange(partial);
  };

  return (
    <section className="panel" aria-labelledby="channel-title">
      <h2 id="channel-title">Canal</h2>
      <ChannelSliders params={sim.channelParams} onChange={update} />
      <div className="row">
        <button type="button" onClick={() => sim.dropNext()}>
          Descartar o próximo segmento
        </button>
        {sim.pendingDrops > 0 && <span className="badge warn">{sim.pendingDrops} na fila</span>}
      </div>
    </section>
  );
}
