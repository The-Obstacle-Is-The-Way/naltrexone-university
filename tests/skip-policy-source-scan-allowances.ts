import type { SkipPolicyAllowance } from './skip-policy-source-scan';

export const DOCUMENTED_SKIP_POLICY_ALLOWANCES: readonly SkipPolicyAllowance[] =
  [
    {
      api: 'describe',
      filePath:
        'tests/integration/stripe-checkout-client-contract.integration.test.ts',
      guardExpression: "providerGate.mode==='skip'",
      kind: 'conditional-reference',
      method: 'skip',
      moduleName: 'vitest',
      expectedCount: 1,
      reason:
        'Flag-off is an intentional hermetic-lane skip; flag-on prerequisites fail closed through the shared provider gate.',
    },
    {
      api: 'describe',
      filePath:
        'tests/integration/stripe-trial-clock-smoke.integration.test.ts',
      guardExpression: "providerGate.mode==='skip'",
      kind: 'conditional-reference',
      method: 'skip',
      moduleName: 'vitest',
      expectedCount: 1,
      reason:
        'Flag-off is an intentional hermetic-lane skip; flag-on prerequisites fail closed through the shared provider gate.',
    },
    {
      api: 'it',
      filePath: 'scripts/run-stripe-provider-contracts.test.ts',
      guardExpression: "process.platform==='win32'",
      kind: 'call',
      method: 'skipIf',
      moduleName: 'vitest',
      expectedCount: 1,
      reason:
        'The descendant-process fixture depends on POSIX process-group semantics.',
    },
    {
      api: 'it',
      filePath: 'scripts/run-stripe-provider-contracts-process.test.ts',
      guardExpression: "process.platform==='win32'",
      kind: 'call',
      method: 'skipIf',
      moduleName: 'vitest',
      expectedCount: 1,
      reason:
        'The ignored-signal fixture is constructible only on POSIX platforms.',
    },
  ];
