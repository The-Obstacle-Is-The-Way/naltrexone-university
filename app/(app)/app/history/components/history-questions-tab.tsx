'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ErrorCard } from '@/components/error-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDate } from '@/lib/format-date';
import { ROUTES, toQuestionRoute } from '@/lib/routes';
import { headerActionLinkClasses } from '@/lib/shared-styles';
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

// WHY: This file exceeds the 300-line soft guideline intentionally.
// DEBT-234 enforces a warning threshold at 350 lines; DEBT-224 keeps 300 as the design guideline.
// It is a deep module (Ousterhout) with a single responsibility: render the History Questions tab with its filter controls, pagination state, and question-row presentation.
// Splitting would fragment shared filter/pagination/href context across components and increase risk of mismatched query-state and navigation behavior.
// Reviewed in DEBT-224 audit (2026-02-18).
const ALL_FILTER_VALUE = '__all__';
const TAG_KIND_ORDER = ['topic', 'substance', 'treatment'] as const;

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'incorrect-first', label: 'Incorrect first' },
  { value: 'correct-first', label: 'Correct first' },
  { value: 'difficulty', label: 'Difficulty' },
] as const;

function getSessionOriginLabel(input: {
  sessionId: string | null;
  sessionMode: 'tutor' | 'exam' | null;
}): string {
  if (input.sessionId && input.sessionMode) {
    return `${input.sessionMode === 'exam' ? 'Exam' : 'Tutor'} session`;
  }
  return 'Ad-hoc practice';
}

function getTagKindLabel(kind: 'topic' | 'substance' | 'treatment'): string {
  if (kind === 'topic') return 'Topic';
  if (kind === 'substance') return 'Substance';
  return 'Treatment';
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
  tagOptions?: {
    slug: string;
    name: string;
    kind: 'topic' | 'substance' | 'treatment';
  }[];
};

