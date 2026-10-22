import { describe, expect, it } from 'vitest';
import { ApplicationErrorCodes } from './application-errors';
import { errorDiagnosticPolicy } from './error-diagnostic-policy';

describe('errorDiagnosticPolicy', () => {
  it('keeps the four expected browser outcomes unreported', () => {
    for (const code of ApplicationErrorCodes) {
      expect(errorDiagnosticPolicy(code).reportable).toBe(
        ![
          'VALIDATION_ERROR',
          'UNAUTHENTICATED',
          'UNSUBSCRIBED',
          'RATE_LIMITED',
        ].includes(code),
      );
    }
  });
  it('logs operational failures while preserving normal action outcomes', () => {
    for (const code of ApplicationErrorCodes) {
      expect(errorDiagnosticPolicy(code).logLevel).toBe(
        ['INTERNAL_ERROR', 'STRIPE_ERROR'].includes(code) ? 'error' : null,
      );
    }
    expect(errorDiagnosticPolicy(undefined)).toEqual({
      classification: 'operational',
      logLevel: 'error',
      reportable: true,
    });
  });
  it('treats an unrecognized code as operational and reportable', () => {
    expect(errorDiagnosticPolicy('FUTURE_PROVIDER_ERROR')).toEqual({
      classification: 'operational',
      logLevel: 'error',
      reportable: true,
    });
  });
});
