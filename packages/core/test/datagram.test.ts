import { describe, expect, it } from 'vitest';
import { UDP_HEADER_LENGTH, checksumIsValid, decodeDatagram, encodeDatagram } from '../src';

const payload = new TextEncoder().encode('ola, redes convergentes!');

describe('datagrama UDP', () => {
  it('monta o cabeçalho de 8 bytes: portas, comprimento e checksum', () => {
    const bytes = encodeDatagram({ srcPort: 5000, dstPort: 53, payload });
    const view = new DataView(bytes.buffer);
    expect(bytes.length).toBe(UDP_HEADER_LENGTH + payload.length);
    expect(view.getUint16(0)).toBe(5000);
    expect(view.getUint16(2)).toBe(53);
    expect(view.getUint16(4)).toBe(bytes.length);
    expect(view.getUint16(6)).not.toBe(0);
    expect(checksumIsValid(bytes)).toBe(true);
  });

  it('codifica e decodifica sem perder nada', () => {
    const bytes = encodeDatagram({ srcPort: 1234, dstPort: 4321, payload });
    const result = decodeDatagram(bytes);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.datagram.srcPort).toBe(1234);
      expect(result.datagram.dstPort).toBe(4321);
      expect(Array.from(result.datagram.payload)).toEqual(Array.from(payload));
    }
  });

  it('aceita payload vazio e payload de tamanho ímpar', () => {
    for (const size of [0, 1, 2, 3, 101]) {
      const data = new Uint8Array(size).map((_, i) => i * 7);
      const result = decodeDatagram(encodeDatagram({ srcPort: 1, dstPort: 2, payload: data }));
      expect(result.ok).toBe(true);
    }
  });

  it('rejeita qualquer troca de um único bit, no cabeçalho ou no payload', () => {
    const bytes = encodeDatagram({ srcPort: 5000, dstPort: 53, payload });
    for (let bit = 0; bit < bytes.length * 8; bit++) {
      const damaged = bytes.slice();
      damaged[bit >> 3] = damaged[bit >> 3]! ^ (1 << (bit & 7));
      expect(decodeDatagram(damaged).ok).toBe(false);
    }
  });

  it('informa o motivo: length quando o campo de comprimento muda, checksum nos demais casos', () => {
    const bytes = encodeDatagram({ srcPort: 5000, dstPort: 53, payload });

    const lengthDamaged = bytes.slice();
    lengthDamaged[5] = lengthDamaged[5]! ^ 0x01;
    expect(decodeDatagram(lengthDamaged)).toEqual({ ok: false, reason: 'length' });

    const payloadDamaged = bytes.slice();
    payloadDamaged[UDP_HEADER_LENGTH + 3] = payloadDamaged[UDP_HEADER_LENGTH + 3]! ^ 0x10;
    expect(decodeDatagram(payloadDamaged)).toEqual({ ok: false, reason: 'checksum' });
  });

  it('rejeita dados menores que o cabeçalho', () => {
    expect(decodeDatagram(new Uint8Array(5))).toEqual({ ok: false, reason: 'truncated' });
  });

  it('rejeita portas inválidas', () => {
    expect(() => encodeDatagram({ srcPort: -1, dstPort: 1, payload })).toThrow(RangeError);
    expect(() => encodeDatagram({ srcPort: 1, dstPort: 70000, payload })).toThrow(RangeError);
    expect(() => encodeDatagram({ srcPort: 1.5, dstPort: 1, payload })).toThrow(RangeError);
  });

  it('rejeita datagrama maior que 65535 bytes', () => {
    expect(() =>
      encodeDatagram({ srcPort: 1, dstPort: 2, payload: new Uint8Array(65530) }),
    ).toThrow(/grande demais/);
  });

  it('nunca grava checksum 0 no cabeçalho (0 significaria "sem checksum")', () => {
    for (let a = 0; a < 3000; a++) {
      const bytes = encodeDatagram({
        srcPort: a,
        dstPort: 0xffff - a,
        payload: new Uint8Array([a & 0xff, a >> 8]),
      });
      expect(new DataView(bytes.buffer).getUint16(6)).not.toBe(0);
      expect(decodeDatagram(bytes).ok).toBe(true);
    }
  });
});
