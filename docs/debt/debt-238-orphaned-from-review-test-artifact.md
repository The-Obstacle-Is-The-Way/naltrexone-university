# DEBT-238: Orphaned `from=review` Test Artifact From DEBT-215 Cleanup

**Status:** Open
**Priority:** P4
**Date:** 2026-02-19
**Component:** `app/(app)/app/questions/[slug]/page.test.tsx`
**GitHub Issue:** [#89](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/89)

---

## Description

DEBT-215 (resolved 2026-02-14, commit `8f13391`) removed all backwards-compatibility shims from the codebase:

- `?tab=missed` alias → removed
- `?source=quick` alias → removed
- `from=review` origin type + parsing + UI branch → removed
- `/app/review` redirect → removed
- `ROUTES.APP_REVIEW` dead constant → removed

However, one test artifact survived the cleanup. `page.test.tsx:50-58` still passes `from: 'review'` as a search param value:

```typescript
it('passes origin searchParams into the client page', async () => {
  const element = await QuestionPage({
    params: Promise.resolve({ slug: 'q-1' }),
    searchParams: Promise.resolve({ from: 'review' }),  // ← dead origin value
  } as never);

  expect(element).toMatchObject({
    props: { slug: 'q-1', from: 'review' },  // ← asserts dead value passthrough
  });
});
```

The test passes because the server component blindly forwards raw `searchParams` to the client — it doesn't validate the `from` value. But `'review'` is no longer a valid `QuestionOrigin` (the type allows only `'dashboard' | 'bookmarks' | 'practice' | 'history'` per `lib/routes.ts:21`).

This was missed because DEBT-215's verification grep (`rg "from=review"`) would match `from: 'review'` only if the pattern included the TypeScript syntax variant. The commit removed all production code and most tests, but this one test in the server component file (not the client component test file) slipped through.

## Impact

- Tests a dead scenario that cannot occur in production
- Misleads future developers into thinking `'review'` is a valid origin
- Prevents GitHub issue #89 from being fully closed
- Violates DEBT-215's own verification criterion: "zero hits for `from=review`"

## Resolution

1. Change `from: 'review'` to `from: 'history'` (or any valid `QuestionOrigin`) in `page.test.tsx:53,57`
2. Verify no other source files reference `from=review` or `from: 'review'` outside `docs/_archive/`
3. Close GitHub issue #89 with a comment linking DEBT-215 + DEBT-238

## Verification

- [ ] `rg "from.review" app src lib tests --type ts --type tsx` returns zero hits (excluding `docs/_archive/`)
- [ ] `pnpm test --run` passes
- [ ] `pnpm typecheck` passes
- [ ] GitHub issue #89 is closed

## Related

- [DEBT-215](../../docs/_archive/debt/debt-215-backwards-compatibility-shims-cleanup.md) — Parent cleanup that missed this artifact
- [DEBT-210](../../docs/_archive/debt/debt-210-dead-routes-app-review-constant.md) — Dead `ROUTES.APP_REVIEW` constant (subsumed by DEBT-215)
- [GitHub Issue #89](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/issues/89) — Tracking issue for full backward-compat removal
