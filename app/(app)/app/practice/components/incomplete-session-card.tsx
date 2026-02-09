import Link from 'next/link';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toPracticeSessionRoute } from '@/lib/routes';
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
    <Card className="gap-0 rounded-2xl p-6 shadow-sm">
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
            <Link href={toPracticeSessionRoute(input.session.sessionId)}>
              Resume session
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled={input.isPending}
              >
                Abandon session
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Abandon session?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will discard the in-progress session and you will need to
                  start over.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel type="button">
                  Keep session
                </AlertDialogCancel>
                <AlertDialogAction
                  type="button"
                  variant="destructive"
                  onClick={input.onAbandon}
                >
                  Abandon anyway
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </Card>
  );
}
