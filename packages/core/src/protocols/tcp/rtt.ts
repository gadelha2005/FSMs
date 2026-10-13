export interface RttState {
  estRtt: number;
  devRtt: number;
  timeout: number;
  rttSamples: number;
}

export const RTT_ALPHA = 0.125;
export const RTT_BETA = 0.25;

export function updateRtt(state: RttState, sample: number, minTimeout: number): RttState {
  if (sample < 0) throw new Error('A amostra de RTT não pode ser negativa');

  if (state.rttSamples === 0) {
    const devRtt = sample / 2;
    return {
      estRtt: sample,
      devRtt,
      timeout: Math.max(minTimeout, sample + 4 * devRtt),
      rttSamples: 1,
    };
  }

  const devRtt = (1 - RTT_BETA) * state.devRtt + RTT_BETA * Math.abs(sample - state.estRtt);
  const estRtt = (1 - RTT_ALPHA) * state.estRtt + RTT_ALPHA * sample;
  return {
    estRtt,
    devRtt,
    timeout: Math.max(minTimeout, estRtt + 4 * devRtt),
    rttSamples: state.rttSamples + 1,
  };
}

export function backoffTimeout(timeout: number, maxTimeout: number): number {
  return Math.min(timeout * 2, maxTimeout);
}