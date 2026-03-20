// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import type {
  EndPracticeSessionOutput,
  GetCompletedSessionQuestionsWithFeedbackOutput,
} from '@/src/adapters/controllers/practice-controller';

type PostExamReviewViewModule = typeof import('./post-exam-review-view');

let PostExamReviewView: PostExamReviewViewModule['PostExamReviewView'];

beforeAll(async () => {
  ({ PostExamReviewView } = await import('./post-exam-review-view'));
});

function createSummary(
  overrides?: Partial<EndPracticeSessionOutput>,
): EndPracticeSessionOutput {
  return {
    sessionId: 'session-1',
    mode: 'exam',
    questionCount: 1,
    endedAt: '2026-03-20T00:00:00.000Z',
    totals: {
      answered: 1,
      correct: 0,
      accuracy: 0,
      durationSeconds: 120,
    },
    ...overrides,
  };
}

function createReviewRow(
  overrides?: Partial<
    GetCompletedSessionQuestionsWithFeedbackOutput['rows'][number]
  >,
): GetCompletedSessionQuestionsWithFeedbackOutput['rows'][number] {
  return {
    isAvailable: true,
    questionId: 'question-1',
    slug: 'question-1',
    stemMd: 'Question stem',
    difficulty: 'easy',
    order: 1,
    isAnswered: false,
    isCorrect: null,
    markedForReview: false,
    choices: [
      { id: 'choice-a', label: 'A', textMd: 'Choice A' },
      { id: 'choice-b', label: 'B', textMd: 'Choice B' },
    ],
    selectedChoiceId: null,
    correctChoiceId: 'choice-b',
    explanationMd: 'Explanation for unanswered review.',
    referenceMd: 'Anton RF et al. JAMA. 2006;295(17):2003-2017.',
    choiceExplanations: [
      {
        choiceId: 'choice-a',
        displayLabel: 'A',
        textMd: 'Choice A',
        isCorrect: false,
        explanationMd: 'Choice A is incorrect.',
      },
      {
        choiceId: 'choice-b',
        displayLabel: 'B',
        textMd: 'Choice B',
        isCorrect: true,
        explanationMd: 'Choice B is correct.',
      },
    ],
    ...overrides,
  };
}

function createReview(
  row: GetCompletedSessionQuestionsWithFeedbackOutput['rows'][number],
  overrides?: Partial<GetCompletedSessionQuestionsWithFeedbackOutput>,
): GetCompletedSessionQuestionsWithFeedbackOutput {
  return {
    sessionId: 'session-1',
    mode: 'exam',
    totalCount: 1,
    answeredCount: row.isAnswered ? 1 : 0,
    markedCount: row.markedForReview ? 1 : 0,
    rows: [row],
    ...overrides,
  };
}

function findVerdictPill(
  container: ParentNode,
  text: 'Correct' | 'Incorrect',
): HTMLElement | undefined {
  return Array.from(container.querySelectorAll('div, span')).find(
    (element) =>
      element.textContent?.trim() === text &&
      (element.getAttribute('class') ?? '').includes('self-start'),
  ) as HTMLElement | undefined;
}

function renderView(input?: {
  row?: GetCompletedSessionQuestionsWithFeedbackOutput['rows'][number];
  summary?: EndPracticeSessionOutput;
}) {
  const row = input?.row ?? createReviewRow();
  const summary =
    input?.summary ??
    createSummary({
      totals: {
        answered: row.isAnswered ? 1 : 0,
        correct: row.isCorrect === true ? 1 : 0,
        accuracy: row.isCorrect === true ? 1 : 0,
        durationSeconds: 120,
      },
    });
  const html = renderToStaticMarkup(
    <PostExamReviewView
      summary={summary}
      review={createReview(row)}
      currentQuestionId={row.questionId}
      controlledPanelId="practice-question-panel"
      bookmarkStatus="idle"
      isBookmarked={false}
      onToggleBookmark={() => undefined}
      onNavigateQuestion={() => undefined}
      onViewSummary={() => undefined}
    />,
  );

  return new DOMParser().parseFromString(html, 'text/html');
}

describe('PostExamReviewView', () => {
  it('renders a warning banner for unanswered questions', () => {
    const doc = renderView();
    const banner = Array.from(doc.querySelectorAll('[role="status"]')).find(
      (element) =>
        element.textContent?.includes(
          'You did not answer this question during this session.',
        ),
    );

    expect(banner).not.toBeUndefined();
    expect(banner?.getAttribute('class')).toContain('border-warning/50');
    expect(banner?.getAttribute('class')).toContain('bg-warning/5');
  });

  it('does not render an incorrect verdict pill for unanswered questions', () => {
    const doc = renderView();

    expect(findVerdictPill(doc, 'Incorrect')).toBeUndefined();
  });

  it('still renders the incorrect verdict pill for answered incorrect questions', () => {
    const doc = renderView({
      row: createReviewRow({
        isAnswered: true,
        isCorrect: false,
        selectedChoiceId: 'choice-a',
      }),
    });

    expect(findVerdictPill(doc, 'Incorrect')?.textContent?.trim()).toBe(
      'Incorrect',
    );
  });

  it('still renders the correct verdict pill for answered correct questions', () => {
    const doc = renderView({
      row: createReviewRow({
        isAnswered: true,
        isCorrect: true,
        selectedChoiceId: 'choice-b',
      }),
    });

    expect(findVerdictPill(doc, 'Correct')?.textContent?.trim()).toBe(
      'Correct',
    );
  });
});
