// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { createQuestionProps } from './practice-view-test-helpers';

type PracticeViewModule = typeof import('./practice-view');

let PracticeView: PracticeViewModule['PracticeView'];

beforeAll(async () => {
  PracticeView = (await import('./practice-view')).PracticeView;
});

describe('PracticeView exam actions', () => {
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

  it('renders Review & Submit in the bottom bar on the last exam question before submission', () => {
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

    expect(labels).toEqual(['Previous', 'Review & Submit', 'Mark for review']);
  });

  it('groups active-exam navigation separately from the mark-for-review affordance', () => {
    const question = createQuestionProps();

    const html = renderToStaticMarkup(
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
        isMarkingForReview={false}
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
        hasNextQuestion={true}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const primaryGroup = doc.querySelector(
      '[data-testid="exam-action-primary-group"]',
    );
    const secondaryGroup = doc.querySelector(
      '[data-testid="exam-action-secondary-group"]',
    );

    expect(
      Array.from(primaryGroup?.querySelectorAll('button') ?? []).map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(['Previous', 'Next']);
    expect(
      Array.from(secondaryGroup?.querySelectorAll('button') ?? []).map(
        (button) => button.textContent?.trim(),
      ),
    ).toEqual(['Mark for review']);
  });

  it('describes the last-question Review & Submit action for assistive tech', () => {
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
      (button) => button.textContent?.trim() === 'Review & Submit',
    );
    const descriptionId = nextButton?.getAttribute('aria-describedby');
    const description = descriptionId
      ? doc.getElementById(descriptionId)
      : null;

    expect(descriptionId).toBeTruthy();
    expect(description?.textContent).toBe('Opens review and submit.');
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
});
