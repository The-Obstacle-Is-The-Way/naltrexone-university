import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// DEBT-510: Codecov sometimes processes an upload and never posts
// codecov/patch, which the merge guard requires. CI sends the notification a
// second time near the end of the job, through the same pinned action.

type Step = {
  name?: string;
  id?: string;
  if?: string;
  uses?: string;
  'continue-on-error'?: boolean;
  with?: Record<string, string | boolean>;
};

function ciSteps(): Step[] {
  const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
    jobs?: Record<string, { steps?: Step[] }>;
  };
  return Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
}

describe('Codecov notification backup', () => {
  const steps = ciSteps();
  const index = (name: string) => steps.findIndex((s) => s.name === name);
  const upload = steps[index('Upload coverage to Codecov')];
  const notify = steps[index('Send Codecov notifications')];

  // #1423 review: a renamed step would leave both sides undefined, and the
  // comparisons below would pass on nothing.
  it('finds every step it checks', () => {
    for (const name of [
      'E2E smoke',
      'Upload coverage to Codecov',
      'Send Codecov notifications',
    ]) {
      expect(index(name), name).toBeGreaterThanOrEqual(0);
    }
  });

  it('sends the notification after E2E, with the upload step pinned the same', () => {
    expect(index('Send Codecov notifications')).toBeGreaterThan(
      index('E2E smoke'),
    );
    expect(notify?.uses).toBe(upload?.uses);
    expect(notify?.with).toEqual({
      token: `\${{ secrets.CODECOV_TOKEN }}`,
      run_command: 'send-notifications',
      fail_ci_if_error: true,
    });
  });

  it('runs only after a successful upload, and never fails the job', () => {
    // The condition names the upload step by this id.
    expect(upload?.id).toBe('codecov');
    expect(notify?.if).toBe(
      `\${{ !cancelled() && steps.codecov.outcome == 'success' }}`,
    );
    expect(notify?.['continue-on-error']).toBe(true);
  });
});
