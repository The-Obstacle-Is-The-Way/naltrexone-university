// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { createNextQuestion } from '@/src/application/test-helpers/create-next-question';
import { createQuestionProps } from './practice-view-test-helpers';

type PracticeViewModule = typeof import('./practice-view');

let PracticeView: PracticeViewModule['PracticeView'];

beforeAll(async () => {
  PracticeView = (await import('./practice-view')).PracticeView;
});

describe('PracticeView bookmarks', () => {
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
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
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
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
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
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
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
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    expect(html).toContain('>Bookmark<');
  });

  it('disables the tutor bookmark button when bookmarks are unavailable', () => {
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
        bookmarkStatus="error"
        isBookmarked={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onToggleMarkForReview={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const bookmarkButton = Array.from(doc.querySelectorAll('button')).find(
      (button) => button.textContent === 'Bookmark',
    );

    expect(bookmarkButton).not.toBeNull();
    expect(bookmarkButton?.hasAttribute('disabled')).toBe(true);
    expect(html).toContain('Bookmarks unavailable.');
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
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
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
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />,
    );

    expect(html).toContain('>Bookmark<');
  });
});
