'use client';

import type * as React from 'react';
import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useNotification } from '@/components/ui/notification-provider';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { MAX_QUESTION_FEEDBACK_COMMENT_LENGTH } from '@/src/adapters/shared/validation-limits';
import {
  AllQuestionFeedbackCategories,
  type QuestionFeedbackCategory,
} from '@/src/domain/value-objects';

const CATEGORY_LABELS: Record<QuestionFeedbackCategory, string> = {
  incorrect_answer: 'Incorrect answer',
  ambiguous_wording: 'Ambiguous wording',
  typo_formatting: 'Typo or formatting',
  outdated_reference: 'Outdated reference',
  other: 'Other',
};

const CATEGORY_VALIDATION_MESSAGE = 'Choose a category to send your feedback.';
const NEAR_LIMIT_REMAINING_COUNT = 100;

export type QuestionReportSubmitInput = {
  category: QuestionFeedbackCategory;
  comment: string | null;
};

export type QuestionReportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitReport: (input: QuestionReportSubmitInput) => Promise<boolean>;
  disabled?: boolean;
};

export type QuestionReportDialogFormProps = {
  category: QuestionFeedbackCategory | null;
  comment: string;
  validationError: string | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onCategoryChange: (category: QuestionFeedbackCategory) => void;
  onCommentChange: (comment: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  firstCategoryInputRef?: React.Ref<HTMLInputElement>;
};

export function QuestionReportDialogForm({
  category,
  comment,
  validationError,
  isSubmitting,
  onCancel,
  onCategoryChange,
  onCommentChange,
  onSubmit,
  firstCategoryInputRef,
}: QuestionReportDialogFormProps) {
  const errorId = useId();
  const counterId = useId();
  const remainingCharacters =
    MAX_QUESTION_FEEDBACK_COMMENT_LENGTH - comment.length;
  const isNearLimit = remainingCharacters <= NEAR_LIMIT_REMAINING_COUNT;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Give feedback</DialogTitle>
        <DialogDescription>
          Spotted an issue or have a suggestion? This goes to our medical
          editors and won't affect your score.
        </DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={onSubmit}>
        <fieldset
          className="space-y-2"
          aria-describedby={validationError ? errorId : undefined}
        >
          <legend className="text-sm font-medium text-foreground">
            What's this about?
          </legend>
          <div className="grid gap-2">
            {AllQuestionFeedbackCategories.map((option, index) => {
              const selected = category === option;

              return (
                <label
                  key={option}
                  className={cn(
                    'block w-full rounded-xl border border-foreground/50 bg-background/50 p-4 text-left shadow-sm transition-colors focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] dark:border-foreground/40 dark:bg-background/50',
                    !selected &&
                      !isSubmitting &&
                      'cursor-pointer hover:border-foreground/55 hover:bg-foreground/[0.06] dark:hover:border-foreground/50 dark:hover:bg-foreground/[0.05]',
                    selected &&
                      'border-ring bg-foreground/[0.08] dark:border-foreground/70 dark:bg-foreground/[0.12]',
                    isSubmitting && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <input
                    ref={index === 0 ? firstCategoryInputRef : undefined}
                    type="radio"
                    name="category"
                    value={option}
                    checked={selected}
                    disabled={isSubmitting}
                    onChange={() => onCategoryChange(option)}
                    className="sr-only"
                  />
                  <span className="text-base text-foreground">
                    {CATEGORY_LABELS[option]}
                  </span>
                </label>
              );
            })}
          </div>
          {validationError ? (
            <p id={errorId} role="alert" className="text-sm text-destructive">
              {validationError}
            </p>
          ) : null}
        </fieldset>

        <div className="space-y-2">
          <label
            htmlFor="question-report-comment"
            className="text-sm font-medium text-foreground"
          >
            Add details (optional)
          </label>
          <Textarea
            id="question-report-comment"
            name="comment"
            autoComplete="off"
            maxLength={MAX_QUESTION_FEEDBACK_COMMENT_LENGTH}
            value={comment}
            disabled={isSubmitting}
            aria-describedby={counterId}
            onChange={(event) => onCommentChange(event.currentTarget.value)}
          />
          <p
            id={counterId}
            data-testid="question-report-counter"
            aria-live="polite"
            className={cn(
              'text-sm text-muted-foreground',
              isNearLimit && 'font-medium text-warning-foreground',
            )}
          >
            {comment.length} / {MAX_QUESTION_FEEDBACK_COMMENT_LENGTH}
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            Submit feedback
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function QuestionReportDialog({
  open,
  onOpenChange,
  submitReport,
  disabled = false,
}: QuestionReportDialogProps) {
  const { notify } = useNotification();
  const [category, setCategory] = useState<QuestionFeedbackCategory | null>(
    null,
  );
  const [comment, setComment] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const firstCategoryInputRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setCategory(null);
    setComment('');
    setValidationError(null);
    setIsSubmitting(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!category) {
      setValidationError(CATEGORY_VALIDATION_MESSAGE);
      firstCategoryInputRef.current?.focus();
      return;
    }

    setValidationError(null);
    setIsSubmitting(true);

    const trimmedComment = comment.trim();
    try {
      const didSubmit = await submitReport({
        category,
        comment: trimmedComment.length > 0 ? trimmedComment : null,
      });

      if (!didSubmit) {
        notify({
          message: "Couldn't send your feedback. Check your connection.",
          tone: 'error',
        });
        setIsSubmitting(false);
        return;
      }

      notify({
        message: 'Thanks — our editors will take a look.',
        tone: 'success',
      });
      resetForm();
      onOpenChange(false);
    } catch {
      notify({
        message: "Couldn't send your feedback. Check your connection.",
        tone: 'error',
      });
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          disabled={disabled}
        >
          Give feedback
        </Button>
      </DialogTrigger>
      <DialogContent>
        <QuestionReportDialogForm
          category={category}
          comment={comment}
          validationError={validationError}
          isSubmitting={isSubmitting}
          onCancel={() => handleOpenChange(false)}
          onCategoryChange={(nextCategory) => {
            setCategory(nextCategory);
            setValidationError(null);
          }}
          onCommentChange={setComment}
          onSubmit={handleSubmit}
          firstCategoryInputRef={firstCategoryInputRef}
        />
      </DialogContent>
    </Dialog>
  );
}
