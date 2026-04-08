// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import type { GetCompletedSessionQuestionsWithFeedbackOutput } from '@/src/adapters/controllers/practice-controller';
import {
  createReview,
  createReviewRow,
  createSummary,
} from './post-exam-review-view.fixtures';

type PostExamReviewViewModule = typeof import('./post-exam-review-view');
type ReviewRow = GetCompletedSessionQuestionsWithFeedbackOutput['rows'][number];

let PostExamReviewView: PostExamReviewViewModule['PostExamReviewView'];

beforeAll(async () => {
  ({ PostExamReviewView } = await import('./post-exam-review-view'));
});

function renderView(input?: {
  rows?: ReviewRow[];
  row?: GetCompletedSessionQuestionsWithFeedbackOutput['rows'][number];
  currentQuestionId?: string | null;
  isBookmarked?: boolean;
}) {
  const rows = input?.rows ?? [input?.row ?? createReviewRow()];
  const answered = rows.filter((row) => row.isAnswered).length;
  const correct = rows.filter((row) => row.isCorrect === true).length;
  const questionCount = rows.length;
  const summary = createSummary({
    questionCount,
    totals: {
      answered,
      correct,
      accuracy: questionCount === 0 ? 0 : correct / questionCount,
      durationSeconds: 120,
    },
  });
  const html = renderToStaticMarkup(
    <PostExamReviewView
      summary={summary}
      review={createReview(rows)}
      currentQuestionId={
        input?.currentQuestionId ?? rows[0]?.questionId ?? null
      }
      controlledPanelId="practice-question-panel"
      bookmarkStatus="idle"
      isBookmarked={input?.isBookmarked ?? false}
      onToggleBookmark={() => undefined}
      onNavigateQuestion={() => undefined}
      onViewSummary={() => undefined}
    />,
  );

  return new DOMParser().parseFromString(html, 'text/html');
}

function getReviewActionLabels(doc: Document) {
  return Array.from(doc.querySelectorAll('button'))
    .filter((button) => {
      const label = button.textContent?.trim();
      return (
        label === 'Previous' ||
        label === 'Next' ||
        label === 'Finish review' ||
        button.hasAttribute('aria-pressed')
      );
    })
    .map((button) => button.textContent?.trim());
}

describe('PostExamReviewView', () => {
  it('gives the review panel an accessible name for screen readers', () => {
    const doc = renderView();
    const panel = doc.querySelector('#practice-question-panel');

    expect(panel?.getAttribute('aria-label')).toBe('Question 1 of 1');
  });

  it('uses a semantic section for the labeled review panel', () => {
    const doc = renderView();
    const panel = doc.querySelector('#practice-question-panel');

    expect(panel?.tagName).toBe('SECTION');
  });

  it('applies the repo-standard focus-visible ring classes to the review panel', () => {
    const doc = renderView();
    const panel = doc.querySelector('#practice-question-panel');
    const className = panel?.getAttribute('class') ?? '';

    expect(className).toContain('focus-visible:ring-ring/50');
    expect(className).toContain('focus-visible:ring-[3px]');
  });

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

    expect(doc.querySelector('[data-testid="verdict-pill"]')).toBeNull();
  });

  it('still renders the incorrect verdict pill for answered incorrect questions', () => {
    const doc = renderView({
      row: createReviewRow({
        isAnswered: true,
        isCorrect: false,
        selectedChoiceId: 'choice-a',
      }),
    });

    expect(
      doc.querySelector('[data-testid="verdict-pill"]')?.textContent?.trim(),
    ).toBe('Incorrect');
  });

  it('still renders the correct verdict pill for answered correct questions', () => {
    const doc = renderView({
      row: createReviewRow({
        isAnswered: true,
        isCorrect: true,
        selectedChoiceId: 'choice-b',
      }),
    });

    expect(
      doc.querySelector('[data-testid="verdict-pill"]')?.textContent?.trim(),
    ).toBe('Correct');
  });

  it('renders the middle-question action bar in navigation-first DOM order', () => {
    const rows = [
      createReviewRow({
        questionId: 'question-1',
        slug: 'question-1',
        order: 1,
      }),
      createReviewRow({
        questionId: 'question-2',
        slug: 'question-2',
        order: 2,
      }),
      createReviewRow({
        questionId: 'question-3',
        slug: 'question-3',
        order: 3,
      }),
    ];

    const doc = renderView({
      rows,
      currentQuestionId: 'question-2',
    });

    expect(getReviewActionLabels(doc)).toEqual([
      'Previous',
      'Next',
      'Bookmark',
    ]);
    expect(
      doc.querySelector('button[aria-pressed="false"]')?.textContent?.trim(),
    ).toBe('Bookmark');
  });

  it('renders the first-question action bar with next before bookmark', () => {
    const rows = [
      createReviewRow({
        questionId: 'question-1',
        slug: 'question-1',
        order: 1,
      }),
      createReviewRow({
        questionId: 'question-2',
        slug: 'question-2',
        order: 2,
      }),
    ];

    const doc = renderView({
      rows,
      currentQuestionId: 'question-1',
    });

    expect(getReviewActionLabels(doc)).toEqual(['Next', 'Bookmark']);
  });

  it('renders the last-question action bar with finish review before bookmark', () => {
    const rows = [
      createReviewRow({
        questionId: 'question-1',
        slug: 'question-1',
        order: 1,
      }),
      createReviewRow({
        questionId: 'question-2',
        slug: 'question-2',
        order: 2,
      }),
    ];

    const doc = renderView({
      rows,
      currentQuestionId: 'question-2',
    });

    expect(getReviewActionLabels(doc)).toEqual([
      'Previous',
      'Finish review',
      'Bookmark',
    ]);
  });

  it('renders the single-question action bar with finish review before bookmark', () => {
    const doc = renderView();

    expect(getReviewActionLabels(doc)).toEqual(['Finish review', 'Bookmark']);
  });

  it('does not render the bookmark toggle for unavailable questions', () => {
    const doc = renderView({
      row: createReviewRow({
        isAvailable: false,
      }),
    });

    expect(doc.querySelector('button[aria-pressed]')).toBeNull();
  });

  it('uses bidirectional helper copy that does not imply a one-way summary handoff', () => {
    const doc = renderView();

    expect(doc.body.textContent).toContain(
      'Review each question with detailed feedback.',
    );
    expect(doc.body.textContent).not.toContain(
      'before moving to your session summary',
    );
  });
});
