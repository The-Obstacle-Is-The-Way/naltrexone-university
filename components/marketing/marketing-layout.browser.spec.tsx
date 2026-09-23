import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { MarketingLayout } from '@/components/marketing/marketing-layout';

// The marketing layout's auth slot reaches server-only helpers; Browser Mode
// needs only the layout, so the external marker is stubbed. No application
// module is replaced.
vi.mock('server-only', () => ({}));

test('does not mount the ThemeToggle while light mode is disabled (DEBT-421)', async () => {
  const element = await MarketingLayout({
    authNavSlot: <div>Auth</div>,
    featuresHref: '#features',
    children: <div>Child content</div>,
  });
  const screen = await render(element);

  await expect.element(screen.getByRole('main')).toBeVisible();
  // The real ThemeToggle renders its control after mount, so a re-mounted
  // toggle surfaces here as a "Toggle theme" button. It stays unmounted until
  // light mode is design-complete (DEBT-421 Option A exit state).
  await expect
    .element(screen.getByRole('button', { name: 'Toggle theme' }))
    .not.toBeInTheDocument();
});
