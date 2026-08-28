import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
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
  'name: /\\bCVC(?:\\/CVV)?$/i',
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

const EXACT_SEMVER_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

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
  const sourceFile = ts.createSourceFile(
    'e2e-spec.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let found = false;

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'test' &&
      node.expression.name.text === 'use'
    ) {
      const options = node.arguments[0];
      if (
        options &&
        ts.isObjectLiteralExpression(options) &&
        options.properties.some(
          (property) =>
            ts.isPropertyAssignment(property) &&
            ((ts.isIdentifier(property.name) &&
              property.name.text === 'storageState') ||
              (ts.isStringLiteral(property.name) &&
                property.name.text === 'storageState')) &&
            ts.isIdentifier(property.initializer) &&
            property.initializer.text === 'E2E_CLERK_AUTH_STATE_PATH',
        )
      ) {
        found = true;
        return;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
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

  it('rejects shared auth state text outside the test.use call', () => {
    const source = `
      test.use({ locale: 'en-US' });
      const unrelatedOptions = {
        storageState: E2E_CLERK_AUTH_STATE_PATH,
      };
      test('unrelated case', () => {});
    `;

    expect(usesSharedAuthState(source)).toBe(false);
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

  it.each(['0.0.0', '1.2.3', '2.0.0-beta.1', '2.0.0+build.7'])(
    'accepts exact semantic version %s',
    (version) => {
      expect(version).toMatch(EXACT_SEMVER_PATTERN);
    },
  );

  it.each([
    '^1.2.3',
    '~1.2.3',
    '>=1.2.3',
    '1.2.x',
    'latest',
    'workspace:1.2.3',
  ])('rejects non-exact semantic version %s', (version) => {
    expect(version).not.toMatch(EXACT_SEMVER_PATTERN);
  });

  it('requires the official Stripe CLI dependency to use exact semver', () => {
    expect(packageJson.devDependencies['@stripe/cli']).toMatch(
      EXACT_SEMVER_PATTERN,
    );
  });

  it('never opens the HTML report server after a local run', () => {
    expect(playwrightConfig.reporter).toEqual([
      ['html', { open: 'never' }],
      ['list'],
    ]);
  });

  it('keeps retry traces local and disables them in hosted CI', () => {
    const source = readFileSync('playwright.config.ts', 'utf8');

    expect(source).toContain(
      "trace: process.env.CI ? 'off' : 'on-first-retry'",
    );
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

  it('uses a resilient CVC accessible-name fallback in the hosted paid smoke', () => {
    const source = readFileSync(
      'tests/e2e/stripe-hosted-paid-checkout.spec.ts',
      'utf8',
    );

    expect(source).toContain('name: /\\bCVC(?:\\/CVV)?$/i');
    expect(source).not.toContain("name: 'CVC'");
  });

  it('bounds direct E2E Stripe SDK calls through the shared test client', () => {
    for (const path of NETWORKED_STRIPE_HELPERS) {
      const source = readFileSync(path, 'utf8');

      expect(source).toContain("from './stripe-test-client'");
      expect(source).not.toMatch(/new Stripe\s*\(/);
    }
  });
});
