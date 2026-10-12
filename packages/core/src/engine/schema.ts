import { z } from 'zod';

export const ActionSchema = z.looseObject({
  do: z.string().min(1),
});

export const TransitionSchema = z.object({
  from: z.string().min(1),
  event: z.string().min(1),
  guard: z.record(z.string(), z.unknown()).optional(),
  actions: z.array(ActionSchema).default([]),
  to: z.string().min(1),
  label: z
    .object({
      event: z.string(),
      action: z.string().optional(),
    })
    .optional(),
});

export const FsmDefinitionSchema = z
  .object({
    id: z.string().min(1),
    initial: z.string().min(1),
    states: z.array(z.string().min(1)).min(1),
    transitions: z.array(TransitionSchema),
  })
  .superRefine((def, ctx) => {
    const known = new Set(def.states);

    if (known.size !== def.states.length) {
      ctx.addIssue({ code: 'custom', message: 'Há estados repetidos em "states"' });
    }
    if (!known.has(def.initial)) {
      ctx.addIssue({
        code: 'custom',
        message: `Estado inicial "${def.initial}" não está em "states"`,
      });
    }
    def.transitions.forEach((t, i) => {
      if (!known.has(t.from)) {
        ctx.addIssue({
          code: 'custom',
          message: `transitions[${i}].from "${t.from}" não está em "states"`,
        });
      }
      if (!known.has(t.to)) {
        ctx.addIssue({
          code: 'custom',
          message: `transitions[${i}].to "${t.to}" não está em "states"`,
        });
      }
    });
  });

export type FsmAction = z.infer<typeof ActionSchema>;
export type FsmTransition = z.infer<typeof TransitionSchema>;
export type FsmDefinition = z.infer<typeof FsmDefinitionSchema>;
