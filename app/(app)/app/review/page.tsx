import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import {
  type GetMissedQuestionsOutput,
  getMissedQuestions,
} from '@/src/adapters/controllers/review-controller';
import {
  getStemPreview,
  toPlainText,
} from '@/src/adapters/shared/stem-preview';

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

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (!Number.isInteger(n)) return fallback;
  if (n < 0) return fallback;
  return n;
}

function parseLimit(value: string | undefined): number {
  const limit = parsePositiveInt(value, 20);
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
        <Link
          href="/app/practice"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Go to Practice
        </Link>
      </div>

      {rows.length === 0 ? (
        totalCount === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
            No missed questions yet.
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
            No more missed questions on this page.
            <div className="mt-4">
              <Link
                href={`/app/review?offset=0&limit=${limit}`}
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Back to first page
              </Link>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Showing {showingStart}–{showingEnd} of {totalCount}
          </div>
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
                          {getStemPreview(row.stemMd, 80)}
                        </div>
                        {toPlainText(row.stemMd).length > 80 && (
                          <div className="text-sm text-muted-foreground">
                            {toPlainText(row.stemMd)}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          <span className="capitalize">{row.difficulty}</span>
                          <span className="mx-2">•</span>
                          <span>Missed {row.lastAnsweredAt.slice(0, 10)}</span>
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
                          <span>Missed {row.lastAnsweredAt.slice(0, 10)}</span>
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
                    <Button asChild variant="outline" className="rounded-full">
                      <Link href={`/app/questions/${row.slug}`}>Reattempt</Link>
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between">
            {offset > 0 ? (
              <Link
                href={`/app/review?offset=${prevOffset}&limit=${limit}`}
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Previous
              </Link>
            ) : (
              <span />
            )}

            {hasNextPage ? (
              <Link
                href={`/app/review?offset=${nextOffset}&limit=${limit}`}
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Next
              </Link>
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
        <div
          className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm"
          role="alert"
        >
          {result.error.message}
        </div>
        <Button asChild className="rounded-full">
          <Link href="/app/practice">Go to Practice</Link>
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
    const offset = parsePositiveInt(params.offset, 0);

    const result = await getMissedQuestionsFn({ limit, offset });
    return renderReview(result);
  };
}

export default createReviewPage();
