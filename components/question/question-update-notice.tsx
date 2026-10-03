import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { toQuestionRoute } from '@/lib/routes';

type QuestionUpdateNoticeProps = (
  | { variant: 'review'; slug: string }
  | { variant: 'session' }
) & {
  /**
   * ADR-022 Decision 4: the answer key changed, so an answer graded on the
   * version shown is not scored.
   */
  keyCorrected?: boolean;
};

// The caution card Pattern Registry F-11 uses: a key correction means the
// learner may have learned a wrong answer.
const CAUTION =
  'gap-0 rounded-2xl border-warning/50 bg-warning/5 p-4 text-sm text-foreground shadow-sm';

// Pattern Registry F-12: a question updated since the learner saw it
// (ADR-021). A review keeps the version they saw, marked, and links to the
// current one. An active session keeps its version and stays in the session.
// A corrected answer key is said as such, as a caution (ADR-022 Decision 4).
export function QuestionUpdateNotice(props: QuestionUpdateNoticeProps) {
  if (props.variant === 'session') {
    if (props.keyCorrected) {
      return (
        <Card role="status" data-tone="caution" className={CAUTION}>
          <p className="font-medium">
            The answer to this question was corrected after your session began.
          </p>
          <p>
            {
              "This session shows the earlier version, so your answer here won't be scored."
            }
          </p>
        </Card>
      );
    }
    return (
      <Card role="status" className="gap-0 p-4 text-sm">
        <p className="font-medium text-foreground">
          This question has been updated since your session began.
        </p>
        <p className="text-muted-foreground">
          This session uses the version shown here. Its answer or explanation
          may have changed.
        </p>
      </Card>
    );
  }

  const link = (
    <p>
      <Link
        href={toQuestionRoute(props.slug)}
        className="rounded-sm font-medium underline ring-focus transition-colors hover:text-foreground"
      >
        {props.keyCorrected
          ? 'Practice the corrected question'
          : 'Practice the current version'}
      </Link>
    </p>
  );

  if (props.keyCorrected) {
    return (
      <Card role="status" data-tone="caution" className={CAUTION}>
        <p className="font-medium">
          The answer to this question was corrected after you answered.
        </p>
        <p>{"This attempt isn't scored."}</p>
        {link}
      </Card>
    );
  }

  return (
    <Card role="status" className="gap-0 p-4 text-sm">
      <p className="font-medium text-foreground">
        This question has been updated.
      </p>
      <p className="text-muted-foreground">
        This is the version you saw. Its answer or explanation may have changed.
      </p>
      {link}
    </Card>
  );
}
