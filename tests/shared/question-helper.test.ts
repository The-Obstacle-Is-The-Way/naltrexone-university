import { describe, expect, it } from 'vitest';
import {
  rethrowIfQuestionMissingCheckError,
  SeededQuestionMissingError,
} from '../e2e/helpers/question';

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
