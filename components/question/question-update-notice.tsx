import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { toQuestionRoute } from '@/lib/routes';

// Pattern Registry F-12: a review of a question that has been updated since
// the learner saw it (ADR-021). The review keeps the version they saw, marked,
// and links to the current one.
export function QuestionUpdateNotice({ slug }: { slug: string }) {
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
          href={toQuestionRoute(slug)}
          className="rounded-sm font-medium underline ring-focus transition-colors hover:text-foreground"
        >
          Practice the current version
        </Link>
      </p>
    </Card>
  );
}
