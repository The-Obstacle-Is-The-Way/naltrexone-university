import { useCallback, useState } from 'react';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import {
  createReviewResponse,
  createReviewRow,
} from '../hooks/practice-session-page-controller.browser.fixtures';
import { PracticeSessionPageView } from './practice-session-page-view';

const noop = () => undefined;

const examQuestionNavigator = createReviewResponse({
  mode: 'exam',
  totalCount: 2,
  answeredCount: 0,
  markedCount: 0,
  rows: [
    createReviewRow({
      questionId: 'q1',
      slug: 'q-1',
      order: 1,
      isAnswered: false,
      isCorrect: null,
    }),
    createReviewRow({
      questionId: 'q2',
      slug: 'q-2',
      order: 2,
      isAnswered: false,
      isCorrect: null,
    }),
  ],
});

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
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
        onViewSummary={() => setSubstage('session_summary')}
        onReenterPostExamReview={(questionId) => {
          if (questionId) setCurrentQuestionId(questionId);
          setSubstage('post_exam_review');
        }}
        onNavigatePostExamReviewQuestion={(questionId) =>
          setCurrentQuestionId(questionId)
        }
      />
    );
  }

  return render(<Harness />);
}

function renderQuestionNavigationHarness() {
  function Harness() {
    const [questionIndex, setQuestionIndex] = useState(0);
    const handleNextQuestion = useCallback(() => {
      setQuestionIndex((current) => Math.min(current + 1, 1));
    }, []);
    const handleNavigateQuestion = useCallback((nextQuestionId: string) => {
      if (nextQuestionId === 'q1') {
        setQuestionIndex(0);
        return;
      }

      if (nextQuestionId === 'q2') {
        setQuestionIndex(1);
        return;
      }

      throw new Error(`Unexpected question id: ${nextQuestionId}`);
    }, []);

    const questionId = questionIndex === 0 ? 'q1' : 'q2';
    const stem = questionIndex === 0 ? 'Stem 1' : 'Stem 2';

    return (
      <PracticeSessionPageView
        summary={null}
        review={null}
        navigator={examQuestionNavigator}
        sessionInfo={{
          sessionId: 'session-1',
          mode: 'exam',
          index: questionIndex,
          total: 2,
          isMarkedForReview: false,
        }}
        loadState={{ status: 'ready' }}
        question={createNextQuestion({
          questionId,
          slug: questionId,
          stemMd: stem,
          difficulty: 'easy',
        })}
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
        onToggleMarkForReview={noop}
        onSelectChoice={noop}
        onSubmit={noop}
        onNextQuestion={handleNextQuestion}
        onNavigateQuestion={handleNavigateQuestion}
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
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
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
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
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

test('renders exam review branch and triggers review actions', async () => {
  const onOpenReviewQuestion = vi.fn();
  const onFinalizeReview = vi.fn(async () => undefined);

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={{
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'A sample exam review question stem',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: true,
            markedForReview: false,
          },
        ],
      }}
      reviewLoadState={{ status: 'ready' }}
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
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onOpenReviewQuestion={onOpenReviewQuestion}
      onFinalizeReview={onFinalizeReview}
    />,
  );

  await expect
    .element(screen.getByRole('heading', { name: 'Review & Submit' }))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Open question' }).click();
  expect(onOpenReviewQuestion).toHaveBeenCalledWith('q1');

  await screen.getByRole('button', { name: 'Submit exam' }).click();
  await expect
    .element(screen.getByRole('alertdialog', { name: 'Submit exam?' }))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Confirm submit' }).click();
  expect(onFinalizeReview).toHaveBeenCalledTimes(1);
});

