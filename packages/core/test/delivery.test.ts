import { describe, expect, it } from 'vitest';
import { analyzeDelivery, packId, unpackId } from '../src';

describe('packId / unpackId', () => {
  it('ida e volta de um número de 32 bits', () => {
    for (const id of [0, 1, 255, 65536, 4294967295]) {
      expect(unpackId(packId(id))).toBe(id);
    }
  });
});

describe('analyzeDelivery', () => {
  const expected = [1, 2, 3, 4, 5];

  it('entrega perfeita', () => {
    expect(analyzeDelivery(expected, [1, 2, 3, 4, 5])).toEqual({
      expected: 5,
      delivered: 5,
      lost: 0,
      duplicates: 0,
      outOfOrder: 0,
      inOrder: true,
    });
  });

  it('conta perdidos', () => {
    const report = analyzeDelivery(expected, [1, 3, 5]);
    expect(report.delivered).toBe(3);
    expect(report.lost).toBe(2);
    expect(report.inOrder).toBe(true);
  });

  it('conta duplicados sem contá-los como entregues', () => {
    const report = analyzeDelivery(expected, [1, 2, 2, 3, 3, 3, 4, 5]);
    expect(report.delivered).toBe(5);
    expect(report.duplicates).toBe(3);
  });

  it('conta fora de ordem', () => {
    const report = analyzeDelivery(expected, [1, 3, 2, 5, 4]);
    expect(report.outOfOrder).toBe(2);
    expect(report.inOrder).toBe(false);
  });

  it('ignora a segunda cópia ao avaliar a ordem', () => {
    expect(analyzeDelivery(expected, [1, 2, 3, 2, 4, 5]).inOrder).toBe(true);
  });

  it('ignora ids que não eram esperados', () => {
    const report = analyzeDelivery(expected, [1, 99, 2]);
    expect(report.delivered).toBe(2);
    expect(report.duplicates).toBe(1);
  });
});
