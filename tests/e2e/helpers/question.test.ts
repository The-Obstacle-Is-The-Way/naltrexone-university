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

    await expectVerdictPillVisible(page as never);

    expect(page.getByTestId).toHaveBeenCalledWith('verdict-pill');
    expect(verdictPill.first).toHaveBeenCalledTimes(1);
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
