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
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ROUTES } from '@/lib/routes';
import {
  AllQuestionProgressStatuses,
  isValidQuestionProgressStatus,
  type QuestionProgressStatus,
} from '@/src/domain/value-objects';

type SearchParamsLike = Pick<URLSearchParams, 'get' | 'toString'>;

const EMPTY_TAG_SLUGS: PracticeFilters['tagSlugs'] = [];

export function parseStatusParam(
  searchParams: SearchParamsLike,
): QuestionProgressStatus {
  const raw = searchParams.get('status');
  if (raw && isValidQuestionProgressStatus(raw)) return raw;
  return 'unanswered';
}

export function buildQuickPracticeStatusHref(input: {
  searchParams: SearchParamsLike;
  status: QuestionProgressStatus;
}): string {
  const nextParams = new URLSearchParams(input.searchParams.toString());
  if (input.status === 'unanswered') {
    nextParams.delete('status');
  } else {
    nextParams.set('status', input.status);
  }

  const qs = nextParams.toString();
  return qs.length > 0
    ? `${ROUTES.APP_PRACTICE_QUICK}?${qs}`
    : ROUTES.APP_PRACTICE_QUICK;
}

export default function QuickPracticeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = useMemo(() => parseStatusParam(searchParams), [searchParams]);

  const filters: PracticeFilters = useMemo(
    () => ({
      tagSlugs: EMPTY_TAG_SLUGS,
      difficulty: null,
      status,
    }),
    [status],
  );

  const questionFlow = usePracticeQuestionFlow({
    filters,
  });

  return (
    <PracticeView
      title="Quick Practice"
      description="Answer one question at a time."
      backLink={{ href: ROUTES.APP_PRACTICE, label: 'Back to Practice' }}
      belowHeadingContent={
        <div className="mt-4">
          <SegmentedControl
            options={AllQuestionProgressStatuses.map((s) => ({
              value: s,
              label: statusDisplayLabel(s),
            }))}
            value={status}
            onChange={(value) => {
              const href = buildQuickPracticeStatusHref({
                searchParams,
                status: value as QuestionProgressStatus,
              });
              router.push(href, { scroll: false });
            }}
            legend="Status"
          />
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
