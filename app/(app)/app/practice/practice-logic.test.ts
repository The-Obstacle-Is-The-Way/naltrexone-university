import { describe, expect, it } from 'vitest';
import { TimeoutError } from '@/lib/with-timeout';
import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from './practice-logic';

describe('practice-logic', () => {
  describe('getActionResultErrorMessage', () => {
    it('returns a helpful message for error ActionResult', () => {
      expect(
        getActionResultErrorMessage({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: 'Internal error' },
        }),
      ).toBe('Internal error');
    });

    it('returns a fallback message for ok ActionResult', () => {
      expect(getActionResultErrorMessage({ ok: true, data: null })).toBe(
        'Unexpected ok result',
      );
    });
  });

  describe('getThrownErrorMessage', () => {
    it('returns a friendly message when error is TimeoutError', () => {
      expect(getThrownErrorMessage(new TimeoutError(5000))).toBe(
        'Request timed out. Please try again.',
      );
    });
  });
});
