import { useEffect, useMemo, useRef } from 'react';
import type { Simulation } from '@fsms/scenarios';
import { formatTime } from '../format';
import { useSimulationVersion } from '../sim/useSimulation';
import { buildArrows, describeArrow, layoutSequence, LOST_FRACTION } from './sequence';

const WIDTH = 640;
const X_A = 190;
const X_B = 450;

interface Props {
  sim: Simulation;
  title?: string;
  maxHeight?: number;
}

export function SequenceDiagram({ sim, title = 'Diagrama de sequência', maxHeight = 460 }: Props) {
  const version = useSimulationVersion(sim);
  const box = useRef<HTMLDivElement>(null);

  const layout = useMemo(
    () => layoutSequence(buildArrows(sim.channelEvents), sim.log),
    [sim, version],
  );
  const count = layout.arrows.length;

  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  const lost = layout.arrows.filter((a) => a.outcome === 'lost').length;
  const retx = layout.arrows.filter((a) => a.kind !== 'normal').length;

  return (
    <section className="panel" aria-label={title}>
      <h2>{title}</h2>
      <p className="muted small">
        {count} quadros no canal, {lost} perdidos, {retx} retransmissões.
      </p>
      <div className="sequence-box" ref={box} style={{ maxHeight }} tabIndex={0}>
        <svg
          viewBox={`0 0 ${WIDTH} ${layout.height}`}
          width="100%"
          role="img"
          aria-label={`Diagrama de sequência com ${count} quadros`}
        >
          <defs>
            {[
              ['seq-normal', 'var(--accent)'],
              ['seq-retx', 'var(--warn)'],
              ['seq-fast', 'var(--retx-fast)'],
              ['seq-lost', 'var(--danger)'],
            ].map(([id, color]) => (
              <marker
                key={id}
                id={id}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerUnits="userSpaceOnUse"
                markerWidth="9"
                markerHeight="9"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
              </marker>
            ))}
          </defs>
          <text x={X_A} y={18} className="seq-host" textAnchor="middle">
            Host A
          </text>
          <text x={X_B} y={18} className="seq-host" textAnchor="middle">
            Host B
          </text>
          <line x1={X_A} x2={X_A} y1={26} y2={layout.height - 10} className="seq-life" />
          <line x1={X_B} x2={X_B} y1={26} y2={layout.height - 10} className="seq-life" />

          {layout.ticks.map((tick) => (
            <text key={`${tick.y}-${tick.time}`} x={6} y={tick.y + 4} className="seq-tick">
              {formatTime(tick.time)} ms
            </text>
          ))}

          {layout.tags.map((tag, i) => (
            <text
              key={i}
              x={tag.host === 'A' ? X_A - 10 : X_B + 10}
              y={tag.y + 4}
              textAnchor={tag.host === 'A' ? 'end' : 'start'}
              className="seq-tag"
            >
              {tag.text}
            </text>
          ))}

          {layout.arrows.map((arrow) => {
            const fromX = arrow.towardsB ? X_A : X_B;
            const toX = arrow.towardsB ? X_B : X_A;
            const endX =
              arrow.outcome === 'lost'
                ? fromX + (toX - fromX) * LOST_FRACTION
                : arrow.outcome === 'in-flight'
                  ? fromX + (toX - fromX) * 0.5
                  : toX;
            const color =
              arrow.outcome === 'lost'
                ? 'lost'
                : arrow.kind === 'retx-fast'
                  ? 'fast'
                  : arrow.kind === 'retx-timeout'
                    ? 'retx'
                    : 'normal';
            const classes = [
              'seq-arrow',
              `seq-${color}`,
              arrow.corrupted ? 'corrupted' : '',
              arrow.duplicate ? 'duplicate' : '',
              arrow.outcome === 'in-flight' ? 'in-flight' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const midX = (fromX + endX) / 2;
            const midY = (arrow.y1 + arrow.y2) / 2;
            const suffix =
              (arrow.kind === 'retx-timeout' ? ' (retx)' : '') +
              (arrow.kind === 'retx-fast' ? ' (retx rápida)' : '') +
              (arrow.corrupted ? ' ⚡' : '') +
              (arrow.duplicate ? ' ⧉' : '');
            return (
              <g key={arrow.id}>
                <title>{describeArrow(arrow)}</title>
                <line
                  x1={fromX}
                  y1={arrow.y1}
                  x2={endX}
                  y2={arrow.y2}
                  className={classes}
                  markerEnd={arrow.outcome === 'lost' ? undefined : `url(#seq-${color})`}
                />
                {arrow.outcome === 'lost' && (
                  <text x={endX} y={arrow.y2 + 5} textAnchor="middle" className="seq-cross">
                    ✕
                  </text>
                )}
                <text
                  x={midX}
                  y={midY - 5}
                  textAnchor="middle"
                  className={`seq-label seq-${color}`}
                >
                  {arrow.label + suffix}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="legend small">
        <span>
          <i className="swatch edge-taken" /> quadro entregue
        </span>
        <span>
          <i className="swatch edge-active" /> retransmissão por timeout
        </span>
        <span>
          <i className="swatch edge-fast" /> retransmissão rápida
        </span>
        <span>
          <i className="swatch edge-lost" /> ✕ perdido
        </span>
        <span>⚡ corrompido</span>
        <span>⧉ duplicado</span>
      </div>
    </section>
  );
}
