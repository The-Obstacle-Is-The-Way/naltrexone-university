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

  function findBottomRightBadge(el: Element | null): Element | null {
    return (
      Array.from(el?.querySelectorAll('span') ?? []).find((span) => {
        const tokens = getClassList(span);
        return (
          tokens.includes('absolute') &&
          tokens.includes('-bottom-1') &&
          tokens.includes('-right-1') &&
          tokens.includes('bg-background')
        );
      }) ?? null
    );
  }

  function findTopRightReviewDot(el: Element | null): Element | null {
    return (
      Array.from(el?.querySelectorAll('span') ?? []).find((span) => {
        const tokens = getClassList(span);
        return (
          tokens.includes('absolute') &&
          tokens.includes('bg-primary') &&
          tokens.includes('-right-0.5') &&
          tokens.includes('-top-0.5')
        );
      }) ?? null
    );
  }

  async function renderNavigator(input?: {
    review?: GetPracticeSessionReviewOutput;
    currentQuestionId?: string | null;
    controlledPanelId?: string;
    mode?: 'exam' | 'review';
  }) {
    const { QuestionNavigator } = await import('./exam-review-view');
    const controlledPanelId =
      input?.controlledPanelId ?? 'practice-question-panel';
    const html = renderToStaticMarkup(
      <QuestionNavigator
        review={input?.review ?? review}
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

  it('does not render correctness badges in exam mode', async () => {
    const { doc } = await renderNavigator({ mode: 'exam' });

    const buttons = Array.from(
      doc.querySelectorAll('button[aria-label^="Question "]'),
    );
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      expect(findBottomRightBadge(btn)).toBeNull();
      expect(btn.querySelector('svg')).toBeNull();
    }
  });

  it('renders check and x overflow badges only for answered review buttons', async () => {
    const { doc } = await renderNavigator({
      currentQuestionId: 'q3',
      mode: 'review',
    });

    const correct = findByAriaLabel(doc, 'Question 1: Correct');
    const incorrect = findByAriaLabel(doc, 'Question 2: Incorrect');
    const unanswered = findByAriaLabel(doc, 'Question 3: Current, Unanswered');

    const correctBadge = findBottomRightBadge(correct);
    const incorrectBadge = findBottomRightBadge(incorrect);

    expect(correctBadge?.getAttribute('aria-hidden')).toBe('true');
    expect(getClassList(correctBadge?.querySelector('svg') ?? null)).toContain(
      'text-success',
    );
    expect(getClassList(correctBadge?.querySelector('svg') ?? null)).toContain(
      'size-2.5',
    );

    expect(incorrectBadge?.getAttribute('aria-hidden')).toBe('true');
    expect(
      getClassList(incorrectBadge?.querySelector('svg') ?? null),
    ).toContain('text-destructive');
    expect(findBottomRightBadge(unanswered)).toBeNull();
    expect(unanswered?.querySelector('svg')).toBeNull();
  });

  it('renders both the review dot and bottom-right check badge for marked correct review buttons', async () => {
    const { doc } = await renderNavigator({
      review: {
        ...review,
        markedCount: 1,
        rows: review.rows.map((row) =>
          row.questionId === 'q1' ? { ...row, markedForReview: true } : row,
        ),
      },
      currentQuestionId: 'q3',
      mode: 'review',
    });

    const markedCorrect = findByAriaLabel(
      doc,
      'Question 1: Marked for review, Correct',
    );

    expect(findTopRightReviewDot(markedCorrect)).not.toBeNull();
    const badge = findBottomRightBadge(markedCorrect);
    expect(badge).not.toBeNull();
    expect(getClassList(badge?.querySelector('svg') ?? null)).toContain(
      'text-success',
    );
  });
});
