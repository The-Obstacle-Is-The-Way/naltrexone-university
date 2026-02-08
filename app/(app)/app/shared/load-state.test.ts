import { describe, expect, it } from 'vitest';
import { getLoadStateErrorMessage } from './load-state';

describe('shared/load-state', () => {
  it('returns null for loading state', () => {
    expect(getLoadStateErrorMessage({ status: 'loading' })).toBeNull();
  });

  it('returns null for ready state', () => {
    expect(getLoadStateErrorMessage({ status: 'ready' })).toBeNull();
  });

  it('returns null for idle state', () => {
    expect(getLoadStateErrorMessage({ status: 'idle' })).toBeNull();
  });

  it('returns the message for error states', () => {
    expect(
      getLoadStateErrorMessage({
        status: 'error',
        message: 'Something failed.',
      }),
    ).toBe('Something failed.');
  });
});
