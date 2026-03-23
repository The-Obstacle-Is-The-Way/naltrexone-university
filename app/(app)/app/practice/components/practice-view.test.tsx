// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/lib/routes';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

type PracticeViewModule = typeof import('./practice-view');

let PracticeView: PracticeViewModule['PracticeView'];
let getBookmarkNotificationTransition: PracticeViewModule['getBookmarkNotificationTransition'];

beforeAll(async () => {
  const module = await import('./practice-view');
  PracticeView = module.PracticeView;
  getBookmarkNotificationTransition = module.getBookmarkNotificationTransition;
});

function createQuestionProps() {
  return createNextQuestion({
    questionId: 'question-1',
    slug: 'question-1',
    stemMd: 'Stem',
    difficulty: 'easy',
  });
}

describe('PracticeView', () => {
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

  it('renders submit pending copy without rendering question-loading text', () => {
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

  it('exposes toggle state via aria-pressed for bookmark button', () => {
    const question = createNextQuestion();
    const selectedChoice = question.choices[0];
    if (!selectedChoice) {
      throw new Error('Expected at least one choice');
    }

    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={selectedChoice.id}
        isAnswered={true}
        submitResult={{
          attemptId: 'attempt-1',
          isCorrect: true,
          correctChoiceId: selectedChoice.id,
          explanationMd: 'Because.',
          referenceMd: null,
          choiceExplanations: [],
        }}
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

  it('does not render the bookmark button in exam mode', () => {
    const html = renderToStaticMarkup(
      <PracticeView
        sessionInfo={{
          sessionId: 'session-1',
          mode: 'exam',
          index: 0,
          total: 10,
          isMarkedForReview: false,
        }}
        loadState={{ status: 'ready' }}
        question={createQuestionProps()}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    expect(html).not.toContain('>Bookmark<');
    expect(html).toContain('>Mark for review<');
  });

  it('does not render the bookmark button in tutor mode on unanswered session questions', () => {
    const html = renderToStaticMarkup(
      <PracticeView
        sessionInfo={{
          sessionId: 'session-1',
          mode: 'tutor',
          index: 0,
          total: 10,
          isMarkedForReview: false,
        }}
        loadState={{ status: 'ready' }}
        question={createQuestionProps()}
        selectedChoiceId={null}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    expect(html).not.toContain('>Bookmark<');
    expect(html).not.toContain('>Mark for review<');
  });

  it('renders the bookmark button in tutor mode after feedback is visible', () => {
    const question = createQuestionProps();
    const selectedChoice = question.choices[0];
    if (!selectedChoice) {
      throw new Error('Expected at least one choice');
    }

    const html = renderToStaticMarkup(
      <PracticeView
        sessionInfo={{
          sessionId: 'session-1',
          mode: 'tutor',
          index: 0,
          total: 10,
          isMarkedForReview: false,
        }}
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={selectedChoice.id}
        isAnswered={true}
        submitResult={{
          attemptId: 'attempt-1',
          isCorrect: true,
          correctChoiceId: selectedChoice.id,
          explanationMd: 'Because.',
          referenceMd: null,
          choiceExplanations: [],
        }}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    expect(html).toContain('>Bookmark<');
  });

  it('does not render the bookmark button in quick practice on unanswered questions', () => {
    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={createQuestionProps()}
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

    expect(html).not.toContain('>Bookmark<');
  });

  it('renders the bookmark button in quick practice after feedback is visible', () => {
    const question = createQuestionProps();
    const selectedChoice = question.choices[0];
    if (!selectedChoice) {
      throw new Error('Expected at least one choice');
    }

    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={selectedChoice.id}
        isAnswered={true}
        submitResult={{
          attemptId: 'attempt-1',
          isCorrect: true,
          correctChoiceId: selectedChoice.id,
          explanationMd: 'Because.',
          referenceMd: null,
          choiceExplanations: [],
        }}
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

    expect(html).toContain('>Bookmark<');
  });

  it('renders an explicit session action when no more questions remain', () => {
    const html = renderToStaticMarkup(
      <PracticeView
        endSessionLabel="Finish exam"
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
      (button) => button.textContent?.includes('Finish exam'),
    );
    expect(endButtons).toHaveLength(2);
  });

  it('renders a Previous button when onPreviousQuestion is provided', () => {
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
        isBookmarked={false}
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
        onPreviousQuestion={() => undefined}
        hasPreviousQuestion={true}
      />,
    );

    expect(html).toContain('Previous');
  });

  it('disables Previous when canNavigatePrevious is false', () => {
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
        isBookmarked={false}
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
        onPreviousQuestion={() => undefined}
        hasPreviousQuestion={true}
        canNavigatePrevious={false}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const previousButton = Array.from(doc.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Previous'),
    );

    expect(previousButton).toBeDefined();
    expect(previousButton?.hasAttribute('disabled')).toBe(true);
  });

  it('hides Previous when hasPreviousQuestion is false', () => {
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
        isBookmarked={false}
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
        onPreviousQuestion={() => undefined}
        hasPreviousQuestion={false}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const previousButton = Array.from(doc.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Previous'),
    );
    expect(previousButton).toBeUndefined();
  });

  it('renders "Next" (not "Next Question")', () => {
    const question = createNextQuestion();

    const props: Parameters<typeof PracticeView>[0] = {
      loadState: { status: 'ready' },
      question,
      selectedChoiceId: null,
      isAnswered: false,
      submitResult: null,
      isPending: false,
      bookmarkStatus: 'idle',
      isBookmarked: false,
      canSubmit: false,
      onTryAgain: () => undefined,
      onToggleBookmark: () => undefined,
      onSelectChoice: () => undefined,
      onSubmit: () => undefined,
      onNextQuestion: () => undefined,
      onPreviousQuestion: () => undefined,
      hasPreviousQuestion: true,
    };

    const html = renderToStaticMarkup(<PracticeView {...props} />);

    expect(html).toContain('Next');
    expect(html).not.toContain('Next Question');
  });

  it('hides Next when hasNextQuestion is false', () => {
    const question = createNextQuestion();

    const props: Parameters<typeof PracticeView>[0] = {
      loadState: { status: 'ready' },
      question,
      selectedChoiceId: null,
      isAnswered: false,
      submitResult: null,
      isPending: false,
      bookmarkStatus: 'idle',
      isBookmarked: false,
      canSubmit: false,
      onTryAgain: () => undefined,
      onToggleBookmark: () => undefined,
      onSelectChoice: () => undefined,
      onSubmit: () => undefined,
      onNextQuestion: () => undefined,
      onPreviousQuestion: () => undefined,
      hasPreviousQuestion: true,
      hasNextQuestion: false,
    };

    const html = renderToStaticMarkup(<PracticeView {...props} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const nextButton = Array.from(doc.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Next'),
    );

    expect(nextButton).toBeUndefined();
  });

  it('keeps tutor action bar ordering as Previous, Submit, Next before feedback', () => {
    const question = createNextQuestion();

    const props: Parameters<typeof PracticeView>[0] = {
      sessionInfo: {
        sessionId: 'session-1',
        mode: 'tutor',
        index: 1,
        total: 3,
        isMarkedForReview: false,
      },
      loadState: { status: 'ready' },
      question,
      selectedChoiceId: null,
      isAnswered: false,
      submitResult: null,
      isPending: false,
      bookmarkStatus: 'idle',
      isBookmarked: false,
      canSubmit: false,
      onTryAgain: () => undefined,
      onToggleBookmark: () => undefined,
      onSelectChoice: () => undefined,
      onSubmit: () => undefined,
      onNextQuestion: () => undefined,
      onPreviousQuestion: () => undefined,
      hasPreviousQuestion: true,
      hasNextQuestion: true,
    };

    const html = renderToStaticMarkup(<PracticeView {...props} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const actionBar = doc.querySelector('[data-testid="bottom-action-bar"]');
    if (!actionBar) throw new Error('Expected action bar');

    const labels = Array.from(actionBar.querySelectorAll('button')).map(
      (button) => (button.textContent ?? '').trim(),
    );

    expect(labels).toEqual(['Previous', 'Submit', 'Next']);
  });

  it('keeps tutor action bar ordering as Previous, Next, Bookmark after feedback', () => {
    const question = createNextQuestion();
    const selectedChoice = question.choices[0];
    if (!selectedChoice) {
      throw new Error('Expected at least one choice');
    }

    const props: Parameters<typeof PracticeView>[0] = {
      sessionInfo: {
        sessionId: 'session-1',
        mode: 'tutor',
        index: 1,
        total: 3,
        isMarkedForReview: false,
      },
      loadState: { status: 'ready' },
      question,
      selectedChoiceId: selectedChoice.id,
      isAnswered: true,
      submitResult: {
        attemptId: 'attempt-1',
        isCorrect: true,
        correctChoiceId: selectedChoice.id,
        explanationMd: 'Because.',
        referenceMd: null,
        choiceExplanations: [],
      },
      isPending: false,
      bookmarkStatus: 'idle',
      isBookmarked: false,
      canSubmit: false,
      onTryAgain: () => undefined,
      onToggleBookmark: () => undefined,
      onSelectChoice: () => undefined,
      onSubmit: () => undefined,
      onNextQuestion: () => undefined,
      onPreviousQuestion: () => undefined,
      hasPreviousQuestion: true,
      hasNextQuestion: true,
    };

    const html = renderToStaticMarkup(<PracticeView {...props} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const actionBar = doc.querySelector('[data-testid="bottom-action-bar"]');
    if (!actionBar) throw new Error('Expected action bar');

    const labels = Array.from(actionBar.querySelectorAll('button')).map(
      (button) => (button.textContent ?? '').trim(),
    );

    expect(labels).toEqual(['Previous', 'Next', 'Bookmark']);
  });

  it('renders exam action bar with Next and Mark for review and no Submit on the first question', () => {
    const question = createQuestionProps();
    const selectedChoice = question.choices[0];
    if (!selectedChoice) {
      throw new Error('Expected at least one choice');
    }

    const html = renderToStaticMarkup(
      <PracticeView
        sessionInfo={{
          sessionId: 'session-1',
          mode: 'exam',
          index: 0,
          total: 2,
          isMarkedForReview: false,
        }}
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={selectedChoice.id}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
        onPreviousQuestion={() => undefined}
        hasPreviousQuestion={false}
        hasNextQuestion={true}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const actionBar = doc.querySelector('[data-testid="bottom-action-bar"]');
    if (!actionBar) throw new Error('Expected action bar');

    const labels = Array.from(actionBar.querySelectorAll('button')).map(
      (button) => (button.textContent ?? '').trim(),
    );

    expect(labels).toEqual(['Next', 'Mark for review']);
    expect(
      actionBar.querySelectorAll('span[aria-hidden="true"].h-9.min-w-24'),
    ).toHaveLength(0);
    expect(html).not.toContain('>Submit<');
    expect(html).not.toContain('>Previous<');
  });

  it('keeps Submit visible and Next outlined before submission', () => {
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
    const submitButton = Array.from(doc.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Submit',
    );
    const nextButton = Array.from(doc.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Next',
    );

    expect(submitButton).not.toBeUndefined();
    expect(nextButton).not.toBeUndefined();
    expect(nextButton?.className).toContain('border bg-background');
  });

  it('hides Submit and promotes Next to primary after submission', () => {
    const question = createQuestionProps();
    const selectedChoice = question.choices[0];
    if (!selectedChoice) {
      throw new Error('Expected at least one choice');
    }

    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={selectedChoice.id}
        isAnswered={true}
        submitResult={{
          attemptId: 'attempt-1',
          isCorrect: true,
          correctChoiceId: selectedChoice.id,
          explanationMd: 'Because.',
          referenceMd: null,
          choiceExplanations: [],
        }}
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
    const submitButton = Array.from(doc.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Submit',
    );
    const nextButton = Array.from(doc.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Next',
    );

    expect(submitButton).toBeUndefined();
    expect(nextButton).not.toBeUndefined();
    expect(nextButton?.className).toContain('bg-primary');
  });

  it('renders Next in the bottom bar on the last exam question before submission', () => {
    const question = createQuestionProps();
    const selectedChoice = question.choices[0];
    if (!selectedChoice) {
      throw new Error('Expected at least one choice');
    }
    const html = renderToStaticMarkup(
      <PracticeView
        sessionInfo={{
          sessionId: 'session-1',
          mode: 'exam',
          index: 1,
          total: 2,
          isMarkedForReview: false,
        }}
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={selectedChoice.id}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        canSubmit={false}
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
        onPreviousQuestion={() => undefined}
        hasPreviousQuestion={true}
        hasNextQuestion={false}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const actionBar = doc.querySelector('[data-testid="bottom-action-bar"]');
    if (!actionBar) throw new Error('Expected action bar');

    const labels = Array.from(actionBar.querySelectorAll('button')).map(
      (button) => (button.textContent ?? '').trim(),
    );

    expect(labels).toEqual(['Previous', 'Next', 'Mark for review']);
  });

  it('describes the last-question Next action for assistive tech', () => {
    const question = createQuestionProps();

    const html = renderToStaticMarkup(
      <PracticeView
        sessionInfo={{
          sessionId: 'session-1',
          mode: 'exam',
          index: 1,
          total: 2,
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
        canSubmit={false}
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
        onPreviousQuestion={() => undefined}
        hasPreviousQuestion={true}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const nextButton = Array.from(doc.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Next',
    );
    const descriptionId = nextButton?.getAttribute('aria-describedby');
    const description = descriptionId
      ? doc.getElementById(descriptionId)
      : null;

    expect(descriptionId).toBeTruthy();
    expect(description?.textContent).toBe('Opens review and submit.');
  });

  it('does not render Review answers for tutor mode after submit', () => {
    const question = createQuestionProps();
    const selectedChoice = question.choices[0];
    if (!selectedChoice) {
      throw new Error('Expected at least one choice');
    }

    const html = renderToStaticMarkup(
      <PracticeView
        sessionInfo={{
          sessionId: 'session-1',
          mode: 'tutor',
          index: 1,
          total: 2,
          isMarkedForReview: false,
        }}
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={selectedChoice.id}
        isAnswered={true}
        submitResult={{
          attemptId: 'attempt-1',
          isCorrect: true,
          correctChoiceId: selectedChoice.id,
          explanationMd: 'Because.',
          referenceMd: null,
          choiceExplanations: [],
        }}
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
        onPreviousQuestion={() => undefined}
        hasPreviousQuestion={true}
        hasNextQuestion={false}
      />,
    );

    expect(html).not.toContain('Review answers');
  });

  it('keeps Next in position 2 on non-final exam questions even when hasNextQuestion is false', () => {
    const question = createQuestionProps();
    const html = renderToStaticMarkup(
      <PracticeView
        sessionInfo={{
          sessionId: 'session-1',
          mode: 'exam',
          index: 0,
          total: 2,
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
        canSubmit={false}
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
        onPreviousQuestion={() => undefined}
        hasPreviousQuestion={false}
        hasNextQuestion={false}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const actionBar = doc.querySelector('[data-testid="bottom-action-bar"]');
    if (!actionBar) throw new Error('Expected action bar');

    const labels = Array.from(actionBar.querySelectorAll('button')).map(
      (button) => (button.textContent ?? '').trim(),
    );

    expect(labels).toEqual(['Next', 'Mark for review']);
    expect(html).not.toContain('Review answers');
  });

  it('does not render Submit in exam mode', () => {
    const question = createQuestionProps();

    const html = renderToStaticMarkup(
      <PracticeView
        sessionInfo={{
          sessionId: 'session-1',
          mode: 'exam',
          index: 1,
          total: 2,
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
        canSubmit={false}
        onEndSession={() => undefined}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
        onPreviousQuestion={() => undefined}
        hasPreviousQuestion={true}
        hasNextQuestion={false}
      />,
    );

    expect(html).not.toContain('>Submit<');
  });

  it('keeps exam action bar labels stable when a draft selection exists', () => {
    const question = createQuestionProps();
    const selectedChoice = question.choices[0];
    if (!selectedChoice) {
      throw new Error('Expected at least one choice');
    }

    const unansweredHtml = renderToStaticMarkup(
      <PracticeView
        sessionInfo={{
          sessionId: 'session-1',
          mode: 'exam',
          index: 1,
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
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
        onPreviousQuestion={() => undefined}
        hasPreviousQuestion={true}
        hasNextQuestion={true}
      />,
    );

    const draftedHtml = renderToStaticMarkup(
      <PracticeView
        sessionInfo={{
          sessionId: 'session-1',
          mode: 'exam',
          index: 1,
          total: 3,
          isMarkedForReview: false,
        }}
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={selectedChoice.id}
        isAnswered={false}
        submitResult={null}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
        onPreviousQuestion={() => undefined}
        hasPreviousQuestion={true}
        hasNextQuestion={true}
      />,
    );

    const unansweredDoc = new DOMParser().parseFromString(
      unansweredHtml,
      'text/html',
    );
    const draftedDoc = new DOMParser().parseFromString(
      draftedHtml,
      'text/html',
    );
    const unansweredActionBar = unansweredDoc.querySelector(
      '[data-testid="bottom-action-bar"]',
    );
    const draftedActionBar = draftedDoc.querySelector(
      '[data-testid="bottom-action-bar"]',
    );
    if (!unansweredActionBar || !draftedActionBar) {
      throw new Error('Expected action bar');
    }

    const unansweredLabels = Array.from(
      unansweredActionBar.querySelectorAll('button'),
    ).map((button) => (button.textContent ?? '').trim());
    const draftedLabels = Array.from(
      draftedActionBar.querySelectorAll('button'),
    ).map((button) => (button.textContent ?? '').trim());

    expect(unansweredLabels).toEqual(['Previous', 'Next', 'Mark for review']);
    expect(draftedLabels).toEqual(['Previous', 'Next', 'Mark for review']);
  });

  it('passes selected choice context to feedback after submit', () => {
    const question = createNextQuestion();
    const selectedChoice = question.choices[0];
    if (!selectedChoice) {
      throw new Error('Expected at least one choice');
    }
    const secondChoiceId = 'choice-2';

    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={selectedChoice.id}
        isAnswered={true}
        submitResult={{
          attemptId: 'attempt-1',
          isCorrect: false,
          correctChoiceId: secondChoiceId,
          explanationMd: 'Because.',
          referenceMd: null,
          choiceExplanations: [
            {
              choiceId: selectedChoice.id,
              displayLabel: selectedChoice.label,
              textMd: selectedChoice.textMd,
              isCorrect: false,
              explanationMd: 'Selected choice explanation.',
            },
            {
              choiceId: secondChoiceId,
              displayLabel: 'B',
              textMd: 'Choice B',
              isCorrect: true,
              explanationMd: 'Correct choice explanation.',
            },
          ],
        }}
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
    const feedbackCard = doc.querySelector('[role="status"]');
    const correctAnswerChip = Array.from(
      feedbackCard?.querySelectorAll('div, span') ?? [],
    ).find((element) => element.textContent?.trim() === 'Correct Answer');

    expect(html).not.toContain('Your answer');
    expect(correctAnswerChip?.textContent?.trim()).toBe('Correct Answer');
    expect(html).toContain('Choice A');
  });

  it('does not render feedback when submit correctness is unknown', () => {
    const question = createNextQuestion();
    const selectedChoice = question.choices[0];
    if (!selectedChoice) {
      throw new Error('Expected at least one choice');
    }

    const html = renderToStaticMarkup(
      <PracticeView
        loadState={{ status: 'ready' }}
        question={question}
        selectedChoiceId={selectedChoice.id}
        isAnswered={true}
        submitResult={{
          attemptId: 'attempt-1',
          isCorrect: null,
          correctChoiceId: null,
          explanationMd: 'Redacted explanation.',
          referenceMd: null,
          choiceExplanations: [],
        }}
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

    expect(html).not.toContain('Your answer');
    expect(html).not.toContain('Redacted explanation.');
    expect(html).not.toContain('>Bookmark<');
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
        canSubmit={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const questionPanel = doc.querySelector('div[tabindex="-1"]');

    expect(questionPanel).not.toBeNull();
    expect(questionPanel?.getAttribute('id')).toBe('practice-question-panel');
  });
});

describe('getBookmarkNotificationTransition', () => {
  it('resets last key and returns no notification when message is null', () => {
    const transition = getBookmarkNotificationTransition({
      message: null,
      version: 1,
      bookmarkStatus: 'idle',
      lastKey: '1:hi',
    });

    expect(transition.nextKey).toBeNull();
    expect(transition.notification).toBeNull();
  });

  it('returns a success notification for new messages when status is not error', () => {
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

  it('returns an error notification when bookmarkStatus is error', () => {
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

  it('returns no notification for duplicate messages', () => {
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
