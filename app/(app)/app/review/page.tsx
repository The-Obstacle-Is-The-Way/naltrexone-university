import type { Metadata } from 'next';
import Link from 'next/link';
import { ErrorCard } from '@/components/error-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/format-date';
import { ROUTES, toQuestionRoute } from '@/lib/routes';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import {
  type GetMissedQuestionsOutput,
  getMissedQuestions,
} from '@/src/adapters/controllers/review-controller';
import {
  getStemPreview,
  toPlainText,
} from '@/src/adapters/shared/stem-preview';

export const metadata: Metadata = {
  title: 'Review - Addiction Boards',
};

const headerLinkButtonClasses =
  'h-auto p-0 text-muted-foreground no-underline hover:text-foreground hover:no-underline';

type ReviewSearchParams = {
  limit?: string;
  offset?: string;
};

function getSessionOriginLabel(input: {
  sessionId: string | null;
  sessionMode: 'tutor' | 'exam' | null;
}): string {
  if (input.sessionId && input.sessionMode) {
    return `${input.sessionMode === 'exam' ? 'Exam' : 'Tutor'} session`;
  }
  return 'Ad-hoc practice';
}

function parseNonNegativeInt(
  value: string | undefined,
  fallback: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (!Number.isInteger(n)) return fallback;
  if (n < 0) return fallback;
  return n;
}

function parseLimit(value: string | undefined): number {
  const limit = parseNonNegativeInt(value, 20);
  return Math.min(Math.max(limit, 1), 100);
}

export function ReviewView({
  rows,
  limit,
  offset,
  totalCount,
}: GetMissedQuestionsOutput) {
  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;
  const hasNextPage = offset + rows.length < totalCount;
  const showingStart = rows.length > 0 ? offset + 1 : 0;
  const showingEnd = offset + rows.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
            Review
          </h1>
          <p className="mt-1 text-muted-foreground">
            Review questions you&apos;ve missed.
          </p>
        </div>
        <Button asChild variant="link" className={headerLinkButtonClasses}>
          <Link href={ROUTES.APP_PRACTICE}>Go to Practice</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        totalCount === 0 ? (
          <Card className="gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm">
            <div>No missed questions yet.</div>
            <div className="mt-4">
              <Button asChild variant="outline" className="rounded-full">
                <Link href={ROUTES.APP_PRACTICE}>Practice a question</Link>
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm">
            No more missed questions on this page.
            <div className="mt-4">
              <Button
                asChild
                variant="link"
                className={headerLinkButtonClasses}
              >
                <Link href={`${ROUTES.APP_REVIEW}?offset=0&limit=${limit}`}>
                  Back to first page
                </Link>
              </Button>
            </div>
          </Card>
        )
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Showing {showingStart}–{showingEnd} of {totalCount}
          </div>
          <ul className="space-y-3">
            {rows.map((row) => {
              const plainStem = row.isAvailable ? toPlainText(row.stemMd) : '';

              return (
                <li key={row.questionId}>
                  <Card className="gap-0 rounded-2xl p-6 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        {row.isAvailable ? (
                          <>
                            <div className="text-sm font-medium text-foreground">
                              {getStemPreview(row.stemMd, 80)}
                            </div>
                            {plainStem.length > 80 && (
                              <div className="text-sm text-muted-foreground">
                                {plainStem}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground">
                              <span className="capitalize">
                                {row.difficulty}
                              </span>
                              <span className="mx-2">•</span>
                              <span>
                                Missed {formatDate(row.lastAnsweredAt)}
                              </span>
                              <span className="mx-2">•</span>
                              <span>
                                {getSessionOriginLabel({
                                  sessionId: row.sessionId,
                                  sessionMode: row.sessionMode,
                                })}
                              </span>
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
                              <span>
                                Missed {formatDate(row.lastAnsweredAt)}
                              </span>
                              <span className="mx-2">•</span>
                              <span>
                                {getSessionOriginLabel({
                                  sessionId: row.sessionId,
                                  sessionMode: row.sessionMode,
                                })}
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      {row.isAvailable ? (
                        <Button
                          asChild
                          variant="outline"
                          className="rounded-full"
                        >
                          <Link
                            href={toQuestionRoute(row.slug)}
                            aria-label={`Reattempt question: ${getStemPreview(
                              row.stemMd,
                              80,
                            )}`}
                          >
                            Reattempt
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between">
            {offset > 0 ? (
              <Button
                asChild
                variant="link"
                className={headerLinkButtonClasses}
              >
                <Link
                  href={`${ROUTES.APP_REVIEW}?offset=${prevOffset}&limit=${limit}`}
                >
                  Previous
                </Link>
              </Button>
            ) : (
              <span />
            )}

            {hasNextPage ? (
              <Button
                asChild
                variant="link"
                className={headerLinkButtonClasses}
              >
                <Link
                  href={`${ROUTES.APP_REVIEW}?offset=${nextOffset}&limit=${limit}`}
                >
                  Next
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export function renderReview(result: ActionResult<GetMissedQuestionsOutput>) {
  if (!result.ok) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
            Review
          </h1>
          <p className="mt-1 text-muted-foreground">
            Unable to load missed questions.
          </p>
        </div>
        <ErrorCard className="p-6">{result.error.message}</ErrorCard>
        <Button asChild className="rounded-full">
          <Link href={ROUTES.APP_PRACTICE}>Go to Practice</Link>
        </Button>
      </div>
    );
  }

  return (
    <ReviewView
      rows={result.data.rows}
      limit={result.data.limit}
      offset={result.data.offset}
      totalCount={result.data.totalCount}
    />
  );
}

export function createReviewPage(deps?: {
  getMissedQuestionsFn?: typeof getMissedQuestions;
}) {
  const getMissedQuestionsFn = deps?.getMissedQuestionsFn ?? getMissedQuestions;

  return async function ReviewPage({
    searchParams,
  }: {
    searchParams: Promise<ReviewSearchParams>;
  }) {
    const params = await searchParams;
    const limit = parseLimit(params.limit);
    const offset = parseNonNegativeInt(params.offset, 0);

    const result = await getMissedQuestionsFn({ limit, offset });
    return renderReview(result);
  };
}

export default createReviewPage();
