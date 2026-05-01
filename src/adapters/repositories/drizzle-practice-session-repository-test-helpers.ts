import { vi } from 'vitest';

export function restoreDrizzlePracticeSessionRepositoryTestMocks() {
  vi.useRealTimers();
  vi.restoreAllMocks();
}
