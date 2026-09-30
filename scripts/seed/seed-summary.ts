import type { SeedSyncCounts } from './question-syncer';

// The seed's report. ADR-021 phase 2b: changed content is appended as a new
// revision, so an update can be a new revision or a status or tag change.
export function summarizeSeedSync(
  counts: SeedSyncCounts,
  fileCount: number,
): string {
  return `Seed complete: inserted=${counts.inserted} updated=${counts.updated} (new revisions=${counts.revised}) skipped=${counts.skipped} (files=${fileCount})`;
}
