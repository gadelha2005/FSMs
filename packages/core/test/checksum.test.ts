import { describe, expect, it } from 'vitest';
import { checksumIsValid, internetChecksum, onesComplementSum } from '../src';

const bookExample = new Uint8Array([0x66, 0x60, 0x55, 0x55, 0x8f, 0x0c]);

describe('checksum de 16 bits em complemento de 1', () => {
  it('reproduz o exemplo do livro (seção 3.3)', () => {
    expect(onesComplementSum(bookExample)).toBe(0b0100101011000010);
    expect(internetChecksum(bookExample)).toBe(0b1011010100111101);
  });

  it('soma dos dados com o checksum dá 0xFFFF', () => {
    const withChecksum = new Uint8Array([...bookExample, 0xb5, 0x3d]);
    expect(onesComplementSum(withChecksum)).toBe(0xffff);
    expect(checksumIsValid(withChecksum)).toBe(true);
  });

  it('o carry do bit mais alto volta para o bit menos significativo', () => {
    expect(onesComplementSum(new Uint8Array([0xff, 0xff, 0x00, 0x01]))).toBe(0x0001);
  });

  it('completa com um byte zero quando o tamanho é ímpar', () => {
    expect(onesComplementSum(new Uint8Array([0x12, 0x34, 0x56]))).toBe(0x1234 + 0x5600);
    expect(internetChecksum(new Uint8Array([0xab]))).toBe(~0xab00 & 0xffff);
  });

  it('dados vazios têm soma 0 e checksum 0xFFFF', () => {
    expect(onesComplementSum(new Uint8Array())).toBe(0);
    expect(internetChecksum(new Uint8Array())).toBe(0xffff);
  });

  it('a ordem das palavras de 16 bits não altera o resultado', () => {
    const a = new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66]);
    const b = new Uint8Array([0x55, 0x66, 0x11, 0x22, 0x33, 0x44]);
    expect(internetChecksum(a)).toBe(internetChecksum(b));
  });

  it('detecta qualquer troca de um único bit', () => {
    const withChecksum = new Uint8Array([...bookExample, 0xb5, 0x3d]);
    for (let bit = 0; bit < withChecksum.length * 8; bit++) {
      const damaged = withChecksum.slice();
      damaged[bit >> 3] = damaged[bit >> 3]! ^ (1 << (bit & 7));
      expect(checksumIsValid(damaged)).toBe(false);
    }
  });
});
