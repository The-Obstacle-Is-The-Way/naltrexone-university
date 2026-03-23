'use client';

import Link from 'next/link';
import type { SessionNavigation } from '@/app/(app)/app/questions/[slug]/question-page-logic';
import { ReviewCorrectnessBadge } from '@/app/(app)/app/shared/components/review-correctness-badge';
import {
  getReviewStatusLabel,
  getReviewVariant,
} from '@/app/(app)/app/shared/components/review-navigator-utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toQuestionRoute } from '@/lib/routes';
import { cn } from '@/lib/utils';

type ReviewQuestionNavigatorProps = {
  navigation: SessionNavigation;
  historyHref?: string;
};

export function ReviewQuestionNavigator({
  navigation,
  historyHref,
}: ReviewQuestionNavigatorProps) {
  const { questions, currentIndex, sessionId, from, historySequence } =
    navigation;
  const historySeqParam = historySequence?.join(',');
  if (questions.length === 0) return null;
  if (currentIndex < 0 || currentIndex >= questions.length) return null;

  return (
    <nav aria-label="Question navigator">
      <Card className="gap-0 rounded-2xl p-4 shadow-sm">
        <h2 className="text-sm font-medium text-foreground">
          Question navigator
        </h2>
        <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-10">
          {questions.map((q, i) => {
            const isCurrent = i === currentIndex;
            const variant = getReviewVariant(q.isCorrect);
            const statusLabel = getReviewStatusLabel(q.isCorrect);
            const retryLabel = q.wasRetried ? ', Retried' : '';

            const innerContent = (
              <>
                {q.order}
                <ReviewCorrectnessBadge isCorrect={q.isCorrect} />
                {q.wasRetried ? (
                  <span
                    aria-hidden
                    data-testid="review-question-retry-dot"
                    className="absolute -right-1 -top-1 size-2 rounded-full bg-primary"
                  />
                ) : null}
              </>
            );

            return (
              <Button
                key={q.slug}
                asChild={!isCurrent}
                variant={variant}
                className={cn(
                  'relative rounded-full',
                  isCurrent && 'ring-[3px] ring-ring/50',
                )}
                aria-label={`Question ${q.order}: ${statusLabel}${retryLabel}${isCurrent ? ', Current' : ''}`}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {isCurrent ? (
                  <span>{innerContent}</span>
                ) : (
                  <Link
                    href={toQuestionRoute(q.slug, {
                      from,
                      mode: 'review',
                      sessionId,
                      historyHref,
                      historySeq: historySeqParam,
                      historyIndex: historySeqParam ? i : undefined,
                    })}
                  >
                    {innerContent}
                  </Link>
                )}
              </Button>
            );
          })}
        </div>
      </Card>
    </nav>
  );
}
