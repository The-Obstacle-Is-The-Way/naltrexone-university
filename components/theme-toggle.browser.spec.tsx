import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ThemeToggle } from '@/components/theme-toggle';

const { setThemeMock, useThemeMock } = vi.hoisted(() => ({
  setThemeMock: vi.fn(),
  useThemeMock: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: useThemeMock,
}));

test('renders toggle button after mount', async () => {
  useThemeMock.mockReturnValue({
    resolvedTheme: 'light',
    setTheme: setThemeMock,
  });

  const screen = await render(<ThemeToggle />);

  await expect
    .element(screen.getByRole('button', { name: 'Toggle theme' }))
    .toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Toggle theme' }))
    .toHaveAttribute('data-slot', 'button');
});

test('click switches from dark to light', async () => {
  setThemeMock.mockReset();
  useThemeMock.mockReturnValue({
    resolvedTheme: 'dark',
    setTheme: setThemeMock,
  });

  const screen = await render(<ThemeToggle />);

  await expect
    .element(screen.getByRole('button', { name: 'Toggle theme' }))
    .toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Toggle theme' }))
    .toHaveAttribute('data-slot', 'button');
  await screen.getByRole('button', { name: 'Toggle theme' }).click();

  expect(setThemeMock).toHaveBeenCalledWith('light');
});
