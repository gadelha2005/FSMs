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
