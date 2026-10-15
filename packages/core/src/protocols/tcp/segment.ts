import { checksumIsValid, internetChecksum } from '../udp/checksum';

export const TCP_HEADER_LENGTH = 20;
const DATA_OFFSET_WORDS = 5;
const FLAG_BITS = { fin: 0x01, syn: 0x02, rst: 0x04, ack: 0x10 } as const;
const CANONICAL_ORDER = ['SYN', 'FIN', 'RST', 'ACK'] as const;

export type FlagName = (typeof CANONICAL_ORDER)[number];

export interface TcpFlags {
  syn: boolean;
  ack: boolean;
  fin: boolean;
  rst: boolean;
}

export interface TcpSegment {
  srcPort: number;
  dstPort: number;
  seq: number;
  ack: number;
  flags: TcpFlags;
  window: number;
  payload: Uint8Array;
}

export type TcpDecodeFailure = 'truncated' | 'malformed' | 'checksum';

export type TcpDecodeResult =
  { ok: true; segment: TcpSegment } | { ok: false; reason: TcpDecodeFailure };

export function flagNames(flags: TcpFlags): FlagName[] {
  return CANONICAL_ORDER.filter((name) => flags[name.toLowerCase() as keyof TcpFlags]);
}

export function flagsFromNames(names: string[]): TcpFlags {
  const flags: TcpFlags = { syn: false, ack: false, fin: false, rst: false };
  for (const name of names) {
    const key = name.toLowerCase() as keyof TcpFlags;
    if (!(key in flags)) throw new Error(`Flag TCP desconhecida: "${name}"`);
    flags[key] = true;
  }
  return flags;
}

export function segmentLength(segment: TcpSegment): number {
  return segment.payload.length + (segment.flags.syn ? 1 : 0) + (segment.flags.fin ? 1 : 0);
}

export function encodeSegment(segment: TcpSegment): Uint8Array {
  const bytes = new Uint8Array(TCP_HEADER_LENGTH + segment.payload.length);
  const view = new DataView(bytes.buffer);

  let flagBits = 0;
  for (const key of Object.keys(FLAG_BITS) as (keyof typeof FLAG_BITS)[]) {
    if (segment.flags[key]) flagBits |= FLAG_BITS[key];
  }

  view.setUint16(0, segment.srcPort);
  view.setUint16(2, segment.dstPort);
  view.setUint32(4, segment.seq >>> 0);
  view.setUint32(8, segment.ack >>> 0);
  view.setUint16(12, (DATA_OFFSET_WORDS << 12) | flagBits);
  view.setUint16(14, segment.window);
  view.setUint16(16, 0);
  view.setUint16(18, 0);
  bytes.set(segment.payload, TCP_HEADER_LENGTH);

  const checksum = internetChecksum(bytes);
  view.setUint16(16, checksum === 0 ? 0xffff : checksum);
  return bytes;
}

export function decodeSegment(bytes: Uint8Array): TcpDecodeResult {
  if (bytes.length < TCP_HEADER_LENGTH) return { ok: false, reason: 'truncated' };
  if (!checksumIsValid(bytes)) return { ok: false, reason: 'checksum' };

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offsetAndFlags = view.getUint16(12);
  if (offsetAndFlags >> 12 !== DATA_OFFSET_WORDS) return { ok: false, reason: 'malformed' };

  return {
    ok: true,
    segment: {
      srcPort: view.getUint16(0),
      dstPort: view.getUint16(2),
      seq: view.getUint32(4),
      ack: view.getUint32(8),
      flags: {
        fin: (offsetAndFlags & FLAG_BITS.fin) !== 0,
        syn: (offsetAndFlags & FLAG_BITS.syn) !== 0,
        rst: (offsetAndFlags & FLAG_BITS.rst) !== 0,
        ack: (offsetAndFlags & FLAG_BITS.ack) !== 0,
      },
      window: view.getUint16(14),
      payload: bytes.slice(TCP_HEADER_LENGTH),
    },
  };
}
