import { describe, expect, it } from 'vitest';
import {
  TCP_HEADER_LENGTH,
  checksumIsValid,
  decodeSegment,
  encodeSegment,
  flagNames,
  flagsFromNames,
  segmentLength,
  type TcpSegment,
} from '../src';

const base: TcpSegment = {
  srcPort: 1234,
  dstPort: 80,
  seq: 1000,
  ack: 5001,
  flags: { syn: false, ack: true, fin: false, rst: false },
  window: 65535,
  payload: new Uint8Array(),
};

describe('segmento TCP', () => {
  it('monta o cabeçalho de 20 bytes com portas, seq, ack, flags e janela', () => {
    const bytes = encodeSegment(base);
    const view = new DataView(bytes.buffer);
    expect(bytes.length).toBe(TCP_HEADER_LENGTH);
    expect(view.getUint16(0)).toBe(1234);
    expect(view.getUint16(2)).toBe(80);
    expect(view.getUint32(4)).toBe(1000);
    expect(view.getUint32(8)).toBe(5001);
    expect(view.getUint16(12) >> 12).toBe(5);
    expect(view.getUint16(12) & 0x3f).toBe(0x10);
    expect(view.getUint16(14)).toBe(65535);
    expect(checksumIsValid(bytes)).toBe(true);
  });

  it('codifica cada flag no bit certo (FIN=1, SYN=2, RST=4, ACK=16)', () => {
    const bits = (flags: Partial<TcpSegment['flags']>) => {
      const bytes = encodeSegment({ ...base, flags: { ...base.flags, ack: false, ...flags } });
      return new DataView(bytes.buffer).getUint16(12) & 0x3f;
    };
    expect(bits({ fin: true })).toBe(0x01);
    expect(bits({ syn: true })).toBe(0x02);
    expect(bits({ rst: true })).toBe(0x04);
    expect(bits({ ack: true })).toBe(0x10);
    expect(bits({ syn: true, ack: true })).toBe(0x12);
  });

  it('codifica e decodifica sem perder nada, inclusive payload', () => {
    const segment = {
      ...base,
      flags: { syn: true, ack: true, fin: false, rst: false },
      payload: new TextEncoder().encode('dados'),
    };
    const result = decodeSegment(encodeSegment(segment));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.segment).toMatchObject({
        srcPort: 1234,
        dstPort: 80,
        seq: 1000,
        ack: 5001,
        flags: segment.flags,
        window: 65535,
      });
      expect(new TextDecoder().decode(result.segment.payload)).toBe('dados');
    }
  });

  it('rejeita qualquer troca de um único bit', () => {
    const bytes = encodeSegment({ ...base, payload: new Uint8Array([1, 2, 3]) });
    for (let bit = 0; bit < bytes.length * 8; bit++) {
      const damaged = bytes.slice();
      damaged[bit >> 3] = damaged[bit >> 3]! ^ (1 << (bit & 7));
      expect(decodeSegment(damaged).ok).toBe(false);
    }
  });

  it('informa o motivo: truncated e checksum', () => {
    expect(decodeSegment(new Uint8Array(10))).toEqual({ ok: false, reason: 'truncated' });
    const damaged = encodeSegment(base);
    damaged[4] = damaged[4]! ^ 0x01;
    expect(decodeSegment(damaged)).toEqual({ ok: false, reason: 'checksum' });
  });

  it('rejeita cabeçalho com tamanho diferente de 5 palavras (opções não suportadas)', () => {
    const fixed = encodeSegment(base);
    new DataView(fixed.buffer).setUint16(12, (6 << 12) | 0x10);
    new DataView(fixed.buffer).setUint16(16, 0);
    let sum = 0;
    for (let i = 0; i < fixed.length; i += 2) sum += (fixed[i]! << 8) | fixed[i + 1]!;
    while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
    new DataView(fixed.buffer).setUint16(16, ~sum & 0xffff);
    expect(decodeSegment(fixed)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('flagNames devolve os nomes na ordem canônica SYN, FIN, RST, ACK', () => {
    expect(flagNames(flagsFromNames(['ACK', 'SYN']))).toEqual(['SYN', 'ACK']);
    expect(flagNames(flagsFromNames(['ACK', 'FIN']))).toEqual(['FIN', 'ACK']);
    expect(flagNames(flagsFromNames(['ACK', 'RST']))).toEqual(['RST', 'ACK']);
    expect(flagNames(flagsFromNames([]))).toEqual([]);
  });

  it('flagsFromNames recusa nome desconhecido', () => {
    expect(() => flagsFromNames(['XYZ'])).toThrow(/desconhecida/);
  });

  it('SYN e FIN consomem 1 número de sequência cada; o payload consome 1 por byte', () => {
    expect(segmentLength({ ...base, flags: { ...base.flags, syn: true } })).toBe(1);
    expect(segmentLength({ ...base, flags: { ...base.flags, fin: true } })).toBe(1);
    expect(segmentLength({ ...base, payload: new Uint8Array(10) })).toBe(10);
    expect(segmentLength(base)).toBe(0);
  });
});