test('renders post-exam review with score banner, feedback, and a summary exit', async () => {
  const onNavigatePostExamReviewQuestion = vi.fn();
  const onViewSummary = vi.fn();
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      postExamSummary={{
        sessionId: 'session-1',
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 120,
        },
      }}
      postExamReview={{
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [
          {
            isAvailable: true,
            questionId: 'q1',
            slug: 'q-1',
            stemMd: 'Stem 1',
            difficulty: 'easy',
            order: 1,
            isAnswered: true,
            isCorrect: false,
            markedForReview: false,
            choices: [
              { id: 'c1', label: 'A', textMd: 'Choice A' },
              { id: 'c2', label: 'B', textMd: 'Choice B' },
            ],
            selectedChoiceId: 'c1',
            correctChoiceId: 'c2',
            explanationMd: 'Because B is correct.',
            referenceMd: 'Reference 1',
            choiceExplanations: [
              {
                choiceId: 'c1',
                displayLabel: 'A',
                textMd: 'Choice A',
                isCorrect: false,
                explanationMd: 'A is not correct.',
              },
              {
                choiceId: 'c2',
                displayLabel: 'B',
                textMd: 'Choice B',
                isCorrect: true,
                explanationMd: null,
              },
            ],
          },
          {
            isAvailable: true,
            questionId: 'q2',
            slug: 'q-2',
            stemMd: 'Stem 2',
            difficulty: 'medium',
            order: 2,
            isAnswered: true,
            isCorrect: true,
            markedForReview: false,
            choices: [{ id: 'c3', label: 'A', textMd: 'Choice C' }],
            selectedChoiceId: 'c3',
            correctChoiceId: 'c3',
            explanationMd: 'Because C is correct.',
            referenceMd: null,
            choiceExplanations: [
              {
                choiceId: 'c3',
                displayLabel: 'A',
                textMd: 'Choice C',
                isCorrect: true,
                explanationMd: null,
              },
            ],
          },
        ],
      }}
      examResultsSubstage="post_exam_review"
      postExamReviewLoadState={{ status: 'ready' }}
      postExamReviewCurrentQuestionId="q1"
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
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onNavigatePostExamReviewQuestion={onNavigatePostExamReviewQuestion}
      onViewSummary={onViewSummary}
    />,
  );

  await expect.element(screen.getByText('Score: 50% (1/2)')).toBeVisible();
  await expect.element(screen.getByText('Because B is correct.')).toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Question 2: Correct' }))
    .toBeVisible();
  await expect
    .element(screen.getByRole('button', { name: 'Try Again' }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole('button', { name: 'Practice Again' }))
    .not.toBeInTheDocument();

  await screen.getByRole('button', { name: 'Next' }).click();
  expect(onNavigatePostExamReviewQuestion).toHaveBeenCalledWith('q2');

  await screen.getByRole('button', { name: 'View Summary' }).click();
  expect(onViewSummary).toHaveBeenCalledTimes(1);
});

test('renders a loading state while post-exam review is hydrating inside the session route', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      postExamSummary={{
        sessionId: 'session-1',
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 120,
        },
      }}
      examResultsSubstage="post_exam_review"
      postExamReviewLoadState={{ status: 'loading' }}
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
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
    />,
  );

  await expect.element(screen.getByText('Loading review...')).toBeVisible();
  await expect
    .element(screen.getByRole('heading', { name: 'Session Summary' }))
    .not.toBeInTheDocument();
});

test('renders retry and summary actions when post-exam review hydration fails', async () => {
  const onRetryPostExamReview = vi.fn();
  const onViewSummary = vi.fn();
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      postExamSummary={{
        sessionId: 'session-1',
        endedAt: '2026-02-07T00:20:00.000Z',
        mode: 'exam',
        questionCount: 2,
        totals: {
          answered: 2,
          correct: 1,
          accuracy: 0.5,
          durationSeconds: 120,
        },
      }}
      examResultsSubstage="post_exam_review"
      postExamReviewLoadState={{
        status: 'error',
        message: 'Review hydration failed',
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
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onRetryPostExamReview={onRetryPostExamReview}
      onViewSummary={onViewSummary}
    />,
  );

  await expect
    .element(screen.getByText('Review hydration failed'))
    .toBeVisible();

  await screen.getByRole('button', { name: 'Retry review' }).click();
  expect(onRetryPostExamReview).toHaveBeenCalledTimes(1);

  await screen.getByRole('button', { name: 'View Summary' }).click();
  expect(onViewSummary).toHaveBeenCalledTimes(1);
});

test('falls back to onEndSession when onFinalizeReview is omitted in the review stage', async () => {
  const onEndSession = vi.fn();

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={{
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 1,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'A sample exam review question stem',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: true,
            markedForReview: false,
          },
        ],
      }}
      reviewLoadState={{ status: 'ready' }}
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
      onEndSession={onEndSession}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
    />,
  );

  await expect
    .element(screen.getByRole('heading', { name: 'Review & Submit' }))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Submit exam' }).click();
  await expect
    .element(screen.getByRole('alertdialog', { name: 'Submit exam?' }))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Confirm submit' }).click();
  expect(onEndSession).toHaveBeenCalledTimes(1);
});

