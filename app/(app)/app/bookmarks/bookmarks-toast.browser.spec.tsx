import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { NotificationProvider } from '@/components/ui/notification-provider';
import { BookmarksToast } from './bookmarks-toast';

test('shows a toast when a bookmark is removed', async () => {
  const screen = await render(
    <NotificationProvider>
      <BookmarksToast code="bookmark_removed" />
      <div>page</div>
    </NotificationProvider>,
  );

  await expect.element(screen.getByText('Bookmark removed.')).toBeVisible();
});
