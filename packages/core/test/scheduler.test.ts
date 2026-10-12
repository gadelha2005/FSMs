import { describe, expect, it } from 'vitest';
import { Scheduler } from '../src';

describe('Scheduler', () => {
  it('começa no tempo 0 e sem eventos', () => {
    const s = new Scheduler();
    expect(s.now).toBe(0);
    expect(s.pending).toBe(0);
    expect(s.step()).toBe(false);
  });

  it('executa em ordem de tempo, não de inserção', () => {
    const s = new Scheduler();
    const log: string[] = [];
    s.at(30, () => log.push('c'));
    s.at(10, () => log.push('a'));
    s.at(20, () => log.push('b'));
    s.runAll();
    expect(log).toEqual(['a', 'b', 'c']);
  });

  it('no mesmo instante, executa na ordem em que foi agendado', () => {
    const s = new Scheduler();
    const log: number[] = [];
    for (let i = 0; i < 20; i++) s.at(5, () => log.push(i));
    s.runAll();
    expect(log).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it('o relógio pula para o instante do evento', () => {
    const s = new Scheduler();
    const seen: number[] = [];
    s.at(1000, () => seen.push(s.now));
    s.at(250, () => seen.push(s.now));
    s.runAll();
    expect(seen).toEqual([250, 1000]);
    expect(s.now).toBe(1000);
  });

  it('after() é relativo ao instante atual', () => {
    const s = new Scheduler();
    const seen: number[] = [];
    s.at(100, () => {
      s.after(50, () => seen.push(s.now));
    });
    s.runAll();
    expect(seen).toEqual([150]);
  });

  it('um evento pode agendar outro dentro dele', () => {
    const s = new Scheduler();
    const log: string[] = [];
    s.at(10, () => {
      log.push('A');
      s.at(10, () => log.push('C'));
    });
    s.at(10, () => log.push('B'));
    s.runAll();
    expect(log).toEqual(['A', 'B', 'C']);
  });

  it('cancel() impede o disparo e devolve true só na primeira vez', () => {
    const s = new Scheduler();
    let fired = false;
    const id = s.at(10, () => (fired = true));
    expect(s.cancel(id)).toBe(true);
    expect(s.cancel(id)).toBe(false);
    expect(s.pending).toBe(0);
    s.runAll();
    expect(fired).toBe(false);
  });

  it('cancel() de um evento que já disparou devolve false', () => {
    const s = new Scheduler();
    const id = s.at(1, () => {});
    s.runAll();
    expect(s.cancel(id)).toBe(false);
  });

  it('nextEventTime ignora eventos cancelados', () => {
    const s = new Scheduler();
    const first = s.at(10, () => {});
    s.at(20, () => {});
    s.cancel(first);
    expect(s.nextEventTime).toBe(20);
  });

  it('runUntil processa só até o limite e deixa o relógio nele', () => {
    const s = new Scheduler();
    const log: number[] = [];
    s.at(10, () => log.push(10));
    s.at(20, () => log.push(20));
    s.at(30, () => log.push(30));
    s.runUntil(25);
    expect(log).toEqual([10, 20]);
    expect(s.now).toBe(25);
    expect(s.pending).toBe(1);
  });

  it('runUntil avança o relógio mesmo sem eventos', () => {
    const s = new Scheduler();
    s.runUntil(500);
    expect(s.now).toBe(500);
  });

  it('não permite agendar no passado nem atraso negativo', () => {
    const s = new Scheduler();
    s.runUntil(100);
    expect(() => s.at(50, () => {})).toThrow(RangeError);
    expect(() => s.after(-1, () => {})).toThrow(RangeError);
    expect(() => s.at(NaN, () => {})).toThrow(RangeError);
  });

  it('runAll protege contra loop infinito de timers', () => {
    const s = new Scheduler();
    const loop = (): void => {
      s.after(1, loop);
    };
    s.after(1, loop);
    expect(() => s.runAll(1000)).toThrow(/loop infinito/);
  });

  it('simula 2×MSL de 60 s instantaneamente (sem esperar tempo real)', () => {
    const s = new Scheduler();
    let closedAt = -1;
    s.after(2 * 30_000, () => (closedAt = s.now));
    const start = performance.now();
    s.runAll();
    expect(closedAt).toBe(60_000);
    expect(performance.now() - start).toBeLessThan(100);
  });
});
