import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { NotificationProvider } from '@/components/ui/notification-provider';
import { PracticeSessionToast } from './practice-session-toast';

test('shows a success toast when a session is started', async () => {
  const screen = await render(
    <NotificationProvider>
      <PracticeSessionToast code="session_started" />
      <div>page</div>
    </NotificationProvider>,
  );

  await expect.element(screen.getByText('Session started.')).toBeVisible();
});

test('shows an info toast when fewer questions are available than requested', async () => {
  const screen = await render(
    <NotificationProvider>
      <PracticeSessionToast
        code="session_started"
        requestedCount="50"
        actualCount="30"
      />
      <div>page</div>
    </NotificationProvider>,
  );

  await expect
    .element(
      screen.getByText(
        'Only 30 of 50 questions matched your filters. Starting session with 30 questions.',
      ),
    )
    .toBeVisible();
});
