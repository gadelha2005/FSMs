export const CORE_VERSION = '0.1.0';

export { createRng, type Rng } from './sim/rng';
export { Scheduler, type TimerId } from './sim/scheduler';
export { FsmEngine } from './engine/fsm-engine';
export type {
  ActionEnv,
  ActionHandler,
  ActionRegistry,
  FsmEngineOptions,
  FsmEvent,
  FsmTrace,
} from './engine/fsm-engine';
export { FsmDefinitionSchema, type FsmDefinition, type FsmTransition } from './engine/schema';
export { Channel } from './channel/channel';
export type {
  ChannelEvent,
  FaultRule,
  Frame,
  FrameHandler,
  LossReason,
  SentFrame,
} from './channel/channel';
export { DEFAULT_CHANNEL_PARAMS, validateParams, type ChannelParams } from './channel/params';
export { checksumIsValid, internetChecksum, onesComplementSum } from './protocols/udp/checksum';
export {
  UDP_HEADER_LENGTH,
  decodeDatagram,
  encodeDatagram,
  type DecodeFailure,
  type DecodeResult,
  type UdpDatagram,
} from './protocols/udp/datagram';
export {
  UdpHost,
  type UdpCounters,
  type UdpDiscard,
  type UdpDiscardReason,
  type UdpHostOptions,
  type UdpReceived,
} from './protocols/udp/udp-host';
export { analyzeDelivery, packId, unpackId, type DeliveryReport } from './analysis/delivery';
export {
  TCP_HEADER_LENGTH,
  decodeSegment,
  encodeSegment,
  flagNames,
  flagsFromNames,
  segmentLength,
  type FlagName,
  type TcpDecodeFailure,
  type TcpDecodeResult,
  type TcpFlags,
  type TcpSegment,
} from './protocols/tcp/segment';
export {
  TcpHost,
  type TcpContext,
  type TcpDiscard,
  type TcpHostOptions,
} from './protocols/tcp/tcp-host';
export { TcpReceiver, type ReceiveKind, type ReceiveRecord } from './protocols/tcp/receiver';
export {
  TcpSender,
  type SenderContext,
  type TcpSenderOptions,
  type Transmission,
  type TransmissionKind,
} from './protocols/tcp/sender';
export { RTT_ALPHA, RTT_BETA, backoffTimeout, updateRtt, type RttState } from './protocols/tcp/rtt';