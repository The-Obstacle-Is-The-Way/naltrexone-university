'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/routes';
import { setBookmark } from '@/src/adapters/controllers/bookmark-controller';

export async function removeBookmarkAction(
  formData: FormData,
  deps?: {
    setBookmarkFn?: typeof setBookmark;
    revalidatePathFn?: typeof revalidatePath;
    redirectFn?: (url: string) => never;
  },
) {
  const setBookmarkFn = deps?.setBookmarkFn ?? setBookmark;
  const revalidatePathFn = deps?.revalidatePathFn ?? revalidatePath;
  const redirectFn = deps?.redirectFn ?? redirect;

  const questionId = formData.get('questionId');
  if (typeof questionId !== 'string' || questionId === '') {
    return redirectFn(`${ROUTES.APP_BOOKMARKS}?error=missing_question_id`);
  }

  const rawKey = formData.get('idempotencyKey');
  const idempotencyKey = typeof rawKey === 'string' ? rawKey : undefined;

  const result = await setBookmarkFn({
    questionId,
    bookmarked: false,
    idempotencyKey,
  });
  if (!result.ok) {
    return redirectFn(`${ROUTES.APP_BOOKMARKS}?error=remove_failed`);
  }

  revalidatePathFn(ROUTES.APP_BOOKMARKS);
  return redirectFn(`${ROUTES.APP_BOOKMARKS}?toast=bookmark_removed`);
}
