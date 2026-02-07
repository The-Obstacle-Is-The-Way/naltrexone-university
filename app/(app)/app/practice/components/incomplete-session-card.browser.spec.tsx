import type { ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { IncompleteSessionCard } from './incomplete-session-card';

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

test('renders resume link and calls abandon handler', async () => {
  const onAbandon = vi.fn();

  const screen = await render(
    <IncompleteSessionCard
      session={{
        sessionId: 'session-1',
        mode: 'exam',
        answeredCount: 4,
        totalCount: 10,
        startedAt: '2026-02-07T00:00:00.000Z',
      }}
      isPending={false}
      onAbandon={onAbandon}
    />,
  );

  await expect
    .element(screen.getByText('Exam mode • 4/10 answered'))
    .toBeVisible();
  await expect
    .element(screen.getByRole('link', { name: 'Resume session' }))
    .toHaveAttribute('href', '/app/practice/session-1');

  await screen.getByRole('button', { name: 'Abandon session' }).click();
  expect(onAbandon).toHaveBeenCalledTimes(1);
});

test('disables abandon button when pending', async () => {
  const screen = await render(
    <IncompleteSessionCard
      session={{
        sessionId: 'session-1',
        mode: 'tutor',
        answeredCount: 1,
        totalCount: 20,
        startedAt: '2026-02-07T00:00:00.000Z',
      }}
      isPending
      onAbandon={() => undefined}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: 'Abandon session' }))
    .toBeDisabled();
});
