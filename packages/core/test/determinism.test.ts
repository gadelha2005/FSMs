import { describe, expect, it } from 'vitest';
import { Scheduler, createRng } from '../src';

function simulate(seed: number): number[] {
  const rng = createRng(seed);
  const s = new Scheduler();
  const arrivals: number[] = [];
  for (let id = 0; id < 50; id++) {
    s.after(rng.int(10, 200), () => arrivals.push(id));
  }
  s.runAll();
  return arrivals;
}

describe('determinismo (Scheduler + RNG com seed)', () => {
  it('mesma seed => mesma ordem de chegada', () => {
    expect(simulate(123)).toEqual(simulate(123));
  });

  it('seeds diferentes => ordens diferentes (pacotes reordenam)', () => {
    expect(simulate(1)).not.toEqual(simulate(2));
  });
});
