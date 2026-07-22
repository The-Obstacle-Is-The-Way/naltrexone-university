// Only the bounded batch size is shared. Retention horizons and cleanup owners
// remain table/state-specific policies at their controller or repository seam.
export const PRUNE_BATCH_LIMIT = 100;
