import * as Sentry from '@sentry/nextjs';

type ClientErrorContext = {
  component?: string;
  action?: string;
};

const NON_REPORTABLE_CLIENT_ERROR_CODES = new Set([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'UNSUBSCRIBED',
  'RATE_LIMITED',
]);

function getTags(
  context: ClientErrorContext | undefined,
): Record<string, string> | undefined {
  const tags = {
    component: context?.component,
    action: context?.action,
  };

  return Object.values(tags).some((value) => value !== undefined)
    ? (tags as Record<string, string>)
    : undefined;
}

export function shouldReportClientError(error: unknown): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  ) {
    return !NON_REPORTABLE_CLIENT_ERROR_CODES.has(
      (error as { code: string }).code,
    );
  }

  return true;
}

export function reportClientError(
  error: unknown,
  context?: ClientErrorContext,
): void {
  if (process.env.NODE_ENV === 'development') {
    console.error('[ClientError]', context, error);
  }

  const tags = getTags(context);
  if (tags) {
    Sentry.captureException(error, { tags });
    return;
  }

  Sentry.captureException(error);
}
