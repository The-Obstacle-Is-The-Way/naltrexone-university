import { cn } from '@/lib/utils';

type PageLoadingProps = {
  label: string;
  cardCount?: number;
  className?: string;
};

export function PageLoading({
  label,
  cardCount = 3,
  className,
}: PageLoadingProps) {
  const cardKeys = Array.from(
    { length: cardCount },
    (_, index) => `skeleton-card-${index}`,
  );

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={cn('animate-pulse space-y-6', className)}
    >
      <p className="sr-only">{label}</p>

      <div className="h-8 w-48 rounded-md bg-background" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cardKeys.map((key) => (
          <div
            key={key}
            className="space-y-4 rounded-xl border border-border bg-background p-6"
          >
            <div className="space-y-3">
              <div className="h-4 w-1/2 rounded bg-muted" />
              <div className="h-4 w-5/6 rounded bg-muted" />
              <div className="h-4 w-2/3 rounded bg-muted" />
            </div>
            <div className="h-10 w-32 rounded-md bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
