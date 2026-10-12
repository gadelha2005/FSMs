export interface ChannelParams {
  lossProb: number;
  corruptProb: number;
  dupProb: number;
  reorderProb: number;
  delayMin: number;
  delayMax: number;
}

export const DEFAULT_CHANNEL_PARAMS: ChannelParams = {
  lossProb: 0,
  corruptProb: 0,
  dupProb: 0,
  reorderProb: 0,
  delayMin: 10,
  delayMax: 10,
};

const PROBABILITIES = ['lossProb', 'corruptProb', 'dupProb', 'reorderProb'] as const;

export function validateParams(params: ChannelParams): ChannelParams {
  for (const key of PROBABILITIES) {
    const value = params[key];
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`${key} deve estar entre 0 e 1 (recebido: ${value})`);
    }
  }
  if (!Number.isFinite(params.delayMin) || params.delayMin < 0) {
    throw new RangeError(`delayMin deve ser >= 0 (recebido: ${params.delayMin})`);
  }
  if (!Number.isFinite(params.delayMax) || params.delayMax < params.delayMin) {
    throw new RangeError(
      `delayMax deve ser >= delayMin (recebido: min=${params.delayMin}, max=${params.delayMax})`,
    );
  }
  return params;
}
