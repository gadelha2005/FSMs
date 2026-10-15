import { describe, expect, it } from 'vitest';
import type { HostInfo } from '@fsms/scenarios';
import {
  closeAvailability,
  connectAvailability,
  listenAvailability,
  nextStepHint,
  sendAvailability,
  type Hosts,
} from '../src/guide';

const host = (name: 'A' | 'B', state: string, senderState?: string): HostInfo => ({
  name,
  state,
  senderState,
  details: [],
});

const pair = (a: string, b: string): Hosts => ({ A: host('A', a), B: host('B', b) });

describe('disponibilidade dos botões', () => {
  it('abrir e conectar só com o host fechado', () => {
    expect(listenAvailability(host('A', 'CLOSED')).enabled).toBe(true);
    expect(listenAvailability(host('A', 'LISTEN')).enabled).toBe(false);
    expect(connectAvailability(host('A', 'CLOSED')).enabled).toBe(true);
    expect(connectAvailability(host('A', 'ESTABLISHED')).reason).toContain('ESTABLISHED');
  });

  it('enviar só com a conexão pronta e sem envio em andamento', () => {
    expect(sendAvailability(host('A', 'CLOSED')).enabled).toBe(false);
    expect(sendAvailability(host('A', 'ESTABLISHED', 'IDLE')).enabled).toBe(true);
    expect(sendAvailability(host('A', 'ESTABLISHED', 'SENDING')).enabled).toBe(false);
  });

  it('fechar só com a conexão pronta', () => {
    expect(closeAvailability(host('A', 'ESTABLISHED')).enabled).toBe(true);
    expect(closeAvailability(host('A', 'LISTEN')).enabled).toBe(false);
  });
});

describe('nextStepHint', () => {
  it('guia o handshake passo a passo', () => {
    expect(nextStepHint(pair('CLOSED', 'CLOSED'), true)).toContain('1º passo');
    expect(nextStepHint(pair('CLOSED', 'LISTEN'), true)).toContain('2º passo');
    expect(nextStepHint(pair('SYN_SENT', 'LISTEN'), false)).toContain('Iniciar');
    expect(nextStepHint(pair('ESTABLISHED', 'ESTABLISHED'), true)).toContain('Conexão pronta');
  });
});
