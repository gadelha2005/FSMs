import { describe, expect, it } from 'vitest';
import { FsmEngine, Scheduler, type FsmTrace } from '../src';
import trafficLight from '../../definitions/traffic-light.json';

const toggle = {
  id: 'toggle',
  initial: 'OFF',
  states: ['OFF', 'ON'],
  transitions: [
    { from: 'OFF', event: 'PRESS', to: 'ON' },
    { from: 'ON', event: 'PRESS', to: 'OFF' },
  ],
};

const door = {
  id: 'door',
  initial: 'LOCKED',
  states: ['LOCKED', 'OPEN', 'BLOCKED'],
  transitions: [
    {
      from: 'LOCKED',
      event: 'ENTER_CODE',
      guard: { '==': [{ var: 'event.code' }, 1234] },
      actions: [{ do: 'set', key: 'attempts', value: 0 }],
      to: 'OPEN',
    },
    {
      from: 'LOCKED',
      event: 'ENTER_CODE',
      guard: {
        and: [{ '!=': [{ var: 'event.code' }, 1234] }, { '<': [{ var: 'ctx.attempts' }, 2] }],
      },
      actions: [{ do: 'inc', key: 'attempts' }],
      to: 'LOCKED',
    },
    {
      from: 'LOCKED',
      event: 'ENTER_CODE',
      guard: {
        and: [{ '!=': [{ var: 'event.code' }, 1234] }, { '>=': [{ var: 'ctx.attempts' }, 2] }],
      },
      to: 'BLOCKED',
    },
    { from: 'OPEN', event: 'CLOSE', to: 'LOCKED' },
  ],
};

describe('FsmEngine: transições básicas', () => {
  it('começa no estado inicial', () => {
    const fsm = new FsmEngine(toggle, { context: {} });
    expect(fsm.state).toBe('OFF');
  });

  it('muda de estado e devolve o trace da transição', () => {
    const fsm = new FsmEngine(toggle, { context: {} });
    const trace = fsm.dispatch({ type: 'PRESS' });
    expect(fsm.state).toBe('ON');
    expect(trace).toMatchObject({ kind: 'transition', from: 'OFF', event: 'PRESS', to: 'ON' });
  });

  it('rejeita evento inválido, registra o motivo e mantém o estado', () => {
    const fsm = new FsmEngine(toggle, { context: {} });
    const trace = fsm.dispatch({ type: 'EXPLODE' });
    expect(fsm.state).toBe('OFF');
    expect(trace.kind).toBe('rejected');
    expect(trace.kind === 'rejected' && trace.reason).toMatch(
      /"EXPLODE" não é válido no estado "OFF"/,
    );
  });

  it('usa o relógio informado nos traces', () => {
    let now = 0;
    const fsm = new FsmEngine(toggle, { context: {}, clock: () => now });
    now = 250;
    expect(fsm.dispatch({ type: 'PRESS' }).time).toBe(250);
  });
});

describe('FsmEngine: guards e ações', () => {
  it('escolhe a transição cuja condição é verdadeira', () => {
    const fsm = new FsmEngine(door, { context: { attempts: 0 } });
    fsm.dispatch({ type: 'ENTER_CODE', payload: { code: 1234 } });
    expect(fsm.state).toBe('OPEN');
  });

  it('conta tentativas erradas com a ação inc e bloqueia na terceira', () => {
    const ctx = { attempts: 0 };
    const fsm = new FsmEngine(door, { context: ctx });
    fsm.dispatch({ type: 'ENTER_CODE', payload: { code: 1 } });
    fsm.dispatch({ type: 'ENTER_CODE', payload: { code: 2 } });
    expect(fsm.state).toBe('LOCKED');
    expect(ctx.attempts).toBe(2);
    fsm.dispatch({ type: 'ENTER_CODE', payload: { code: 3 } });
    expect(fsm.state).toBe('BLOCKED');
  });

  it('rejeita quando existem transições mas nenhuma condição é satisfeita', () => {
    const def = {
      id: 'g',
      initial: 'A',
      states: ['A', 'B'],
      transitions: [{ from: 'A', event: 'GO', guard: { '==': [1, 2] }, to: 'B' }],
    };
    const fsm = new FsmEngine(def, { context: {} });
    const trace = fsm.dispatch({ type: 'GO' });
    expect(fsm.state).toBe('A');
    expect(trace.kind === 'rejected' && trace.reason).toMatch(/nenhuma condição satisfeita/);
  });

  it('lança erro quando duas transições são possíveis ao mesmo tempo', () => {
    const def = {
      id: 'amb',
      initial: 'A',
      states: ['A', 'B', 'C'],
      transitions: [
        { from: 'A', event: 'GO', to: 'B' },
        { from: 'A', event: 'GO', to: 'C' },
      ],
    };
    const fsm = new FsmEngine(def, { context: {} });
    expect(() => fsm.dispatch({ type: 'GO' })).toThrow(/ambígua/);
  });

  it('a ação set aceita valor literal e expressão', () => {
    const def = {
      id: 's',
      initial: 'A',
      states: ['A'],
      transitions: [
        {
          from: 'A',
          event: 'E',
          to: 'A',
          actions: [
            { do: 'set', key: 'fixed', value: 7 },
            { do: 'set', key: 'sum', expr: { '+': [{ var: 'ctx.fixed' }, { var: 'event.n' }] } },
          ],
        },
      ],
    };
    const ctx: Record<string, unknown> = {};
    new FsmEngine(def, { context: ctx }).dispatch({ type: 'E', payload: { n: 5 } });
    expect(ctx).toEqual({ fixed: 7, sum: 12 });
  });

  it('executa ações customizadas na ordem em que aparecem', () => {
    const calls: string[] = [];
    const def = {
      id: 'c',
      initial: 'A',
      states: ['A', 'B'],
      transitions: [
        {
          from: 'A',
          event: 'E',
          to: 'B',
          actions: [
            { do: 'say', text: 'um' },
            { do: 'say', text: 'dois' },
          ],
        },
      ],
    };
    const fsm = new FsmEngine(def, {
      context: {},
      actions: { say: ({ params, from, to }) => calls.push(`${params.text}:${from}->${to}`) },
    });
    fsm.dispatch({ type: 'E' });
    expect(calls).toEqual(['um:A->B', 'dois:A->B']);
  });

  it('recusa criar o motor com ação não registrada', () => {
    const def = {
      id: 'x',
      initial: 'A',
      states: ['A'],
      transitions: [{ from: 'A', event: 'E', to: 'A', actions: [{ do: 'naoExiste' }] }],
    };
    expect(() => new FsmEngine(def, { context: {} })).toThrow(/"naoExiste" não está registrada/);
  });

  it('recusa criar o motor com definição inválida', () => {
    expect(() => new FsmEngine({ id: 'x' }, { context: {} })).toThrow();
  });
});

