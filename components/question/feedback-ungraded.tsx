import { Markdown } from '@/components/markdown/markdown';
import { Card } from '@/components/ui/card';
import type { UngradedReason } from '@/src/domain/services';
import type { FeedbackChoiceExplanation } from './feedback';
import { FeedbackReference } from './feedback-reference';
import { KEY_NAME, NOT_SCORED, YOUR_ANSWER } from './ungraded-review';

// ADR-022 Amendment 2026-10-05 (DEBT-498): what the score leaves out, the
// page does not grade. Pattern Registry F-1, F-5 and F-8 give the neutral
// forms used here in place of the verdict and its colors.

const NEUTRAL_CHIP =
  'inline-flex rounded-full bg-muted px-3 py-1 text-sm font-semibold text-foreground dark:bg-foreground/10';
const NEUTRAL_CARD =
  'rounded-xl border border-border/60 bg-background/50 p-4 dark:border-foreground/40';
const NEUTRAL_CHOICE_BADGE =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-foreground/20 bg-foreground/[0.06] text-xs font-semibold leading-none text-foreground dark:border-foreground/60 dark:bg-foreground/20';

export type UngradedFeedbackProps = {
  ungraded: UngradedReason;
  explanationMd: string | null;
  referenceMd: string | null;
  choiceExplanations: readonly FeedbackChoiceExplanation[];
  selectedChoiceId: string | null;
};

function hasExplanation(choice: FeedbackChoiceExplanation): boolean {
  return (
    typeof choice.explanationMd === 'string' &&
    choice.explanationMd.trim().length > 0
  );
}

function ChoiceCard({
  choice,
  explanationMd,
}: {
  choice: FeedbackChoiceExplanation;
  explanationMd: string | null;
}) {
  return (
    <div className={`mt-2 ${NEUTRAL_CARD}`}>
      <div className="flex items-start gap-3">
        <div className={NEUTRAL_CHOICE_BADGE}>{choice.displayLabel}</div>
        <Markdown
          content={choice.textMd}
          className="text-base text-foreground"
        />
      </div>
      {explanationMd ? (
        <Markdown
          content={explanationMd}
          className="mt-2 text-base text-foreground"
        />
      ) : null}
    </div>
  );
}

function InDoubtSections({
  explanationMd,
  choiceExplanations,
  selectedChoiceId,
}: Omit<UngradedFeedbackProps, 'ungraded' | 'referenceMd'>) {
  const keyedChoice =
    choiceExplanations.find((choice) => choice.isCorrect) ?? null;
  const yourChoice =
    selectedChoiceId && selectedChoiceId !== keyedChoice?.choiceId
      ? (choiceExplanations.find(
          (choice) => choice.choiceId === selectedChoiceId,
        ) ?? null)
      : null;
  const otherChoices = choiceExplanations.filter(
    (choice) =>
      !choice.isCorrect &&
      choice.choiceId !== yourChoice?.choiceId &&
      hasExplanation(choice),
  );

  return (
    <>
      {yourChoice ? (
        <div className="mt-6">
          <span className={NEUTRAL_CHIP}>{YOUR_ANSWER}</span>
          <ChoiceCard
            choice={yourChoice}
            explanationMd={yourChoice.explanationMd}
          />
        </div>
      ) : null}
      <div className={yourChoice ? 'mt-4' : 'mt-6'}>
        <span className={NEUTRAL_CHIP}>{KEY_NAME.in_doubt}</span>
        {keyedChoice ? (
          <ChoiceCard choice={keyedChoice} explanationMd={explanationMd} />
        ) : (
          <div className={`mt-2 ${NEUTRAL_CARD}`}>
            {explanationMd ? (
              <Markdown
                content={explanationMd}
                className="text-base text-foreground"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Explanation not available.
              </p>
            )}
          </div>
        )}
      </div>
      {otherChoices.length > 0 ? (
        <div className="mt-4">
          <span className={NEUTRAL_CHIP}>Other answers</span>
          {otherChoices.map((choice) => (
            <ChoiceCard
              key={choice.choiceId}
              choice={choice}
              explanationMd={choice.explanationMd}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

export function UngradedFeedback({
  ungraded,
  explanationMd,
  referenceMd,
  choiceExplanations,
  selectedChoiceId,
}: UngradedFeedbackProps) {
  return (
    <Card role="status">
      <span data-testid="verdict-pill" className={`self-start ${NEUTRAL_CHIP}`}>
        {NOT_SCORED}
      </span>
      {ungraded === 'key_corrected' ? (
        // The explanation and its reference argue for the superseded key.
        <p className="mt-6 text-base text-foreground">
          The explanation was written for the answer before the correction, so
          it isn't shown.
        </p>
      ) : (
        <>
          <InDoubtSections
            explanationMd={explanationMd}
            choiceExplanations={choiceExplanations}
            selectedChoiceId={selectedChoiceId}
          />
          {referenceMd ? <FeedbackReference referenceMd={referenceMd} /> : null}
        </>
      )}
    </Card>
  );
}
