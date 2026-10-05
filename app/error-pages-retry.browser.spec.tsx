import type {
  ComponentPropsWithoutRef,
  ComponentType,
  PropsWithChildren,
} from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

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

// What Next.js passes every error component.
type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
  retry: () => void;
};

type ErrorPageModule = { default: ComponentType<ErrorPageProps> };

function isErrorPageModule(value: unknown): value is ErrorPageModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    'default' in value &&
    typeof value.default === 'function'
  );
}

const errorPages = Object.entries(
  import.meta.glob(['./**/error.tsx', './global-error.tsx'], { eager: true }),
).flatMap(([path, page]) =>
  isErrorPageModule(page) ? [[path, page] as const] : [],
);

// BUG-319: "Try again" must refetch from the server (retry). reset only
// replays the tree that failed, which cannot recover a stale or failed render.
describe('route error pages (browser)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('finds every route error page', () => {
    expect(errorPages.length).toBeGreaterThanOrEqual(12);
  });

  it.each(errorPages)(
    '%s retries from the server when Try again is clicked',
    async (_path, page) => {
      const ErrorPage = page.default;
      const reset = vi.fn();
      const retry = vi.fn();
      const screen = await render(
        <ErrorPage error={new Error('boom')} reset={reset} retry={retry} />,
      );

      await screen.getByRole('button', { name: 'Try again' }).click();

      expect(retry).toHaveBeenCalledTimes(1);
      expect(reset).not.toHaveBeenCalled();
    },
  );
});
