'use client';

import { Markdown } from '@/components/markdown/Markdown';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type FeedbackChoiceExplanation = {
  choiceId: string;
  displayLabel: string;
  textMd: string;
  isCorrect: boolean;
  explanationMd: string | null;
};

type IncorrectChoiceWithExplanation = FeedbackChoiceExplanation & {
  isCorrect: false;
  explanationMd: string;
};

function isIncorrectChoiceWithExplanation(
  choice: FeedbackChoiceExplanation,
): choice is IncorrectChoiceWithExplanation {
  return (
    !choice.isCorrect &&
    typeof choice.explanationMd === 'string' &&
    choice.explanationMd.trim().length > 0
  );
}

export type FeedbackProps = {
  isCorrect: boolean;
  explanationMd: string | null;
  referenceMd?: string | null;
  choiceExplanations?: readonly FeedbackChoiceExplanation[];
  selectedChoiceId?: string | null;
};

type CorrectAnswerSectionProps = {
  sectionClassName: string;
  correctChoice: FeedbackChoiceExplanation | null;
  explanationMd: string | null;
};

function getExplanationClassName(hasCorrectChoice: boolean): string {
  return hasCorrectChoice ? 'mt-2 text-sm' : 'text-sm';
}

function getFallbackExplanationClassName(hasCorrectChoice: boolean): string {
  return cn(getExplanationClassName(hasCorrectChoice), 'text-muted-foreground');
}

function CorrectAnswerSection({
  sectionClassName,
  correctChoice,
  explanationMd,
}: CorrectAnswerSectionProps) {
  const hasCorrectChoice = correctChoice !== null;
  const explanationClassName = getExplanationClassName(hasCorrectChoice);
  const fallbackExplanationClassName =
    getFallbackExplanationClassName(hasCorrectChoice);

  return (
    <div className={sectionClassName}>
      <div className="text-sm font-medium text-foreground">
        {correctChoice ? 'Correct answer' : 'Explanation'}
      </div>
      <div className="mt-2 rounded-xl border border-success/60 bg-success/5 p-4">
        {correctChoice ? (
          <div className="flex items-start gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold leading-none text-foreground dark:border-foreground/60 dark:bg-foreground/20">
              {correctChoice.displayLabel}
            </div>
            <Markdown
              content={correctChoice.textMd}
              className="text-base text-foreground"
            />
          </div>
        ) : null}
        {explanationMd ? (
          <Markdown content={explanationMd} className={explanationClassName} />
        ) : (
          <p className={fallbackExplanationClassName}>
            Explanation not available.
          </p>
        )}
      </div>
    </div>
  );
}

export function Feedback({
  isCorrect,
  explanationMd,
  referenceMd,
  choiceExplanations = [],
  selectedChoiceId = null,
}: FeedbackProps) {
  const correctChoice =
    choiceExplanations.find((choice) => choice.isCorrect) ?? null;
  const visibleChoiceExplanations = choiceExplanations.filter(
    isIncorrectChoiceWithExplanation,
  );
  const hasMissingIncorrectExplanation = choiceExplanations.some(
    (choice) =>
      !choice.isCorrect &&
      (choice.explanationMd === null ||
        choice.explanationMd.trim().length === 0),
  );
  const shouldRenderChoiceExplanations =
    !hasMissingIncorrectExplanation && visibleChoiceExplanations.length > 0;
  const userChoice =
    !isCorrect && selectedChoiceId
      ? (choiceExplanations.find(
          (choice) => choice.choiceId === selectedChoiceId && !choice.isCorrect,
        ) ?? null)
      : null;
  const otherWrongChoices = !isCorrect
    ? visibleChoiceExplanations.filter(
        (choice) => choice.choiceId !== userChoice?.choiceId,
      )
    : visibleChoiceExplanations;
  const shouldRenderOtherWrongChoices =
    !isCorrect &&
    shouldRenderChoiceExplanations &&
    otherWrongChoices.length > 0;

  return (
    <Card role="status">
      <span
        className={cn(
          'inline-flex self-start rounded-full px-3 py-1 text-sm font-semibold',
          isCorrect && 'bg-success text-success-foreground dark:bg-success/60',
          !isCorrect &&
            'bg-destructive text-destructive-foreground dark:bg-destructive/60',
        )}
      >
        {isCorrect ? 'Correct' : 'Incorrect'}
      </span>

      {isCorrect ? (
        <>
          <CorrectAnswerSection
            sectionClassName="mt-6"
            correctChoice={correctChoice}
            explanationMd={explanationMd}
          />

          {shouldRenderChoiceExplanations ? (
            <div className="mt-4">
              <div className="text-sm font-medium text-foreground">
                Why other answers are wrong:
              </div>
              <div className="mt-2 space-y-3">
                {visibleChoiceExplanations.map((choice) => (
                  <div
                    key={choice.choiceId}
                    className="rounded-xl border border-border/60 bg-background/50 p-4 dark:border-foreground/40"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold leading-none text-foreground dark:border-foreground/60 dark:bg-foreground/20">
                        {choice.displayLabel}
                      </div>
                      <Markdown
                        content={choice.textMd}
                        className="text-base text-foreground"
                      />
                    </div>
                    <Markdown
                      content={choice.explanationMd}
                      className="mt-2 text-sm text-muted-foreground"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          {userChoice ? (
            <div className="mt-6">
              <div className="text-sm font-medium text-foreground">
                Your answer
              </div>
              <div className="mt-2 rounded-xl border border-destructive bg-destructive/5 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold leading-none text-foreground dark:border-foreground/60 dark:bg-foreground/20">
                    {userChoice.displayLabel}
                  </div>
                  <Markdown
                    content={userChoice.textMd}
                    className="text-base text-foreground"
                  />
                </div>
                {userChoice.explanationMd ? (
                  <Markdown
                    content={userChoice.explanationMd}
                    className="mt-2 text-sm"
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          <CorrectAnswerSection
            sectionClassName={userChoice ? 'mt-4' : 'mt-6'}
            correctChoice={correctChoice}
            explanationMd={explanationMd}
          />

          {shouldRenderOtherWrongChoices ? (
            <div className="mt-4">
              <div className="text-sm font-medium text-foreground">
                Why other answers are wrong:
              </div>
              <div className="mt-2 space-y-3">
                {otherWrongChoices.map((choice) => (
                  <div
                    key={choice.choiceId}
                    className="rounded-xl border border-border/60 bg-background/50 p-4 dark:border-foreground/40"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold leading-none text-foreground dark:border-foreground/60 dark:bg-foreground/20">
                        {choice.displayLabel}
                      </div>
                      <Markdown
                        content={choice.textMd}
                        className="text-base text-foreground"
                      />
                    </div>
                    <Markdown
                      content={choice.explanationMd}
                      className="mt-2 text-sm text-muted-foreground"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}

      {referenceMd ? (
        <div className="mt-4 border-t border-border/40 pt-3 dark:border-foreground/40">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reference
          </div>
          <Markdown content={referenceMd} className="mt-1 text-xs" />
        </div>
      ) : null}
    </Card>
  );
}
