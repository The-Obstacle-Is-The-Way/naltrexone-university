// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { renderLiveHook } from '@/src/application/test-helpers/render-live-hook';

describe('renderLiveHook', () => {
  it('returns undefined when the hook value is intentionally undefined', async () => {
    const harness = renderLiveHook(() => undefined);

    try {
      await harness.waitFor(() => true);
      expect(harness.getCurrent()).toBeUndefined();
    } finally {
      harness.unmount();
    }
  });

  it('rejects when waitFor predicate never matches within timeout', async () => {
    const harness = renderLiveHook(() => ({ ready: false }));

    try {
      await expect(
        harness.waitFor((value) => value.ready, 10, 1),
      ).rejects.toThrow('Timed out waiting for hook state');
    } finally {
      harness.unmount();
    }
  });
});
