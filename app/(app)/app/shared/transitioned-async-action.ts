export function runTransitionedAsyncAction(input: {
  startTransition: (fn: () => void) => void;
  run: () => Promise<void>;
  onUnhandledError?: (error: unknown) => void;
}): Promise<void> {
  return new Promise((resolve) => {
    input.startTransition(async () => {
      try {
        await input.run();
      } catch (error) {
        try {
          input.onUnhandledError?.(error);
        } catch {}
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
