import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import {
  createReviewResponse,
  createReviewRow,
} from '../hooks/practice-session-page-model.browser.fixtures';
import { PracticeSessionPageView } from './practice-session-page-view';
import { noop } from './practice-session-page-view-test-helpers';

const fixtureSessionId = crypto.randomUUID();
const fixtureQ1Id = crypto.randomUUID();
const fixtureQ2Id = crypto.randomUUID();
const fixtureQ3Id = crypto.randomUUID();

// ADR-021 §3, ADR-022 Decision 5, Pattern Registry F-11: a session item whose
// question became unavailable after the session began shows the notice, and
// the learner can always move on: to the next available question, or to the
// session's end.
function renderUnavailableItem(input: {
  mode: 'tutor' | 'exam';
  unavailableQuestionId: string;
  availability?: 'withdrawn' | 'retired';
  countsIfEndedNow?: boolean;
  index: number;
  availableAfter: boolean;
  handlers: {
    onEndSession: () => void;
    onNextQuestion: () => void;
    onNavigateQuestion: (questionId: string) => void;
  };
}) {
  const ids = [fixtureQ1Id, fixtureQ2Id, fixtureQ3Id];
  return render(
    <PracticeSessionPageView
      summary={null}
      review={null}
      navigator={createReviewResponse({
        mode: input.mode,
        totalCount: 3,
        answeredCount: 1,
        markedCount: 0,
        rows: ids.map((questionId, index) =>
          createReviewRow({
            questionId,
            order: index + 1,
            isAvailable:
              questionId !== input.unavailableQuestionId &&
              (index < input.index || input.availableAfter),
            isAnswered: index === 0,
          }),
        ),
      })}
      sessionInfo={{
        sessionId: fixtureSessionId,
        mode: input.mode,
        deadlineAt: null,
        index: input.index,
        total: 3,
        isMarkedForReview: false,
      }}
      loadState={{ status: 'ready' }}
      question={null}
      unavailableItem={{
        questionId: input.unavailableQuestionId,
        availability: input.availability ?? 'withdrawn',
        countsIfEndedNow: input.countsIfEndedNow ?? false,
      }}
      selectedChoiceId={null}
      isAnswered={false}
      submitResult={null}
      isPending={false}
      bookmarkStatus="idle"
      isBookmarked={false}
      onTryAgain={noop}
      onToggleBookmark={noop}
      onToggleMarkForReview={noop}
      onSelectChoice={noop}
      {...input.handlers}
    />,
  );
}

function handlers() {
  return {
    onEndSession: vi.fn(),
    onNextQuestion: vi.fn(),
    onNavigateQuestion: vi.fn(),
  };
}

// ADR-022 Decision 5, as amended: the notice says the item won't count only
// when it won't; a tutor answer already given on a retired question will.
test.each([
  [false, true],
  [true, false],
])(
  'says the item will not count only when it will not (counts if ended now: %s)',
  async (countsIfEndedNow, saysWontCount) => {
    const screen = await renderUnavailableItem({
      mode: 'tutor',
      unavailableQuestionId: fixtureQ2Id,
      availability: 'retired',
      countsIfEndedNow,
      index: 1,
      availableAfter: true,
      handlers: handlers(),
    });

    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent(
        'This question was retired from the bank after your session began.',
      );
    if (saysWontCount) {
      await expect
        .element(screen.getByRole('status'))
        .toHaveTextContent("It won't count toward your score.");
    } else {
      await expect
        .element(screen.getByRole('status'))
        .not.toHaveTextContent('count toward your score');
    }
  },
);

test('moves on from an unavailable item to the next and previous available questions by id', async () => {
  const on = handlers();
  const screen = await renderUnavailableItem({
    mode: 'exam',
    unavailableQuestionId: fixtureQ2Id,
    index: 1,
    availableAfter: true,
    handlers: on,
  });

  await expect
    .element(
      screen.getByText('This question was withdrawn after your session began.'),
    )
    .toBeVisible();
  await screen.getByRole('button', { name: 'Next' }).click();
  expect(on.onNavigateQuestion).toHaveBeenLastCalledWith(fixtureQ3Id);
  await screen.getByRole('button', { name: 'Previous' }).click();
  expect(on.onNavigateQuestion).toHaveBeenLastCalledWith(fixtureQ1Id);
  expect(on.onNextQuestion).not.toHaveBeenCalled();
});

test.each([
  ['exam', 'Review & Submit'],
  ['tutor', 'End session'],
] as const)(
  'ends a %s session from an unavailable last item with %s',
  async (mode, label) => {
    const on = handlers();
    const screen = await renderUnavailableItem({
      mode,
      unavailableQuestionId: fixtureQ3Id,
      index: 2,
      availableAfter: false,
      handlers: on,
    });

    await screen
      .getByTestId('bottom-action-bar')
      .getByRole('button', { name: label })
      .click();
    expect(on.onEndSession).toHaveBeenCalledTimes(1);
    expect(on.onNextQuestion).not.toHaveBeenCalled();
  },
);
