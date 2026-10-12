import jsonLogic from 'json-logic-js';
import type { ActionHandler } from './fsm-engine';

export const builtinActions: Record<string, ActionHandler<Record<string, unknown>>> = {
  set: ({ ctx, event, params }) => {
    const key = String(params.key);
    if ('expr' in params) {
      ctx[key] = jsonLogic.apply(params.expr as object, { ctx, event: event.payload ?? {} });
    } else {
      ctx[key] = params.value;
    }
  },
  inc: ({ ctx, params }) => {
    const key = String(params.key);
    const by = typeof params.by === 'number' ? params.by : 1;
    ctx[key] = (Number(ctx[key]) || 0) + by;
  },
};
