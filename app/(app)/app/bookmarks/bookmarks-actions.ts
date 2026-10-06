'use server';

import { removeBookmark } from '@/app/(app)/app/bookmarks/remove-bookmark';

export async function removeBookmarkAction(formData: FormData) {
  return removeBookmark(formData);
}
