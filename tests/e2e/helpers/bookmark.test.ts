import { describe, expect, it, vi } from 'vitest';
import { waitForBookmarksPageState } from './bookmark';

type WaitForOptions = {
  state: 'visible';
  timeout: number;
};

function createWaitable(
  waitForImpl: (options: WaitForOptions) => Promise<void>,
) {
  return {
    waitFor: vi.fn(waitForImpl),
    first() {
      return this;
    },
  };
}

describe('bookmark helper page-state detection', () => {
  it('returns populated when a Remove button becomes visible', async () => {
    const removeButton = createWaitable(async () => {});
    const emptyState = createWaitable(async () => {
      throw new Error('No empty state');
    });
    const page = {
      getByRole: vi.fn(() => removeButton),
      getByText: vi.fn(() => emptyState),
    };

    await expect(waitForBookmarksPageState(page as never, 2_500)).resolves.toBe(
      'populated',
    );
    expect(removeButton.waitFor).toHaveBeenCalledWith({
      state: 'visible',
      timeout: 2_500,
    });
    expect(emptyState.waitFor).toHaveBeenCalledWith({
      state: 'visible',
      timeout: 2_500,
    });
  });

  it('returns empty when the empty-state card becomes visible first', async () => {
    const removeButton = createWaitable(async () => {
      throw new Error('No remove button');
    });
    const emptyState = createWaitable(async () => {});
    const page = {
      getByRole: vi.fn(() => removeButton),
      getByText: vi.fn(() => emptyState),
    };

    await expect(waitForBookmarksPageState(page as never, 4_000)).resolves.toBe(
      'empty',
    );
    expect(removeButton.waitFor).toHaveBeenCalledWith({
      state: 'visible',
      timeout: 4_000,
    });
    expect(emptyState.waitFor).toHaveBeenCalledWith({
      state: 'visible',
      timeout: 4_000,
    });
  });

  it('throws a descriptive error when neither valid page state appears', async () => {
    const removeButton = createWaitable(async () => {
      throw new Error('No remove button');
    });
    const emptyState = createWaitable(async () => {
      throw new Error('No empty state');
    });
    const page = {
      getByRole: vi.fn(() => removeButton),
      getByText: vi.fn(() => emptyState),
    };

    await expect(
      waitForBookmarksPageState(page as never, 1_500),
    ).rejects.toThrow(
      'Bookmarks page did not reach a populated or empty state within 1500ms.',
    );
  });
});
