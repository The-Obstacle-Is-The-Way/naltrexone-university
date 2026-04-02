import type { Metadata } from 'next';
import Link from 'next/link';
import { ErrorCard } from '@/components/error-card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/format-date';
import { ROUTES, toQuestionRoute } from '@/lib/routes';
import { headerActionLinkClasses } from '@/lib/shared-styles';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import {
  type GetBookmarksOutput,
  getBookmarks,
} from '@/src/adapters/controllers/bookmark-controller';
import {
  getStemPreview,
  toPlainText,
} from '@/src/adapters/shared/stem-preview';
import { BookmarkRowShell } from './bookmark-row-shell';
import { removeBookmarkAction } from './bookmarks-actions';
import {
  getRemoveBookmarkErrorMessage,
  parseRemoveBookmarkErrorCode,
} from './bookmarks-errors';
import { BookmarksToast } from './bookmarks-toast';

export const maxDuration = 30;

export const metadata: Metadata = {
  title: 'Bookmarks - Addiction Boards',
};

function RemoveBookmarkControl({
  ariaLabelStem,
  questionId,
  removeFormId,
}: {
  ariaLabelStem: string;
  questionId: string;
  removeFormId: string;
}) {
  return (
    <>
      <form id={removeFormId} action={removeBookmarkAction}>
        <input type="hidden" name="questionId" value={questionId} />
      </form>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            aria-label={`Remove bookmark: ${ariaLabelStem}`}
          >
            Remove
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove bookmark?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the question from your bookmarks list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              form={removeFormId}
              variant="destructive"
            >
              Remove bookmark
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function BookmarksView({ rows }: { rows: GetBookmarksOutput['rows'] }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
            Bookmarks
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Review questions you&apos;ve bookmarked.
          </p>
        </div>
        <Button asChild variant="link" className={headerActionLinkClasses}>
          <Link href={ROUTES.APP_PRACTICE}>Go to Practice</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card className="gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm">
          <div>No bookmarks yet.</div>
          <div className="mt-2">
            Bookmark questions as you practice to review them later.
          </div>
          <div className="mt-4">
            <Button asChild variant="outline" className="rounded-full">
              <Link href={ROUTES.APP_PRACTICE}>Start practicing</Link>
            </Button>
          </div>
        </Card>
      ) : (
        <ul className="space-y-4">
          {rows.map((row) => {
            const plainStem = row.isAvailable ? toPlainText(row.stemMd) : '';
            const ariaLabelStem = row.isAvailable
              ? getStemPreview(row.stemMd, 80)
              : 'unavailable question';
            const removeFormId = `remove-bookmark-${row.questionId}`;
            const reviewHref = row.isAvailable
              ? toQuestionRoute(row.slug, {
                  from: 'bookmarks',
                  mode: 'review',
                })
              : null;

            return (
              <li key={row.questionId}>
                {row.isAvailable && reviewHref ? (
                  <BookmarkRowShell
                    href={reviewHref}
                    className="cursor-pointer rounded-2xl bg-foreground/[0.08] p-4 transition-colors hover:bg-foreground/[0.12]"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-foreground">
                          <Link
                            href={reviewHref}
                            className="rounded-sm focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                          >
                            {getStemPreview(row.stemMd, 80)}
                          </Link>
                        </div>
                        {plainStem.length > 80 && (
                          <div className="text-sm text-muted-foreground">
                            {plainStem}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          <span className="capitalize">{row.difficulty}</span>
                          <span className="mx-2">•</span>
                          <span>Bookmarked {formatDate(row.bookmarkedAt)}</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 sm:items-end">
                        <RemoveBookmarkControl
                          ariaLabelStem={ariaLabelStem}
                          questionId={row.questionId}
                          removeFormId={removeFormId}
                        />
                      </div>
                    </div>
                  </BookmarkRowShell>
                ) : (
                  <div className="rounded-2xl bg-foreground/[0.08] p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-foreground">
                          [Question no longer available]
                        </div>
                        <div className="text-sm text-muted-foreground">
                          This question was removed or unpublished.
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <span>Unavailable</span>
                          <span className="mx-2">•</span>
                          <span>Bookmarked {formatDate(row.bookmarkedAt)}</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 sm:items-end">
                        <RemoveBookmarkControl
                          ariaLabelStem={ariaLabelStem}
                          questionId={row.questionId}
                          removeFormId={removeFormId}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
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
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
            Bookmarks
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Unable to load bookmarks.
          </p>
        </div>
        <ErrorCard>{result.error.message}</ErrorCard>
        <Button asChild className="rounded-full">
          <Link href={ROUTES.APP_PRACTICE}>Go to Practice</Link>
        </Button>
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
    searchParams?: Promise<{
      error?: string | string[];
      toast?: string | string[];
      [key: string]: string | string[] | undefined;
    }>;
  }) {
    const [searchParams, result] = await Promise.all([
      props?.searchParams,
      getBookmarksFn({}),
    ]);
    const errorMessage = getRemoveBookmarkErrorMessage(
      parseRemoveBookmarkErrorCode(searchParams?.error),
    );
    const toast = searchParams?.toast;
    if (!result.ok) return renderBookmarks(result);

    if (!errorMessage) {
      return (
        <>
          <BookmarksToast code={toast} />
          <BookmarksView rows={result.data.rows} />
        </>
      );
    }

    return (
      <div className="space-y-6">
        <BookmarksToast code={toast} />
        <ErrorCard>{errorMessage}</ErrorCard>
        <BookmarksView rows={result.data.rows} />
      </div>
    );
  };
}

export default createBookmarksPage();
