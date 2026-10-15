/**
 * Vitest global setup file
 *
 * This file runs before all tests and sets up the test environment.
 *
 * Key configuration:
 * - IS_REACT_ACT_ENVIRONMENT: Required for React 19's act() to work properly.
 * - server-only: Next.js helper that throws in non-Next environments; mocked for tests.
 *
 * @see https://react.dev/reference/react/act
 */

import { vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Tell React we're in a test environment where act() should work
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
