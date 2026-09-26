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

function renderBoundary(
  props: Partial<Parameters<typeof ErrorBoundaryPage>[0]> = {},
) {
  return render(
    <ErrorBoundaryPage
      error={new Error('boom')}
      reset={() => undefined}
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
    // The boundary logs every caught error; keep test output quiet.
    consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls reset once when Try again is clicked', async () => {
    const reset = vi.fn();
    const screen = await renderBoundary({ reset });

    await screen.getByRole('button', { name: 'Try again' }).click();

    expect(reset).toHaveBeenCalledTimes(1);
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
      .element(screen.getByRole('link', { name: 'Report issue' }))
      .toHaveAttribute('target', '_blank');
  });
});
