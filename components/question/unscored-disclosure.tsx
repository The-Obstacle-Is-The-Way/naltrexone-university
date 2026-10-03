import { cn } from '@/lib/utils';

// ADR-022 Amendment (DEBT-494), Pattern Registry F-13: a score counts an item
// when the learner had a fair chance at it and its content is not in doubt,
// and says when it leaves some out.
export function UnscoredDisclosure({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <p className={cn('text-xs text-muted-foreground', className)}>
      {count === 1
        ? "1 question isn't scored: withdrawn, under review, removed mid-session, or its answer was corrected."
        : `${count} questions aren't scored: withdrawn, under review, removed mid-session, or their answer was corrected.`}
    </p>
  );
}
