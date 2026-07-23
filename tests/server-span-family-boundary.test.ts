import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fg from 'fast-glob';
import { describe, expect, it } from 'vitest';
import { SERVER_SPAN_FAMILIES } from '@/src/adapters/shared/server-tracing';

const PRODUCTION_SOURCE_GLOBS = [
  'app/**/*.{ts,tsx}',
  'lib/**/*.{ts,tsx}',
  'src/**/*.{ts,tsx}',
  '*.ts',
];
const PRODUCTION_SOURCE_IGNORE_GLOBS = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.browser.spec.tsx',
  '**/*test-helpers.ts',
  '**/*test-helpers.tsx',
];

const EXPECTED_START_SPAN_SITES = [
  {
    filePath: 'lib/container/use-cases.ts',
    familyReference: 'SERVER_SPAN_FAMILIES.finalizeExamAnswers',
  },
  {
    filePath: 'src/adapters/controllers/bookmark-controller.ts',
    familyReference: 'SERVER_SPAN_FAMILIES.getBookmarks',
  },
  {
    filePath: 'src/adapters/controllers/review-controller.ts',
    familyReference: 'SERVER_SPAN_FAMILIES.getAttemptedQuestions',
  },
  {
    filePath: 'src/adapters/controllers/stats-controller.ts',
    familyReference: 'SERVER_SPAN_FAMILIES.getUserStats',
  },
  {
    filePath: 'src/adapters/controllers/stripe-webhook-controller.ts',
    familyReference: 'SERVER_SPAN_FAMILIES.stripe.parent',
  },
  {
    filePath: 'src/adapters/gateways/stripe/stripe-subscription-normalizer.ts',
    familyReference: 'SERVER_SPAN_FAMILIES.stripe.subscriptionRetrieve',
  },
] as const;

function countOccurrences(source: string, pattern: RegExp): number {
  return Array.from(source.matchAll(pattern)).length;
}

describe('server span family boundary', () => {
  it('allows only the six pinned startSpan sites within five families', () => {
    expect(Object.keys(SERVER_SPAN_FAMILIES)).toEqual([
      'finalizeExamAnswers',
      'getBookmarks',
      'getUserStats',
      'getAttemptedQuestions',
      'stripe',
    ]);

    const actualSites = fg
      .sync(PRODUCTION_SOURCE_GLOBS, {
        cwd: process.cwd(),
        ignore: PRODUCTION_SOURCE_IGNORE_GLOBS,
        onlyFiles: true,
      })
      .sort()
      .flatMap((filePath) => {
        const source = readFileSync(resolve(process.cwd(), filePath), 'utf8');
        const count = countOccurrences(source, /\bSentry\.startSpan\s*\(/g);
        return count > 0 ? [{ filePath, count, source }] : [];
      });

    expect(
      actualSites.map(({ filePath, count }) => ({ filePath, count })),
    ).toEqual(
      EXPECTED_START_SPAN_SITES.map(({ filePath }) => ({
        filePath,
        count: 1,
      })),
    );

    for (const expected of EXPECTED_START_SPAN_SITES) {
      const actual = actualSites.find(
        ({ filePath }) => filePath === expected.filePath,
      );
      expect(actual?.source).toContain(expected.familyReference);
      expect(
        countOccurrences(
          actual?.source ?? '',
          /\battributes:\s*projectSafeSpanAttributes\s*\(/g,
        ),
      ).toBe(1);
    }
  });
});
