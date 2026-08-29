import { pathToFileURL } from 'node:url';
import {
  HAND_ROLLED_PORT_DOUBLE_FLOORS,
  OWN_CODE_MODULE_MOCK_FLOORS,
  UNKNOWN_DOUBLE_CAST_FLOORS,
} from './test-double-fidelity-ratchet-floors';
import {
  collectHandRolledPortDoubleOccurrences,
  collectOwnCodeModuleMockOccurrences,
  collectRatchetGrowthIssues,
  collectUnknownDoubleCastOccurrences,
  readMaintainedFakePortNames,
  readRepositoryCompilerOptions,
  readTestSources,
} from './test-double-fidelity-source-scan';

export type LiveTestDoubleRatchetIssues = {
  ownCodeModuleMocks: string[];
  unknownDoubleCasts: string[];
  handRolledPortDoubles: string[];
};

export function collectLiveTestDoubleRatchetIssues(): LiveTestDoubleRatchetIssues {
  const sources = readTestSources();

  return {
    ownCodeModuleMocks: collectRatchetGrowthIssues(
      'own-code module mock',
      collectOwnCodeModuleMockOccurrences(sources),
      OWN_CODE_MODULE_MOCK_FLOORS,
    ),
    unknownDoubleCasts: collectRatchetGrowthIssues(
      'unknown double cast',
      collectUnknownDoubleCastOccurrences(sources),
      UNKNOWN_DOUBLE_CAST_FLOORS,
    ),
    handRolledPortDoubles: collectRatchetGrowthIssues(
      'hand-rolled maintained-port double',
      collectHandRolledPortDoubleOccurrences(
        sources,
        readMaintainedFakePortNames(),
        readRepositoryCompilerOptions(),
      ),
      HAND_ROLLED_PORT_DOUBLE_FLOORS,
    ),
  };
}

function assertNoLiveTestDoubleRatchetIssues(
  issues: LiveTestDoubleRatchetIssues,
): void {
  const violations = [
    ...issues.ownCodeModuleMocks,
    ...issues.unknownDoubleCasts,
    ...issues.handRolledPortDoubles,
  ];

  if (violations.length > 0) {
    throw new Error(
      `Test-double fidelity ratchet failed:\n${violations
        .map((violation) => `- ${violation}`)
        .join('\n')}`,
    );
  }
}

export function runCli(
  collectIssues: () => LiveTestDoubleRatchetIssues = collectLiveTestDoubleRatchetIssues,
): void {
  const issues = collectIssues();
  assertNoLiveTestDoubleRatchetIssues(issues);
  process.stdout.write('PASS test-double-fidelity issues=0\n');
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';

if (import.meta.url === executedPath) {
  runCli();
}
