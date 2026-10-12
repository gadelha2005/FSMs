import { describe, expect, it } from 'vitest';
import { CORE_VERSION, createRng } from '../src';

describe('setup', () => {
  it('importa o core', () => {
    expect(CORE_VERSION).toBe('0.1.0');
  });
});

describe('createRng', () => {
  it('mesma seed gera a mesma sequência', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('seeds diferentes geram sequências diferentes', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('chance(0.3) fica perto de 30% em 10 000 sorteios', () => {
    const rng = createRng(7);
    let hits = 0;
    for (let i = 0; i < 10_000; i++) if (rng.chance(0.3)) hits++;
    expect(hits / 10_000).toBeGreaterThan(0.28);
    expect(hits / 10_000).toBeLessThan(0.32);
  });

  it('int respeita os limites', () => {
    const rng = createRng(3);
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(20);
    }
  });
});
