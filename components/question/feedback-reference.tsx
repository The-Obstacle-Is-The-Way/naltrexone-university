import { Markdown } from '@/components/markdown/markdown';

/** Pattern Registry F-6: the cited source below a feedback card's answers. */
export function FeedbackReference({ referenceMd }: { referenceMd: string }) {
  return (
    <div className="mt-4 border-t border-border/40 pt-3 dark:border-foreground/40">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Reference
      </div>
      <Markdown content={referenceMd} className="mt-1 text-sm" />
    </div>
  );
}