test('renders active question branch with navigator and navigation callback', async () => {
  const onNavigateQuestion = vi.fn();
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 2,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: true,
            markedForReview: false,
          },
          {
            questionId: 'q2',
            slug: 'q-2',
            order: 2,
            isAvailable: true,
            stemMd: 'Stem 2',
            difficulty: 'medium',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
        ],
      }}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'exam',
        index: 0,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q1',
        slug: 'q-1',
        stemMd: 'Stem 1',
        difficulty: 'easy',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onToggleMarkForReview={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onNavigateQuestion={onNavigateQuestion}
    />,
  );

  await expect.element(screen.getByText('Exam Session')).toBeVisible();
  await expect
    .element(
      screen.getByText(
        'Question 1 of 2 — Explanations shown after you submit the exam.',
      ),
    )
    .toBeVisible();
  await expect.element(screen.getByText('Question navigator')).toBeVisible();
  await screen.getByRole('button', { name: 'Question 2: Unanswered' }).click();
  expect(onNavigateQuestion).toHaveBeenCalledWith('q2');
});

test('scrolls the question panel into view and restores focus after next and previous navigation', async () => {
  const scrollIntoViewSpy = vi
    .spyOn(Element.prototype, 'scrollIntoView')
    .mockImplementation(() => undefined);

  try {
    const screen = await renderQuestionNavigationHarness();

    const getQuestionPanel = () =>
      document.querySelector<HTMLElement>('section[aria-labelledby]');

    await expect.element(screen.getByText('Stem 1')).toBeVisible();
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();

    await screen.getByRole('button', { name: 'Next' }).click();

    await expect.element(screen.getByText('Stem 2')).toBeVisible();
    await vi.waitFor(() => {
      expect(getQuestionPanel()).toBe(document.activeElement);
    });
    expect(scrollIntoViewSpy).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'start' }),
    );

    scrollIntoViewSpy.mockClear();

    await screen.getByRole('button', { name: 'Previous' }).click();

    await expect.element(screen.getByText('Stem 1')).toBeVisible();
    await vi.waitFor(() => {
      expect(getQuestionPanel()).toBe(document.activeElement);
    });
    expect(scrollIntoViewSpy).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'start' }),
    );
  } finally {
    scrollIntoViewSpy.mockRestore();
  }
});

test('restores the question panel when next-question navigation enters loading before the question id changes', async () => {
  const scrollIntoViewSpy = vi
    .spyOn(Element.prototype, 'scrollIntoView')
    .mockImplementation(() => undefined);

  try {
    function Harness() {
      const [loadState, setLoadState] = useState<{
        status: 'ready' | 'loading';
      }>({ status: 'ready' });
      const [question, setQuestion] = useState<ReturnType<
        typeof createNextQuestion
      > | null>(
        createNextQuestion({
          questionId: 'q1',
          slug: 'q1',
          stemMd: 'Stem 1',
          difficulty: 'easy',
        }),
      );

      const handleNavigateQuestion = useCallback(() => {
        setQuestion(null);
        setLoadState({ status: 'loading' });
      }, []);

      return (
        <PracticeSessionPageView
          summary={null}
          review={null}
          navigator={examQuestionNavigator}
          sessionInfo={{
            sessionId: 'session-1',
            mode: 'exam',
            index: 0,
            total: 2,
            isMarkedForReview: false,
          }}
          loadState={loadState}
          question={question}
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
          onToggleMarkForReview={noop}
          onSelectChoice={noop}
          onSubmit={noop}
          onNextQuestion={noop}
          onNavigateQuestion={handleNavigateQuestion}
        />
      );
    }

    const screen = await render(<Harness />);
    const getQuestionPanel = () =>
      document.querySelector<HTMLElement>('section[aria-labelledby]');

    await expect.element(screen.getByText('Stem 1')).toBeVisible();
    await screen.getByRole('button', { name: 'Next' }).click();

    await expect.element(screen.getByText('Loading question…')).toBeVisible();
    await vi.waitFor(() => {
      expect(getQuestionPanel()).toBe(document.activeElement);
    });
    expect(scrollIntoViewSpy).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'start' }),
    );
  } finally {
    scrollIntoViewSpy.mockRestore();
  }
});

