// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/lib/routes';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

describe('PracticeView', () => {
  it('renders Back to Dashboard link with correct href', async () => {
    const { PracticeView } = await import('./practice-view');

    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    expect(html).toContain('Back to Dashboard');
    expect(html).toContain(`href="${ROUTES.APP_DASHBOARD}"`);
  });

  it('renders topContent above the page heading when provided', async () => {
    const { PracticeView } = await import('./practice-view');

    const html = renderToStaticMarkup(
      <PracticeView
        topContent={<div data-testid="top-content">Top</div>}
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const heading = doc.querySelector('h1');
    expect(heading?.textContent).toBe('Practice');

    const top = doc.querySelector('[data-testid="top-content"]');
    expect(top?.textContent).toBe('Top');

    if (!heading) throw new Error('Expected heading');
    if (!top) throw new Error('Expected top content');

    const position = top.compareDocumentPosition(heading);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('renders belowHeadingContent after the heading and before the question area', async () => {
    const { PracticeView } = await import('./practice-view');

    const html = renderToStaticMarkup(
      <PracticeView
        belowHeadingContent={
          <div data-testid="below-heading-content">Below</div>
        }
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const heading = doc.querySelector('h1');
    expect(heading?.textContent).toBe('Practice');

    const below = doc.querySelector('[data-testid="below-heading-content"]');
    expect(below?.textContent).toBe('Below');

    const questionArea = doc.querySelector('div[tabindex="-1"]');
    expect(questionArea).not.toBeNull();

    if (!heading) throw new Error('Expected heading');
    if (!below) throw new Error('Expected below heading content');
    if (!questionArea) throw new Error('Expected question area');

    const positionAfterHeading = heading.compareDocumentPosition(below);
    expect(positionAfterHeading & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    const positionBeforeQuestionArea =
      below.compareDocumentPosition(questionArea);
    expect(positionBeforeQuestionArea & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('renders submit pending copy without rendering question-loading text', async () => {
    const { PracticeView } = await import('./practice-view');
    const question = createNextQuestion({
      questionId: 'question-1',
      slug: 'question-1',
      stemMd: 'Stem',
      difficulty: 'easy',
    });
    const choice = question.choices[0];
    if (!choice) {
      throw new Error(
        'Expected createNextQuestion to include at least one choice',
      );
    }

    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={choice.id}
        isAnswered={false}
        submitResult={null}
        isPending
        bookmarkStatus="idle"
        isBookmarked={false}
        canSubmit
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    expect(html).toContain('Submitting…');
    expect(html).not.toContain('Loading question');
  });

  it('announces description updates for assistive tech via aria-live', async () => {
    const { PracticeView } = await import('./practice-view');

    const html = renderToStaticMarkup(
      <PracticeView
        description="Question 2 of 10 — Explanations shown after you submit the exam."
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const progress = doc.querySelector('p[aria-live="polite"]');
    expect(progress).not.toBeNull();
    expect(progress?.textContent).toContain('Question 2 of 10');
  });

  it('exposes toggle state via aria-pressed for bookmark button', async () => {
    const { PracticeView } = await import('./practice-view');
    const question = createNextQuestion();

    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={true}
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bookmarkButton = Array.from(doc.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Remove bookmark'),
    );
    expect(bookmarkButton).not.toBeNull();
    expect(bookmarkButton?.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders an explicit session action when no more questions remain', async () => {
    const { PracticeView } = await import('./practice-view');

    const html = renderToStaticMarkup(
      <PracticeView
        endSessionLabel="Review answers"
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

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const endButtons = Array.from(doc.querySelectorAll('button')).filter(
      (button) => button.textContent?.includes('Review answers'),
    );
    expect(endButtons).toHaveLength(2);
  });
});

describe('getBookmarkNotificationTransition', () => {
  it('resets last key and returns no notification when message is null', async () => {
    const { getBookmarkNotificationTransition } = await import(
      './practice-view'
    );

    const transition = getBookmarkNotificationTransition({
      message: null,
      version: 1,
      bookmarkStatus: 'idle',
      lastKey: '1:hi',
    });

    expect(transition.nextKey).toBeNull();
    expect(transition.notification).toBeNull();
  });

  it('returns a success notification for new messages when status is not error', async () => {
    const { getBookmarkNotificationTransition } = await import(
      './practice-view'
    );

    const transition = getBookmarkNotificationTransition({
      message: 'Question bookmarked.',
      version: 2,
      bookmarkStatus: 'idle',
      lastKey: null,
    });

    expect(transition.nextKey).toBe('2:Question bookmarked.');
    expect(transition.notification).toEqual({
      message: 'Question bookmarked.',
      tone: 'success',
    });
  });

  it('returns an error notification when bookmarkStatus is error', async () => {
    const { getBookmarkNotificationTransition } = await import(
      './practice-view'
    );

    const transition = getBookmarkNotificationTransition({
      message: 'Failed.',
      version: 3,
      bookmarkStatus: 'error',
      lastKey: null,
    });

    expect(transition.notification).toEqual({
      message: 'Failed.',
      tone: 'error',
    });
  });

  it('returns no notification for duplicate messages', async () => {
    const { getBookmarkNotificationTransition } = await import(
      './practice-view'
    );

    const transition = getBookmarkNotificationTransition({
      message: 'Question bookmarked.',
      version: 2,
      bookmarkStatus: 'idle',
      lastKey: '2:Question bookmarked.',
    });

    expect(transition.nextKey).toBe('2:Question bookmarked.');
    expect(transition.notification).toBeNull();
  });
});
