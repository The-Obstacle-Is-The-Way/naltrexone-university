import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type VercelConfig = {
  git?: { deploymentEnabled?: boolean | Record<string, boolean> };
};

const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as VercelConfig;

// BUG-327: Vercel builds every branch with Preview's secrets, so freshly
// bumped dependency code from Dependabot would run with them before review.
// GitHub Actions already withholds secrets from Dependabot; Vercel must too.
describe('vercel.json', () => {
  it('does not deploy Dependabot branches', () => {
    const rules = config.git?.deploymentEnabled;

    expect(rules).toMatchObject({ 'dependabot/**': false });
  });

  // Vercel deploys a branch if any matching rule is true, so no other rule may
  // re-enable a Dependabot branch.
  it('has no rule that re-enables a Dependabot branch', () => {
    const rules = config.git?.deploymentEnabled;
    const enabling =
      typeof rules === 'object'
        ? Object.entries(rules).filter(
            ([pattern, enabled]) =>
              enabled &&
              (pattern === '**' ||
                pattern === '*' ||
                pattern.startsWith('dependabot')),
          )
        : [];

    expect(enabling).toEqual([]);
  });
});
