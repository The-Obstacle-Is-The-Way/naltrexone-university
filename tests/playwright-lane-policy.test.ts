import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';
import playwrightConfig from '../playwright.config';

type FilePattern = RegExp | string | readonly (RegExp | string)[];

type PlaywrightProjectPolicy = {
  name?: string;
  teardown?: string;
  testIgnore?: FilePattern;
  testMatch?: FilePattern;
  use?: { storageState?: unknown };
};

const STRIPE_HOSTED_SELECTOR_ALLOWLIST = [
  'tests/e2e/helpers/stripe-hosted-checkout.ts',
  'tests/e2e/stripe-hosted-paid-checkout.spec.ts',
] as const;

const STRIPE_HOSTED_SELECTOR_MARKERS = [
  "name: 'Card'",
  "name: 'Save my information for faster checkout'",
  '/card number/i',
  '/expiration/i',
  "name: 'CVC'",
  '/cardholder name|name on card/i',
  '/zip|postal code/i',
  '/I agree to .*Terms of Service and Privacy Policy/i',
  '/start (free )?trial|subscribe|continue/i',
] as const;

const NETWORKED_STRIPE_HELPERS = [
  'tests/e2e/helpers/credential-health-check.ts',
  'tests/e2e/helpers/paid-checkout.ts',
  'tests/e2e/helpers/seed-test-user.ts',
  'tests/e2e/helpers/subscription.ts',
] as const;

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listTypeScriptFiles(path) : [path];
  });
}

function matchesRegexPattern(
  pattern: FilePattern | undefined,
  filePath: string,
): boolean {
  const patterns = Array.isArray(pattern) ? pattern : [pattern];

  return patterns.some((candidate) => {
    if (!(candidate instanceof RegExp)) return false;
    candidate.lastIndex = 0;
    return candidate.test(filePath);
  });
}

function getProject(name: string): PlaywrightProjectPolicy {
  const project = (playwrightConfig.projects ?? []).find(
    (candidate) => candidate.name === name,
  );
  if (!project) throw new Error(`Missing Playwright project: ${name}`);
  return project;
}

function usesSharedAuthState(source: string): boolean {
  return /test\.use\(\s*\{[\s\S]*?storageState:\s*E2E_CLERK_AUTH_STATE_PATH\s*,?[\s\S]*?\}\s*\)/.test(
    source,
  );
}

describe('Playwright E2E lane policy', () => {
  const requiredSpec = 'tests/e2e/checkout-redirect.spec.ts';
  const providerContractSpec = 'tests/e2e/checkout-success-provider.spec.ts';
  const hostedSpec = 'tests/e2e/stripe-hosted-trial-start.spec.ts';

  it('keeps Stripe-hosted specs out of the required Chromium project', () => {
    const project = getProject('chromium');

    expect(matchesRegexPattern(project.testMatch, requiredSpec)).toBe(true);
    expect(matchesRegexPattern(project.testMatch, providerContractSpec)).toBe(
      true,
    );
    expect(matchesRegexPattern(project.testIgnore, hostedSpec)).toBe(true);
  });

  it('gives hosted Checkout specs an explicit compatibility project', () => {
    const project = getProject('stripe-hosted');

    expect(matchesRegexPattern(project.testMatch, hostedSpec)).toBe(true);
    expect(matchesRegexPattern(project.testMatch, requiredSpec)).toBe(false);
    expect(matchesRegexPattern(project.testMatch, providerContractSpec)).toBe(
      false,
    );
  });

  it('routes required and hosted commands to mutually exclusive projects', () => {
    expect(packageJson.scripts['test:e2e']).toBe(
      'tsx scripts/run-local-e2e.ts --project=chromium',
    );
    expect(packageJson.scripts['test:e2e:stripe-hosted']).toBe(
      'tsx scripts/run-local-e2e.ts --project=stripe-hosted',
    );
  });

  it.each([
    [
      'trailing comma',
      'test.use({ storageState: E2E_CLERK_AUTH_STATE_PATH, });',
    ],
    [
      'multiline options',
      `test.use({
        locale: 'en-US',
        storageState: E2E_CLERK_AUTH_STATE_PATH,
      });`,
    ],
  ])('accepts shared auth state in %s test.use syntax', (_label, source) => {
    expect(usesSharedAuthState(source)).toBe(true);
  });

  it('requires every Clerk-authenticated spec to load the shared suite auth state', () => {
    const authenticatedSpecs = listTypeScriptFiles('tests/e2e')
      .filter((path) => path.endsWith('.spec.ts'))
      .filter((path) =>
        readFileSync(path, 'utf8').includes('signInWithClerkPassword'),
      );

    expect(authenticatedSpecs.length).toBeGreaterThanOrEqual(14);
    for (const path of authenticatedSpecs) {
      const source = readFileSync(path, 'utf8');
      expect(source, path).toContain('E2E_CLERK_AUTH_STATE_PATH');
      expect(usesSharedAuthState(source), path).toBe(true);
    }
  });

  it('pins the official Stripe CLI used by the required completion trigger', () => {
    expect(packageJson.devDependencies['@stripe/cli']).toBe('1.50.1');
  });

  it('never opens the HTML report server after a local run', () => {
    expect(playwrightConfig.reporter).toEqual([
      ['html', { open: 'never' }],
      ['list'],
    ]);
  });

  it('keeps known Stripe-owned selectors in explicitly hosted smoke files', () => {
    const filesWithHostedSelectors = listTypeScriptFiles('tests/e2e')
      .filter((path) => path.endsWith('.ts'))
      .filter((path) => {
        const source = readFileSync(path, 'utf8');
        return STRIPE_HOSTED_SELECTOR_MARKERS.some((marker) =>
          source.includes(marker),
        );
      })
      .sort();

    expect(filesWithHostedSelectors).toEqual(
      [...STRIPE_HOSTED_SELECTOR_ALLOWLIST].sort(),
    );
  });

  it('bounds direct E2E Stripe SDK calls through the shared test client', () => {
    for (const path of NETWORKED_STRIPE_HELPERS) {
      const source = readFileSync(path, 'utf8');

      expect(source).toContain("from './stripe-test-client'");
      expect(source).not.toMatch(/new Stripe\s*\(/);
    }
  });
});
