import { useMemo, useState } from 'react';
import {
  Background,
  Controls as FlowControls,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FSM_DEFINITIONS, type HostName, type LogLayer, type Simulation } from '@fsms/scenarios';
import { formatTime } from '../format';
import { useSimulationVersion } from '../sim/useSimulation';
import { buildGraph, edgeId, layoutGraph, smoothPath, type Layout, type Point } from './fsmGraph';
import { summarizeTrace } from './trace';

interface StateNodeData extends Record<string, unknown> {
  label: string;
  active: boolean;
  visited: boolean;
  initial: boolean;
}

interface FsmEdgeData extends Record<string, unknown> {
  points: Point[];
  lines: string[];
  labelX: number;
  labelY: number;
  taken: boolean;
  active: boolean;
  title: string;
}

type StateNodeType = Node<StateNodeData, 'state'>;
type FsmEdgeType = Edge<FsmEdgeData, 'fsm'>;

function StateNodeView({ data }: NodeProps<StateNodeType>) {
  const classes = ['fsm-node', data.active ? 'active' : '', data.visited ? 'visited' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes}>
      <Handle type="target" position={Position.Left} className="fsm-handle" />
      {data.initial && <span className="fsm-initial">início</span>}
      <span>{data.label}</span>
      <Handle type="source" position={Position.Right} className="fsm-handle" />
    </div>
  );
}

function FsmEdgeView({ data }: EdgeProps<FsmEdgeType>) {
  if (!data) return null;
  const marker = data.active ? 'fsm-arrow-active' : data.taken ? 'fsm-arrow-taken' : 'fsm-arrow';
  const classes = ['fsm-edge', data.taken ? 'taken' : '', data.active ? 'active' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <>
      <path d={smoothPath(data.points)} className={classes} markerEnd={`url(#${marker})`} />
      <EdgeLabelRenderer>
        <div
          className={`fsm-label${data.active ? ' active' : ''}${data.taken ? ' taken' : ''}`}
          style={{
            transform: `translate(-50%, -50%) translate(${data.labelX}px, ${data.labelY}px)`,
          }}
          title={data.title}
        >
          {data.lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { state: StateNodeView };
const edgeTypes = { fsm: FsmEdgeView };

const layoutCache = new Map<LogLayer, { model: ReturnType<typeof buildGraph>; layout: Layout }>();

function graphFor(layer: LogLayer) {
  let cached = layoutCache.get(layer);
  if (!cached) {
    const model = buildGraph(FSM_DEFINITIONS[layer]);
    cached = { model, layout: layoutGraph(model, 'LR') };
    layoutCache.set(layer, cached);
  }
  return cached;
}

const layerTitles: Record<LogLayer, string> = {
  conexão: 'Conexão (handshake e encerramento)',
  remetente: 'Remetente (envio de dados)',
  UDP: 'UDP',
};

interface Props {
  sim: Simulation;
}

export function StateDiagram({ sim }: Props) {
  const version = useSimulationVersion(sim);
  const [host, setHost] = useState<HostName>('A');
  const [tcpLayer, setTcpLayer] = useState<LogLayer>('conexão');
  const [expanded, setExpanded] = useState(false);
  const layer: LogLayer = sim.protocol === 'UDP' ? 'UDP' : tcpLayer;

  const { model, layout } = graphFor(layer);
  const info = sim.hosts()[host];
  const current = layer === 'remetente' ? info.senderState : info.state;
  const summary = summarizeTrace(sim.log, host, layer, model.initial);
  const lastId = summary.last ? edgeId(summary.last.from, summary.last.to) : undefined;

  const nodes = useMemo<StateNodeType[]>(
    () =>
      layout.nodes.map((n) => ({
        id: n.id,
        type: 'state',
        position: { x: n.x - n.width / 2, y: n.y - n.height / 2 },
        draggable: false,
        data: {
          label: n.id,
          active: n.id === current,
          visited: summary.visited.has(n.id),
          initial: n.id === model.initial,
        },
      })),
    [layout, current, version, host, layer],
  );

  const edges = useMemo<FsmEdgeType[]>(
    () =>
      layout.edges.map((e) => {
        const graphEdge = model.edges.find((g) => g.id === e.id)!;
        return {
          id: e.id,
          type: 'fsm',
          source: e.from,
          target: e.to,
          data: {
            points: e.points,
            lines: e.lines,
            labelX: e.labelX,
            labelY: e.labelY,
            taken: summary.taken.has(e.id),
            active: e.id === lastId,
            title: graphEdge.items.map((i) => [i.event, ...i.descriptions].join(': ')).join('\n'),
          },
        };
      }),
    [layout, lastId, version, host, layer],
  );

  const last = summary.last;

  return (
    <section
      className={`panel${expanded ? ' expanded' : ''}`}
      aria-labelledby="state-diagram-title"
    >
      <h2 id="state-diagram-title">Diagrama de estados</h2>
      <div className="row wrap">
        <div className="segmented" role="group" aria-label="Host">
          {(['A', 'B'] as const).map((h) => (
            <button
              key={h}
              type="button"
              className={`segment small${host === h ? ' active' : ''}`}
              aria-pressed={host === h}
              onClick={() => setHost(h)}
            >
              Host {h}
            </button>
          ))}
        </div>
        {sim.protocol === 'TCP' && (
          <div className="segmented" role="group" aria-label="Máquina de estados">
            {(['conexão', 'remetente'] as const).map((l) => (
              <button
                key={l}
                type="button"
                className={`segment small${tcpLayer === l ? ' active' : ''}`}
                aria-pressed={tcpLayer === l}
                onClick={() => setTcpLayer(l)}
              >
                {l === 'conexão' ? 'Conexão' : 'Remetente'}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="push-right" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Fechar tela cheia' : 'Tela cheia'}
        </button>
      </div>
      <p className="muted small">
        {layerTitles[layer]}. Estado atual: <strong>{current ?? '-'}</strong>.
      </p>
      <div className="flow-box" key={`${layer}-${host}-${expanded}`}>
        <svg className="flow-defs" aria-hidden="true">
          <defs>
            {[
              ['fsm-arrow', 'var(--muted)'],
              ['fsm-arrow-taken', 'var(--accent)'],
              ['fsm-arrow-active', 'var(--warn)'],
            ].map(([id, color]) => (
              <marker
                key={id}
                id={id}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
              </marker>
            ))}
          </defs>
        </svg>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.1 }}
          minZoom={0.15}
          maxZoom={1.6}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          colorMode="system"
        >
          <Background gap={20} />
          <FlowControls showInteractive={false} />
        </ReactFlow>
      </div>
      <div className="legend small">
        <span>
          <i className="swatch node-active" /> estado atual
        </span>
        <span>
          <i className="swatch node-visited" /> já visitado
        </span>
        <span>
          <i className="swatch edge-active" /> última transição
        </span>
        <span>
          <i className="swatch edge-taken" /> transição já usada
        </span>
        <span>⚑ tem condição (guarda)</span>
      </div>
      <div className="last-transition" aria-live="polite">
        {last ? (
          <>
            <strong>Última transição</strong> (t = {formatTime(last.time)} ms):{' '}
            <code>{last.from}</code> → <code>{last.to}</code> por <code>{last.event}</code>
            {last.actions.length > 0 && <> com as ações {last.actions.join(', ')}</>}.
          </>
        ) : (
          <span className="muted">Nenhuma transição neste host ainda.</span>
        )}
      </div>
    </section>
  );
}
