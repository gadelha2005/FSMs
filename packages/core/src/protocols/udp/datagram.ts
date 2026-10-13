import { checksumIsValid, internetChecksum } from './checksum';

export const UDP_HEADER_LENGTH = 8;
const MAX_UDP_LENGTH = 0xffff;

export interface UdpDatagram {
  srcPort: number;
  dstPort: number;
  payload: Uint8Array;
}

export type DecodeFailure = 'truncated' | 'length' | 'checksum';

export type DecodeResult =
  { ok: true; datagram: UdpDatagram; checksum: number } | { ok: false; reason: DecodeFailure };

function assertPort(name: string, port: number): void {
  if (!Number.isInteger(port) || port < 0 || port > 0xffff) {
    throw new RangeError(`${name} deve ser um inteiro entre 0 e 65535 (recebido: ${port})`);
  }
}

export function encodeDatagram(datagram: UdpDatagram): Uint8Array {
  assertPort('srcPort', datagram.srcPort);
  assertPort('dstPort', datagram.dstPort);
  const length = UDP_HEADER_LENGTH + datagram.payload.length;
  if (length > MAX_UDP_LENGTH) {
    throw new RangeError(`Datagrama grande demais: ${length} bytes (máximo ${MAX_UDP_LENGTH})`);
  }

  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, datagram.srcPort);
  view.setUint16(2, datagram.dstPort);
  view.setUint16(4, length);
  view.setUint16(6, 0);
  bytes.set(datagram.payload, UDP_HEADER_LENGTH);

  const checksum = internetChecksum(bytes);
  view.setUint16(6, checksum === 0 ? 0xffff : checksum);
  return bytes;
}

export function decodeDatagram(bytes: Uint8Array): DecodeResult {
  if (bytes.length < UDP_HEADER_LENGTH) return { ok: false, reason: 'truncated' };

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(4) !== bytes.length) return { ok: false, reason: 'length' };
  if (!checksumIsValid(bytes)) return { ok: false, reason: 'checksum' };

  return {
    ok: true,
    checksum: view.getUint16(6),
    datagram: {
      srcPort: view.getUint16(0),
      dstPort: view.getUint16(2),
      payload: bytes.slice(UDP_HEADER_LENGTH),
    },
  };
}
