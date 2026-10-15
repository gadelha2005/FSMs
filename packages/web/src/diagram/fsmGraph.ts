import { Graph, layout } from '@dagrejs/dagre';
import type { FsmDefinition } from '@fsms/core';

export interface EdgeItem {
  event: string;
  guarded: boolean;
  descriptions: string[];
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  items: EdgeItem[];
}

export interface GraphModel {
  initial: string;
  states: string[];
  edges: GraphEdge[];
}

export interface Point {
  x: number;
  y: number;
}

export interface PlacedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacedEdge {
  id: string;
  from: string;
  to: string;
  points: Point[];
  labelX: number;
  labelY: number;
  lines: string[];
}

export interface Layout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
}

export const NODE_WIDTH = 132;
export const NODE_HEIGHT = 40;

export const edgeId = (from: string, to: string): string => `${from}>${to}`;

export function buildGraph(definition: FsmDefinition): GraphModel {
  const edges = new Map<string, GraphEdge>();
  for (const t of definition.transitions) {
    const id = edgeId(t.from, t.to);
    let edge = edges.get(id);
    if (!edge) {
      edge = { id, from: t.from, to: t.to, items: [] };
      edges.set(id, edge);
    }
    let item = edge.items.find((i) => i.event === t.event);
    if (!item) {
      item = { event: t.event, guarded: false, descriptions: [] };
      edge.items.push(item);
    }
    if (t.guard) item.guarded = true;
    const description = [t.label?.event, t.label?.action].filter(Boolean).join(' → ');
    if (description && !item.descriptions.includes(description))
      item.descriptions.push(description);
  }
  return {
    initial: definition.initial,
    states: [...definition.states],
    edges: [...edges.values()],
  };
}

export function edgeLines(edge: GraphEdge): string[] {
  return edge.items.map((i) => (i.guarded ? `${i.event} ⚑` : i.event));
}

export function layoutGraph(model: GraphModel, direction: 'LR' | 'TB' = 'LR'): Layout {
  const g = new Graph();
  g.setGraph({
    rankdir: direction,
    nodesep: 36,
    ranksep: 90,
    edgesep: 24,
    marginx: 24,
    marginy: 24,
  });
  g.setDefaultEdgeLabel(() => ({}));
  for (const id of model.states) g.setNode(id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const edge of model.edges) {
    const lines = edgeLines(edge);
    const width = Math.max(...lines.map((l) => l.length)) * 7.4 + 14;
    g.setEdge(edge.from, edge.to, { width, height: lines.length * 17 + 6, labelpos: 'c' });
  }
  layout(g);

  const nodes: PlacedNode[] = model.states.map((id) => {
    const n = g.node(id);
    return { id, x: n.x!, y: n.y!, width: NODE_WIDTH, height: NODE_HEIGHT };
  });
  const edges: PlacedEdge[] = model.edges.map((edge) => {
    const e = g.edge(edge.from, edge.to);
    const lines = edgeLines(edge);
    if (edge.from === edge.to) {
      const n = g.node(edge.from);
      const top = n.y! - NODE_HEIGHT / 2;
      const rise = 26 + lines.length * 8;
      return {
        id: edge.id,
        from: edge.from,
        to: edge.to,
        points: selfLoop(n.x!, top, rise),
        labelX: n.x!,
        labelY: top - rise - lines.length * 8.5,
        lines,
      };
    }
    return {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      points: (e.points ?? []).map((p: Point) => ({ x: p.x, y: p.y })),
      labelX: e.x ?? 0,
      labelY: e.y ?? 0,
      lines,
    };
  });
  return { nodes, edges };
}

function selfLoop(x: number, top: number, rise: number): Point[] {
  return [
    { x: x + 20, y: top },
    { x: x + 36, y: top - rise },
    { x: x - 36, y: top - rise },
    { x: x - 20, y: top },
  ];
}

export function smoothPath(points: Point[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  if (rest.length === 0) return `M ${first!.x} ${first!.y}`;
  let d = `M ${first!.x} ${first!.y}`;
  for (let i = 0; i < rest.length - 1; i++) {
    const p = rest[i]!;
    const q = rest[i + 1]!;
    d += ` Q ${p.x} ${p.y} ${(p.x + q.x) / 2} ${(p.y + q.y) / 2}`;
  }
  const last = rest[rest.length - 1]!;
  return `${d} L ${last.x} ${last.y}`;
}
