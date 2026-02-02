import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import {
  type GetBookmarksOutput,
  getBookmarks,
  toggleBookmark,
} from '@/src/adapters/controllers/bookmark-controller';

async function removeBookmarkAction(formData: FormData) {
  'use server';

  const questionId = formData.get('questionId');
  if (typeof questionId !== 'string') {
    throw new Error('questionId is required');
  }

  const result = await toggleBookmark({ questionId });
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  if (result.data.bookmarked) {
    throw new Error('Expected bookmark to be removed');
  }

  revalidatePath('/app/bookmarks');
}

export function BookmarksView({ rows }: { rows: GetBookmarksOutput['rows'] }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Bookmarks</h1>
          <p className="mt-1 text-muted-foreground">
            Review questions you&apos;ve bookmarked.
          </p>
        </div>
        <Link
          href="/app/practice"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Go to Practice
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
          No bookmarks yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.questionId}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground">
                    {row.slug}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {row.stemMd}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="capitalize">{row.difficulty}</span>
                    <span className="mx-2">•</span>
                    <span>Bookmarked {row.bookmarkedAt.slice(0, 10)}</span>
                  </div>
                </div>

                <form action={removeBookmarkAction}>
                  <input
                    type="hidden"
                    name="questionId"
                    value={row.questionId}
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                  >
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function renderBookmarks(result: ActionResult<GetBookmarksOutput>) {
  if (!result.ok) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Bookmarks</h1>
          <p className="mt-1 text-muted-foreground">
            Unable to load bookmarks.
          </p>
        </div>
        <div
          className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm"
          role="alert"
        >
          {result.error.message}
        </div>
        <Link
          href="/app/practice"
          className="inline-flex items-center justify-center rounded-full bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          Go to Practice
        </Link>
      </div>
    );
  }

  return <BookmarksView rows={result.data.rows} />;
}

export default async function BookmarksPage() {
  const result = await getBookmarks({});
  return renderBookmarks(result);
}
