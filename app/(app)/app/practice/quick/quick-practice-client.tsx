'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { PracticeView } from '@/app/(app)/app/practice/components';
import {
  fireAndForget,
  logUnhandledAsyncError,
} from '@/app/(app)/app/practice/fire-and-forget';
import { usePracticeQuestionFlow } from '@/app/(app)/app/practice/hooks/use-practice-question-flow';
import type { PracticeFilters } from '@/app/(app)/app/practice/practice-page-logic';
import { statusDisplayLabel } from '@/app/(app)/app/practice/practice-page-types';
import { FilterChip } from '@/components/ui/filter-chip';
import { ROUTES } from '@/lib/routes';
import {
  AllQuestionProgressStatuses,
  type QuestionProgressStatus,
} from '@/src/domain/value-objects';

export function parseStatusParams(
  searchParams: URLSearchParams,
): QuestionProgressStatus[] {
  const raw = searchParams.get('status');
  if (!raw) return [];

  return raw
    .split(',')
    .filter((value): value is QuestionProgressStatus =>
      AllQuestionProgressStatuses.includes(value as QuestionProgressStatus),
    );
}

export function buildQuickPracticeStatusHref(input: {
  searchParams: URLSearchParams;
  currentStatuses: readonly QuestionProgressStatus[];
  toggledStatus: QuestionProgressStatus;
}): string {
  const selected = input.currentStatuses.includes(input.toggledStatus);
  const next = selected
    ? input.currentStatuses.filter((s) => s !== input.toggledStatus)
    : [...input.currentStatuses, input.toggledStatus];

  const nextParams = new URLSearchParams(input.searchParams.toString());
  if (next.length === 0) {
    nextParams.delete('status');
  } else {
    nextParams.set('status', next.join(','));
  }

  const qs = nextParams.toString();
  return qs.length > 0
    ? `${ROUTES.APP_PRACTICE_QUICK}?${qs}`
    : ROUTES.APP_PRACTICE_QUICK;
}

export default function QuickPracticeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statuses = useMemo(
    () => parseStatusParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const filters: PracticeFilters = useMemo(
    () => ({
      tagSlugs: [],
      difficulties: [],
      statuses,
    }),
    [statuses],
  );

  const questionFlow = usePracticeQuestionFlow({
    filters,
  });

  return (
    <PracticeView
      title="Quick Practice"
      description="Answer one question at a time."
      backLink={{ href: ROUTES.APP_PRACTICE, label: 'Back to Practice' }}
      topContent={
        <div>
          <div className="text-sm font-medium text-foreground">Status</div>
          <fieldset
            className="mt-2 flex flex-wrap gap-2 border-0 p-0 m-0"
            aria-label="Status"
          >
            {AllQuestionProgressStatuses.map((status) => {
              const selected = statuses.includes(status);
              return (
                <FilterChip
                  key={status}
                  label={statusDisplayLabel(status)}
                  selected={selected}
                  onClick={() => {
                    router.push(
                      buildQuickPracticeStatusHref({
                        searchParams: new URLSearchParams(
                          searchParams.toString(),
                        ),
                        currentStatuses: statuses,
                        toggledStatus: status,
                      }),
                    );
                  }}
                />
              );
            })}
          </fieldset>
        </div>
      }
      questionAreaRef={questionFlow.questionAreaRef}
      loadState={questionFlow.loadState}
      question={questionFlow.question}
      selectedChoiceId={questionFlow.selectedChoiceId}
      isAnswered={questionFlow.isAnswered}
      submitResult={questionFlow.submitResult}
      isPending={questionFlow.isPending}
      bookmarkStatus={questionFlow.bookmarkStatus}
      isBookmarked={questionFlow.isBookmarked}
      // Mark-for-review is session-only; ad-hoc practice doesn't support it yet.
      isMarkingForReview={false}
      bookmarkMessage={questionFlow.bookmarkMessage}
      bookmarkMessageVersion={questionFlow.bookmarkMessageVersion}
      canSubmit={questionFlow.canSubmit}
      onTryAgain={questionFlow.onTryAgain}
      onRetryBookmarks={questionFlow.onRetryBookmarks}
      onToggleBookmark={() => {
        fireAndForget(questionFlow.onToggleBookmark(), logUnhandledAsyncError);
      }}
      onSelectChoice={questionFlow.onSelectChoice}
      onSubmit={() => {
        fireAndForget(questionFlow.onSubmit(), logUnhandledAsyncError);
      }}
      onNextQuestion={questionFlow.onNextQuestion}
    />
  );
}
