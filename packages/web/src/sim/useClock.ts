import { useEffect } from 'react';
import type { Simulation } from '@fsms/scenarios';

const MAX_FRAME_MS = 100;

export function useClock(sim: Simulation, running: boolean, speed: number): void {
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const elapsed = Math.min(now - last, MAX_FRAME_MS);
      last = now;
      if (!sim.idle) sim.advance(elapsed * speed);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [sim, running, speed]);
}