import { Check, X } from 'lucide-react';

export function ReviewCorrectnessBadge({
  isCorrect,
}: {
  isCorrect: boolean | null;
}) {
  if (isCorrect === null) return null;

  const Icon = isCorrect ? Check : X;
  const toneClassName = isCorrect ? 'text-success' : 'text-destructive';

  return (
    <span
      aria-hidden="true"
      className="absolute -bottom-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-background"
    >
      <Icon aria-hidden="true" className={`size-2.5 ${toneClassName}`} />
    </span>
  );
}
