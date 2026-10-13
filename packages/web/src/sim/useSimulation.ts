import { useSyncExternalStore } from 'react';
import type { Simulation } from '@fsms/scenarios';

export function useSimulationVersion(sim: Simulation): number {
  return useSyncExternalStore(
    (notify) => sim.subscribe(notify),
    () => sim.getVersion(),
  );
}