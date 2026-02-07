// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Lightweight hook-capture utility for React 19 + Vitest.
 *
 * Uses renderToStaticMarkup (a stable first-party React API) instead of
 * @testing-library/react, which has a known act() bug with React 19.
 * See docs/dev/react-vitest-testing.md for rationale.
 */
export function renderHook<T>(useHook: () => T): T {
  let captured: T | undefined;
  let didCapture = false;

  function Probe() {
    captured = useHook();
    didCapture = true;
    return null;
  }

  renderToStaticMarkup(<Probe />);
  if (!didCapture) {
    throw new Error('Hook result was not captured');
  }
  return captured as T;
}
