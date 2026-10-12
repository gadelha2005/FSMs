// Ponto de entrada do núcleo de simulação.
// Regra de ouro: nada aqui pode importar React, DOM ou qualquer coisa de packages/web.

export const CORE_VERSION = '0.1.0';

export { createRng, type Rng } from './sim/rng';
