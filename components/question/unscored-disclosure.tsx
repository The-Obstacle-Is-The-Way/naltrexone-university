// ADR-022 Decision 3, Pattern Registry F-13: a score counts only the items
// whose question is available and whose key was not corrected, and says when
// it leaves some out.
export function UnscoredDisclosure({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {count === 1
        ? "1 question isn't scored: withdrawn, under review, retired, or its answer was corrected."
        : `${count} questions aren't scored: withdrawn, under review, retired, or their answer was corrected.`}
    </p>
  );
}
