import { useCallback, useState } from 'react';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import {
  createReviewResponse,
  createReviewRow,
} from '../hooks/practice-session-page-model.browser.fixtures';
import { PracticeSessionPageView } from './practice-session-page-view';
import { noop } from './practice-session-page-view-test-helpers';

const fixtureSession1Id = crypto.randomUUID();
const fixtureQ1Id = crypto.randomUUID();
const fixtureQ2Id = crypto.randomUUID();

function renderExamResultsContinuityHarness() {
  const summary = {
    sessionId: fixtureSession1Id,
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
        questionId: fixtureQ1Id,
        slug: 'q-1',
        stemMd: 'Stem 1',
        order: 1,
        isAnswered: true,
        isCorrect: false,
        isOmitted: false,
      }),
      createReviewRow({
        questionId: fixtureQ2Id,
        slug: 'q-2',
        stemMd: 'Stem 2',
        order: 2,
        isAnswered: true,
        isCorrect: true,
        isOmitted: false,
      }),
    ],
  });
  const postExamReview = {
    sessionId: fixtureSession1Id,
    mode: 'exam' as const,
    totalCount: 2,
    answeredCount: 2,
    markedCount: 0,
    rows: [
      {
        isAvailable: true as const,
        questionId: fixtureQ1Id,
        slug: 'q-1',
        stemMd: 'Stem 1',
        difficulty: 'easy' as const,
        order: 1,
        isAnswered: true,
        isCorrect: false,
        isOmitted: false,
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
        questionId: fixtureQ2Id,
        slug: 'q-2',
        stemMd: 'Stem 2',
        difficulty: 'medium' as const,
        order: 2,
        isAnswered: true,
        isCorrect: true,
        isOmitted: false,
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
      fixtureQ1Id,
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
        onEndSession={noop}
        onTryAgain={noop}
        onToggleBookmark={noop}
        onSelectChoice={noop}
        onNextQuestion={noop}
        onViewSummary={handleViewSummary}
        onReenterPostExamReview={handleReenterPostExamReview}
        onNavigatePostExamReviewQuestion={handleNavigatePostExamReviewQuestion}
      />
    );
  }

  return render(<Harness />);
}

async function expectPostExamReviewScoreBanner(
  screen: Awaited<ReturnType<typeof renderExamResultsContinuityHarness>>,
) {
  await expect
    .element(screen.getByRole('heading', { level: 1, name: 'Exam complete' }))
    .toBeVisible();
  const scoreBanner = screen
    .getByText('Exam complete')
    .element()
    .closest('[data-slot="card"]');
  const scoreStat = Array.from(scoreBanner?.querySelectorAll('div') ?? []).find(
    (element) => element.textContent?.trim() === '50%',
  );
  const scoreDescription = Array.from(
    scoreBanner?.querySelectorAll('p') ?? [],
  ).find((element) => element.textContent?.includes('1 of 2 correct'));

  if (!(scoreStat instanceof HTMLElement)) {
    throw new Error('Expected score-banner stat number');
  }

  expect(scoreStat.matches('h1,h2,h3,h4,h5,h6')).toBe(false);
  expect(scoreDescription?.tagName).toBe('P');
  expect(scoreDescription?.textContent).toContain(
    '1 of 2 correct · Review each question with detailed feedback.',
  );
}

test('renders session summary branch when summary is present', async () => {
  const screen = await render(
    <PracticeSessionPageView
      summary={{
        sessionId: fixtureSession1Id,
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
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
      onNextQuestion={noop}
    />,
  );

  await expect
    .element(screen.getByRole('heading', { level: 1, name: 'Session Summary' }))
    .toHaveFocus();
  await expect.element(screen.getByText('80%')).toBeVisible();
});

test('renders callback-driven Review Answers button for exam-mode session summaries in the orchestrator', async () => {
  const screen = await renderExamResultsContinuityHarness();

  await expect
    .element(screen.getByRole('heading', { level: 1, name: 'Session Summary' }))
    .toHaveFocus();
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
        sessionId: fixtureSession1Id,
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
        sessionId: fixtureSession1Id,
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
            questionId: fixtureQ1Id,
            slug: 'q-1',
            stemMd: 'Stem 1',
            order: 1,
            isAnswered: true,
            isCorrect: false,
            isOmitted: false,
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
      onEndSession={noop}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onSelectChoice={noop}
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

  await expectPostExamReviewScoreBanner(screen);
  await expect.element(screen.getByText('Explanation 1')).toBeVisible();
  await expect
    .element(screen.getByRole('heading', { name: 'Session Summary' }))
    .not.toBeInTheDocument();
});

test('clicking View Summary from post-exam review focuses the summary heading', async () => {
  const screen = await renderExamResultsContinuityHarness();

  await screen.getByRole('button', { name: 'Review Answers' }).click();
  await expectPostExamReviewScoreBanner(screen);

  await screen.getByRole('button', { name: 'View Summary' }).click();

  await expect
    .element(screen.getByRole('heading', { level: 1, name: 'Session Summary' }))
    .toHaveFocus();
});

test('clicking a summary breakdown row opens the exact reviewed question in post-exam review', async () => {
  const screen = await renderExamResultsContinuityHarness();

  await screen.getByRole('button', { name: /Stem 2/i }).click();

  await expectPostExamReviewScoreBanner(screen);
  await expect.element(screen.getByText('Explanation 2')).toBeVisible();
  await expect
    .element(screen.getByRole('region', { name: 'Question 2 of 2' }))
    .toBeVisible();
});
