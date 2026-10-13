export interface DeliveryReport {
  expected: number;
  delivered: number;
  lost: number;
  duplicates: number;
  outOfOrder: number;
  inOrder: boolean;
}

export function packId(id: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, id);
  return bytes;
}

export function unpackId(bytes: Uint8Array): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
}

export function analyzeDelivery(expectedIds: number[], receivedIds: number[]): DeliveryReport {
  const expected = new Set(expectedIds);
  const seen = new Set<number>();
  let maxSeen = -Infinity;
  let outOfOrder = 0;

  for (const id of receivedIds) {
    if (!expected.has(id) || seen.has(id)) continue;
    seen.add(id);
    if (id < maxSeen) outOfOrder++;
    maxSeen = Math.max(maxSeen, id);
  }

  return {
    expected: expected.size,
    delivered: seen.size,
    lost: expected.size - seen.size,
    duplicates: receivedIds.length - seen.size,
    outOfOrder,
    inOrder: outOfOrder === 0,
  };
}
