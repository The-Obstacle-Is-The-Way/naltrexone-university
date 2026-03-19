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

  function getClassList(el: Element | null): string[] {
    return (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
  }

  async function renderNavigator(input?: {
    currentQuestionId?: string | null;
    controlledPanelId?: string;
    mode?: 'exam' | 'review';
  }) {
    const { QuestionNavigator } = await import('./exam-review-view');
    const controlledPanelId =
      input?.controlledPanelId ?? 'practice-question-panel';
    const html = renderToStaticMarkup(
      <QuestionNavigator
        review={review}
        currentQuestionId={input?.currentQuestionId ?? 'q2'}
        controlledPanelId={controlledPanelId}
        mode={input?.mode}
        onNavigateQuestion={() => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return { doc };
  }

  it('exposes a navigation landmark with an accessible label', async () => {
    const { doc } = await renderNavigator();

    expect(
      doc.querySelector('nav[aria-label="Question navigator"]'),
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

  it('wires each navigator button to the controlled question panel with aria-controls', async () => {
    const { doc } = await renderNavigator();
    const buttons = Array.from(
      doc.querySelectorAll('button[aria-label^="Question "]'),
    );

    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((button) => {
      expect(button.getAttribute('aria-controls')).toBe(
        'practice-question-panel',
      );
    });
  });

  it('uses correctness styling in review mode', async () => {
    const { doc } = await renderNavigator({
      currentQuestionId: 'q3',
      mode: 'review',
    });

    const correct = findByAriaLabel(doc, 'Question 1: Correct');
    const incorrect = findByAriaLabel(doc, 'Question 2: Incorrect');
    const unanswered = findByAriaLabel(doc, 'Question 3: Current, Unanswered');

    expect(getClassList(correct)).toContain('bg-success');
    expect(getClassList(correct)).toContain('text-success-foreground');
    expect(getClassList(incorrect)).toContain('bg-destructive');
    expect(getClassList(unanswered)).toContain('bg-background');
    expect(getClassList(unanswered)).toContain('border');
  });
});
