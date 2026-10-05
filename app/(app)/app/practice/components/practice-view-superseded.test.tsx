// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { isNodeBefore, parseHtml } from '@/tests/shared/dom-helpers';
import { createQuestionProps } from './practice-view-test-helpers';

const fixtureSession1Id = crypto.randomUUID();

type PracticeViewModule = typeof import('./practice-view');
type PracticeViewProps = Parameters<PracticeViewModule['PracticeView']>[0];

let PracticeView: PracticeViewModule['PracticeView'];

beforeAll(async () => {
  PracticeView = (await import('./practice-view')).PracticeView;
});

const noop = () => undefined;
const SESSION_NOTICE =
  'This question has been updated since your session began.';

// ADR-021 phase 2b, Pattern Registry F-12: a session keeps the revision its
// item was bound to, and says so when a newer one became current.
function renderItem(input: {
  mode: 'tutor' | 'exam';
  superseded: boolean;
  answerKeyChanged?: boolean;
  answeredCorrectly?: boolean;
}): Document {
  const question = {
    ...createQuestionProps(),
    superseded: input.superseded,
    answerKeyChanged: input.answerKeyChanged ?? false,
  };
  const props: PracticeViewProps = {
    sessionInfo: {
      sessionId: fixtureSession1Id,
      mode: input.mode,
      deadlineAt: null,
      index: 0,
      total: 2,
      isMarkedForReview: false,
    },
    loadState: { status: 'ready' },
    question,
    selectedChoiceId: null,
    isAnswered: input.answeredCorrectly !== undefined,
    submitResult:
      input.answeredCorrectly === undefined
        ? null
        : {
            attemptId: crypto.randomUUID(),
            isCorrect: input.answeredCorrectly,
            correctChoiceId: question.choices[0]?.id ?? null,
            explanationMd: 'Because of the earlier key.',
            referenceMd: null,
            choiceExplanations: [],
          },
    isPending: false,
    bookmarkStatus: 'idle',
    isBookmarked: false,
    isMarkingForReview: false,
    onEndSession: noop,
    onTryAgain: noop,
    onToggleBookmark: noop,
    onToggleMarkForReview: noop,
    onSelectChoice: noop,
    onNextQuestion: noop,
    hasNextQuestion: true,
  };
  return parseHtml(renderToStaticMarkup(<PracticeView {...props} />));
}

function sessionNotice(doc: Document) {
  return (
    Array.from(doc.querySelectorAll('[role="status"]')).find((element) =>
      element.textContent?.includes(SESSION_NOTICE),
    ) ?? null
  );
}

describe('PracticeView: a session item updated since the session began', () => {
  it.each(['tutor', 'exam'] as const)(
    'shows the F-12 session notice above the stem in %s mode',
    (mode) => {
      const doc = renderItem({ mode, superseded: true });

      const notice = sessionNotice(doc);
      const stem = Array.from(doc.querySelectorAll('p')).find(
        (element) => element.textContent === 'Stem',
      );
      expect(notice).not.toBeNull();
      expect(stem).toBeDefined();
      expect(notice && stem ? isNodeBefore(notice, stem) : false).toBe(true);
      // The learner stays in the session: the notice links nowhere.
      expect(notice?.querySelector('a')).toBeNull();
    },
  );

  it('shows no notice for an item on the current revision', () => {
    expect(
      sessionNotice(renderItem({ mode: 'tutor', superseded: false })),
    ).toBe(null);
  });

  // ADR-022 Decision 4: the current revision keys another answer, so an
  // answer here is graded on a corrected key and won't be scored.
  it('says the answer was corrected, in place of the update notice, when its key changed', () => {
    const doc = renderItem({
      mode: 'tutor',
      superseded: true,
      answerKeyChanged: true,
    });

    const notice = Array.from(doc.querySelectorAll('[role="status"]')).find(
      (element) =>
        element.textContent?.includes(
          'The answer to this question was corrected after your session began.',
        ),
    );
    expect(notice?.getAttribute('data-tone')).toBe('caution');
    expect(sessionNotice(doc)).toBeNull();
  });

  // ADR-022 Amendment 2026-10-05 (DEBT-498): the answer won't be scored, so
  // its feedback is not graded against the earlier key.
  it('shows a tutor answer graded on a corrected key as not scored, without the earlier explanation', () => {
    const doc = renderItem({
      mode: 'tutor',
      superseded: true,
      answerKeyChanged: true,
      answeredCorrectly: true,
    });

    expect(doc.querySelector('[data-testid="verdict-pill"]')?.textContent).toBe(
      'Not scored',
    );
    expect(doc.body.textContent).not.toContain('Because of the earlier key.');
  });

  it('keeps the grade of a tutor answer on an unchanged key', () => {
    const doc = renderItem({
      mode: 'tutor',
      superseded: true,
      answeredCorrectly: true,
    });

    expect(doc.querySelector('[data-testid="verdict-pill"]')?.textContent).toBe(
      'Correct',
    );
  });
});
