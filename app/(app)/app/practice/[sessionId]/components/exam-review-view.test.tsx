// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GetPracticeSessionReviewOutput } from '@/src/application/use-cases/get-practice-session-review';

describe('QuestionNavigator', () => {
  const review = {
    sessionId: 'session-1',
    mode: 'exam',
    totalCount: 3,
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
        isCorrect: true,
        markedForReview: false,
      },
      {
        isAvailable: true,
        questionId: 'q2',
        slug: 'q-2',
        stemMd: 'Stem 2',
        difficulty: 'medium',
        order: 2,
        isAnswered: true,
        isCorrect: false,
        markedForReview: false,
      },
      {
        isAvailable: false,
        questionId: 'q3',
        order: 3,
        isAnswered: false,
        isCorrect: null,
        markedForReview: false,
      },
    ],
  } as const satisfies GetPracticeSessionReviewOutput;

  function findByAriaLabel(doc: Document, label: string): Element | null {
    return (
      Array.from(doc.querySelectorAll('[aria-label]')).find(
        (el) => el.getAttribute('aria-label') === label,
      ) ?? null
    );
  }

  async function renderNavigator(input?: {
    currentQuestionId?: string | null;
  }) {
    const { QuestionNavigator } = await import('./exam-review-view');
    const html = renderToStaticMarkup(
      <QuestionNavigator
        review={review}
        currentQuestionId={input?.currentQuestionId ?? 'q2'}
        onNavigateQuestion={() => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return { doc };
  }

  it('exposes a navigation landmark with an accessible label', async () => {
    const { doc } = await renderNavigator();

    expect(
      doc.querySelector('[role="navigation"][aria-label="Question navigator"]'),
    ).not.toBeNull();
  });

  it('sets aria-current="step" on the current question button', async () => {
    const { doc } = await renderNavigator();
    const el = findByAriaLabel(doc, 'Question 2: Current, Answered');

    expect(el?.getAttribute('aria-current')).toBe('step');
  });

  it('does not set aria-current on non-current questions', async () => {
    const { doc } = await renderNavigator();
    const el = findByAriaLabel(doc, 'Question 1: Answered');

    expect(el?.getAttribute('aria-current')).toBeNull();
  });
});
