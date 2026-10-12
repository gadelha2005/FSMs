/**
 * Gerador pseudoaleatório com seed (mulberry32).
 * Mesma seed => mesma sequência de números => mesmas falhas no canal.
 * Nunca use Math.random() dentro do core: isso quebraria o determinismo.
 */
export interface Rng {
  /** Número em [0, 1). */
  next(): number;
  /** Inteiro em [min, max], inclusivo. */
  int(min: number, max: number): number;
  /** true com probabilidade p (0..1). */
  chance(p: number): boolean;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
  };
}
