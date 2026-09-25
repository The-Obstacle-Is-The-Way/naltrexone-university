// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createChoice, createQuestion } from '@/src/domain/test-helpers';
import { findAnchorByHref } from '@/tests/shared/dom-helpers';
import {
  createBaseProps,
  fixtureSession123Id,
  getBottomActionBar,
  sharedSessionNavigation,
} from './question-page-client-test-helpers';

const fixtureAttempt1Id = crypto.randomUUID();
const fixtureChoiceAId = crypto.randomUUID();
const fixtureChoiceBId = crypto.randomUUID();
const fixtureQuestion1Id = crypto.randomUUID();
const fixtureQuestion1Id2 = crypto.randomUUID();

vi.mock('next/link', () => ({
  default: (props: Record<string, unknown>) => <a {...props} />,
}));

type QuestionPageClientModule = typeof import('./question-page-client');

let QuestionView: QuestionPageClientModule['QuestionView'];
let parseHistorySequence: QuestionPageClientModule['parseHistorySequence'];

beforeAll(async () => {
  ({ QuestionView, parseHistorySequence } = await import(
    './question-page-client'
  ));
});

describe('QuestionView', () => {
  it('renders a Back to Dashboard utility link', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={null}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backLink = doc.querySelector('a[href="/app/dashboard"]');

    expect(backLink?.textContent?.trim()).toBe('Back to Dashboard');
  });

  it('renders a single Back to History link for history origin', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: false,
          correctChoiceId: 'c1',
          explanationMd: 'Explanation',
          referenceMd: null,
          choiceExplanations: [],
        }}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        origin="history"
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const historyBackLinks = Array.from(doc.querySelectorAll('a')).filter(
      (link) => link.textContent?.trim() === 'Back to History',
    );
    expect(historyBackLinks).toHaveLength(1);
    const bottomBar = getBottomActionBar(doc);
    if (!bottomBar) {
      throw new Error('Expected bottom action bar');
    }
    expect(bottomBar.textContent).toContain('Back to History');
    expect(html).toContain('Reviewing a question from your history.');
  });

  it('prefers historyHref when origin=history and historyHref is present', () => {
    const historyHref = '/app/history?tab=questions&offset=20&limit=20';

    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        origin="history"
        historyHref={historyHref}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backLink = Array.from(doc.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Back to History'),
    );

    expect(backLink?.getAttribute('href')).toBe(historyHref);
  });

  it('ignores invalid historyHref values when origin=history', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        origin="history"
        historyHref="https://example.com/phish"
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backLink = Array.from(doc.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Back to History'),
    );

    expect(backLink?.getAttribute('href')).toBe('/app/history?tab=questions');
  });

  it('uses a session-aware back link when origin=practice and sessionId is present', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        origin="practice"
        sessionId={fixtureSession123Id}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backLink = doc.querySelector(
      `a[href="/app/practice/${fixtureSession123Id}"]`,
    );

    expect(backLink?.textContent?.trim()).toBe('Back to Session');
  });

  it('uses a summary-aware back link when origin=summary and sessionId is present', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        origin="summary"
        sessionId={fixtureSession123Id}
        sessionNavigation={{
          ...sharedSessionNavigation,
          from: 'summary',
        }}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const summaryLinks = Array.from(doc.querySelectorAll('a')).filter(
      (link) => link.textContent?.trim() === 'Back to Summary',
    );

    expect(summaryLinks).toHaveLength(2);
    for (const link of summaryLinks) {
      expect(link.getAttribute('href')).toBe(
        `/app/practice/${fixtureSession123Id}`,
      );
    }
    expect(html).toContain('Reviewing a question from your session summary.');
  });

  it('uses a sessions-tab back link when origin=history and sessionId is present', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        {...createBaseProps()}
        origin="history"
        sessionId={fixtureSession123Id}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backLink = findAnchorByHref(doc, '/app/history?tab=sessions');

    expect(backLink?.textContent?.trim()).toBe('Back to History');
    expect(findAnchorByHref(doc, '/app/history?tab=questions')).toBeNull();
  });

  it('renders an origin-aware back link when origin=bookmarks', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={null}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        origin="bookmarks"
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const backLink = doc.querySelector('a[href="/app/bookmarks"]');

    expect(backLink?.textContent?.trim()).toBe('Back to Bookmarks');
    expect(html).toContain('Reviewing a bookmarked question.');
  });

  it('uses origin-aware post-submit back actions', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: false,
          correctChoiceId: 'c1',
          explanationMd: 'Explanation',
          referenceMd: null,
          choiceExplanations: [],
        }}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        origin="practice"
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(
      doc.querySelector('a[href="/app/practice"]')?.textContent?.trim(),
    ).toBe('Back to Practice');
    expect(html).toContain('Review a question from your practice history.');
  });

  it('renders Feedback when submitResult is pre-populated (review mode)', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={null}
        selectedChoiceId={null}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: true,
          correctChoiceId: 'c1',
          explanationMd: 'Explanation',
          referenceMd: null,
          choiceExplanations: [],
        }}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        origin="history"
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    expect(html).toContain('Correct');
    expect(html).toContain('Explanation');
  });

  it('renders Loading review while previous attempt is hydrating', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={{
          questionId: fixtureQuestion1Id2,
          slug: 'q1',
          stemMd: 'Question stem',
          difficulty: 'easy',
          choices: [{ id: 'c1', label: 'A', textMd: 'Choice A' }],
        }}
        selectedChoiceId={null}
        submitResult={null}
        sessionNavigation={null}
        canSubmit={true}
        isPending={false}
        mode="review"
        origin="dashboard"
        isLoadingPreviousAttempt={true}
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    expect(html).toContain('Loading review…');
    expect(html).not.toContain('Loading question…');
    expect(html).not.toContain('Question stem');
    expect(html).not.toContain('data-testid="bottom-action-bar"');
    expect(html).not.toContain('>Submit<');
  });

  it('renders question content when previous attempt hydration is complete', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={{
          questionId: fixtureQuestion1Id2,
          slug: 'q1',
          stemMd: 'Question stem',
          difficulty: 'easy',
          choices: [{ id: 'c1', label: 'A', textMd: 'Choice A' }],
        }}
        selectedChoiceId={null}
        submitResult={null}
        sessionNavigation={null}
        canSubmit={true}
        isPending={false}
        mode="review"
        origin="dashboard"
        isLoadingPreviousAttempt={false}
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    expect(html).not.toContain('Loading review…');
    expect(html).toContain('Question stem');
    expect(html).toContain('data-testid="bottom-action-bar"');
    expect(html).toContain('>Submit<');
  });

  it('renders feedback labels, correct answer details, and selected-answer badge', () => {
    const choiceA = createChoice({
      id: fixtureChoiceAId,
      questionId: fixtureQuestion1Id,
      label: 'A',
      textMd: 'Choice A text',
      sortOrder: 1,
    });
    const choiceB = createChoice({
      id: fixtureChoiceBId,
      questionId: fixtureQuestion1Id,
      label: 'B',
      textMd: 'Choice B text',
      sortOrder: 2,
    });
    const question = createQuestion({
      id: fixtureQuestion1Id,
      slug: 'question-1',
      stemMd: 'Question stem',
      difficulty: 'easy',
      choices: [choiceA, choiceB],
    });

    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={{
          questionId: question.id,
          slug: question.slug,
          stemMd: question.stemMd,
          difficulty: question.difficulty,
          choices: question.choices.map((choice) => ({
            id: choice.id,
            label: choice.label,
            textMd: choice.textMd,
          })),
        }}
        selectedChoiceId={choiceA.id}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isCorrect: false,
          correctChoiceId: choiceB.id,
          explanationMd: 'Overall explanation',
          referenceMd: null,
          choiceExplanations: [
            {
              choiceId: choiceA.id,
              displayLabel: 'A',
              textMd: 'Choice A text',
              isCorrect: false,
              explanationMd: 'A explanation',
            },
            {
              choiceId: choiceB.id,
              displayLabel: 'B',
              textMd: 'Choice B text',
              isCorrect: true,
              explanationMd: 'B explanation',
            },
          ],
        }}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const feedbackCard = doc.querySelector('[role="status"]');
    const yourAnswerCard = Array.from(
      feedbackCard?.querySelectorAll('div') ?? [],
    ).find((div) => {
      const className = div.getAttribute('class') ?? '';
      return (
        className.includes('border-destructive') &&
        className.includes('bg-destructive/5')
      );
    });
    const correctAnswerHeading = Array.from(
      feedbackCard?.querySelectorAll('div, span') ?? [],
    ).find((element) => element.textContent?.trim() === 'Correct Answer');

    const correctAnswerCard = correctAnswerHeading?.nextElementSibling;

    const yourAnswerBadge = Array.from(
      yourAnswerCard?.querySelectorAll('div') ?? [],
    ).find((div) => {
      const className = div.getAttribute('class') ?? '';
      return (
        className.includes('rounded-full') && div.textContent?.trim() === 'A'
      );
    });
    const correctAnswerBadge = Array.from(
      correctAnswerCard?.querySelectorAll('div') ?? [],
    ).find((div) => {
      const className = div.getAttribute('class') ?? '';
      return (
        className.includes('rounded-full') && div.textContent?.trim() === 'B'
      );
    });

    expect(yourAnswerCard).not.toBeNull();
    expect(correctAnswerHeading?.textContent?.trim()).toBe('Correct Answer');
    expect(correctAnswerCard).not.toBeNull();
    expect(yourAnswerBadge).not.toBeUndefined();
    expect(correctAnswerBadge).not.toBeUndefined();
    expect(html).toContain('Choice A text');
    expect(html).toContain('Choice B text');
    expect(html).toContain('A explanation');
    expect(html).not.toContain('Your answer');
  });

  it('renders omitted review attempts as incorrect with no selected answer', () => {
    const html = renderToStaticMarkup(
      <QuestionView
        loadState={{ status: 'ready' }}
        question={{
          questionId: fixtureQuestion1Id,
          slug: 'question-1',
          stemMd: 'Question stem',
          difficulty: 'easy',
          choices: [
            { id: fixtureChoiceAId, label: 'A', textMd: 'Choice A text' },
            { id: fixtureChoiceBId, label: 'B', textMd: 'Choice B text' },
          ],
        }}
        selectedChoiceId={null}
        submitResult={{
          attemptId: fixtureAttempt1Id,
          isOmitted: true,
          isCorrect: false,
          correctChoiceId: fixtureChoiceBId,
          explanationMd: 'Overall explanation',
          referenceMd: null,
          choiceExplanations: [
            {
              choiceId: fixtureChoiceAId,
              displayLabel: 'A',
              textMd: 'Choice A text',
              isCorrect: false,
              explanationMd: 'A explanation',
            },
            {
              choiceId: fixtureChoiceBId,
              displayLabel: 'B',
              textMd: 'Choice B text',
              isCorrect: true,
              explanationMd: 'B explanation',
            },
          ],
        }}
        sessionNavigation={null}
        canSubmit={false}
        isPending={false}
        mode="review"
        origin="history"
        onTryAgain={() => undefined}
        onSelectChoice={() => undefined}
        onSubmit={() => undefined}
        onReattempt={() => undefined}
      />,
    );

    expect(html).toContain('Incorrect');
    expect(html).toContain('No answer selected.');
    expect(html).toContain('Correct Answer');
    expect(html).not.toContain('Your answer');
  });
});

describe('parseHistorySequence', () => {
  it.each([
    ['undefined', undefined],
    ['empty string', ''],
  ] as const)('returns null for falsy input (%s)', (_label, input) => {
    expect(parseHistorySequence(input)).toBeNull();
  });

  it('returns null when all slugs are invalid', () => {
    expect(parseHistorySequence('../dashboard,./history,/app/path')).toBeNull();
  });

  it('filters out malformed slugs and keeps valid history sequence items', () => {
    expect(parseHistorySequence('q-1, ../dashboard ,q-2,,q_3')).toEqual([
      'q-1',
      'q-2',
    ]);
  });

  it('caps result at MAX_HISTORY_SEQUENCE_LENGTH (20) slugs', () => {
    const input = Array.from({ length: 25 }, (_, i) => `q-${i + 1}`).join(',');
    const result = parseHistorySequence(input);
    expect(result).toHaveLength(20);
    expect(result?.[0]).toBe('q-1');
    expect(result?.[19]).toBe('q-20');
  });
});
