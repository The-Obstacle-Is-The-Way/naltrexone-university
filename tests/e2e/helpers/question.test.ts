import { beforeEach, describe, expect, it, vi } from 'vitest';

const playwrightExpectCalls = vi.hoisted(() => ({
  toBeVisible: vi.fn(),
  toHaveText: vi.fn(),
}));

vi.mock('@playwright/test', () => ({
  expect: (target: unknown) => ({
    toBeVisible: (options?: unknown) =>
      playwrightExpectCalls.toBeVisible(target, options),
    toHaveText: (expected: unknown) =>
      playwrightExpectCalls.toHaveText(target, expected),
  }),
}));

import {
  expectVerdictPillVisible,
  readVerdict,
  rethrowIfQuestionMissingCheckError,
  SeededQuestionMissingError,
} from './question';

beforeEach(() => {
  playwrightExpectCalls.toBeVisible.mockReset();
  playwrightExpectCalls.toHaveText.mockReset();
});

describe('question helper error handling', () => {
  it('rethrows explicit seeded-question-missing errors', () => {
    const error = new SeededQuestionMissingError('missing-slug');

    expect(() => rethrowIfQuestionMissingCheckError(error)).toThrow(
      SeededQuestionMissingError,
    );
  });

  it('treats Playwright timeout errors as non-fatal even when message contains "not found"', () => {
    const timeoutError = Object.assign(
      new Error(
        "locator.waitFor: Timeout 2000ms exceeded waiting for 'Question not found.'",
      ),
      { name: 'TimeoutError' },
    );

    expect(() =>
      rethrowIfQuestionMissingCheckError(timeoutError),
    ).not.toThrow();
  });

  it('rethrows unexpected errors', () => {
    expect(() =>
      rethrowIfQuestionMissingCheckError(new Error('Unexpected failure')),
    ).toThrow('Unexpected failure');
  });
});

describe('expectVerdictPillVisible', () => {
  it('waits for the verdict pill and anchors its text to the verdict labels', async () => {
    const verdictPill = {
      first: vi.fn(),
    };
    verdictPill.first.mockReturnValue(verdictPill);
    const page = {
      getByTestId: vi.fn(() => verdictPill),
    };

    const actualVerdictPill = await expectVerdictPillVisible(page as never);

    expect(page.getByTestId).toHaveBeenCalledWith('verdict-pill');
    expect(verdictPill.first).toHaveBeenCalledTimes(1);
    expect(actualVerdictPill).toBe(verdictPill);
    expect(playwrightExpectCalls.toBeVisible).toHaveBeenCalledWith(
      verdictPill,
      {
        timeout: 10_000,
      },
    );
    expect(playwrightExpectCalls.toHaveText).toHaveBeenCalledWith(
      verdictPill,
      /^(Correct|Incorrect)$/,
    );
  });
});

describe('readVerdict', () => {
  it('reads the verdict from the pill when the same word also appears elsewhere', async () => {
    const verdictPill = {
      first: vi.fn(),
      textContent: vi.fn(async () => 'Correct'),
    };
    verdictPill.first.mockReturnValue(verdictPill);
    const page = {
      getByTestId: vi.fn(() => verdictPill),
      // A second exact "Correct" on the page: Playwright's strict mode makes a
      // page-wide text check throw, which once read as "not this outcome".
      getByText: vi.fn(() => ({
        isVisible: async () => {
          throw new Error('strict mode violation: resolved to 2 elements');
        },
      })),
    };

    await expect(readVerdict(page as never)).resolves.toBe('Correct');
    expect(playwrightExpectCalls.toHaveText).toHaveBeenCalledWith(
      verdictPill,
      /^(Correct|Incorrect)$/,
    );
  });
});
