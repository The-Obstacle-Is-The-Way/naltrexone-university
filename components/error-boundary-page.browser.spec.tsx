import type { ComponentPropsWithoutRef, PropsWithChildren } from 'react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';
import { render } from 'vitest-browser-react';
import { STALE_ACTION_RELOAD_KEY } from '@/lib/stale-server-action';
import { ErrorBoundaryPage } from './error-boundary-page';

type LinkProps = PropsWithChildren<
  { href: string } & Omit<ComponentPropsWithoutRef<'a'>, 'href'>
>;

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: LinkProps) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Shaped like Next.js's UnrecognizedActionError; lib/stale-server-action.test.ts
// pins the detector against the real class.
function staleActionError() {
  return Object.assign(
    new Error('Server Action "abc" was not found on the server.'),
    { name: 'UnrecognizedActionError' },
  );
}

function renderBoundary(
  props: Partial<Parameters<typeof ErrorBoundaryPage>[0]> = {},
) {
  return render(
    <ErrorBoundaryPage
      error={new Error('boom')}
      retry={() => undefined}
      title="Something went wrong"
      description="Please try again."
      links={[{ href: '/app/dashboard', label: 'Back to Dashboard' }]}
      {...props}
    />,
  );
}

describe('ErrorBoundaryPage (browser)', () => {
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    window.sessionStorage.removeItem(STALE_ACTION_RELOAD_KEY);
    // The boundary logs every caught error; keep test output quiet.
    consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // BUG-319: retry refetches the route from the server before re-rendering;
  // reset only replays the tree that failed.
  it('calls retry once when Try again is clicked', async () => {
    const retry = vi.fn();
    const screen = await renderBoundary({ retry });

    await screen.getByRole('button', { name: 'Try again' }).click();

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('reloads the page when a server action is stale after a deploy', async () => {
    const reloadPage = vi.fn();

    await renderBoundary({ error: staleActionError(), reloadPage });

    await expect.poll(() => reloadPage.mock.calls.length).toBe(1);
  });

  it('shows the error page instead of reloading again within the guard window', async () => {
    const firstReload = vi.fn();
    const first = await renderBoundary({
      error: staleActionError(),
      reloadPage: firstReload,
    });
    await expect.poll(() => firstReload.mock.calls.length).toBe(1);
    await first.unmount();

    const secondReload = vi.fn();
    const second = await renderBoundary({
      error: staleActionError(),
      reloadPage: secondReload,
    });

    await expect
      .element(second.getByRole('button', { name: 'Try again' }))
      .toBeVisible();
    expect(secondReload).not.toHaveBeenCalled();
  });

  it('does not reload for other errors', async () => {
    const reloadPage = vi.fn();
    const screen = await renderBoundary({
      error: new Error('boom'),
      reloadPage,
    });

    await expect
      .element(screen.getByRole('button', { name: 'Try again' }))
      .toBeVisible();
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('logs the caught error once with the boundary prefix', async () => {
    const error = new Error('boom');

    await renderBoundary({ error, logPrefix: 'PracticeError:' });

    await expect
      .poll(() => consoleError.mock.calls)
      .toEqual([['PracticeError:', error]]);
  });

  it('logs with the default prefix when the boundary names none', async () => {
    const error = new Error('boom');

    await renderBoundary({ error });

    await expect
      .poll(() => consoleError.mock.calls)
      .toEqual([['ErrorBoundaryPage:', error]]);
  });

  // Sentry's Next.js SDK does not see errors an error page catches; without
  // this, a browser-side failure (such as a stale action) is invisible.
  it('reports an error that arose in the browser', async () => {
    const error = new Error('boom');
    const reportError = vi.fn();

    await renderBoundary({ error, reportError, logPrefix: 'PricingError:' });

    await expect
      .poll(() => reportError.mock.calls)
      .toEqual([[error, { component: 'PricingError:' }]]);
  });

  it('does not report a server error again, which carries a digest', async () => {
    const reportError = vi.fn();
    const screen = await renderBoundary({
      error: Object.assign(new Error('boom'), { digest: 'digest-123' }),
      reportError,
    });

    await expect
      .element(screen.getByText('Error ID: digest-123'))
      .toBeVisible();
    expect(reportError).not.toHaveBeenCalled();
  });

  it('shows the error digest only when the error carries one', async () => {
    const withDigest = await renderBoundary({
      error: Object.assign(new Error('boom'), { digest: 'digest-123' }),
    });
    await expect
      .element(withDigest.getByText('Error ID: digest-123'))
      .toBeVisible();
    await withDigest.unmount();

    const withoutDigest = await renderBoundary();
    await expect
      .element(withoutDigest.getByText(/Error ID:/))
      .not.toBeInTheDocument();
  });

  it('keeps the escape-hatch navigation links alongside Try again', async () => {
    const screen = await renderBoundary();

    await expect
      .element(screen.getByRole('link', { name: 'Back to Dashboard' }))
      .toHaveAttribute('href', '/app/dashboard');
    await expect
      .element(screen.getByRole('link', { name: 'Contact support' }))
      .toHaveAttribute(
        'href',
        expect.stringMatching(/^mailto:support@addictionboards\.com\?/),
      );
  });
});
