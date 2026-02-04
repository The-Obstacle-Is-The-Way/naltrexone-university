import type { ComponentPropsWithoutRef, PropsWithChildren } from 'react';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { MobileNav } from './mobile-nav';

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

test('toggles open/close and renders navigation links', async () => {
  const screen = await render(<MobileNav />);

  await expect.element(screen.getByText('Dashboard')).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole('button', { name: 'Open navigation menu' }))
    .toHaveAttribute('aria-expanded', 'false');

  await screen.getByRole('button', { name: 'Open navigation menu' }).click();
  await expect.element(screen.getByText('Dashboard')).toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Close navigation menu' }))
    .toHaveAttribute('aria-expanded', 'true');

  await screen.getByRole('button', { name: 'Close navigation menu' }).click();
  await expect.element(screen.getByText('Dashboard')).not.toBeInTheDocument();
});
