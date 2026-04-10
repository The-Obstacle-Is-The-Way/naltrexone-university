import { describe, expect, it, vi } from 'vitest';
import { runTransitionedAsyncAction } from './transitioned-async-action';

describe('shared/transitioned-async-action', () => {
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

    consoleSpy.mockRestore();
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

    consoleSpy.mockRestore();
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

    consoleSpy.mockRestore();
  });
});
