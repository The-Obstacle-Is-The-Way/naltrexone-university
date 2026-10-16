import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  OPERATIONAL_ALERT_WATCHER_WORKFLOW,
  SCHEDULED_WATCHES,
} from '@/src/adapters/jobs/scheduled-checks';

// DEBT-505, DEBT-523: the renewal job alerts on a watched workflow that is
// missing, so a rename that misses these paths would alert in production a
// day later. Failing here catches it before merge.
describe('the workflows the renewal job watches', () => {
  it.each([OPERATIONAL_ALERT_WATCHER_WORKFLOW, ...SCHEDULED_WATCHES])(
    'names %s, which exists in the repository',
    (path) => {
      expect(existsSync(path)).toBe(true);
    },
  );
});