test('restores the question panel when navigation fails before the question id changes', async () => {
  const scrollIntoViewSpy = vi
    .spyOn(Element.prototype, 'scrollIntoView')
    .mockImplementation(() => undefined);

  try {
    function Harness() {
      const [loadState, setLoadState] = useState<
        { status: 'ready' } | { status: 'error'; message: string }
      >({ status: 'ready' });
      const question = createNextQuestion({
        questionId: 'q1',
        slug: 'q1',
        stemMd: 'Stem 1',
        difficulty: 'easy',
      });

      const handleNavigateQuestion = useCallback(() => {
        setLoadState({
          status: 'error',
          message: 'Failed to load the next question.',
        });
      }, []);

      return (
        <PracticeSessionPageView
          summary={null}
          review={null}
          navigator={examQuestionNavigator}
          sessionInfo={{
            sessionId: 'session-1',
            mode: 'exam',
            index: 0,
            total: 2,
            isMarkedForReview: false,
          }}
          loadState={loadState}
          question={question}
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
          onToggleMarkForReview={noop}
          onSelectChoice={noop}
          onSubmit={noop}
          onNextQuestion={noop}
          onNavigateQuestion={handleNavigateQuestion}
        />
      );
    }

    const screen = await render(<Harness />);
    const getQuestionPanel = () =>
      document.querySelector<HTMLElement>('section[aria-labelledby]');

    await expect.element(screen.getByText('Stem 1')).toBeVisible();
    await screen.getByRole('button', { name: 'Next' }).click();

    await expect
      .element(screen.getByText('Failed to load the next question.'))
      .toBeVisible();
    await vi.waitFor(() => {
      expect(getQuestionPanel()).toBe(document.activeElement);
    });
    expect(scrollIntoViewSpy).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'start' }),
    );
  } finally {
    scrollIntoViewSpy.mockRestore();
  }
});

test('renders Finish exam in the active exam-question header', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={null}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'exam',
        index: 0,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q1',
        slug: 'q-1',
        stemMd: 'Stem 1',
        difficulty: 'easy',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onToggleMarkForReview={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: 'Finish exam' }))
    .toBeVisible();
});

test('wires navigator aria-controls to an existing question panel id', async () => {
  await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
        sessionId: 'session-1',
        mode: 'exam',
        totalCount: 2,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: true,
            isCorrect: true,
            markedForReview: false,
          },
          {
            questionId: 'q2',
            slug: 'q-2',
            order: 2,
            isAvailable: true,
            stemMd: 'Stem 2',
            difficulty: 'medium',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
        ],
      }}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'exam',
        index: 0,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q1',
        slug: 'q-1',
        stemMd: 'Stem 1',
        difficulty: 'easy',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onToggleMarkForReview={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onNavigateQuestion={() => undefined}
    />,
  );

  const navigatorButton = document.querySelector<HTMLButtonElement>(
    '[aria-label="Question 2: Unanswered"]',
  );

  expect(navigatorButton).not.toBeNull();
  const controlledPanelId =
    navigatorButton?.getAttribute('aria-controls') ?? null;

  if (!controlledPanelId) {
    throw new Error('Expected navigator button to expose aria-controls');
  }

  expect(document.getElementById(controlledPanelId)).not.toBeNull();
});

test('renders Previous button in the session answering branch', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
          {
            questionId: 'q2',
            slug: 'q-2',
            order: 2,
            isAvailable: true,
            stemMd: 'Stem 2',
            difficulty: 'medium',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
        ],
      }}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'tutor',
        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q2',
        slug: 'q-2',
        stemMd: 'Stem 2',
        difficulty: 'medium',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onNavigateQuestion={() => undefined}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: 'Previous' }))
    .toBeVisible();
});

test('hasPreviousQuestion is false when current question is first in navigator', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
          {
            questionId: 'q2',
            slug: 'q-2',
            order: 2,
            isAvailable: true,
            stemMd: 'Stem 2',
            difficulty: 'medium',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
        ],
      }}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'tutor',
        index: 0,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q1',
        slug: 'q-1',
        stemMd: 'Stem 1',
        difficulty: 'easy',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onNavigateQuestion={() => undefined}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: 'Previous' }))
    .not.toBeInTheDocument();
});

test('hasPreviousQuestion is false on the first question when navigator is missing', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={null}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'tutor',
        index: 0,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q-missing',
        slug: 'q-missing',
        stemMd: 'Stem missing',
        difficulty: 'easy',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onNavigateQuestion={() => undefined}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: 'Previous' }))
    .not.toBeInTheDocument();
});

test('renders Previous when navigator is missing but sessionInfo indicates a prior question exists, but keeps it disabled until the target resolves', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={null}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'tutor',
        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q2',
        slug: 'q-2',
        stemMd: 'Stem 2',
        difficulty: 'medium',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onNavigateQuestion={() => undefined}
    />,
  );

  const previousButton = screen.getByRole('button', { name: 'Previous' });
  await expect.element(previousButton).toBeVisible();
  await expect.element(previousButton).toBeDisabled();
});

