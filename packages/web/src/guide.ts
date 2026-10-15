import type { HostInfo, HostName } from '@fsms/scenarios';

export type Hosts = Record<HostName, HostInfo>;

export interface Availability {
  enabled: boolean;
  reason?: string;
}

const CAN_TRANSFER = ['ESTABLISHED', 'CLOSE_WAIT'];

export function listenAvailability(info: HostInfo): Availability {
  return info.state === 'CLOSED'
    ? { enabled: true }
    : { enabled: false, reason: `O host já está em ${info.state}` };
}

export function connectAvailability(info: HostInfo): Availability {
  return info.state === 'CLOSED'
    ? { enabled: true }
    : { enabled: false, reason: `O host já está em ${info.state}` };
}

export function sendAvailability(info: HostInfo): Availability {
  if (!CAN_TRANSFER.includes(info.state)) {
    return { enabled: false, reason: 'Só dá para enviar com a conexão estabelecida' };
  }
  if (info.senderState === 'SENDING') {
    return { enabled: false, reason: 'Já existe um envio em andamento' };
  }
  return { enabled: true };
}

export function closeAvailability(info: HostInfo): Availability {
  return CAN_TRANSFER.includes(info.state)
    ? { enabled: true }
    : { enabled: false, reason: 'Só dá para fechar uma conexão estabelecida' };
}

export function nextStepHint(hosts: Hosts, idle: boolean): string {
  const a = hosts.A.state;
  const b = hosts.B.state;
  if (a === 'CLOSED' && b === 'CLOSED') {
    return '1º passo: clique em "Abrir porta" no Host B (ele será o servidor).';
  }
  if (a === 'CLOSED' && b === 'LISTEN') {
    return '2º passo: clique em "Conectar" no Host A (ele será o cliente).';
  }
  if (!idle) {
    return 'Há eventos agendados: clique em Iniciar para rodar sozinho ou em Passo para ir um evento por vez.';
  }
  if (a === 'ESTABLISHED' && b === 'ESTABLISHED') {
    return 'Conexão pronta. Experimente Enviar dados (e mexa no canal antes) ou Fechar a conexão.';
  }
  if (a === 'CLOSED' && b === 'CLOSED') {
    return 'Conexão encerrada. Clique em Reset para começar de novo.';
  }
  return 'Nada agendado. Use os botões de Aplicação ou clique em Reset.';
}

export const STATE_HELP: Record<string, string> = {
  CLOSED: 'Sem conexão',
  LISTEN: 'Esperando alguém conectar',
  SYN_SENT: 'Pediu para conectar, aguardando resposta',
  SYN_RCVD: 'Recebeu o pedido, aguardando a confirmação final',
  ESTABLISHED: 'Conexão pronta para trocar dados',
  FIN_WAIT_1: 'Pediu para encerrar, aguardando confirmação',
  FIN_WAIT_2: 'Encerramento confirmado, aguardando o outro lado fechar',
  CLOSE_WAIT: 'O outro lado fechou; falta a aplicação fechar',
  CLOSING: 'Os dois fecharam ao mesmo tempo',
  LAST_ACK: 'Aguardando a última confirmação',
  TIME_WAIT: 'Esperando 2 × MSL antes de liberar a conexão',
};
