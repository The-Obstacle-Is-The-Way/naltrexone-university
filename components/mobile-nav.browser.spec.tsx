import type { ComponentPropsWithoutRef, PropsWithChildren } from 'react';
import { expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
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

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/dashboard',
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

test('traps focus inside the menu and supports escape-to-close', async () => {
  const screen = await render(<MobileNav />);

  await screen.getByRole('button', { name: 'Open navigation menu' }).click();

  const firstLink = screen.getByRole('link', { name: 'Dashboard' });
  const lastLink = screen.getByRole('link', { name: 'Billing' });

  await expect.element(firstLink).toHaveFocus();

  await userEvent.tab({ shift: true });
  await expect.element(lastLink).toHaveFocus();

  await userEvent.tab();
  await expect.element(firstLink).toHaveFocus();

  await userEvent.keyboard('{Escape}');
  await expect.element(screen.getByText('Dashboard')).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole('button', { name: 'Open navigation menu' }))
    .toHaveFocus();
});

test('applies reduced hover background intensity to inactive links', async () => {
  const screen = await render(<MobileNav />);

  await screen.getByRole('button', { name: 'Open navigation menu' }).click();

  const inactiveLink = screen.getByRole('link', { name: 'Billing' });
  const activeLink = screen.getByRole('link', { name: 'Dashboard' });

  await expect
    .element(inactiveLink)
    .toHaveAttribute(
      'class',
      expect.stringContaining('hover:bg-muted/50 hover:text-foreground'),
    );
  await expect
    .element(activeLink)
    .toHaveAttribute(
      'class',
      expect.stringContaining(
        'bg-muted px-3 py-3 text-sm font-medium text-foreground',
      ),
    );
});
