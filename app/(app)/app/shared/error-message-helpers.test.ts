import { describe, expect, it } from 'vitest';
import { TimeoutError } from '@/lib/with-timeout';
import {
  getActionResultErrorMessage,
  getThrownErrorMessage,
} from './error-message-helpers';

describe('shared/error-message-helpers', () => {
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

    it('returns the message from a standard Error', () => {
      expect(getThrownErrorMessage(new Error('Something broke'))).toBe(
        'Something broke',
      );
    });

    it('returns the string directly when thrown value is a non-empty string', () => {
      expect(getThrownErrorMessage('network failure')).toBe('network failure');
    });

    it('returns fallback for unknown thrown values', () => {
      expect(getThrownErrorMessage(undefined)).toBe('Unexpected error');
      expect(getThrownErrorMessage(null)).toBe('Unexpected error');
      expect(getThrownErrorMessage(42)).toBe('Unexpected error');
      expect(getThrownErrorMessage('')).toBe('Unexpected error');
    });
  });
});
