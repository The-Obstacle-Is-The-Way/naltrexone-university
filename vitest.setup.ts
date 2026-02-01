/**
 * Vitest global setup file
 *
 * This file runs before all tests and sets up the test environment.
 *
 * Key configuration:
 * - IS_REACT_ACT_ENVIRONMENT: Required for React 19's act() to work properly.
 * - @testing-library/jest-dom: Provides DOM matchers like toBeInTheDocument().
 *
 * @see https://react.dev/reference/react/act
 * @see https://testing-library.com/docs/react-testing-library/intro
 */

import '@testing-library/jest-dom/vitest';

// Tell React we're in a test environment where act() should work
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
