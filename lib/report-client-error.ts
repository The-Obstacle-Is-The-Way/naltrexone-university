import * as Sentry from '@sentry/nextjs';
import type { ApplicationErrorCode } from '@/src/application/errors';

type ClientErrorContext = {
  component?: string;
  action?: string;
};

/**
 * ActionResult error codes that represent expected business outcomes, not
 * operational failures. These should never reach Sentry — they are normal
 * UI-state transitions (e.g. "you need a subscription", "too many requests").
 *
 * New codes default to reportable. Only add a code here when you are certain
 * it is an expected user-facing business outcome, not a system failure.
 */
const EXPECTED_BUSINESS_ERROR_CODES: ReadonlySet<ApplicationErrorCode> =
  new Set<ApplicationErrorCode>([
    'VALIDATION_ERROR',
    'UNAUTHENTICATED',
    'UNSUBSCRIBED',
    'RATE_LIMITED',
  ]);

function getTags(
  context: ClientErrorContext | undefined,
): Record<string, string> | undefined {
  if (!context) return undefined;
  const tags: Record<string, string> = {};
  if (context.component) tags.component = context.component;
  if (context.action) tags.action = context.action;
  return Object.keys(tags).length > 0 ? tags : undefined;
}

export function shouldReportClientError(error: unknown): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  ) {
    return !EXPECTED_BUSINESS_ERROR_CODES.has(
      (error as { code: string }).code as ApplicationErrorCode,
    );
  }

  return true;
}

export function reportClientError(
  error: unknown,
  context?: ClientErrorContext,
): void {
  try {
    if (process.env.NODE_ENV === 'development') {
      console.error('[ClientError]', context, error);
    }

    const tags = getTags(context);
    if (tags) {
      Sentry.captureException(error, { tags });
      return;
    }

    Sentry.captureException(error);
  } catch {
    // Telemetry is best-effort and must never break the caller's primary error path.
  }
}
