import { describe, expect, it } from 'vitest';
import { Simulation, type Command } from '@fsms/scenarios';
import { buildArrows, describeArrow, layoutSequence, LOST_DROP } from '../src/diagram/sequence';

function tcp(commands: (Command | { advance: number } | 'drop')[], channel = {}): Simulation {
  const sim = new Simulation({ protocol: 'TCP', seed: 1, channel });
  for (const c of commands) {
    if (c === 'drop') sim.dropNext();
    else if ('advance' in c) sim.advance(c.advance);
    else sim.command(c);
  }
  return sim;
}

describe('buildArrows', () => {
  it('o handshake vira três setas entregues, de A para B e de volta', () => {
    const sim = tcp([
      { type: 'listen', host: 'B' },
      { type: 'connect', host: 'A' },
      { advance: 1000 },
    ]);
    const arrows = buildArrows(sim.channelEvents);
    expect(arrows.map((a) => a.label.split(' ')[0])).toEqual(['SYN', 'SYN-ACK', 'ACK']);
    expect(arrows.map((a) => `${a.from}${a.to}`)).toEqual(['AB', 'BA', 'AB']);
    expect(arrows.every((a) => a.outcome === 'delivered' && a.kind === 'normal')).toBe(true);
    expect(arrows.every((a) => a.arriveAt! > a.sentAt)).toBe(true);
  });

  it('o SYN descartado aparece perdido e o reenvio como retransmissão por timeout', () => {
    const sim = tcp([
      { type: 'listen', host: 'B' },
      'drop',
      { type: 'connect', host: 'A' },
      { advance: 5000 },
    ]);
    const [first, second] = buildArrows(sim.channelEvents);
    expect(first!.outcome).toBe('lost');
    expect(first!.lossReason).toBe('manual');
    expect(second!.label).toBe(first!.label);
    expect(second!.kind).toBe('retx-timeout');
    expect(second!.outcome).toBe('delivered');
  });

  it('a perda de um segmento de dados gera retransmissão rápida', () => {
    const sim = tcp([
      { type: 'listen', host: 'B' },
      { type: 'connect', host: 'A' },
      { advance: 500 },
      'drop',
      { type: 'send', host: 'A', bytes: 1000 },
      { advance: 5000 },
    ]);
    const arrows = buildArrows(sim.channelEvents);
    const lost = arrows.filter((a) => a.outcome === 'lost');
    expect(lost).toHaveLength(1);
    expect(lost[0]!.label).toContain('DATA seq=1001');
    const fast = arrows.filter((a) => a.kind === 'retx-fast');
    expect(fast.length).toBeGreaterThan(0);
    expect(fast[0]!.label).toContain('DATA seq=1001');
  });

  it('cópias duplicadas e quadros corrompidos são marcados', () => {
    const dup = tcp(
      [{ type: 'listen', host: 'B' }, { type: 'connect', host: 'A' }, { advance: 2000 }],
      { dupProb: 1 },
    );
    const arrows = buildArrows(dup.channelEvents);
    expect(arrows.some((a) => a.duplicate)).toBe(true);
    expect(arrows.filter((a) => a.duplicate).every((a) => a.label !== '')).toBe(true);

    const bad = new Simulation({ protocol: 'UDP', seed: 3, channel: { corruptProb: 1 } });
    bad.command({ type: 'datagram', host: 'A' });
    bad.advance(1000);
    const [arrow] = buildArrows(bad.channelEvents);
    expect(arrow!.corrupted).toBe(true);
    expect(describeArrow(arrow!)).toContain('corrompido');
  });

  it('um quadro que ainda não chegou fica em trânsito', () => {
    const sim = tcp([
      { type: 'listen', host: 'B' },
      { type: 'connect', host: 'A' },
    ]);
    const [syn] = buildArrows(sim.channelEvents);
    expect(syn!.outcome).toBe('in-flight');
    expect(describeArrow(syn!)).toContain('trânsito');
  });
});

describe('layoutSequence', () => {
  it('mantém a ordem do tempo e dá altura a cada seta', () => {
    const sim = tcp([
      { type: 'listen', host: 'B' },
      { type: 'connect', host: 'A' },
      { advance: 500 },
      'drop',
      { type: 'send', host: 'A', bytes: 1000 },
      { advance: 5000 },
    ]);
    const layout = layoutSequence(buildArrows(sim.channelEvents), sim.log);
    const starts = layout.arrows.map((a) => a.y1);
    expect([...starts].sort((p, q) => p - q)).toEqual(starts);
    for (const a of layout.arrows) {
      if (a.outcome === 'delivered') expect(a.y2).toBeGreaterThan(a.y1);
      if (a.outcome === 'lost') expect(a.y2).toBe(a.y1 + LOST_DROP);
    }
    const times = layout.ticks.map((t) => t.time);
    expect([...times].sort((p, q) => p - q)).toEqual(times);
    expect(layout.height).toBeGreaterThan(Math.max(...layout.arrows.map((a) => a.y2)));
    expect(layout.tags.some((t) => t.host === 'A' && t.text === 'ESTABLISHED')).toBe(true);
  });

  it('um intervalo longo não estica o desenho', () => {
    const sim = tcp([
      { type: 'listen', host: 'B' },
      'drop',
      { type: 'connect', host: 'A' },
      { advance: 5000 },
    ]);
    const layout = layoutSequence(buildArrows(sim.channelEvents));
    const [first, second] = layout.arrows;
    expect(second!.y1 - first!.y1).toBeLessThanOrEqual(64);
  });

  it('sem eventos devolve um desenho vazio', () => {
    const layout = layoutSequence([]);
    expect(layout.arrows).toEqual([]);
    expect(layout.height).toBeGreaterThan(0);
  });
});
