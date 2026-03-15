import { reportClientError } from '@/lib/report-client-error';

function reportFireAndForgetHandlerError(handlerError: unknown): void {
  reportClientError(handlerError, {
    component: 'FireAndForget',
    action: 'onErrorHandler',
  });
}

export function logUnhandledAsyncError(error: unknown): void {
  reportClientError(error, {
    component: 'FireAndForget',
    action: 'unhandledAsyncAction',
  });
}

export function fireAndForget(
  promise: Promise<unknown>,
  onError: (error: unknown) => void | Promise<void>,
): void {
  promise.catch((error) => {
    try {
      const maybePromise = onError(error);
      void Promise.resolve(maybePromise).catch((handlerError) => {
        reportFireAndForgetHandlerError(handlerError);
      });
    } catch (handlerError) {
      reportFireAndForgetHandlerError(handlerError);
    }
  });
}
