# DEBT-434: Migration 0021's backfill copies `params_json.questionStates` into the new table but never strips the now-dead JSON copy, leaving diverging duplicate data on disk

**Status:** Resolved
**Priority:** P4
**Date:** 2026-07-01

---

## Description

`0021_flaky_domino.sql:27-103` backfills `practice_session_question_states` by reading each legacy row's `params_json -> 'questionStates'` array, but only ever `INSERT`s from it — it never strips, nulls, or otherwise marks that key on the source `practice_sessions.params_json` row. Per [DEBT-425](./debt-425-legacy-compatibility-tolerances-audit.md), application code (`practice-session-params.ts`, the session-creation path) now ignores `questionStates` in `params_json` entirely going forward — but every pre-Track-A row still carries the original per-question blob verbatim in `params_json`, frozen at whatever state it was in at migration time.

## Impact

From the moment the application writes any new question-state change (via `practice_session_question_states`), that row's `params_json.questionStates` is stale and will silently diverge from the source of truth with every subsequent answer/draft/review-mark write — nothing updates it, and nothing marks it as dead. Low runtime risk (the app itself never reads it again), but a real footgun for anyone who queries `params_json` directly outside the application layer — analytics, a future migration author skimming existing data for a pattern, or support tooling — who could reasonably assume a JSON column still reflects current state and draw wrong conclusions from an answer that's actually been changed since.

## Resolution

Low priority, no urgency: DEBT-425's post-deploy proof is now satisfied. On 2026-07-02, Development and Production both had migration ledger head `0025_worthless_junta`, and the normalized-state proof queries returned zero state-coverage mismatches, zero cross-question choice references, and zero out-of-range draft durations. Production has zero practice sessions and zero stale JSON `questionStates` rows; Development has 123 stale JSON `questionStates` rows left from pre-Track-A sessions.

Implemented in migration `0026_track_a_tail_sweep.sql`: after normalizing any string-typed `params_json` rows, the migration removes the stale `questionStates` key from object-shaped `practice_sessions.params_json` rows. The app already treats the normalized table as the sole source of truth; this cleanup removes misleading duplicate data for humans and ad hoc tooling, not runtime behavior.

The migration captures affected-row counts with `GET DIAGNOSTICS` / `RAISE NOTICE`, so deploy logs record how many stale JSON blobs were stripped. Post-merge proof on 2026-07-04 confirmed both deployed Neon branches are at ledger head `0026_track_a_tail_sweep` and have zero remaining `params_json.questionStates` keys, so this debt is closed.

## Verification

Implementation proof in this branch:

- `tests/integration/practice-session-params-json-cleanup.integration.test.ts` seeds an object-shaped row with stale `questionStates`, runs the marked `DEBT-428/434` cleanup block twice, and proves the key is removed while an unaffected object row remains byte-identical.

Post-merge proof recorded 2026-07-04:

| Target | Host | Ledger entries | Ledger head | Stale JSON `questionStates` rows |
|---|---|---:|---|---:|
| Development | `ep-still-frog` | 27 | `0026_track_a_tail_sweep` / `1783092600000` | 0 |
| Production | `ep-withered-cell` | 27 | `0026_track_a_tail_sweep` / `1783092600000` | 0 |

Query:

```sql
SELECT count(*)::int AS stale_question_states_rows
FROM practice_sessions
WHERE jsonb_typeof(params_json) = 'object'
  AND params_json ? 'questionStates';
```

Current post-deploy baseline from 2026-07-02:

| Target | Stale JSON `questionStates` rows |
|---|---:|
| Development (`ep-still-frog`) | 123 |
| Production (`ep-withered-cell`) | 0 |

## Related

- PR #537, [DEBT-425](./debt-425-legacy-compatibility-tolerances-audit.md)
- `db/migrations/0021_flaky_domino.sql:27-103`
- Found via a systematic derived-data consistency audit (2026-07-01)
- Also noted in the same audit, not filed separately as too minor to track: `scripts/seed/placeholder-archiver.ts`'s `archivePlaceholderQuestions` unconditionally bumps `updatedAt` on every `pnpm db:seed` run for all `slug LIKE 'placeholder-%'` rows even when nothing else changed — cosmetic non-idempotency with no functional impact, not worth a tracked item on its own.
