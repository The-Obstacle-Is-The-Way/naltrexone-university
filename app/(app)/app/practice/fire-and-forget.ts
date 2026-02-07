function logUnhandledAsyncError(error: unknown): void {
  console.error('Unhandled async UI action error', error);
}

export function fireAndForget(
  promise: Promise<unknown>,
  onError: (error: unknown) => void = logUnhandledAsyncError,
): void {
  promise.catch((error) => {
    onError(error);
  });
}
