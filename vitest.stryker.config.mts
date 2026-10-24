import { defineConfig } from 'vitest/config';
import unit from './vitest.config.mts';

// Stryker runs only the tests related to each mutant. A partial run is no
// full-lane receipt, so it runs the unit settings without RuleProofReporter.
export default defineConfig({
  ...unit,
  test: { ...unit.test, reporters: ['default'] },
});
