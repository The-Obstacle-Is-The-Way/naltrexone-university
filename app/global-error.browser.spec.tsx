import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import GlobalError from './global-error';

// Sentry does not see errors an error page catches, global-error included.
describe('GlobalError (browser)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports an error that arose in the browser', async () => {
    const error = new Error('boom');
    const reportError = vi.fn();

    await render(
      <GlobalError
        error={error}
        retry={() => undefined}
        reportError={reportError}
      />,
    );

    await expect
      .poll(() => reportError.mock.calls)
      .toEqual([[error, { component: 'app/global-error.tsx:' }]]);
  });

  it('does not report a server error again, which carries a digest', async () => {
    const reportError = vi.fn();
    const screen = await render(
      <GlobalError
        error={Object.assign(new Error('boom'), { digest: 'digest-123' })}
        retry={() => undefined}
        reportError={reportError}
      />,
    );

    await expect
      .element(screen.getByText('Error ID: digest-123'))
      .toBeVisible();
    expect(reportError).not.toHaveBeenCalled();
  });
});
