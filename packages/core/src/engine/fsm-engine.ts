import jsonLogic from 'json-logic-js';
import { builtinActions } from './builtin-actions';
import {
  FsmDefinitionSchema,
  type FsmAction,
  type FsmDefinition,
  type FsmTransition,
} from './schema';

export interface FsmEvent {
  type: string;
  payload?: Record<string, unknown>;
}

export interface ActionEnv<C> {
  ctx: C;
  event: FsmEvent;
  params: FsmAction;
  from: string;
  to: string;
}

export type ActionHandler<C> = (env: ActionEnv<C>) => void;
export type ActionRegistry<C> = Record<string, ActionHandler<C>>;

export type FsmTrace =
  | {
      kind: 'transition';
      time: number;
      from: string;
      event: string;
      to: string;
      actions: string[];
      label?: FsmTransition['label'];
    }
  | {
      kind: 'rejected';
      time: number;
      state: string;
      event: string;
      reason: string;
    };

export interface FsmEngineOptions<C> {
  context: C;
  actions?: ActionRegistry<C>;
  clock?: () => number;
}

export class FsmEngine<C extends Record<string, unknown> = Record<string, unknown>> {
  readonly definition: FsmDefinition;
  readonly context: C;

  private current: string;
  private readonly handlers: ActionRegistry<C>;
  private readonly clock: () => number;
  private readonly index = new Map<string, FsmTransition[]>();
  private readonly listeners = new Set<(trace: FsmTrace) => void>();

  constructor(definition: unknown, options: FsmEngineOptions<C>) {
    this.definition = FsmDefinitionSchema.parse(definition);
    this.context = options.context;
    this.clock = options.clock ?? (() => 0);
    this.handlers = {
      ...(builtinActions as unknown as ActionRegistry<C>),
      ...options.actions,
    };
    this.current = this.definition.initial;

    for (const t of this.definition.transitions) {
      for (const action of t.actions) {
        if (!this.handlers[action.do]) {
          throw new Error(
            `FSM "${this.definition.id}": ação "${action.do}" não está registrada (usada em ${t.from} --${t.event}--> ${t.to})`,
          );
        }
      }
      const key = this.keyOf(t.from, t.event);
      const list = this.index.get(key) ?? [];
      list.push(t);
      this.index.set(key, list);
    }
  }

  get state(): string {
    return this.current;
  }

  subscribe(listener: (trace: FsmTrace) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispatch(event: FsmEvent): FsmTrace {
    const from = this.current;
    const candidates = this.index.get(this.keyOf(from, event.type)) ?? [];

    if (candidates.length === 0) {
      return this.reject(event, `evento "${event.type}" não é válido no estado "${from}"`);
    }

    const data = { ctx: this.context, event: event.payload ?? {}, state: from };
    const matching = candidates.filter((t) => !t.guard || jsonLogic.apply(t.guard, data));

    if (matching.length === 0) {
      return this.reject(
        event,
        `nenhuma condição satisfeita para "${event.type}" no estado "${from}" (${candidates.length} transição(ões) testada(s))`,
      );
    }
    if (matching.length > 1) {
      throw new Error(
        `FSM "${this.definition.id}": ${matching.length} transições possíveis para "${event.type}" no estado "${from}" (definição ambígua)`,
      );
    }

    const transition = matching[0]!;
    this.current = transition.to;

    const trace: FsmTrace = {
      kind: 'transition',
      time: this.clock(),
      from,
      event: event.type,
      to: transition.to,
      actions: transition.actions.map((a) => a.do),
      label: transition.label,
    };
    this.emit(trace);

    for (const params of transition.actions) {
      this.handlers[params.do]!({ ctx: this.context, event, params, from, to: transition.to });
    }
    return trace;
  }

  private reject(event: FsmEvent, reason: string): FsmTrace {
    const trace: FsmTrace = {
      kind: 'rejected',
      time: this.clock(),
      state: this.current,
      event: event.type,
      reason,
    };
    this.emit(trace);
    return trace;
  }

  private emit(trace: FsmTrace): void {
    for (const listener of this.listeners) listener(trace);
  }

  private keyOf(state: string, event: string): string {
    return `${state}\u0000${event}`;
  }
}
