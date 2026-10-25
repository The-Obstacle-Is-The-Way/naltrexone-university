import { expect, it } from 'vitest';
import * as ledger from '../scripts/database/migration-ledger';
import * as documentation from '../scripts/records/documentation-archive';
import * as e2e from '../scripts/test-lanes/e2e-local-orchestrator';

it('keeps retired, uncalled script APIs out of the public surface', () => {
  expect(documentation).not.toHaveProperty('documentationLinks');
  expect(ledger).not.toHaveProperty('formatMigrationContentDriftMessage');
  expect(e2e).not.toHaveProperty('resolveLocalE2EDatabaseUrl');
});
