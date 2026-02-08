import { describe, expect, it } from 'vitest';
import { getLoadStateErrorMessage } from './load-state';

describe('shared/load-state', () => {
  it('returns null for non-error states', () => {
    expect(getLoadStateErrorMessage({ status: 'loading' })).toBeNull();
    expect(getLoadStateErrorMessage({ status: 'ready' })).toBeNull();
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
