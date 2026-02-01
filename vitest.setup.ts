/**
 * Vitest global setup file
 *
 * This file runs before all tests and sets up the test environment.
 *
 * Key configuration:
 * - IS_REACT_ACT_ENVIRONMENT: Required for React 19's act() to work properly.
 *   Without this, act() may fail intermittently (especially in fresh environments
 *   like git hooks or CI).
 *
 * @see https://react.dev/reference/react/act
 * @see https://github.com/testing-library/react-testing-library/issues/1061
 */

// Tell React we're in a test environment where act() should work
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
