import { useEffect } from 'react';
import { reportClientError } from '@/lib/report-client-error';

/**
 * Logs an error an error page caught and reports it to Sentry, which does not
 * see errors an error page catches. A server error carries a digest and was
 * already reported on the server (onRequestError), so it is not sent again.
 */
export function useReportCaughtError(
  error: Error & { digest?: string },
  component: string,
  reportError: typeof reportClientError = reportClientError,
): void {
  useEffect(() => {
    console.error(component, error);
    if (!error.digest) reportError(error, { component });
  }, [error, component, reportError]);
}
