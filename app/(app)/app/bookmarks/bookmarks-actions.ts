'use server';

import { removeBookmark } from '@/app/(app)/app/bookmarks/remove-bookmark';

export async function removeBookmarkAction(formData: FormData) {
  // BUG-324: a client chooses this argument, and only a submitted form gives
  // FormData. Anything else is not from our page, so do nothing and log
  // nothing.
  if (!(formData instanceof FormData)) return;
  return removeBookmark(formData);
}
