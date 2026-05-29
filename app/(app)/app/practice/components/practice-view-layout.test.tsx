// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/lib/routes';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import './practice-view-test-helpers';

const { fixtureQuestion1Id, fixtureSession1Id, fixtureChoice1Id } = vi.hoisted(
  () => ({
    fixtureQuestion1Id: crypto.randomUUID(),
    fixtureSession1Id: crypto.randomUUID(),
    fixtureChoice1Id: crypto.randomUUID(),
  }),
);

function createFixtureNextQuestion(
  overrides: Parameters<typeof createNextQuestion>[0] = {},
) {
  return createNextQuestion({
    questionId: fixtureQuestion1Id,
    choices: [
      {
        id: fixtureChoice1Id,
        label: 'A',
        textMd: 'Choice A',
        sortOrder: 1,
      },
    ],
    ...overrides,
  });
}

type PracticeViewModule = typeof import('./practice-view');

let PracticeView: PracticeViewModule['PracticeView'];

beforeAll(async () => {
  PracticeView = (await import('./practice-view')).PracticeView;
});

describe('PracticeView layout', () => {
  it('renders Back to Dashboard link with correct href', () => {
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
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    expect(html).toContain('Back to Dashboard');
    expect(html).toContain(`href="${ROUTES.APP_DASHBOARD}"`);
  });

  it('renders topContent above the page heading when provided', () => {
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
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
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

  it('renders belowHeadingContent after the heading and before the question area', () => {
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
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const heading = doc.querySelector('h1');
    expect(heading?.textContent).toBe('Practice');

    const below = doc.querySelector('[data-testid="below-heading-content"]');
    expect(below?.textContent).toBe('Below');

    const questionArea = doc.querySelector('section[aria-labelledby]');
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

  it('announces description updates for assistive tech via aria-live', () => {
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
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const progress = doc.querySelector('p[aria-live="polite"]');
    expect(progress).not.toBeNull();
    expect(progress?.textContent).toContain('Question 2 of 10');
  });

  it('exposes the focused question panel as a labeled region', () => {
    const question = createFixtureNextQuestion({
      questionId: fixtureQuestion1Id,
      slug: 'question-1',
      stemMd: 'Stem',
      difficulty: 'easy',
    });

    const html = renderToStaticMarkup(
      <PracticeView
        title="Exam Session"
        description="Question 2 of 10 — Explanations shown after you submit the exam."
        questionPanelId="question-panel"
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const questionPanel = doc.getElementById('question-panel');
    const progress = doc.querySelector('p[aria-live="polite"]');

    expect(questionPanel).not.toBeNull();
    expect(progress).not.toBeNull();
    expect(progress?.id).toBeTruthy();
    expect(questionPanel?.tagName).toBe('SECTION');
    expect(questionPanel?.getAttribute('aria-labelledby')).toBe(progress?.id);
  });

  it('renders an explicit session action when no more questions remain', () => {
    const html = renderToStaticMarkup(
      <PracticeView
        endSessionLabel="Review & Submit"
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const endButtons = Array.from(doc.querySelectorAll('button')).filter(
      (button) => button.textContent?.includes('Review & Submit'),
    );
    expect(endButtons).toHaveLength(2);
  });

  it('renders a scoped exam header action rail before the question area', () => {
    const question = createFixtureNextQuestion({
      questionId: fixtureQuestion1Id,
      slug: 'question-1',
      stemMd: 'Stem',
      difficulty: 'easy',
    });

    const html = renderToStaticMarkup(
      <PracticeView
        title="Exam Session"
        description="Question 1 of 3 — Explanations shown after you submit the exam."
        sessionInfo={{
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 3,
          isMarkedForReview: false,
        }}
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const headerActions = doc.querySelector(
      '[data-testid="question-header-actions"]',
    );
    const questionPanel = doc.querySelector(
      '[data-testid="active-question-panel"]',
    );

    expect(headerActions).not.toBeNull();
    expect(
      Array.from(headerActions?.querySelectorAll('button') ?? []).map(
        (button) => button.textContent?.trim(),
      ),
    ).toEqual(['Mark for review']);
    expect(headerActions?.textContent).not.toContain('End session');

    if (!headerActions) throw new Error('Expected header actions');
    if (!questionPanel) throw new Error('Expected question panel');

    const position = headerActions.compareDocumentPosition(questionPanel);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('renders the exam timer only in the exam header action rail', () => {
    const question = createFixtureNextQuestion({
      questionId: fixtureQuestion1Id,
      slug: 'question-1',
      stemMd: 'Stem',
      difficulty: 'easy',
    });

    const examHtml = renderToStaticMarkup(
      <PracticeView
        title="Exam Session"
        description="Question 1 of 3 — Explanations shown after you submit the exam."
        sessionInfo={{
          sessionId: fixtureSession1Id,
          mode: 'exam',
          deadlineAt: '2099-05-22T12:02:24.000Z',
          index: 0,
          total: 3,
          isMarkedForReview: false,
        }}
        examTimer={<span data-testid="exam-timer-probe">12:34</span>}
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    const tutorHtml = renderToStaticMarkup(
      <PracticeView
        title="Tutor Session"
        description="Question 1 of 3 — Explanations shown after each answer."
        sessionInfo={{
          sessionId: fixtureSession1Id,
          mode: 'tutor',
          deadlineAt: null,
          index: 0,
          total: 3,
          isMarkedForReview: false,
        }}
        examTimer={<span data-testid="exam-timer-probe">12:34</span>}
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(examHtml, 'text/html');
    expect(
      doc
        .querySelector('[data-testid="question-header-actions"]')
        ?.querySelector('[data-testid="exam-timer-probe"]')?.textContent,
    ).toBe('12:34');
    expect(tutorHtml).not.toContain('exam-timer-probe');
  });

  it('renders the fallback back link when exam mode has no mark-for-review action', () => {
    const question = createFixtureNextQuestion({
      questionId: fixtureQuestion1Id,
      slug: 'question-1',
      stemMd: 'Stem',
      difficulty: 'easy',
    });

    const html = renderToStaticMarkup(
      <PracticeView
        title="Exam Session"
        description="Question 1 of 3 — Explanations shown after you submit the exam."
        sessionInfo={{
          sessionId: fixtureSession1Id,
          mode: 'exam',

          deadlineAt: '2099-05-22T12:02:24.000Z',

          index: 0,
          total: 3,
          isMarkedForReview: false,
        }}
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const headerActions = doc.querySelector(
      '[data-testid="question-header-actions"]',
    );
    const backLink = headerActions?.querySelector('a');

    expect(headerActions).not.toBeNull();
    expect(headerActions?.querySelectorAll('button')).toHaveLength(0);
    expect(backLink?.textContent).toBe('Back to Dashboard');
    expect(backLink?.getAttribute('href')).toBe(ROUTES.APP_DASHBOARD);
  });

  it('renders a question panel id for navigator aria-controls wiring', () => {
    const html = renderToStaticMarkup(
      <PracticeView
        questionPanelId="practice-question-panel"
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const questionPanel = doc.querySelector('section[aria-labelledby]');

    expect(questionPanel).not.toBeNull();
    expect(questionPanel?.getAttribute('id')).toBe('practice-question-panel');
    expect(questionPanel?.getAttribute('data-testid')).toBe(
      'active-question-panel',
    );
  });
});
