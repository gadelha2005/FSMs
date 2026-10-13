export type ScenarioProtocol = 'TCP' | 'UDP' | 'UDP vs TCP';

export interface Check {
  description: string;
  passed: boolean;
  detail?: string;
}

export interface ScenarioResult {
  id: number;
  protocol: ScenarioProtocol;
  title: string;
  expected: string;
  passed: boolean;
  checks: Check[];
  metrics: Record<string, unknown>;
}

export interface Scenario {
  id: number;
  protocol: ScenarioProtocol;
  title: string;
  expected: string;
  run(): ScenarioResult;
}

export function check(description: string, passed: boolean, detail?: string): Check {
  return { description, passed, detail };
}

export function buildResult(
  scenario: Omit<Scenario, 'run'>,
  checks: Check[],
  metrics: Record<string, unknown> = {},
): ScenarioResult {
  return {
    id: scenario.id,
    protocol: scenario.protocol,
    title: scenario.title,
    expected: scenario.expected,
    passed: checks.every((c) => c.passed),
    checks,
    metrics,
  };
}
