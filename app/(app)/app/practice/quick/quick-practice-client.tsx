'use client';

import { PracticeView } from '@/app/(app)/app/practice/components';
import {
  fireAndForget,
  logUnhandledAsyncError,
} from '@/app/(app)/app/practice/fire-and-forget';
import { usePracticeQuestionFlow } from '@/app/(app)/app/practice/hooks/use-practice-question-flow';
import type { PracticeFilters } from '@/app/(app)/app/practice/practice-page-logic';
import { ROUTES } from '@/lib/routes';

const QUICK_PRACTICE_FILTERS: PracticeFilters = {
  tagSlugs: [],
  difficulties: [],
};

export default function QuickPracticeClient() {
  const questionFlow = usePracticeQuestionFlow({
    filters: QUICK_PRACTICE_FILTERS,
  });

  return (
    <PracticeView
      title="Quick Practice"
      description="Answer one question at a time."
      backLink={{ href: ROUTES.APP_PRACTICE, label: 'Back to Practice' }}
      questionAreaRef={questionFlow.questionAreaRef}
      loadState={questionFlow.loadState}
      question={questionFlow.question}
      selectedChoiceId={questionFlow.selectedChoiceId}
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
