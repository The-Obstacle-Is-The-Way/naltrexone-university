'use client';

import Link from 'next/link';
import { ErrorCard } from '@/components/error-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/format-date';
import { ROUTES, toQuestionRoute } from '@/lib/routes';
import type { ActionResult } from '@/src/adapters/controllers/action-result';
import type {
  AttemptedQuestionRow,
  GetAttemptedQuestionsOutput,
} from '@/src/adapters/controllers/review-controller';
import { getStemPreview } from '@/src/adapters/shared/stem-preview';
import {
  buildHistoryQuestionsHref,
  type QuestionsFilters,
} from '../history-search-params';

const headerLinkButtonClasses =
  'h-auto p-0 text-muted-foreground no-underline hover:text-foreground hover:no-underline';

const selectClassName =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]';

function getSessionOriginLabel(input: {
  sessionId: string | null;
  sessionMode: 'tutor' | 'exam' | null;
}): string {
  if (input.sessionId && input.sessionMode) {
    return `${input.sessionMode === 'exam' ? 'Exam' : 'Tutor'} session`;
  }
  return 'Ad-hoc practice';
}

function getResultBadge(isCorrect: boolean) {
  if (isCorrect) {
    return <span className="text-success">Correct</span>;
  }
  return <span className="text-destructive">Incorrect</span>;
}

type QuestionMetadataRow = Pick<
  AttemptedQuestionRow,
  'isCorrect' | 'lastAnsweredAt' | 'sessionId' | 'sessionMode'
>;

function QuestionMetadata({
  row,
  middleLabel,
  middleLabelClassName,
}: {
  row: QuestionMetadataRow;
  middleLabel: string;
  middleLabelClassName?: string;
}) {
  return (
    <div className="text-xs text-muted-foreground">
      {getResultBadge(row.isCorrect)}
      <span className="mx-2">•</span>
      <span className={middleLabelClassName}>{middleLabel}</span>
      <span className="mx-2">•</span>
      <span>{formatDate(row.lastAnsweredAt)}</span>
      <span className="mx-2">•</span>
      <span>
        {getSessionOriginLabel({
          sessionId: row.sessionId,
          sessionMode: row.sessionMode,
        })}
      </span>
    </div>
  );
}

export type HistoryQuestionsTabProps = {
  result: ActionResult<GetAttemptedQuestionsOutput>;
  filters?: QuestionsFilters;
  tagOptions?: { slug: string; name: string }[];
};

