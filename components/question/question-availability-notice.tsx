import { Card } from '@/components/ui/card';
import type { UnavailableQuestionAvailability } from '@/src/domain/value-objects';

// ADR-022 Decision 1, Pattern Registry F-11: what a learner is told about a
// question that is no longer available. Withdrawn and under-review content
// may be wrong, so their notices are clinical cautions; a retired question's
// content was not found wrong, so its notice is neutral.
const NOTICES: Record<
  UnavailableQuestionAvailability,
  { label: string; heading: string; body: string; caution: boolean }
> = {
  withdrawn: {
    label: 'Withdrawn',
    heading: 'This question was withdrawn.',
    body: "Its answer and explanation may be inaccurate or outdated, so don't rely on them.",
    caution: true,
  },
  under_review: {
    label: 'Under review',
    heading: 'This question is under review.',
    body: "Its answer or explanation may change, so don't rely on them until it returns.",
    caution: true,
  },
  retired: {
    label: 'Retired',
    heading: 'This question has been retired from the bank.',
    body: 'You can still review your answer.',
    caution: false,
  },
};

/** The short label for list rows, navigators and badges. */
export function questionAvailabilityLabel(
  availability: UnavailableQuestionAvailability,
): string {
  return NOTICES[availability].label;
}

/**
 * The sentence naming the state, for a row that shows no content: an item
 * the learner never answered (ADR-022 Decision 2).
 */
export function questionAvailabilityHeading(
  availability: UnavailableQuestionAvailability,
): string {
  return NOTICES[availability].heading;
}

type QuestionAvailabilityNoticeProps = {
  availability: UnavailableQuestionAvailability;
  /**
   * ADR-022 Decision 2: an item the learner never answered shows no content,
   * so it names the state alone, with nothing to caution against.
   */
  labelOnly?: boolean;
};

export function QuestionAvailabilityNotice({
  availability,
  labelOnly = false,
}: QuestionAvailabilityNoticeProps) {
  const notice = NOTICES[availability];
  const caution = notice.caution && !labelOnly;
  return (
    <Card
      role="status"
      data-tone={caution ? 'caution' : 'neutral'}
      className={
        caution
          ? 'gap-0 rounded-2xl border-warning/50 bg-warning/5 p-4 text-sm text-foreground shadow-sm'
          : 'gap-0 p-4 text-sm'
      }
    >
      <p className="font-medium text-foreground">{notice.heading}</p>
      {labelOnly ? null : (
        <p className={caution ? 'text-foreground' : 'text-muted-foreground'}>
          {notice.body}
        </p>
      )}
    </Card>
  );
}
