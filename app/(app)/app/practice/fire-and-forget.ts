import { reportClientError } from '@/lib/report-client-error';

export function logUnhandledAsyncError(error: unknown): void {
  reportClientError(error, {
    component: 'FireAndForget',
    action: 'unhandledAsyncAction',
  });
}

export function fireAndForget(
  promise: Promise<unknown>,
  onError: (error: unknown) => void,
): void {
  promise.catch((error) => {
    try {
      onError(error);
    } catch (handlerError) {
      reportClientError(handlerError, {
        component: 'FireAndForget',
        action: 'onErrorHandler',
      });
    }
  });
}
