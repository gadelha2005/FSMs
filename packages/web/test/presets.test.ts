import { describe, expect, it } from 'vitest';
import { Simulation } from '@fsms/scenarios';
import { PRESETS, applyPreset, findPreset, type Preset } from '../src/presets';

function load(preset: Preset): Simulation {
  const sim = new Simulation({
    protocol: preset.protocol,
    seed: preset.seed,
    channel: preset.channel,
    tcp: preset.tcp,
  });
  applyPreset(sim, preset);
  return sim;
}

function settle(sim: Simulation): void {
  sim.advance(60_000);
}

const state = (sim: Simulation, host: 'A' | 'B') => sim.hosts()[host].state;
const detail = (sim: Simulation, host: 'A' | 'B', label: string) =>
  sim.hosts()[host].details.find((d) => d.label === label)?.value;

describe('cenários prontos', () => {
  it('têm ids de 1 a 9, únicos e com texto', () => {
    expect(PRESETS.map((p) => p.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const p of PRESETS) {
      expect(p.title && p.summary && p.watch).toBeTruthy();
    }
    expect(findPreset(6)?.title).toBe('Retransmissão rápida');
    expect(findPreset(99)).toBeUndefined();
  });

  it('1: o handshake só começa e os dois chegam a ESTABLISHED depois', () => {
    const sim = load(findPreset(1)!);
    expect(state(sim, 'A')).toBe('SYN_SENT');
    settle(sim);
    expect([state(sim, 'A'), state(sim, 'B')]).toEqual(['ESTABLISHED', 'ESTABLISHED']);
  });

  it('2: o SYN perdido é reenviado por timeout', () => {
    const sim = load(findPreset(2)!);
    settle(sim);
    expect([state(sim, 'A'), state(sim, 'B')]).toEqual(['ESTABLISHED', 'ESTABLISHED']);
    expect(sim.log.some((e) => e.event === 'TIMEOUT_RETX' && e.host === 'A')).toBe(true);
    expect(sim.channelEvents.filter((e) => e.kind === 'lost')).toHaveLength(1);
  });

  it('3: o SYN+ACK perdido também termina conectado', () => {
    const sim = load(findPreset(3)!);
    settle(sim);
    expect([state(sim, 'A'), state(sim, 'B')]).toEqual(['ESTABLISHED', 'ESTABLISHED']);
    const lost = sim.channelEvents.filter((e) => e.kind === 'lost');
    expect(lost).toHaveLength(1);
    expect(String(lost[0]!.frame.meta.label)).toContain('SYN-ACK');
  });

  it('4: A fecha e fica esperando B; depois B fecha e a conexão termina', () => {
    const sim = load(findPreset(4)!);
    sim.advance(1000);
    expect([state(sim, 'A'), state(sim, 'B')]).toEqual(['FIN_WAIT_2', 'CLOSE_WAIT']);
    sim.command({ type: 'close', host: 'B' });
    sim.advance(1000);
    expect(state(sim, 'A')).toBe('TIME_WAIT');
    settle(sim);
    expect([state(sim, 'A'), state(sim, 'B')]).toEqual(['CLOSED', 'CLOSED']);
  });

  it('5: fechamento simultâneo passa por CLOSING', () => {
    const sim = load(findPreset(5)!);
    sim.advance(1);
    expect([state(sim, 'A'), state(sim, 'B')]).toEqual(['FIN_WAIT_1', 'FIN_WAIT_1']);
    sim.advance(1000);
    expect(sim.log.some((e) => e.to === 'CLOSING')).toBe(true);
    settle(sim);
    expect([state(sim, 'A'), state(sim, 'B')]).toEqual(['CLOSED', 'CLOSED']);
  });

  it('6: perde o primeiro segmento, recebe ACKs duplicados e retransmite rápido', () => {
    const sim = load(findPreset(6)!);
    settle(sim);
    expect(detail(sim, 'B', 'Bytes entregues à aplicação')).toBe('1000');
    expect(sim.log.filter((e) => e.event === 'ACK_DUP').length).toBeGreaterThanOrEqual(3);
    const fast = sim.channelEvents.filter((e) => e.kind === 'sent' && e.frame.meta.retx === 'fast');
    expect(fast.length).toBeGreaterThan(0);
  });

  it('7: porta fechada, o handshake não conclui', () => {
    const sim = load(findPreset(7)!);
    settle(sim);
    expect([state(sim, 'A'), state(sim, 'B')]).toEqual(['CLOSED', 'CLOSED']);
    const labels = sim.channelEvents.flatMap((e) =>
      e.kind === 'sent' ? [String(e.frame.meta.label)] : [],
    );
    expect(labels.some((l) => l.startsWith('RST'))).toBe(true);
    expect(sim.log.some((e) => e.host === 'A' && e.from === 'SYN_SENT' && e.to === 'CLOSED')).toBe(
      true,
    );
  });

  it('8: o UDP perde datagramas e não retransmite', () => {
    const sim = load(findPreset(8)!);
    settle(sim);
    expect(detail(sim, 'A', 'Enviados')).toBe('20');
    const delivered = Number(detail(sim, 'B', 'Entregues à aplicação'));
    expect(delivered).toBeGreaterThan(0);
    expect(delivered).toBeLessThan(20);
    expect(sim.channelEvents.filter((e) => e.kind === 'sent')).toHaveLength(20);
  });

  it('9: todos os datagramas são descartados pelo checksum', () => {
    const sim = load(findPreset(9)!);
    settle(sim);
    expect(detail(sim, 'B', 'Entregues à aplicação')).toBe('0');
    expect(detail(sim, 'B', 'Descartados (checksum)')).toBe('3');
  });
});