export function HistoryQuestionsTab({
  result,
  filters,
  tagOptions,
}: HistoryQuestionsTabProps) {
  const router = useRouter();

  if (!result.ok) {
    return <ErrorCard className="p-4">{result.error.message}</ErrorCard>;
  }

  const { rows, limit, offset, totalCount } = result.data;

  const selectedDifficulty = filters?.difficulty ?? null;
  const selectedTagSlug = filters?.tagSlug ?? null;
  const selectedResult = filters?.result ?? null;
  const selectedSort = filters?.sort ?? 'recent';

  const hasActiveControls = Boolean(
    selectedDifficulty ||
      selectedTagSlug ||
      selectedResult ||
      selectedSort !== 'recent',
  );

  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;
  const hasNextPage = offset + rows.length < totalCount;
  const showingStart = rows.length > 0 ? offset + 1 : 0;
  const showingEnd = offset + rows.length;
  const historyHref = buildHistoryQuestionsHref({ limit, offset, filters });

  function applyFilter(nextFilters: QuestionsFilters): void {
    router.push(
      buildHistoryQuestionsHref({
        limit,
        offset: 0,
        filters: nextFilters,
      }),
    );
  }

  function patchFilters(next: Partial<QuestionsFilters>): QuestionsFilters {
    return {
      difficulty:
        'difficulty' in next ? (next.difficulty ?? null) : selectedDifficulty,
      tagSlug: 'tagSlug' in next ? (next.tagSlug ?? null) : selectedTagSlug,
      result: 'result' in next ? (next.result ?? null) : selectedResult,
      sort: 'sort' in next ? (next.sort ?? 'recent') : selectedSort,
    };
  }

  const resolvedTagOptions = (() => {
    const optionsBySlug = new Map(
      (tagOptions ?? []).map((tag) => [tag.slug, tag]),
    );

    if (selectedTagSlug && !optionsBySlug.has(selectedTagSlug)) {
      optionsBySlug.set(selectedTagSlug, {
        slug: selectedTagSlug,
        name: selectedTagSlug,
        kind: 'topic',
      });
    }

    return Array.from(optionsBySlug.values()).sort(
      (a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug),
    );
  })();

  const tagNameCounts = new Map<string, number>();
  for (const tag of resolvedTagOptions) {
    tagNameCounts.set(tag.name, (tagNameCounts.get(tag.name) ?? 0) + 1);
  }

  const shouldShowFiltersCard = totalCount > 0 || hasActiveControls;
  return (
    <div className="space-y-6">
      {shouldShowFiltersCard ? (
        <Card className="gap-0 rounded-2xl border-border p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 text-sm">
              <label
                htmlFor="history-questions-result"
                className="font-medium text-foreground"
              >
                Result
              </label>
              <Select
                value={selectedResult ?? ALL_FILTER_VALUE}
                onValueChange={(value) =>
                  applyFilter(
                    patchFilters({
                      result:
                        value === ALL_FILTER_VALUE
                          ? null
                          : (value as NonNullable<QuestionsFilters['result']>),
                    }),
                  )
                }
              >
                <SelectTrigger
                  id="history-questions-result"
                  className="w-full"
                  aria-label="Result"
                >
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>All</SelectItem>
                  <SelectItem value="correct">Correct</SelectItem>
                  <SelectItem value="incorrect">Incorrect</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 text-sm">
              <label
                htmlFor="history-questions-difficulty"
                className="font-medium text-foreground"
              >
                Difficulty
              </label>
              <Select
                value={selectedDifficulty ?? ALL_FILTER_VALUE}
                onValueChange={(value) =>
                  applyFilter(
                    patchFilters({
                      difficulty:
                        value === ALL_FILTER_VALUE
                          ? null
                          : (value as NonNullable<
                              QuestionsFilters['difficulty']
                            >),
                    }),
                  )
                }
              >
                <SelectTrigger
                  id="history-questions-difficulty"
                  className="w-full"
                  aria-label="Difficulty"
                >
                  <SelectValue placeholder="All difficulties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>
                    All difficulties
                  </SelectItem>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 text-sm">
              <label
                htmlFor="history-questions-tag"
                className="font-medium text-foreground"
              >
                Tag
              </label>
              <Select
                value={selectedTagSlug ?? ALL_FILTER_VALUE}
                onValueChange={(value) =>
                  applyFilter(
                    patchFilters({
                      tagSlug: value === ALL_FILTER_VALUE ? null : value,
                    }),
                  )
                }
              >
                <SelectTrigger
                  id="history-questions-tag"
                  className="w-full"
                  aria-label="Tag"
                >
                  <SelectValue placeholder="All tags" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>All tags</SelectItem>
                  {TAG_KIND_ORDER.map((kind) => {
                    const tagsForKind = resolvedTagOptions.filter(
                      (tag) => tag.kind === kind,
                    );
                    if (tagsForKind.length === 0) return null;

                    return (
                      <SelectGroup key={kind}>
                        <SelectLabel>{getTagKindLabel(kind)}</SelectLabel>
                        {tagsForKind.map((tag) => (
                          <SelectItem key={tag.slug} value={tag.slug}>
                            {(tagNameCounts.get(tag.name) ?? 0) > 1
                              ? `${tag.name} (${getTagKindLabel(tag.kind)})`
                              : tag.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 text-sm">
              <label
                htmlFor="history-questions-sort"
                className="font-medium text-foreground"
              >
                Sort
              </label>
              <Select
                value={selectedSort}
                onValueChange={(value) =>
                  applyFilter(
                    patchFilters({
                      sort: value as NonNullable<QuestionsFilters['sort']>,
                    }),
                  )
                }
              >
                <SelectTrigger
                  id="history-questions-sort"
                  className="w-full"
                  aria-label="Sort"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {hasActiveControls ? (
            <div className="mt-3 flex justify-end">
              <Button
                asChild
                variant="link"
                className={headerActionLinkClasses}
              >
                <Link href={buildHistoryQuestionsHref({ limit, offset: 0 })}>
                  Clear filters
                </Link>
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {rows.length === 0 ? (
        totalCount === 0 ? (
          hasActiveControls ? (
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
                No Quick Practice questions yet. Questions from Tutor and Exam
                sessions can be reviewed from the Sessions tab.
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
                className={headerActionLinkClasses}
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
                  <Link
                    href={href}
                    className="block rounded-2xl border border-border p-4 shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <span className="text-sm font-medium text-foreground">
                          {title}
                        </span>

                        {shouldShowBodyText ? (
                          <div
                            className="text-sm text-muted-foreground"
                            data-testid="history-question-preview"
                          >
                            {bodyPreview}
                          </div>
                        ) : null}
                        <QuestionMetadata
                          row={row}
                          middleLabel={row.difficulty}
                          middleLabelClassName="capitalize"
                        />
                      </div>

                      <span className="inline-flex items-center rounded-full border px-4 py-2 text-sm">
                        Review
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between">
            {offset > 0 ? (
              <Button
                asChild
                variant="link"
                className={headerActionLinkClasses}
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
                className={headerActionLinkClasses}
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
