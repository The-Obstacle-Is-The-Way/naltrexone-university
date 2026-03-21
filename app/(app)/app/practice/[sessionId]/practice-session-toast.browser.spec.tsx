import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { NotificationProvider } from '@/components/ui/notification-provider';
import { PracticeSessionToast } from './practice-session-toast';

test('does not show a toast when a session is started without count data', async () => {
  await render(
    <NotificationProvider>
      <PracticeSessionToast code="session_started" />
      <div>page</div>
    </NotificationProvider>,
  );

  await expect
    .poll(() => document.querySelectorAll('[data-testid="app-toast"]').length)
    .toBe(0);
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

test('does not show a toast when requestedCount equals actualCount', async () => {
  await render(
    <NotificationProvider>
      <PracticeSessionToast
        code="session_started"
        requestedCount="10"
        actualCount="10"
      />
      <div>page</div>
    </NotificationProvider>,
  );

  await expect
    .poll(() => document.querySelectorAll('[data-testid="app-toast"]').length)
    .toBe(0);
});

test('does not show a toast when requestedCount is not numeric', async () => {
  await render(
    <NotificationProvider>
      <PracticeSessionToast
        code="session_started"
        requestedCount="not-a-number"
        actualCount="10"
      />
      <div>page</div>
    </NotificationProvider>,
  );

  await expect
    .poll(() => document.querySelectorAll('[data-testid="app-toast"]').length)
    .toBe(0);
});

test('does not show a toast when counts are non-positive', async () => {
  await render(
    <NotificationProvider>
      <PracticeSessionToast
        code="session_started"
        requestedCount="0"
        actualCount="0"
      />
      <div>page</div>
    </NotificationProvider>,
  );

  await expect
    .poll(() => document.querySelectorAll('[data-testid="app-toast"]').length)
    .toBe(0);
});
