export function onesComplementSum(bytes: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 2) {
    const high = bytes[i]!;
    const low = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    sum += (high << 8) | low;
    while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
  }
  return sum;
}

export function internetChecksum(bytes: Uint8Array): number {
  return ~onesComplementSum(bytes) & 0xffff;
}

export function checksumIsValid(bytes: Uint8Array): boolean {
  return internetChecksum(bytes) === 0;
}
