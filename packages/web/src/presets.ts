import type { ChannelParams } from '@fsms/core';
import type { Command, ProtocolName, Simulation, TcpSettings } from '@fsms/scenarios';

export type Step = Command | { type: 'advance'; ms: number } | { type: 'dropNext' };

export interface Preset {
  id: number;
  title: string;
  protocol: ProtocolName;
  seed: number;
  channel?: Partial<ChannelParams>;
  tcp?: Partial<TcpSettings>;
  setup: Step[];
  summary: string;
  watch: string;
}

const handshake: Step[] = [
  { type: 'listen', host: 'B' },
  { type: 'connect', host: 'A' },
  { type: 'advance', ms: 500 },
];

export const PRESETS: Preset[] = [
  {
    id: 1,
    title: 'Handshake de três vias',
    protocol: 'TCP',
    seed: 1,
    setup: [
      { type: 'listen', host: 'B' },
      { type: 'connect', host: 'A' },
    ],
    summary: 'B abre a porta e A pede a conexão. Nada roda sozinho: use Passo ou Iniciar.',
    watch: 'SYN, SYN-ACK e ACK no diagrama de sequência; A e B chegam a ESTABLISHED.',
  },
  {
    id: 2,
    title: 'Perda do SYN',
    protocol: 'TCP',
    seed: 2,
    setup: [{ type: 'listen', host: 'B' }, { type: 'dropNext' }, { type: 'connect', host: 'A' }],
    summary: 'O primeiro SYN é descartado pelo canal.',
    watch: 'O timer de 1000 ms estoura, o SYN é reenviado (seta laranja) e o handshake termina.',
  },
  {
    id: 3,
    title: 'Perda do SYN+ACK',
    protocol: 'TCP',
    seed: 3,
    setup: [{ type: 'listen', host: 'B' }, { type: 'connect', host: 'A' }, { type: 'dropNext' }],
    summary: 'O SYN chega, mas o SYN+ACK de resposta é descartado.',
    watch: 'Os dois lados retransmitem por timeout (SYN de A e SYN+ACK de B) e fecham a conexão.',
  },
  {
    id: 4,
    title: 'Encerramento normal',
    protocol: 'TCP',
    seed: 4,
    setup: [...handshake, { type: 'close', host: 'A' }],
    summary: 'A conexão já está pronta e A pediu para fechar.',
    watch:
      'A vai a FIN_WAIT_2 e B a CLOSE_WAIT. Clique em Fechar no Host B para terminar; A passa por TIME_WAIT.',
  },
  {
    id: 5,
    title: 'Encerramento simultâneo',
    protocol: 'TCP',
    seed: 5,
    setup: [...handshake, { type: 'close', host: 'A' }, { type: 'close', host: 'B' }],
    summary: 'Com a conexão pronta, os dois hosts fecham no mesmo instante.',
    watch: 'Os dois entram em FIN_WAIT_1, depois CLOSING e TIME_WAIT.',
  },
  {
    id: 6,
    title: 'Retransmissão rápida',
    protocol: 'TCP',
    seed: 6,
    setup: [...handshake, { type: 'dropNext' }, { type: 'send', host: 'A', bytes: 1000 }],
    summary: 'A envia 10 segmentos de 100 bytes e o primeiro é descartado.',
    watch: 'ACKs duplicados no log; no terceiro, A retransmite sem esperar o timer (seta roxa).',
  },
  {
    id: 7,
    title: 'Conexão a uma porta fechada',
    protocol: 'TCP',
    seed: 7,
    setup: [{ type: 'connect', host: 'A' }],
    summary: 'A tenta conectar, mas B nunca abriu a porta.',
    watch: 'B responde recusando a conexão e A volta a CLOSED sem chegar a ESTABLISHED.',
  },
  {
    id: 8,
    title: 'UDP com 30% de perda',
    protocol: 'UDP',
    seed: 8,
    channel: { lossProb: 0.3 },
    setup: Array.from({ length: 20 }, () => ({ type: 'datagram', host: 'A' }) as const),
    summary: 'A manda 20 datagramas para B por um canal que perde 30%.',
    watch: 'Alguns datagramas somem (✕) e nada é reenviado: B entrega só o que chegou.',
  },
  {
    id: 9,
    title: 'UDP com checksum inválido',
    protocol: 'UDP',
    seed: 9,
    channel: { corruptProb: 1 },
    setup: Array.from({ length: 3 }, () => ({ type: 'datagram', host: 'A' }) as const),
    summary: 'Todos os datagramas chegam com um bit trocado.',
    watch:
      'B descarta em silêncio (contador "Descartados (checksum)") e a aplicação não recebe nada.',
  },
];

export function findPreset(id: number): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

export function applyPreset(sim: Simulation, preset: Preset): void {
  for (const step of preset.setup) {
    if (step.type === 'advance') sim.advance(step.ms);
    else if (step.type === 'dropNext') sim.dropNext();
    else sim.command(step);
  }
}