test('routes the last exam-question footer Review & Submit button through onEndSession instead of onNextQuestion', async () => {
  const onEndSession = vi.fn();
  const onNextQuestion = vi.fn();

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={createReviewResponse({
        mode: 'exam',
        totalCount: 2,
        answeredCount: 2,
        markedCount: 0,
        rows: [
          createReviewRow({
            questionId: 'q1',
            order: 1,
            isAnswered: true,
            isCorrect: true,
          }),
          createReviewRow({
            questionId: 'q2',
            order: 2,
            isAnswered: true,
            isCorrect: true,
          }),
        ],
      })}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'exam',
        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={createNextQuestion({
        questionId: 'q2',
        slug: 'q-2',
        stemMd: 'Last exam question',
        difficulty: 'medium',
      })}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={onEndSession}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onToggleMarkForReview={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={onNextQuestion}
      onNavigateQuestion={() => undefined}
    />,
  );

  await screen.getByRole('button', { name: 'Review & Submit' }).click();
  expect(onEndSession).toHaveBeenCalledTimes(1);
  expect(onNextQuestion).not.toHaveBeenCalled();
});

test('hasPreviousQuestion is true when current question is not first', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
          {
            questionId: 'q2',
            slug: 'q-2',
            order: 2,
            isAvailable: true,
            stemMd: 'Stem 2',
            difficulty: 'medium',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
        ],
      }}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'tutor',
        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q2',
        slug: 'q-2',
        stemMd: 'Stem 2',
        difficulty: 'medium',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onNavigateQuestion={() => undefined}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: 'Previous' }))
    .not.toBeDisabled();
});

test('hasNextQuestion is false when current question is last available', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
          {
            questionId: 'q2',
            slug: 'q-2',
            order: 2,
            isAvailable: true,
            stemMd: 'Stem 2',
            difficulty: 'medium',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
        ],
      }}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'tutor',
        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q2',
        slug: 'q-2',
        stemMd: 'Stem 2',
        difficulty: 'medium',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onNavigateQuestion={() => undefined}
    />,
  );

  await expect
    .element(screen.getByRole('button', { name: 'Next' }))
    .not.toBeInTheDocument();
});

test('clicking Next in a completed session navigates to the next available question id', async () => {
  const onNavigateQuestion = vi.fn();
  const onNextQuestion = vi.fn();

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={createReviewResponse({
        mode: 'tutor',
        totalCount: 4,
        answeredCount: 4,
        markedCount: 0,
        rows: [
          createReviewRow({
            questionId: 'q1',
            order: 1,
            isAnswered: true,
            isCorrect: true,
          }),
          createReviewRow({
            questionId: 'q2',
            order: 2,
            isAnswered: true,
            isCorrect: true,
          }),
          createReviewRow({
            questionId: 'q3',
            order: 3,
            isAnswered: true,
            isCorrect: true,
          }),
          createReviewRow({
            questionId: 'q4',
            order: 4,
            isAnswered: true,
            isCorrect: true,
          }),
        ],
      })}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'tutor',
        index: 1,
        total: 4,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={createNextQuestion({
        questionId: 'q2',
        stemMd: 'Stem 2',
        session: {
          sessionId: 'session-1',
          mode: 'tutor',
          index: 1,
          total: 4,
          isMarkedForReview: false,
          latestSelectedChoiceId: 'choice_1',
          latestIsCorrect: true,
        },
      })}
      selectedChoiceId="choice_1"
      isAnswered={true}
      submitResult={{
        attemptId: 'attempt-2',
        isCorrect: true,
        correctChoiceId: 'choice_1',
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
      }}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={onNextQuestion}
      onNavigateQuestion={onNavigateQuestion}
    />,
  );

  await screen.getByRole('button', { name: 'Next' }).click();

  expect(onNavigateQuestion).toHaveBeenCalledWith('q3');
  expect(onNextQuestion).not.toHaveBeenCalled();
});

