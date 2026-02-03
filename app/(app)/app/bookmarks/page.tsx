import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import {
  type GetBookmarksOutput,
  getBookmarks,
  toggleBookmark,
} from '@/src/adapters/controllers/bookmark-controller';

type RemoveBookmarkErrorCode =
  | 'missing_question_id'
  | 'toggle_failed'
  | 'remove_failed';

function parseRemoveBookmarkErrorCode(
  code: string | undefined,
): RemoveBookmarkErrorCode | undefined {
  if (code === 'missing_question_id') return code;
  if (code === 'toggle_failed') return code;
  if (code === 'remove_failed') return code;
  return undefined;
}

function getRemoveBookmarkErrorMessage(
  code: RemoveBookmarkErrorCode | undefined,
): string | null {
  if (!code) return null;

  switch (code) {
    case 'missing_question_id':
      return 'Unable to remove bookmark: missing question id.';
    case 'toggle_failed':
      return 'Unable to remove bookmark. Please try again.';
    case 'remove_failed':
      return 'Unable to remove bookmark. Please refresh and try again.';
  }
}

export async function removeBookmarkAction(
  formData: FormData,
  deps?: {
    toggleBookmarkFn?: typeof toggleBookmark;
    revalidatePathFn?: typeof revalidatePath;
    redirectFn?: (url: string) => never;
  },
) {
  'use server';

  const toggleBookmarkFn = deps?.toggleBookmarkFn ?? toggleBookmark;
  const revalidatePathFn = deps?.revalidatePathFn ?? revalidatePath;
  const redirectFn = deps?.redirectFn ?? redirect;

  const questionId = formData.get('questionId');
  if (typeof questionId !== 'string') {
    return redirectFn('/app/bookmarks?error=missing_question_id');
  }

  const result = await toggleBookmarkFn({ questionId });
  if (!result.ok) {
    return redirectFn('/app/bookmarks?error=toggle_failed');
  }

  if (result.data.bookmarked) {
    return redirectFn('/app/bookmarks?error=remove_failed');
  }

  revalidatePathFn('/app/bookmarks');
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
                  {row.isAvailable ? (
                    <>
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
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-medium text-foreground">
                        [Question no longer available]
                      </div>
                      <div className="text-sm text-muted-foreground">
                        This question was removed or unpublished.
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <span>Unavailable</span>
                        <span className="mx-2">•</span>
                        <span>Bookmarked {row.bookmarkedAt.slice(0, 10)}</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex flex-col gap-2 sm:items-end">
                  {row.isAvailable ? (
                    <Link
                      href={`/app/questions/${row.slug}`}
                      className="inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Reattempt
                    </Link>
                  ) : null}

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

export function createBookmarksPage(deps?: {
  getBookmarksFn?: typeof getBookmarks;
}) {
  const getBookmarksFn = deps?.getBookmarksFn ?? getBookmarks;

  return async function BookmarksPage(props?: {
    searchParams?: Promise<Record<string, string | undefined>>;
  }) {
    const searchParams = await props?.searchParams;
    const errorMessage = getRemoveBookmarkErrorMessage(
      parseRemoveBookmarkErrorCode(searchParams?.error),
    );

    const result = await getBookmarksFn({});
    if (!result.ok) return renderBookmarks(result);

    if (!errorMessage) return <BookmarksView rows={result.data.rows} />;

    return (
      <div className="space-y-6">
        <div
          className="rounded-2xl border border-border bg-card p-4 text-sm text-destructive shadow-sm"
          role="alert"
        >
          {errorMessage}
        </div>
        <BookmarksView rows={result.data.rows} />
      </div>
    );
  };
}

export default createBookmarksPage();
