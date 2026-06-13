# DEBT-417: Enable Stricter Index and Optional Property Type Checks

**Priority:** P2 (recommended-soon agent-safety guardrail; deferred only to avoid a repo-wide audit-resolution diff)
**Created:** 2026-06-13
**Status:** Open
**Related:** [AUDIT-012](../audits/audit-012-repo-org-devx.md)

---

## Context

AUDIT-012 confirmed that TypeScript strict mode is enabled, but `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are not.

```bash
$ rg -n '"strict": true' tsconfig.json
tsconfig.json:7:    "strict": true,

$ rg -n "noUncheckedIndexedAccess|exactOptionalPropertyTypes" tsconfig.json; echo exit=$?
exit=1
```

The locked AUDIT-012 decision is to defer this to a dedicated PR rather than flipping both flags inside the audit-resolution branch. The flags are valuable for an AI-agent-operated codebase because they mechanically prevent common unsafe assumptions (`arr[0]` exists, optional means explicitly `undefined` is interchangeable), but the initial type-fix diff should be reviewed on its own.

## Scope

- Enable `noUncheckedIndexedAccess`.
- Enable `exactOptionalPropertyTypes`.
- Fix the resulting type errors with small, behavior-preserving edits.
- Do not weaken types with casts to satisfy the flags.
- Keep the change in a focused PR; do not combine it with feature work.

## Acceptance Criteria

- [ ] `tsconfig.json` sets both flags to `true`.
- [ ] `pnpm typecheck` is green on Node 24.
- [ ] Existing test suites remain green.
- [ ] Any unavoidable API-shape change is documented with the affected boundary and rationale.
