import { afterEach, describe, expect, it, vi } from 'vitest';
import { runTransitionedAsyncAction } from './transitioned-async-action';

describe('shared/transitioned-async-action', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves transitioned async action after completion', async () => {
    let transitioned = false;

    const promise = runTransitionedAsyncAction({
      startTransition: (fn) => {
        transitioned = true;
        fn();
      },
      run: async () => {},
    });

    await expect(promise).resolves.toBeUndefined();
    expect(transitioned).toBe(true);
  });

  it('resolves transitioned async action even when it throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const promise = runTransitionedAsyncAction({
      startTransition: (fn) => {
        fn();
      },
      run: async () => {
        throw new Error('boom');
      },
    });

    await expect(promise).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      'runTransitionedAsyncAction: unhandled error in run()',
      expect.any(Error),
    );
  });

  it('invokes onUnhandledError when run() throws and still resolves', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('boom');
    const onUnhandledError = vi.fn();

    const promise = runTransitionedAsyncAction({
      startTransition: (fn) => {
        fn();
      },
      run: async () => {
        throw error;
      },
      onUnhandledError,
    });

    await expect(promise).resolves.toBeUndefined();

    expect(onUnhandledError).toHaveBeenCalledWith(error);
    expect(consoleSpy).toHaveBeenCalledWith(
      'runTransitionedAsyncAction: unhandled error in run()',
      error,
    );
  });

  it('still logs the original error and resolves when onUnhandledError throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('boom');
    const onUnhandledError = vi.fn(() => {
      throw new Error('reporter failed');
    });

    const promise = runTransitionedAsyncAction({
      startTransition: (fn) => {
        fn();
      },
      run: async () => {
        throw error;
      },
      onUnhandledError,
    });

    await expect(promise).resolves.toBeUndefined();

    expect(onUnhandledError).toHaveBeenCalledWith(error);
    expect(consoleSpy).toHaveBeenCalledWith(
      'runTransitionedAsyncAction: unhandled error in run()',
      error,
    );
  });

  it('waits for an async onUnhandledError before resolving', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('boom');
    const reporter = (() => {
      let resolveReporter: (() => void) | undefined;
      const promise = new Promise<void>((resolve) => {
        resolveReporter = resolve;
      });

      if (!resolveReporter) {
        throw new Error('Expected async reporter resolver to be assigned');
      }

      return {
        promise,
        resolve: resolveReporter,
      };
    })();
    let resolved = false;

    const promise = runTransitionedAsyncAction({
      startTransition: (fn) => {
        fn();
      },
      run: async () => {
        throw error;
      },
      onUnhandledError: async (receivedError) => {
        expect(receivedError).toBe(error);
        await reporter.promise;
      },
    }).then(() => {
      resolved = true;
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(resolved).toBe(false);

    reporter.resolve();
    await expect(promise).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      'runTransitionedAsyncAction: unhandled error in run()',
      error,
    );
  });

  it('still logs the original error and resolves when async onUnhandledError rejects', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('boom');
    const onUnhandledError = vi.fn(async () => {
      throw new Error('reporter failed');
    });

    const promise = runTransitionedAsyncAction({
      startTransition: (fn) => {
        fn();
      },
      run: async () => {
        throw error;
      },
      onUnhandledError,
    });

    await expect(promise).resolves.toBeUndefined();

    expect(onUnhandledError).toHaveBeenCalledWith(error);
    expect(consoleSpy).toHaveBeenCalledWith(
      'runTransitionedAsyncAction: unhandled error in run()',
      error,
    );
  });
});
