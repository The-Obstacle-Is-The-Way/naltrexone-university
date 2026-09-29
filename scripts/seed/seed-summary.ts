import type { SeedSyncCounts } from './question-syncer';

// The seed's report. A deferred question (ADR-021: an incomplete session binds
// the revision the change would refresh) fails the run after every other
// question is applied, so an operator cannot miss it.
export function summarizeSeedSync(
  counts: SeedSyncCounts,
  fileCount: number,
): { summary: string; deferralFailure: string | null } {
  const summary = `Seed complete: inserted=${counts.inserted} updated=${counts.updated} skipped=${counts.skipped} deferred=${counts.deferred.length} (files=${fileCount})`;
  if (counts.deferred.length === 0) return { summary, deferralFailure: null };

  const questions = counts.deferred
    .map(
      ({ slug, sessions }) =>
        `${slug} (${sessions} ${sessions === 1 ? 'session' : 'sessions'})`,
    )
    .join(', ');
  const noun = counts.deferred.length === 1 ? 'question' : 'questions';
  return {
    summary,
    deferralFailure: `Seed deferred ${counts.deferred.length} ${noun} because incomplete practice sessions bind their current revision: ${questions}. Every other question was applied. Rerun the seed after those sessions end.`,
  };
}
