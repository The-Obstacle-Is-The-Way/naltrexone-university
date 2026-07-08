import { useState } from 'react';
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { PracticeView } from './practice-view';

const fixtureSession1Id = crypto.randomUUID();
const fixtureQuestion1Id = crypto.randomUUID();
const fixtureChoiceAId = crypto.randomUUID();

function TutorCommitFocusHarness() {
  const [submitResult, setSubmitResult] = useState<{
    attemptId: string;
    isCorrect: boolean;
    correctChoiceId: string;
    explanationMd: string;
    referenceMd: null;
    choiceExplanations: [];
  } | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() =>
          setSubmitResult({
            attemptId: fixtureQuestion1Id,
            isCorrect: true,
            correctChoiceId: fixtureChoiceAId,
            explanationMd: 'Because.',
            referenceMd: null,
            choiceExplanations: [],
          })
        }
      >
        complete-commit
      </button>
      <PracticeView
        sessionInfo={{
          sessionId: fixtureSession1Id,
          mode: 'tutor',

          deadlineAt: null,

          index: 0,
          total: 3,
          isMarkedForReview: false,
        }}
        loadState={{ status: 'ready' }}
        question={{
          questionId: fixtureQuestion1Id,
          slug: 'question-1',
          stemMd: 'What is the next best step?',
          difficulty: 'easy',
          choices: [
            {
              id: fixtureChoiceAId,
              label: 'A',
              textMd: 'Option A',
              sortOrder: 1,
            },
          ],
          session: null,
        }}
        selectedChoiceId={fixtureChoiceAId}
        isAnswered={submitResult !== null}
        submitResult={submitResult}
        isPending={false}
        bookmarkStatus="idle"
        isBookmarked={false}
        onTryAgain={() => undefined}
        onToggleBookmark={() => undefined}
        onSelectChoice={() => undefined}
        onNextQuestion={() => undefined}
      />
    </>
  );
}

test('moves focus to the answer feedback when a commit completes', async () => {
  const screen = await render(<TutorCommitFocusHarness />);

  await screen.getByRole('button', { name: 'complete-commit' }).click();

  const feedbackRegion = screen.getByTestId('answer-feedback-region');
  await expect.element(feedbackRegion).toBeInTheDocument();
  await expect.element(feedbackRegion).toHaveFocus();
});
