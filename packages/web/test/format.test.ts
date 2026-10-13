import { describe, expect, it } from 'vitest';
import { formatTime } from '../src/format';

describe('formatTime', () => {
  it('inteiros ficam como estão', () => {
    expect(formatTime(0)).toBe('0');
    expect(formatTime(1250)).toBe('1250');
  });

  it('decimais ficam com uma casa, sem zero sobrando', () => {
    expect(formatTime(43.349609375)).toBe('43.3');
    expect(formatTime(62829.0004)).toBe('62829');
    expect(formatTime(10.25)).toBe('10.3');
  });
});