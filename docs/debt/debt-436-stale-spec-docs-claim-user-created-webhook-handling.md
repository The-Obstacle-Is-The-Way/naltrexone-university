# DEBT-436: Master Spec Docs Claim the Clerk Webhook Handles `user.created`, Contradicting the Actual Lazy-Provisioning Design

**Status:** Open
**Priority:** P3
**Date:** 2026-06-30

---

## Description

`docs/specs/master_spec.md` and `docs/specs/master_spec_part2.md` both still list, under "Events handled" for the Clerk webhook:

```text
* `user.created` — Create user in `users` table
* `user.updated` — Update user email in `users` table
* `user.deleted` — Delete user and cascade (subscription, attempts, bookmarks, etc.)
```

This directly contradicts both the live implementation and this repo's own already-correct vendor documentation. The webhook controller never handles `user.created`:

- [`src/adapters/controllers/clerk-webhook-controller.ts`](../../src/adapters/controllers/clerk-webhook-controller.ts#L213) branches only on `event.type !== 'user.updated' && event.type !== 'user.deleted'` (treating anything else, including `user.created`, as a no-op) — there is no `user.created` handler anywhere in the file.
- [`docs/vendor-docs/clerk.md`](../vendor-docs/clerk.md#L136) already states the correct, intentional design plainly: "We do NOT handle `user.created`. Users are created lazily on first authenticated request."
- [`src/adapters/gateways/clerk-auth-gateway.ts`](../../src/adapters/gateways/clerk-auth-gateway.ts#L48-L71) (`getCurrentUser`) confirms the actual mechanism: every authenticated request calls `currentUser()` and upserts the local `users` row via `userRepository.upsertByClerkId(...)` — a genuine, race-safe Postgres `ON CONFLICT (clerk_user_id) DO UPDATE` ([`drizzle-user-repository.ts#L71-L135`](../../src/adapters/repositories/drizzle-user-repository.ts#L71-L135)) — independent of any webhook.

This is not a functional bug (the lazy-provisioning design is correct and was specifically verified race-free during the 2026-06-30 auth/redirect bug sweep), purely a documentation drift between two specs that disagree with this repo's own correct vendor doc and with reality.

**Fix scope note:** the identical stale claim also appears in two archived documents — `docs/_archive/audits/audit-001-foundation-report.md:139` and `docs/_archive/specs/spec-010-server-actions.md:230`. Both are left **out of scope** for this fix: `docs/_archive/` holds frozen historical snapshots that this repo treats as superseded-not-living once archived, so editing them would misrepresent what those documents said at the time they were current. This fix targets only the two living spec files that active engineers would actually consult today.

## Impact

A future engineer or auditor who trusts `master_spec.md`/`master_spec_part2.md` over `clerk.md` could waste time hunting for non-existent `user.created` handler code, or worse, "fix" a perceived webhook gap that was deliberately designed away — re-introducing complexity (and a real race-condition surface) that the lazy-provisioning approach was chosen specifically to avoid.

## Resolution

Replace the `user.created` bullet in both `docs/specs/master_spec.md` and `docs/specs/master_spec_part2.md` with a line matching `clerk.md`'s framing, e.g.:

```text
* `user.created` — No-op; users are created lazily via `upsertByClerkId` on first authenticated request (see `docs/vendor-docs/clerk.md`)
* `user.updated` — Update user email in `users` table
* `user.deleted` — Delete user and cascade (subscription, attempts, bookmarks, etc.)
```

Docs-only change; no code, test, or behavior changes required.

## Verification

- `rg "user.created.*Create user" docs/specs/` returns zero hits after the fix.
- Both spec files read consistently with `docs/vendor-docs/clerk.md` and the live `clerk-webhook-controller.ts` behavior.
- (Explicitly not checked by the above command, and intentionally out of scope per the Description: `docs/_archive/audits/audit-001-foundation-report.md` and `docs/_archive/specs/spec-010-server-actions.md` retain the historical claim as frozen snapshots.)

## Related

- [`docs/vendor-docs/clerk.md`](../vendor-docs/clerk.md) is the already-correct source of truth this fix aligns the specs to.
- Found during the 2026-06-30 auth/redirect bug sweep while verifying the Clerk webhook-vs-DB-provisioning timing race was a non-issue (it is, by this exact lazy-upsert design).
