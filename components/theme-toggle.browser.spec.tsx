import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ThemeToggle } from './theme-toggle';

const { setThemeMock, useThemeMock } = vi.hoisted(() => ({
  setThemeMock: vi.fn(),
  useThemeMock: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: useThemeMock,
}));

test('renders toggle button after mount and switches from dark to light', async () => {
  useThemeMock.mockReturnValue({
    resolvedTheme: 'dark',
    setTheme: setThemeMock,
  });

  const screen = await render(<ThemeToggle />);

  await expect
    .element(screen.getByRole('button', { name: 'Toggle theme' }))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Toggle theme' }).click();

  expect(setThemeMock).toHaveBeenCalledWith('light');
});
