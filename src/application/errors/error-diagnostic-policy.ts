import type { ApplicationErrorCode } from './application-errors';

const EXPECTED_CLIENT_OUTCOMES: ReadonlySet<string> = new Set([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'UNSUBSCRIBED',
  'RATE_LIMITED',
]);

const EXPECTED_ACTION_OUTCOMES: ReadonlySet<string> = new Set([
  ...EXPECTED_CLIENT_OUTCOMES,
  'ALREADY_SUBSCRIBED',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_WEBHOOK_SIGNATURE',
  'INVALID_WEBHOOK_PAYLOAD',
]);

// Reportability and diagnostic severity do not decide durable replay safety.
// Each action's cache policy owns that decision, including rollback certainty.
export function errorDiagnosticPolicy(
  code: ApplicationErrorCode | string | undefined,
): {
  classification: 'expected' | 'operational';
  logLevel: 'error' | null;
  reportable: boolean;
} {
  const operational = code === undefined || !EXPECTED_ACTION_OUTCOMES.has(code);
  return {
    classification: operational ? 'operational' : 'expected',
    logLevel: operational ? 'error' : null,
    reportable: code === undefined || !EXPECTED_CLIENT_OUTCOMES.has(code),
  };
}
