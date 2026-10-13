import { scenario10 } from './compare';
import { buildResult, check, type Scenario, type ScenarioResult } from './scenario';
import { scenario1, scenario2, scenario3, scenario4, scenario5, scenario7 } from './tcp';
import { scenario6 } from './tcp-transfer';
import { scenario8, scenario9 } from './udp';

export const allScenarios: Scenario[] = [
  scenario1,
  scenario2,
  scenario3,
  scenario4,
  scenario5,
  scenario6,
  scenario7,
  scenario8,
  scenario9,
  scenario10,
];

export function runScenario(scenario: Scenario): ScenarioResult {
  try {
    return scenario.run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return buildResult(scenario, [check('o cenário executa sem erro', false, message)]);
  }
}

export function runAll(scenarios: Scenario[] = allScenarios): ScenarioResult[] {
  return scenarios.map(runScenario);
}