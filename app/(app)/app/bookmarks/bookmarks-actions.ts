'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/routes';
import { toggleBookmark } from '@/src/adapters/controllers/bookmark-controller';

export async function removeBookmarkAction(
  formData: FormData,
  deps?: {
    toggleBookmarkFn?: typeof toggleBookmark;
    revalidatePathFn?: typeof revalidatePath;
    redirectFn?: (url: string) => never;
  },
) {
  const toggleBookmarkFn = deps?.toggleBookmarkFn ?? toggleBookmark;
  const revalidatePathFn = deps?.revalidatePathFn ?? revalidatePath;
  const redirectFn = deps?.redirectFn ?? redirect;

  const questionId = formData.get('questionId');
  if (typeof questionId !== 'string' || questionId === '') {
    return redirectFn(`${ROUTES.APP_BOOKMARKS}?error=missing_question_id`);
  }

  const rawKey = formData.get('idempotencyKey');
  const idempotencyKey = typeof rawKey === 'string' ? rawKey : undefined;

  const result = await toggleBookmarkFn({ questionId, idempotencyKey });
  if (!result.ok) {
    return redirectFn(`${ROUTES.APP_BOOKMARKS}?error=toggle_failed`);
  }

  if (result.data.bookmarked) {
    return redirectFn(`${ROUTES.APP_BOOKMARKS}?error=remove_failed`);
  }

  revalidatePathFn(ROUTES.APP_BOOKMARKS);
  return redirectFn(`${ROUTES.APP_BOOKMARKS}?toast=bookmark_removed`);
}
