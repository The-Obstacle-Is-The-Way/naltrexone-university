import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { GetIncompletePracticeSessionOutput } from '@/src/adapters/controllers/practice-controller';

type IncompletePracticeSession =
  NonNullable<GetIncompletePracticeSessionOutput>;

export function IncompleteSessionCard(input: {
  session: IncompletePracticeSession;
  isPending: boolean;
  onAbandon: () => void;
}) {
  const modeLabel = input.session.mode === 'exam' ? 'Exam mode' : 'Tutor mode';

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">
            Continue session
          </div>
          <div className="text-sm text-muted-foreground">
            {modeLabel} • {input.session.answeredCount}/
            {input.session.totalCount} answered
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild type="button" className="rounded-full">
            <Link href={`/app/practice/${input.session.sessionId}`}>
              Resume session
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={input.isPending}
            onClick={input.onAbandon}
          >
            Abandon session
          </Button>
        </div>
      </div>
    </div>
  );
}