test('clicking Next falls back to onNextQuestion when id-based navigation is unavailable', async () => {
  const onNextQuestion = vi.fn();

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={createReviewResponse({
        mode: 'tutor',
        totalCount: 3,
        answeredCount: 1,
        markedCount: 0,
        rows: [
          createReviewRow({
            questionId: 'q1',
            order: 1,
            isAnswered: true,
            isCorrect: true,
          }),
          createReviewRow({
            questionId: 'q2',
            order: 2,
            isAnswered: false,
            isCorrect: null,
          }),
          createReviewRow({
            questionId: 'q3',
            order: 3,
            isAnswered: false,
            isCorrect: null,
          }),
        ],
      })}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'tutor',
        index: 0,
        total: 3,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={createNextQuestion({
        questionId: 'q1',
        stemMd: 'Stem 1',
        session: {
          sessionId: 'session-1',
          mode: 'tutor',
          index: 0,
          total: 3,
          isMarkedForReview: false,
          latestSelectedChoiceId: 'choice_1',
          latestIsCorrect: true,
        },
      })}
      selectedChoiceId="choice_1"
      isAnswered={true}
      submitResult={{
        attemptId: 'attempt-1',
        isCorrect: true,
        correctChoiceId: 'choice_1',
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
      }}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={onNextQuestion}
    />,
  );

  await screen.getByRole('button', { name: 'Next' }).click();

  expect(onNextQuestion).toHaveBeenCalledTimes(1);
});

test("clicking Previous calls onNavigateQuestion with the previous question's ID", async () => {
  const onNavigateQuestion = vi.fn();

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={{
        sessionId: 'session-1',
        mode: 'tutor',
        totalCount: 2,
        answeredCount: 0,
        markedCount: 0,
        rows: [
          {
            questionId: 'q1',
            slug: 'q-1',
            order: 1,
            isAvailable: true,
            stemMd: 'Stem 1',
            difficulty: 'easy',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
          {
            questionId: 'q2',
            slug: 'q-2',
            order: 2,
            isAvailable: true,
            stemMd: 'Stem 2',
            difficulty: 'medium',
            isAnswered: false,
            isCorrect: null,
            markedForReview: false,
          },
        ],
      }}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'tutor',
        index: 1,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={{
        questionId: 'q2',
        slug: 'q-2',
        stemMd: 'Stem 2',
        difficulty: 'medium',
        choices: [{ id: 'c1', label: 'A', textMd: 'Choice A', sortOrder: 1 }],
        session: null,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
      onNavigateQuestion={onNavigateQuestion}
    />,
  );

  await screen.getByRole('button', { name: 'Previous' }).click();
  expect(onNavigateQuestion).toHaveBeenCalledWith('q1');
});

test('renders review error actions with retry and end session escape hatch', async () => {
  const onRetryReview = vi.fn();
  const onEndSession = vi.fn();

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      reviewLoadState={{ status: 'error', message: 'Review unavailable.' }}
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
      onEndSession={onEndSession}
      onRetryReview={onRetryReview}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
    />,
  );

  await expect.element(screen.getByText('Review unavailable.')).toBeVisible();
  await screen.getByRole('button', { name: 'Try again' }).click();
  expect(onRetryReview).toHaveBeenCalledTimes(1);

  await screen.getByRole('button', { name: 'End session' }).click();
  expect(onEndSession).toHaveBeenCalledTimes(1);
});

test('renders navigator error with retry action', async () => {
  const onRetryNavigator = vi.fn();

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={null}
      navigatorLoadState={{
        status: 'error',
        message: 'Navigator unavailable.',
      }}
      sessionInfo={{
        sessionId: 'session-1',
        mode: 'exam',
        index: 0,
        total: 2,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={null}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      canSubmit={false}
      onEndSession={() => undefined}
      onRetryNavigator={onRetryNavigator}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
    />,
  );

  await expect
    .element(screen.getByText('Navigator unavailable.'))
    .toBeVisible();
  await screen.getByRole('button', { name: 'Retry navigator' }).click();
  expect(onRetryNavigator).toHaveBeenCalledTimes(1);
});

test('calls onFinalizeReview instead of onEndSession when both are provided', async () => {
  const onFinalizeReview = vi.fn(async () => undefined);
  const onEndSession = vi.fn();

  const screen = await render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      reviewLoadState={{ status: 'error', message: 'Review unavailable.' }}
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
      onEndSession={onEndSession}
      onFinalizeReview={onFinalizeReview}
      onTryAgain={() => undefined}
      onToggleBookmark={() => undefined}
      onSelectChoice={() => undefined}
      onSubmit={() => undefined}
      onNextQuestion={() => undefined}
    />,
  );

  await screen.getByRole('button', { name: 'End session' }).click();
  expect(onFinalizeReview).toHaveBeenCalledTimes(1);
  expect(onEndSession).not.toHaveBeenCalled();
});
