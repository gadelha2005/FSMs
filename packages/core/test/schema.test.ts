import { describe, expect, it } from 'vitest';
import { FsmDefinitionSchema } from '../src';

const valid = {
  id: 'toggle',
  initial: 'OFF',
  states: ['OFF', 'ON'],
  transitions: [
    { from: 'OFF', event: 'PRESS', to: 'ON' },
    { from: 'ON', event: 'PRESS', to: 'OFF' },
  ],
};

function issues(def: unknown): string[] {
  const result = FsmDefinitionSchema.safeParse(def);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe('FsmDefinitionSchema', () => {
  it('aceita uma definição válida e preenche actions com []', () => {
    const parsed = FsmDefinitionSchema.parse(valid);
    expect(parsed.transitions[0]!.actions).toEqual([]);
  });

  it('rejeita estado inicial que não existe', () => {
    expect(issues({ ...valid, initial: 'BROKEN' }).join()).toMatch(/inicial "BROKEN"/);
  });

  it('rejeita transição que sai de estado inexistente', () => {
    const def = { ...valid, transitions: [{ from: 'X', event: 'E', to: 'ON' }] };
    expect(issues(def).join()).toMatch(/from "X"/);
  });

  it('rejeita transição que chega em estado inexistente', () => {
    const def = { ...valid, transitions: [{ from: 'OFF', event: 'E', to: 'Y' }] };
    expect(issues(def).join()).toMatch(/to "Y"/);
  });

  it('rejeita estados repetidos', () => {
    expect(issues({ ...valid, states: ['OFF', 'ON', 'ON'] }).join()).toMatch(/repetidos/);
  });

  it('rejeita campos ausentes e tipos errados', () => {
    expect(issues({ id: 'x' }).length).toBeGreaterThan(0);
    expect(issues({ ...valid, states: 'OFF' }).length).toBeGreaterThan(0);
  });

  it('mantém parâmetros extras das ações', () => {
    const def = {
      ...valid,
      transitions: [
        { from: 'OFF', event: 'PRESS', to: 'ON', actions: [{ do: 'send', flags: ['SYN'] }] },
      ],
    };
    const parsed = FsmDefinitionSchema.parse(def);
    expect(parsed.transitions[0]!.actions[0]).toEqual({ do: 'send', flags: ['SYN'] });
  });
});
