import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { toQuestionRoute } from '@/lib/routes';

type QuestionUpdateNoticeProps =
  | { variant: 'review'; slug: string }
  | { variant: 'session' };

// Pattern Registry F-12: a question updated since the learner saw it
// (ADR-021). A review keeps the version they saw, marked, and links to the
// current one. An active session keeps its version and stays in the session.
export function QuestionUpdateNotice(props: QuestionUpdateNoticeProps) {
  if (props.variant === 'session') {
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

  return (
    <Card role="status" className="gap-0 p-4 text-sm">
      <p className="font-medium text-foreground">
        This question has been updated.
      </p>
      <p className="text-muted-foreground">
        This is the version you saw. Its answer or explanation may have changed.
      </p>
      <p>
        <Link
          href={toQuestionRoute(props.slug)}
          className="rounded-sm font-medium underline ring-focus transition-colors hover:text-foreground"
        >
          Practice the current version
        </Link>
      </p>
    </Card>
  );
}
