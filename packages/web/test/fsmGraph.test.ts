import { describe, expect, it } from 'vitest';
import { FSM_DEFINITIONS, Simulation } from '@fsms/scenarios';
import { buildGraph, edgeId, layoutGraph, smoothPath } from '../src/diagram/fsmGraph';
import { summarizeTrace } from '../src/diagram/trace';

describe('buildGraph', () => {
  it('agrupa as transições por par origem/destino sem perder nenhuma', () => {
    const def = FSM_DEFINITIONS.conexão;
    const model = buildGraph(def);
    const events = model.edges.reduce((sum, e) => sum + e.items.length, 0);
    expect(model.states).toEqual(def.states);
    expect(model.initial).toBe('CLOSED');
    expect(model.edges.length).toBeLessThan(def.transitions.length);
    expect(events).toBeGreaterThanOrEqual(model.edges.length);
    const keys = new Set(def.transitions.map((t) => edgeId(t.from, t.to)));
    expect(new Set(model.edges.map((e) => e.id))).toEqual(keys);
  });

  it('marca como protegido o evento que tem guarda', () => {
    const model = buildGraph(FSM_DEFINITIONS.remetente);
    const ackNew = model.edges.flatMap((e) => e.items).filter((i) => i.event === 'ACK_NEW');
    expect(ackNew.length).toBeGreaterThan(0);
    expect(ackNew.every((i) => i.guarded)).toBe(true);
  });
});

describe('layoutGraph', () => {
  it.each(['conexão', 'remetente', 'UDP'] as const)('posiciona tudo em %s', (layer) => {
    const model = buildGraph(FSM_DEFINITIONS[layer]);
    const layout = layoutGraph(model);
    expect(layout.nodes).toHaveLength(model.states.length);
    expect(layout.edges).toHaveLength(model.edges.length);
    for (const n of layout.nodes) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
    }
    for (const e of layout.edges) {
      expect(e.points.length).toBeGreaterThanOrEqual(2);
      expect(Number.isFinite(e.labelX) && Number.isFinite(e.labelY)).toBe(true);
    }
  });

  it('desenha o laço de uma transição para o mesmo estado acima do nó', () => {
    const layout = layoutGraph(buildGraph(FSM_DEFINITIONS.UDP));
    const loop = layout.edges[0]!;
    const node = layout.nodes[0]!;
    expect(loop.from).toBe(loop.to);
    expect(loop.labelY).toBeLessThan(node.y - node.height / 2);
  });
});

describe('smoothPath', () => {
  it('gera um caminho que começa e termina nos pontos dados', () => {
    const d = smoothPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
    expect(d.startsWith('M 0 0')).toBe(true);
    expect(d.endsWith('L 10 10')).toBe(true);
    expect(smoothPath([])).toBe('');
  });
});

describe('summarizeTrace', () => {
  it('acompanha o caminho percorrido pelo host no handshake', () => {
    const sim = new Simulation({ protocol: 'TCP', seed: 1 });
    sim.command({ type: 'listen', host: 'B' });
    sim.command({ type: 'connect', host: 'A' });
    sim.advance(1000);

    const a = summarizeTrace(sim.log, 'A', 'conexão', 'CLOSED');
    expect(a.last?.to).toBe('ESTABLISHED');
    expect([...a.visited].sort()).toEqual(['CLOSED', 'ESTABLISHED', 'SYN_SENT']);
    expect(a.taken.has(edgeId('SYN_SENT', 'ESTABLISHED'))).toBe(true);

    const b = summarizeTrace(sim.log, 'B', 'conexão', 'CLOSED');
    expect(b.visited.has('SYN_RCVD')).toBe(true);
    expect(summarizeTrace(sim.log, 'A', 'remetente', 'IDLE').last).toBeUndefined();
  });
});
