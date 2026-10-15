/**
 * Vitest global setup file
 *
 * This file runs before all tests and sets up the test environment.
 *
 * Key configuration:
 * - IS_REACT_ACT_ENVIRONMENT: Required for React 19's act() to work properly.
 * - server-only: Next.js helper that throws in non-Next environments; mocked for tests.
 * - After each file's last test, wait for its dynamic imports to settle and fail
 *   the file if they write to the console (tests/shared/late-console-output.ts).
 *
 * @see https://react.dev/reference/react/act
 */

import { afterAll, vi } from 'vitest';
import { failOnLateConsoleOutput } from '@/tests/shared/late-console-output';

vi.mock('server-only', () => ({}));

afterAll(() => failOnLateConsoleOutput(() => vi.dynamicImportSettled()));

// Tell React we're in a test environment where act() should work
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
