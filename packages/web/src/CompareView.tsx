import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChannelParams } from '@fsms/core';
import type { Simulation, Summary } from '@fsms/scenarios';
import { ChannelSliders } from './components/ChannelSliders';
import { SPEEDS } from './components/Controls';
import { SequenceDiagram } from './diagram/SequenceDiagram';
import {
  DEFAULT_COMPARE_CHANNEL,
  buildPair,
  computeAverages,
  runStats,
  type Averages,
  type RunStats,
} from './compare';
import { formatTime } from './format';
import { useClock } from './sim/useClock';
import { useSimulationVersion } from './sim/useSimulation';

const COLORS = { UDP: 'var(--warn)', TCP: 'var(--accent)' } as const;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="muted small">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Column({
  sim,
  protocol,
  messages,
  note,
}: {
  sim: Simulation;
  protocol: 'UDP' | 'TCP';
  messages: number;
  note: string;
}) {
  useSimulationVersion(sim);
  const stats: RunStats = runStats(sim, messages);
  const pct = Math.round((100 * stats.delivered) / stats.expected);
  return (
    <section className="panel" aria-label={`Execução ${protocol}`}>
      <h2>
        {protocol}{' '}
        <span className={`badge${stats.finished ? '' : ' warn'}`}>
          {stats.finished ? 'concluído' : 'em andamento'}
        </span>
      </h2>
      <p className="muted small">{note}</p>
      <div className="stats">
        <Stat label="Entregues" value={`${stats.delivered}/${stats.expected} (${pct}%)`} />
        <Stat label="Tempo virtual" value={`${formatTime(stats.timeMs)} ms`} />
        <Stat label="Quadros no canal" value={String(stats.framesOnWire)} />
        <Stat label="Quadros perdidos" value={String(stats.lostFrames)} />
        <Stat label="Quadros duplicados" value={String(stats.duplicatedFrames)} />
        <Stat label="Retransmissões" value={String(stats.retransmissions)} />
      </div>
      <SequenceDiagram sim={sim} title={`Sequência ${protocol}`} maxHeight={380} />
    </section>
  );
}

interface Series {
  title: string;
  unit: string;
  udp: number;
  tcp: number;
}

function seriesOf({ udp, tcp }: Averages): Series[] {
  return [
    { title: 'Mensagens entregues', unit: '%', udp: udp.deliveredPct, tcp: tcp.deliveredPct },
    { title: 'Tempo total médio', unit: 'ms', udp: udp.totalMsAvg, tcp: tcp.totalMsAvg },
    { title: 'Quadros no canal (média)', unit: '', udp: udp.framesAvg, tcp: tcp.framesAvg },
  ];
}

function rowsOf({ udp, tcp }: Averages): [string, string, string][] {
  const f = (n: number) => n.toFixed(1);
  const pair = (pick: (s: Summary) => number): [string, string] => [f(pick(udp)), f(pick(tcp))];
  return [
    ['Entregues (%)', ...pair((s) => s.deliveredPct)],
    ['Perdidos (média)', ...pair((s) => s.lostAvg)],
    ['Duplicados (média)', ...pair((s) => s.duplicatesAvg)],
    ['Fora de ordem (média)', ...pair((s) => s.outOfOrderAvg)],
    ['Seeds com entrega completa e em ordem (%)', ...pair((s) => s.inOrderPct)],
    ['Tempo total médio (ms)', ...pair((s) => s.totalMsAvg)],
    ['Quadros no canal (média)', ...pair((s) => s.framesAvg)],
    ['Bytes no canal (média)', ...pair((s) => s.bytesAvg)],
  ];
}

function channelLabel(c: ChannelParams): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return `perda ${pct(c.lossProb)}, corrupção ${pct(c.corruptProb)}, duplicação ${pct(c.dupProb)}, reordenação ${pct(c.reorderProb)}, atraso ${c.delayMin}–${c.delayMax} ms`;
}