describe('FsmEngine: observadores', () => {
  it('avisa os assinantes na ordem dos eventos, com transições e rejeições', () => {
    const fsm = new FsmEngine(toggle, { context: {} });
    const seen: string[] = [];
    fsm.subscribe((t: FsmTrace) => seen.push(t.kind === 'transition' ? `${t.from}>${t.to}` : 'x'));
    fsm.dispatch({ type: 'PRESS' });
    fsm.dispatch({ type: 'NOPE' });
    fsm.dispatch({ type: 'PRESS' });
    expect(seen).toEqual(['OFF>ON', 'x', 'ON>OFF']);
  });

  it('subscribe devolve uma função que cancela a assinatura', () => {
    const fsm = new FsmEngine(toggle, { context: {} });
    let count = 0;
    const off = fsm.subscribe(() => count++);
    fsm.dispatch({ type: 'PRESS' });
    off();
    fsm.dispatch({ type: 'PRESS' });
    expect(count).toBe(1);
  });

  it('o trace da transição sai antes das ações, mesmo se uma ação disparar outro evento', () => {
    const def = {
      id: 'chain',
      initial: 'A',
      states: ['A', 'B', 'C'],
      transitions: [
        { from: 'A', event: 'X', to: 'B', actions: [{ do: 'fireY' }] },
        { from: 'B', event: 'Y', to: 'C' },
      ],
    };
    const fsm: FsmEngine = new FsmEngine(def, {
      context: {},
      actions: { fireY: () => fsm.dispatch({ type: 'Y' }) },
    });
    const seen: string[] = [];
    fsm.subscribe((t) => t.kind === 'transition' && seen.push(`${t.from}>${t.to}`));
    fsm.dispatch({ type: 'X' });
    expect(seen).toEqual(['A>B', 'B>C']);
    expect(fsm.state).toBe('C');
  });
});

describe('FsmEngine + Scheduler + JSON em arquivo', () => {
  it('o semáforo do traffic-light.json anda sozinho com o relógio virtual', () => {
    const scheduler = new Scheduler();
    const ctx = { cycles: 0 };
    const history: string[] = [];

    const fsm = new FsmEngine(trafficLight, {
      context: ctx,
      clock: () => scheduler.now,
      actions: {
        startTimer: ({ params }) => {
          scheduler.after(Number(params.ms), () => fsm.dispatch({ type: String(params.event) }));
        },
      },
    });
    fsm.subscribe((t) => t.kind === 'transition' && history.push(`${t.time}:${t.to}`));

    scheduler.after(3000, () => fsm.dispatch({ type: 'TIMER' }));
    scheduler.runUntil(14_000);

    expect(history).toEqual([
      '3000:GREEN',
      '6000:YELLOW',
      '7000:RED',
      '10000:GREEN',
      '13000:YELLOW',
      '14000:RED',
    ]);
    expect(ctx.cycles).toBe(2);
  });

  it('uma FSM nova funciona só trocando o JSON, sem mudar o motor', () => {
    const lamp = {
      id: 'lamp',
      initial: 'OFF',
      states: ['OFF', 'ON', 'BROKEN'],
      transitions: [
        { from: 'OFF', event: 'PRESS', to: 'ON' },
        { from: 'ON', event: 'PRESS', to: 'OFF' },
        { from: 'ON', event: 'SURGE', to: 'BROKEN' },
      ],
    };
    const fsm = new FsmEngine(lamp, { context: {} });
    fsm.dispatch({ type: 'PRESS' });
    fsm.dispatch({ type: 'SURGE' });
    expect(fsm.state).toBe('BROKEN');
    expect(fsm.dispatch({ type: 'PRESS' }).kind).toBe('rejected');
  });
});
