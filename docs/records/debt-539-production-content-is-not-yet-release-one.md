# DEBT-539: Production Content Is Not Yet Bootstrapped as Release One

**Status:** Blocked — the owner runs the content bootstrap before the first live sale
**Priority:** P2
**Date:** 2026-11-21

---

## Summary

Production's questions were seeded directly, and no content release is active there (last recorded). Until the bootstrap adopts what is live as release one, the direct and managed seeds can still write production, and the direct seed has no stale-answer-key guard. On 2026-11-21, at the owner's delegation, the bootstrap was set for before the first live sale. It writes production, so the owner runs it. This record carries DEBT-483's first Waiting row, whose trigger, the owner's decision, has fired.

## Evidence

- `docs/architecture/content-pipeline.md`, "Releases": the bootstrap adopts what is live as the first release, needs an explicit `DATABASE_URL` and, for a remote target, `DB_TARGET_ACK`, is a dry run unless `--apply`, and "has no supported undo", so a restore point comes first (`docs/guides/operations/database-recovery.md`, "Restore Point Before a Risky Production Data Change").
- The same page, "Read-only live-key comparison": on 2026-11-11 the owner's check found all 948 live questions in content commit `3281add20756c91648ca036a7fedc74c3d35e543` with the same answer keys, and every question in that commit live. That commit is the first release's `--baseline` after the bootstrap.
- DEBT-483's Waiting row recorded its prerequisites, DEBT-490, DEBT-492 and BUG-351, as released, and the owner's choice to bootstrap before any further production seed (ADR-021).

## Impact

No harm is recorded. Until the bootstrap, a production seed from a clone's `content/drafts/questions-backup-*` folders could restore older answer keys (BUG-351's Waiting row), and a content change leaves no release receipt.

## Options

1. **Bootstrap before the first live sale.** Chosen 2026-11-21 at the owner's delegation: no paying user sees content that bypassed a release, and after it a bad question is held (`pnpm content:hold`) or replaced by a new release.
2. Bootstrap after launch. Not chosen: the direct seed could still write production while people pay.

## Resolution (decided)

1. If production content changed after 2026-11-11, rerun `pnpm content:keys:compare` against the content repository's `main`. Its commit replaces the baseline only when every mismatch count is 0 (`content-pipeline.md`).
2. Run the practice QA guide (`docs/guides/qa/practice-core-flows.md`) on a preview. A session can run it.
3. The owner takes the restore point, then runs `pnpm content:release:bootstrap` with `--reason` and `--authority`, previews its plan, and applies it with `--plan <plan-id> --apply`.
4. The owner records the date and the release here.
5. A code pull request then deletes `scripts/seed-production.ts` and `pnpm db:seed:prod`, which after the bootstrap only refuse (DEBT-532).

## Verification

- [ ] The practice QA guide passes on a preview.
- [ ] The owner records the bootstrap's date and release.
- [ ] `seed-production.ts` and `pnpm db:seed:prod` are deleted.

## Related

- DEBT-483 (closed): content withdrawal and release rollback. Its other two Waiting rows stay.
- BUG-351: the backups' Waiting row, whose trigger includes this bootstrap.
- DEBT-532 (closed): the seed deletion after the bootstrap.
- ADR-021: immutable question revisions and content releases.
