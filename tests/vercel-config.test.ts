import { readFileSync } from 'node:fs';
import { matchesGlob } from 'node:path';
import { describe, expect, it } from 'vitest';

type VercelConfig = {
  git?: { deploymentEnabled?: boolean | Record<string, boolean> };
};

const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as VercelConfig;

// Vercel's documented rule: a branch deploys if any matching pattern is true;
// otherwise a matching false stops it; an unmatched branch deploys. Patterns
// are globs, matched here with Node's glob matcher.
function deploys(branch: string): boolean {
  const rules = config.git?.deploymentEnabled;
  if (typeof rules === 'boolean' || rules === undefined) return rules ?? true;
  const matching = Object.entries(rules).filter(([pattern]) =>
    matchesGlob(branch, pattern),
  );
  if (matching.some(([, enabled]) => enabled)) return true;
  return matching.length === 0;
}

// BUG-327: Vercel builds every branch with Preview's secrets, so freshly
// bumped dependency code from Dependabot would run with them before review.
// GitHub Actions already withholds secrets from Dependabot; Vercel must too.
describe('vercel.json', () => {
  it.each([
    'dependabot/npm_and_yarn/next-16.3.7',
    'dependabot/npm_and_yarn/npm-minor-and-patch-a1b2c3d4',
    'dependabot/github_actions/actions/checkout-6',
  ])('does not deploy the Dependabot branch %s', (branch) => {
    expect(deploys(branch)).toBe(false);
  });

  it.each(['dev', 'main', 'fix/bug-327-dependabot-previews'])(
    'still deploys %s',
    (branch) => {
      expect(deploys(branch)).toBe(true);
    },
  );
});
