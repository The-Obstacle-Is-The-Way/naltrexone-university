import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { AppLayoutShell } from '@/app/(app)/app/layout';

// The app layout module reaches server-only helpers; Browser Mode needs only
// the shell, so the external marker is stubbed. No application module is
// replaced.
vi.mock('server-only', () => ({}));

test('does not mount the ThemeToggle while light mode is disabled (DEBT-421)', async () => {
  const screen = await render(
    <AppLayoutShell
      authNav={<div>AuthNav</div>}
      mobileNav={<div>MobileNav</div>}
    >
      <div>Child content</div>
    </AppLayoutShell>,
  );

  await expect
    .element(screen.getByRole('link', { name: 'Addiction Boards' }))
    .toBeVisible();
  // The real ThemeToggle renders its control after mount, so a re-mounted
  // toggle surfaces here as a "Toggle theme" button. It stays unmounted until
  // light mode is design-complete (DEBT-421 Option A exit state).
  await expect
    .element(screen.getByRole('button', { name: 'Toggle theme' }))
    .not.toBeInTheDocument();
});
