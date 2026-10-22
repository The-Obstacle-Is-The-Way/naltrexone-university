import * as Sentry from '@sentry/nextjs';
import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
import { errorDiagnosticPolicy } from '@/src/application/errors/error-diagnostic-policy';

type ClientErrorContext = {
  component?: string;
  action?: string;
};

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
    return errorDiagnosticPolicy((error as { code: string }).code).reportable;
  }

  return true;
}

export function reportClientError(
  error: unknown,
  context?: ClientErrorContext,
): void {
  try {
    if (process.env.NODE_ENV === 'development') {
      console.error(
        '[ClientError]',
        context,
        projectSafeErrorDiagnostics(error),
      );
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
