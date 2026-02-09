export function logUnhandledAsyncError(error: unknown): void {
  console.error('Unhandled async UI action error', error);
}

export function fireAndForget(
  promise: Promise<unknown>,
  onError: (error: unknown) => void,
): void {
  promise.catch((error) => {
    try {
      onError(error);
    } catch (handlerError) {
      console.error('onError handler threw', handlerError);
    }
  });
}
