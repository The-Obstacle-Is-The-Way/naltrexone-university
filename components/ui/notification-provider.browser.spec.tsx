import { useEffect } from 'react';
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { NotificationProvider, useNotification } from './notification-provider';

function NotificationProbe() {
  const { notify } = useNotification();

  useEffect(() => {
    for (let i = 0; i < 55; i += 1) {
      notify({ message: `note-${i}`, durationMs: 0 });
    }
  }, [notify]);

  return null;
}

test('keeps only the latest 50 notifications', async () => {
  await render(
    <NotificationProvider>
      <NotificationProbe />
    </NotificationProvider>,
  );

  await expect
    .poll(() => {
      const toasts = Array.from(
        document.querySelectorAll('[data-testid="app-toast"]'),
      );
      return `${toasts.length}:${toasts[0]?.textContent ?? ''}:${toasts[toasts.length - 1]?.textContent ?? ''}`;
    })
    .toBe('50:note-5:note-54');
});