export function HistoryQuestionsTab({
  result,
  filters,
  tagOptions,
}: HistoryQuestionsTabProps) {
  if (!result.ok) {
    return <ErrorCard>{result.error.message}</ErrorCard>;
  }

  const { rows, limit, offset, totalCount } = result.data;

  const selectedDifficulty = filters?.difficulty ?? null;
  const selectedTagSlug = filters?.tagSlug ?? null;
  const selectedResult = filters?.result ?? null;
  const selectedSource = filters?.source ?? null;

  const hasActiveFilters = Boolean(
    selectedDifficulty || selectedTagSlug || selectedResult || selectedSource,
  );

  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;
  const hasNextPage = offset + rows.length < totalCount;
  const showingStart = rows.length > 0 ? offset + 1 : 0;
  const showingEnd = offset + rows.length;
  const historyHref = buildHistoryQuestionsHref({ limit, offset, filters });

  const resolvedTagOptions = (() => {
    const optionsBySlug = new Map(
      (tagOptions ?? []).map((tag) => [tag.slug, tag]),
    );

    if (selectedTagSlug && !optionsBySlug.has(selectedTagSlug)) {
      optionsBySlug.set(selectedTagSlug, {
        slug: selectedTagSlug,
        name: selectedTagSlug,
      });
    }

    return Array.from(optionsBySlug.values()).sort(
      (a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug),
    );
  })();

  const shouldShowFiltersCard = totalCount > 0 || hasActiveFilters;

  return (
    <div className="space-y-6">
      {shouldShowFiltersCard ? (
        <Card className="gap-0 rounded-2xl border-border p-4 shadow-sm">
          <form method="get" className="grid gap-3 sm:grid-cols-5">
            <input type="hidden" name="tab" value="questions" />
            <input type="hidden" name="limit" value={limit} />
            <input type="hidden" name="offset" value="0" />

            <label className="space-y-2 text-sm">
              <div className="font-medium text-foreground">Result</div>
              <select
                name="result"
                defaultValue={selectedResult ?? ''}
                className={selectClassName}
              >
                <option value="">All</option>
                <option value="correct">Correct</option>
                <option value="incorrect">Incorrect</option>
              </select>
            </label>

            <label className="space-y-2 text-sm">
              <div className="font-medium text-foreground">Source</div>
              <select
                name="source"
                defaultValue={selectedSource ?? ''}
                className={selectClassName}
              >
                <option value="">All</option>
                <option value="tutor">Tutor</option>
                <option value="exam">Exam</option>
                <option value="adhoc">Ad-hoc practice</option>
              </select>
            </label>

            <label className="space-y-2 text-sm">
              <div className="font-medium text-foreground">Difficulty</div>
              <select
                name="difficulty"
                defaultValue={selectedDifficulty ?? ''}
                className={selectClassName}
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
                className={selectClassName}
              >
                <option value="">All tags</option>
                {resolvedTagOptions.map((tag) => (
                  <option key={tag.slug} value={tag.slug}>
                    {tag.name}
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
                  <Link href={buildHistoryQuestionsHref({ limit, offset: 0 })}>
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
          hasActiveFilters ? (
            <Card className="gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm">
              No questions match these filters.
              <div className="mt-4">
                <Button asChild variant="outline" className="rounded-full">
                  <Link href={buildHistoryQuestionsHref({ limit, offset: 0 })}>
                    Clear filters
                  </Link>
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm">
              <div>
                No questions attempted yet. Start practicing to build your
                question history.
              </div>
              <div className="mt-4">
                <Button asChild variant="outline" className="rounded-full">
                  <Link href={ROUTES.APP_PRACTICE}>Go to Practice →</Link>
                </Button>
              </div>
            </Card>
          )
        ) : (
          <Card className="gap-0 rounded-2xl p-6 text-sm text-muted-foreground shadow-sm">
            No more questions on this page.
            <div className="mt-4">
              <Button
                asChild
                variant="link"
                className={headerLinkButtonClasses}
              >
                <Link
                  href={buildHistoryQuestionsHref({
                    limit,
                    offset: 0,
                    filters,
                  })}
                >
                  Back to first page
                </Link>
              </Button>
            </div>
          </Card>
        )
      ) : null}

      {rows.length > 0 ? (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Showing {showingStart}–{showingEnd} of {totalCount}
          </div>

          <ul className="space-y-4">
            {rows.map((row) => {
              if (!row.isAvailable) {
                return (
                  <li key={row.questionId}>
                    <Card className="gap-0 rounded-2xl border-border p-4 shadow-sm">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-foreground">
                            [Question no longer available]
                          </div>
                          <div className="text-sm text-muted-foreground">
                            This question was removed or unpublished.
                          </div>
                          <QuestionMetadata
                            row={row}
                            middleLabel="Unavailable"
                          />
                        </div>
                      </div>
                    </Card>
                  </li>
                );
              }

              const title = getStemPreview(row.stemMd, 80);
              const bodyPreview = getStemPreview(row.stemMd, 240);
              const shouldShowBodyText = bodyPreview && bodyPreview !== title;

              const href = toQuestionRoute(row.slug, {
                from: 'history',
                mode: 'review',
                historyHref,
              });

              return (
                <li key={row.questionId}>
                  <Card className="gap-0 rounded-2xl border-border p-4 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <Link
                          href={href}
                          className="text-sm font-medium text-foreground hover:underline"
                        >
                          {title}
                        </Link>

                        {shouldShowBodyText ? (
                          <div className="text-sm text-muted-foreground">
                            {bodyPreview}
                          </div>
                        ) : null}
                        <QuestionMetadata
                          row={row}
                          middleLabel={row.difficulty}
                          middleLabelClassName="capitalize"
                        />
                      </div>

                      <Button
                        asChild
                        variant="outline"
                        className="rounded-full"
                      >
                        <Link
                          href={href}
                          aria-label={`Review question: ${title}`}
                        >
                          Review
                        </Link>
                      </Button>
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
                  href={buildHistoryQuestionsHref({
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
                  href={buildHistoryQuestionsHref({
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
      ) : null}
    </div>
  );
}
