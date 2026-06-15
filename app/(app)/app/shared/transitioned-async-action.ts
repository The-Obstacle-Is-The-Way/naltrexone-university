export function runTransitionedAsyncAction(input: {
  startTransition: (fn: () => void) => void;
  run: () => Promise<void>;
  onUnhandledError?: ((error: unknown) => void | Promise<void>) | undefined;
}): Promise<void> {
  return new Promise((resolve) => {
    input.startTransition(async () => {
      try {
        await input.run();
      } catch (error) {
        // The caller owns error state; this prevents unhandled rejections.
        try {
          await input.onUnhandledError?.(error);
        } catch {
          // Reporter failures must not mask the original error.
        }
        console.error(
          'runTransitionedAsyncAction: unhandled error in run()',
          error,
        );
      } finally {
        resolve();
      }
    });
  });
}
