'use client';

import Link from 'next/link';
import type { SessionNavigation } from '@/app/(app)/app/questions/[slug]/question-page-logic';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toQuestionRoute } from '@/lib/routes';
import { cn } from '@/lib/utils';

type ReviewQuestionNavigatorProps = {
  navigation: SessionNavigation;
  historyHref?: string;
};

function getVariant(
  isCorrect: boolean | null,
): 'success' | 'destructive' | 'outline' {
  if (isCorrect === true) return 'success';
  if (isCorrect === false) return 'destructive';
  return 'outline';
}

function getStatusLabel(isCorrect: boolean | null): string {
  if (isCorrect === true) return 'Correct';
  if (isCorrect === false) return 'Incorrect';
  return 'Unanswered';
}

export function ReviewQuestionNavigator({
  navigation,
  historyHref,
}: ReviewQuestionNavigatorProps) {
  const { questions, currentIndex, sessionId, from } = navigation;
  if (questions.length === 0) return null;
  if (currentIndex < 0 || currentIndex >= questions.length) return null;

  return (
    <Card
      className="gap-0 rounded-2xl p-4 shadow-sm"
      role="navigation"
      aria-label="Question navigator"
    >
      <h2 className="text-sm font-medium text-foreground">
        Question navigator
      </h2>
      <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-10">
        {questions.map((q, i) => {
          const isCurrent = i === currentIndex;
          const variant = getVariant(q.isCorrect);
          const statusLabel = getStatusLabel(q.isCorrect);

          return (
            <Button
              key={q.slug}
              asChild={!isCurrent}
              variant={variant}
              className={cn(
                'relative rounded-full',
                isCurrent && 'ring-2 ring-ring',
              )}
              aria-label={`Question ${q.order}: ${statusLabel}${isCurrent ? ', Current' : ''}`}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {isCurrent ? (
                <span>{q.order}</span>
              ) : (
                <Link
                  href={toQuestionRoute(q.slug, {
                    from,
                    mode: 'review',
                    sessionId,
                    historyHref,
                  })}
                >
                  {q.order}
                </Link>
              )}
            </Button>
          );
        })}
      </div>
    </Card>
  );
}
