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
  difficulty?: string;
  tag?: string;
};

type DifficultyFilter = 'easy' | 'medium' | 'hard';

export type ReviewFilters = {
  difficulty?: DifficultyFilter | null;
  tagSlug?: string | null;
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

function parseDifficultyFilter(
  value: string | undefined,
): DifficultyFilter | null {
  if (value === 'easy') return value;
  if (value === 'medium') return value;
  if (value === 'hard') return value;
  return null;
}

function parseTagSlugFilter(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildReviewHref(input: {
  limit: number;
  offset: number;
  filters?: ReviewFilters;
}): string {
  const params = new URLSearchParams();
  params.set('offset', String(input.offset));
  params.set('limit', String(input.limit));

  const difficulty = input.filters?.difficulty ?? null;
  const tagSlug = input.filters?.tagSlug ?? null;

  if (difficulty) params.set('difficulty', difficulty);
  if (tagSlug) params.set('tag', tagSlug);

  return `${ROUTES.APP_REVIEW}?${params.toString()}`;
}

export function ReviewView({
  rows,
  limit,
  offset,
  totalCount,
  filters,
}: GetMissedQuestionsOutput & { filters?: ReviewFilters }) {
  const selectedDifficulty = filters?.difficulty ?? null;
  const selectedTagSlug = filters?.tagSlug ?? null;
  const hasActiveFilters = Boolean(selectedDifficulty || selectedTagSlug);

  const displayRows = hasActiveFilters
    ? rows.filter((row) => {
        if (!row.isAvailable) return false;
        if (selectedDifficulty && row.difficulty !== selectedDifficulty)
          return false;
        if (selectedTagSlug && !row.tagSlugs.includes(selectedTagSlug))
          return false;
        return true;
      })
    : rows;

  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;
  const hasNextPage = offset + rows.length < totalCount;
  const showingStart = rows.length > 0 ? offset + 1 : 0;
  const showingEnd = offset + rows.length;

  const tagOptions = Array.from(
    new Set(rows.flatMap((row) => (row.isAvailable ? row.tagSlugs : []))),
  ).sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight text-foreground">
            Review
          </h1>
          <p className="mt-1 text-muted-foreground">
            Questions you answered incorrectly — review and reattempt to
            strengthen weak areas.
          </p>
        </div>
        <Button asChild variant="link" className={headerLinkButtonClasses}>
          <Link href={ROUTES.APP_PRACTICE}>Go to Practice</Link>
        </Button>
      </div>

      {totalCount > 0 ? (
        <Card className="gap-0 rounded-2xl border-border p-4 shadow-sm">
          <form method="get" className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="limit" value={limit} />
            <input type="hidden" name="offset" value="0" />

            <label className="space-y-2 text-sm">
              <div className="font-medium text-foreground">Difficulty</div>
              <select
                name="difficulty"
                defaultValue={selectedDifficulty ?? ''}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              >
                <option value="">All difficulties</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>

            <label className="space-y-2 text-sm">
              <div className="font-medium text-foreground">Tag</div>
              <select
                name="tag"
                defaultValue={selectedTagSlug ?? ''}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              >
                <option value="">All tags</option>
                {tagOptions.map((tagSlug) => (
                  <option key={tagSlug} value={tagSlug}>
                    {tagSlug}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end justify-between gap-3 sm:justify-end">
              {hasActiveFilters ? (
                <Button
                  asChild
                  variant="link"
                  className={headerLinkButtonClasses}
                >
                  <Link href={buildReviewHref({ limit, offset: 0 })}>
                    Clear filters
                  </Link>
                </Button>
              ) : (
                <span />
              )}

              <Button type="submit" variant="outline" className="rounded-full">
                Apply
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        totalCount === 0 ? (
          <Card className="gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm">
            <div>No missed questions yet.</div>
            <div className="mt-2">
              Great work! As you practice, any questions you get wrong will
              appear here for review.
            </div>
            <div className="mt-4">
              <Button asChild variant="outline" className="rounded-full">
                <Link href={ROUTES.APP_PRACTICE}>Go to Practice →</Link>
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
                <Link href={buildReviewHref({ limit, offset: 0, filters })}>
                  Back to first page
                </Link>
              </Button>
            </div>
          </Card>
        )
      ) : hasActiveFilters && displayRows.length === 0 ? (
        <Card className="gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm">
          No missed questions match these filters.
          <div className="mt-4">
            <Button asChild variant="outline" className="rounded-full">
              <Link href={buildReviewHref({ limit, offset: 0 })}>
                Clear filters
              </Link>
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {hasActiveFilters
              ? `Showing ${displayRows.length} of ${rows.length} on this page`
              : `Showing ${showingStart}–${showingEnd} of ${totalCount}`}
          </div>
          <ul className="space-y-3">
            {displayRows.map((row) => {
              const plainStem = row.isAvailable ? toPlainText(row.stemMd) : '';

              return (
                <li key={row.questionId}>
                  <Card className="gap-0 rounded-2xl p-6 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        {row.isAvailable ? (
                          <>
                            <div className="text-sm font-medium text-foreground">
                              <Link
                                href={toQuestionRoute(row.slug, {
                                  from: 'review',
                                })}
                                className="hover:underline"
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
                            href={toQuestionRoute(row.slug, {
                              from: 'review',
                            })}
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
                  href={buildReviewHref({
                    limit,
                    offset: prevOffset,
                    filters,
                  })}
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
                  href={buildReviewHref({
                    limit,
                    offset: nextOffset,
                    filters,
                  })}
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

export function renderReview(
  result: ActionResult<GetMissedQuestionsOutput>,
  options?: { filters?: ReviewFilters },
) {
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
      filters={options?.filters}
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
    const filters: ReviewFilters = {
      difficulty: parseDifficultyFilter(params.difficulty),
      tagSlug: parseTagSlugFilter(params.tag),
    };

    // Filters are applied client-side in ReviewView; server-side filtering tracked in GH #80.
    const result = await getMissedQuestionsFn({ limit, offset });
    return renderReview(result, { filters });
  };
}

export default createReviewPage();
