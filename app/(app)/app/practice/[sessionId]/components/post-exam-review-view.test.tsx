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

let PostExamReviewView: PostExamReviewViewModule['PostExamReviewView'];

beforeAll(async () => {
  ({ PostExamReviewView } = await import('./post-exam-review-view'));
});

function renderView(input?: {
  row?: GetCompletedSessionQuestionsWithFeedbackOutput['rows'][number];
}) {
  const row = input?.row ?? createReviewRow();
  const summary = createSummary({
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
      review={createReview([row])}
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
});