function AveragesPanel({ channel }: { channel: ChannelParams }) {
  const [result, setResult] = useState<{ data: Averages; channel: ChannelParams } | null>(null);
  const [busy, setBusy] = useState(false);

  const compute = () => {
    setBusy(true);
    setTimeout(() => {
      setResult({ data: computeAverages(channel), channel });
      setBusy(false);
    }, 30);
  };

  return (
    <section className="panel" aria-labelledby="avg-title">
      <h2 id="avg-title">Média de 20 seeds (cenário 10)</h2>
      <p className="muted small">
        50 mensagens de 100 bytes, rodadas com as seeds 1 a 20 para cada protocolo, usando o canal
        configurado ao lado. Com o canal padrão desta tela é o cenário 10 do trabalho.
      </p>
      <button type="button" className="primary" onClick={compute} disabled={busy}>
        {busy ? 'Calculando…' : 'Calcular média de 20 seeds'}
      </button>
      {result && (
        <>
          <p className="muted small">Canal usado: {channelLabel(result.channel)}.</p>
          <div className="charts">
            {seriesOf(result.data).map((s) => (
              <figure key={s.title} className="chart">
                <figcaption className="small">
                  <strong>{s.title}</strong>
                </figcaption>
                <ResponsiveContainer width="100%" height={170}>
                  <BarChart
                    data={[
                      { name: 'UDP', value: Number(s.udp.toFixed(1)) },
                      { name: 'TCP', value: Number(s.tcp.toFixed(1)) },
                    ]}
                    margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                    <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} width={48} />
                    <Tooltip
                      formatter={(value) => [`${value} ${s.unit}`.trim(), s.title]}
                      contentStyle={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                      }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      <Cell fill={COLORS.UDP} />
                      <Cell fill={COLORS.TCP} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </figure>
            ))}
          </div>
          <div className="table-box">
            <table>
              <thead>
                <tr>
                  <th>Métrica</th>
                  <th>UDP</th>
                  <th>TCP</th>
                </tr>
              </thead>
              <tbody>
                {rowsOf(result.data).map(([label, udp, tcp]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td className="num">{udp}</td>
                    <td className="num">{tcp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export function CompareView() {
  const [seed, setSeed] = useState(10);
  const [messages, setMessages] = useState(20);
  const [channel, setChannel] = useState<ChannelParams>(DEFAULT_COMPARE_CHANNEL);
  const [speed, setSpeed] = useState(10);
  const [running, setRunning] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const pair = useMemo(
    () => buildPair({ seed, messages, channel }),
    [seed, messages, channel, resetKey],
  );

  useClock(pair.udp, running, speed);
  useClock(pair.tcp, running, speed);

  const change =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setRunning(false);
      setter(value);
    };

  return (
    <div className="view">
      <div className="layout">
        <aside className="sidebar">
          <section className="panel" aria-labelledby="cmp-title">
            <h2 id="cmp-title">Execução lado a lado</h2>
            <p className="muted small">
              Mesma seed, mesmo canal e a mesma carga nos dois protocolos. O UDP manda uma mensagem
              a cada 10 ms. O TCP faz o handshake antes e depois envia tudo de uma vez.
            </p>
            <div className="row">
              <button type="button" className="primary" onClick={() => setRunning((r) => !r)}>
                {running ? 'Pausar' : 'Iniciar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRunning(false);
                  setResetKey((k) => k + 1);
                }}
              >
                Reset
              </button>
            </div>
            <label className="field">
              <span>Velocidade</span>
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Mensagens de 100 bytes</span>
              <input
                type="number"
                min={1}
                max={100}
                value={messages}
                onChange={(e) =>
                  change(setMessages)(Math.min(100, Math.max(1, Number(e.target.value) || 1)))
                }
              />
            </label>
            <label className="field">
              <span>Seed</span>
              <input
                type="number"
                min={0}
                value={seed}
                onChange={(e) =>
                  change(setSeed)(Math.max(0, Math.floor(Number(e.target.value) || 0)))
                }
              />
            </label>
          </section>
          <section className="panel" aria-labelledby="cmp-channel-title">
            <h2 id="cmp-channel-title">Canal</h2>
            <ChannelSliders
              params={channel}
              onChange={(partial) => change(setChannel)({ ...channel, ...partial })}
            />
            <button type="button" onClick={() => change(setChannel)(DEFAULT_COMPARE_CHANNEL)}>
              Restaurar canal do cenário 10
            </button>
          </section>
        </aside>
        <main className="content">
          <div className="compare-grid">
            <Column
              sim={pair.udp}
              protocol="UDP"
              messages={messages}
              note="Sem handshake, sem ACK e sem retransmissão."
            />
            <Column
              sim={pair.tcp}
              protocol="TCP"
              messages={messages}
              note={
                pair.tcpConnected
                  ? 'Handshake já concluído antes do envio (aparece no diagrama).'
                  : 'O handshake não concluiu com este canal e seed: nada foi enviado.'
              }
            />
          </div>
          <AveragesPanel channel={channel} />
        </main>
      </div>
    </div>
  );
}
