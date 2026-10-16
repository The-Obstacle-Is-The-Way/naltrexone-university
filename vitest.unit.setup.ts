/**
 * Vitest setup for the unit lane only (vitest.config.mts).
 *
 * After each file's last test, it waits for the file's pending dynamic imports
 * and fails the file if anything writes to the console while they settle
 * (tests/shared/late-console-output.ts). In this lane's Node workers, a
 * console call during worker shutdown fails the whole run with
 * EnvironmentTeardownError, naming no test. Browser mode has no such
 * shutdown channel, so its lane does not load this file.
 */

import { afterAll, vi } from 'vitest';
import { failOnLateConsoleOutput } from '@/tests/shared/late-console-output';

afterAll(() => failOnLateConsoleOutput(() => vi.dynamicImportSettled()));
