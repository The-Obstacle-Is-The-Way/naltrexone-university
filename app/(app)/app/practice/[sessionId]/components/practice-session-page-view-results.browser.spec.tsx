import { useCallback, useState } from 'react';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import {
  createReviewResponse,
  createReviewRow,
} from '../hooks/practice-session-page-controller.browser.fixtures';
import { PracticeSessionPageView } from './practice-session-page-view';
import { noop } from './practice-session-page-view-test-helpers';

function renderExamResultsContinuityHarness() {
  const summary = {
    sessionId: 'session-1',
    endedAt: '2026-02-07T00:20:00.000Z',
    mode: 'exam' as const,
    questionCount: 2,
    totals: {
      answered: 2,
      correct: 1,
      accuracy: 0.5,
      durationSeconds: 120,
    },
  };
  const summaryReview = createReviewResponse({
    mode: 'exam',
    totalCount: 2,
    answeredCount: 2,
    markedCount: 0,
    rows: [
      createReviewRow({
        questionId: 'q1',
        slug: 'q-1',
        stemMd: 'Stem 1',
        order: 1,
        isAnswered: true,
        isCorrect: false,
      }),
      createReviewRow({
        questionId: 'q2',
        slug: 'q-2',
        stemMd: 'Stem 2',
        order: 2,
        isAnswered: true,
        isCorrect: true,
      }),
    ],
  });
  const postExamReview = {
    sessionId: 'session-1',
    mode: 'exam' as const,
    totalCount: 2,
    answeredCount: 2,
    markedCount: 0,
    rows: [
      {
        isAvailable: true as const,
        questionId: 'q1',
        slug: 'q-1',
        stemMd: 'Stem 1',
        difficulty: 'easy' as const,
        order: 1,
        isAnswered: true,
        isCorrect: false,
        markedForReview: false,
        choices: [
          { id: 'q1-choice-1', label: 'A', textMd: 'Choice A' },
          { id: 'q1-choice-2', label: 'B', textMd: 'Choice B' },
        ],
        selectedChoiceId: 'q1-choice-1',
        correctChoiceId: 'q1-choice-2',
        explanationMd: 'Explanation 1',
        referenceMd: null,
        choiceExplanations: [],
      },
      {
        isAvailable: true as const,
        questionId: 'q2',
        slug: 'q-2',
        stemMd: 'Stem 2',
        difficulty: 'medium' as const,
        order: 2,
        isAnswered: true,
        isCorrect: true,
        markedForReview: false,
        choices: [{ id: 'q2-choice-1', label: 'A', textMd: 'Choice C' }],
        selectedChoiceId: 'q2-choice-1',
        correctChoiceId: 'q2-choice-1',
        explanationMd: 'Explanation 2',
        referenceMd: null,
        choiceExplanations: [],
      },
    ],
  };

  function Harness() {
    const [substage, setSubstage] = useState<
      'session_summary' | 'post_exam_review'
    >('session_summary');
    const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(
      'q1',
    );
    const handleViewSummary = useCallback(() => {
      setSubstage('session_summary');
    }, []);
    const handleReenterPostExamReview = useCallback((questionId?: string) => {
      if (questionId) setCurrentQuestionId(questionId);
      setSubstage('post_exam_review');
    }, []);
    const handleNavigatePostExamReviewQuestion = useCallback(
      (questionId: string) => {
        setCurrentQuestionId(questionId);
      },
      [],
    );

    return (
      <PracticeSessionPageView
        summary={summary}
        postExamSummary={summary}
        postExamReview={postExamReview}
        postExamReviewLoadState={{ status: 'ready' }}
        postExamReviewCurrentQuestionId={currentQuestionId}
        summaryReview={summaryReview}
        summaryReviewLoadState={{ status: 'ready' }}
        examResultsSubstage={substage}
        sessionInfo={null}
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        canSubmit={false}
        onEndSession={noop}
        onTryAgain={noop}
        onToggleBookmark={noop}
        onSelectChoice={noop}
        onSubmit={noop}
        onNextQuestion={noop}
        onViewSummary={handleViewSummary}
        onReenterPostExamReview={handleReenterPostExamReview}
        onNavigatePostExamReviewQuestion={handleNavigatePostExamReviewQuestion}
      />
    );
  }

  return render(<Harness />);
}

test('renders session summary branch when summary is present', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={{
        sessionId: 'session-1',
        endedAt: '2026-02-07T00:00:00.000Z',
        mode: 'tutor',
        questionCount: 10,
        totals: {
          answered: 10,
          correct: 8,
          accuracy: 0.8,
          durationSeconds: 1200,
        },
      }}
      sessionInfo={null}
      loadState={{ status: 'ready' }}
      question={null}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onSubmit={noop}
      onNextQuestion={noop}
    />,
  );

  await expect.element(screen.getByText('Session Summary')).toBeVisible();
  await expect.element(screen.getByText('80%')).toBeVisible();
});

test('renders callback-driven Review Answers button for exam-mode session summaries in the orchestrator', async () => {
  const screen = await renderExamResultsContinuityHarness();

  await expect.element(screen.getByText('Session Summary')).toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Review Answers' }))
    .toBeVisible();
  await expect
    .element(screen.getByRole('link', { name: 'Review Answers' }))
    .not.toBeInTheDocument();
});

test('keeps exam summaries on the in-session review contract when the substage prop is omitted', async () => {
  const onReenterPostExamReview = vi.fn();
  const screen = await render(
    <PracticeSessionPageView
      summary={{
        sessionId: 'session-1',
        endedAt: '2026-02-07T00:00:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 120,
        },
      }}
      postExamSummary={{
        sessionId: 'session-1',
        endedAt: '2026-02-07T00:00:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 120,
        },
      }}
      summaryReview={createReviewResponse({
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [
          createReviewRow({
            questionId: 'q1',
            slug: 'q-1',
            stemMd: 'Stem 1',
            order: 1,
            isAnswered: true,
            isCorrect: false,
          }),
        ],
      })}
      summaryReviewLoadState={{ status: 'ready' }}
      postExamReviewLoadState={{ status: 'idle' }}
      sessionInfo={null}
      loadState={{ status: 'ready' }}
      question={null}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onSubmit={noop}
      onNextQuestion={noop}
      onReenterPostExamReview={onReenterPostExamReview}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: 'Review Answers' }))
    .toBeVisible();
  await expect
    .element(screen.getByRole('link', { name: 'Review Answers' }))
    .not.toBeInTheDocument();

  await screen.getByRole('button', { name: 'Review Answers' }).click();
  expect(onReenterPostExamReview).toHaveBeenCalledTimes(1);
});

test('clicking Review Answers re-enters post-exam review without route ejection', async () => {
  const screen = await renderExamResultsContinuityHarness();

  await screen.getByRole('button', { name: 'Review Answers' }).click();

  await expect.element(screen.getByText('Score: 50% (1/2)')).toBeVisible();
  await expect.element(screen.getByText('Explanation 1')).toBeVisible();
  await expect
    .element(screen.getByRole('heading', { name: 'Session Summary' }))
    .not.toBeInTheDocument();
});

test('clicking a summary breakdown row opens the exact reviewed question in post-exam review', async () => {
  const screen = await renderExamResultsContinuityHarness();

  await screen.getByRole('button', { name: /Stem 2/i }).click();

  await expect.element(screen.getByText('Score: 50% (1/2)')).toBeVisible();
  await expect.element(screen.getByText('Explanation 2')).toBeVisible();
  await expect
    .element(screen.getByRole('region', { name: 'Question 2 of 2' }))
    .toBeVisible();
});
