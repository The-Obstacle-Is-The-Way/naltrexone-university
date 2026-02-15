// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { toQuestionRoute } from '@/lib/routes';
import type { SessionNavigation } from '../question-page-logic';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('ReviewQuestionNavigator', () => {
  const baseNavigation = {
    questions: [
      { slug: 'q1', order: 1, isCorrect: true },
      { slug: 'q2', order: 2, isCorrect: false },
      { slug: 'q3', order: 3, isCorrect: null },
    ],
    currentIndex: 1,
    sessionId: 'session_123',
    from: 'history',
  } as const satisfies SessionNavigation;

  function getClassList(el: Element | null): string[] {
    return (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
  }

  function findByAriaLabel(doc: Document, label: string): Element | null {
    return (
      Array.from(doc.querySelectorAll('[aria-label]')).find(
        (el) => el.getAttribute('aria-label') === label,
      ) ?? null
    );
  }

  async function renderNavigator(input?: {
    navigation?: SessionNavigation;
    historyHref?: string;
  }) {
    const { ReviewQuestionNavigator } = await import(
      './review-question-navigator'
    );
    const navigation = input?.navigation ?? baseNavigation;
    const html = renderToStaticMarkup(
      <ReviewQuestionNavigator
        navigation={navigation}
        historyHref={input?.historyHref}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return { doc, html, navigation };
  }

  it('renders success variant for correct questions', async () => {
    const { doc } = await renderNavigator();
    const el = findByAriaLabel(doc, 'Question 1: Correct');

    expect(getClassList(el)).toContain('bg-success');
    expect(getClassList(el)).toContain('text-success-foreground');
  });

  it('renders destructive variant for incorrect questions', async () => {
    const { doc } = await renderNavigator();
    const el = findByAriaLabel(doc, 'Question 2: Incorrect, Current');

    expect(getClassList(el)).toContain('bg-destructive');
  });

  it('renders outline variant for unanswered questions', async () => {
    const { doc } = await renderNavigator();
    const el = findByAriaLabel(doc, 'Question 3: Unanswered');

    expect(getClassList(el)).toContain('bg-background');
    expect(getClassList(el)).toContain('border');
  });

  it('highlights the current question with ring classes', async () => {
    const { doc } = await renderNavigator();
    const el = findByAriaLabel(doc, 'Question 2: Incorrect, Current');

    expect(getClassList(el)).toContain('ring-2');
    expect(getClassList(el)).toContain('ring-ring');
  });

  it('sets aria-current="step" on the current question', async () => {
    const { doc } = await renderNavigator();
    const el = findByAriaLabel(doc, 'Question 2: Incorrect, Current');

    expect(el?.getAttribute('aria-current')).toBe('step');
  });

  it('does not render the current question as a link', async () => {
    const { doc } = await renderNavigator();
    const el = findByAriaLabel(doc, 'Question 2: Incorrect, Current');

    expect(el?.tagName.toLowerCase()).toBe('button');
  });

  it('renders non-current questions as links', async () => {
    const { doc } = await renderNavigator();

    expect(
      findByAriaLabel(doc, 'Question 1: Correct')?.tagName.toLowerCase(),
    ).toBe('a');
    expect(
      findByAriaLabel(doc, 'Question 3: Unanswered')?.tagName.toLowerCase(),
    ).toBe('a');
  });

  it('generates correct href via toQuestionRoute', async () => {
    const { doc, navigation } = await renderNavigator();
    const el = findByAriaLabel(doc, 'Question 1: Correct');

    expect(el?.getAttribute('href')).toBe(
      toQuestionRoute('q1', {
        from: navigation.from,
        mode: 'review',
        sessionId: navigation.sessionId,
      }),
    );
  });

  it('preserves historyHref in generated links', async () => {
    const historyHref = '/app/history?tab=sessions&offset=0&limit=20';
    const { doc, navigation } = await renderNavigator({ historyHref });
    const el = findByAriaLabel(doc, 'Question 1: Correct');

    expect(el?.getAttribute('href')).toBe(
      toQuestionRoute('q1', {
        from: navigation.from,
        mode: 'review',
        sessionId: navigation.sessionId,
        historyHref,
      }),
    );
  });

  it('includes aria-label for correct questions', async () => {
    const { doc } = await renderNavigator();
    const el = findByAriaLabel(doc, 'Question 1: Correct');

    expect(el).not.toBeNull();
  });

  it('includes aria-label for incorrect questions', async () => {
    const { doc } = await renderNavigator();
    const el = findByAriaLabel(doc, 'Question 2: Incorrect, Current');

    expect(el).not.toBeNull();
  });

  it('includes aria-label for unanswered questions', async () => {
    const { doc } = await renderNavigator();
    const el = findByAriaLabel(doc, 'Question 3: Unanswered');

    expect(el).not.toBeNull();
  });

  it('appends ", Current" to aria-label for the current question', async () => {
    const { doc } = await renderNavigator();
    const el = findByAriaLabel(doc, 'Question 2: Incorrect, Current');

    expect(el?.getAttribute('aria-label')).toBe(
      'Question 2: Incorrect, Current',
    );
  });

  it('renders the correct number of buttons matching questions array length', async () => {
    const { doc, navigation } = await renderNavigator();
    const buttons = doc.querySelectorAll('[data-slot="button"]');

    expect(buttons).toHaveLength(navigation.questions.length);
  });

  it('displays question order numbers as button text', async () => {
    const { doc } = await renderNavigator();

    expect(
      findByAriaLabel(doc, 'Question 1: Correct')?.textContent?.trim(),
    ).toBe('1');
    expect(
      findByAriaLabel(
        doc,
        'Question 2: Incorrect, Current',
      )?.textContent?.trim(),
    ).toBe('2');
    expect(
      findByAriaLabel(doc, 'Question 3: Unanswered')?.textContent?.trim(),
    ).toBe('3');
  });

  it('renders "Question navigator" heading text', async () => {
    const { html } = await renderNavigator();

    expect(html).toContain('Question navigator');
  });
});
