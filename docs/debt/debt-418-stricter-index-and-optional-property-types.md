# DEBT-418: Enable Stricter Index and Optional Property Type Checks

**Priority:** P2 (recommended-soon agent-safety guardrail; deferred only to avoid a repo-wide audit-resolution diff)
**Created:** 2026-06-13
**Status:** Resolved
**Related:** [AUDIT-012](../_archive/audits/audit-012-repo-org-devx.md)

---

## Context

AUDIT-012 confirmed that TypeScript strict mode is enabled, but stricter indexed-access, optional-property, control-flow, override, return, and file-casing checks were not all enabled.

```bash
$ rg -n '"strict": true' tsconfig.json
tsconfig.json:7:    "strict": true,

$ rg -n "noUncheckedIndexedAccess|exactOptionalPropertyTypes|noFallthroughCasesInSwitch|noImplicitOverride|noImplicitReturns|forceConsistentCasingInFileNames" tsconfig.json; echo exit=$?
exit=1
```

The locked AUDIT-012 decision is to defer this to a dedicated PR rather than flipping these flags inside the audit-resolution branch. The flags are valuable for an AI-agent-operated codebase because they mechanically prevent common unsafe assumptions (`arr[0]` exists, optional means explicitly `undefined` is interchangeable), force explicit override/return/control-flow intent, and keep casing drift visible, but the initial type-fix diff should be reviewed on its own.

## Scope

- Enable `noUncheckedIndexedAccess`.
- Enable `exactOptionalPropertyTypes`.
- Enable `noFallthroughCasesInSwitch`.
- Enable `noImplicitOverride`.
- Enable `noImplicitReturns`.
- Enable `forceConsistentCasingInFileNames`.
- Fix the resulting type errors with small, behavior-preserving edits.
- Do not weaken types with casts to satisfy the flags.
- Keep the change in a focused PR; do not combine it with feature work.

## Acceptance Criteria

- [x] `tsconfig.json` sets all six stricter flags to `true`.
- [x] `pnpm typecheck` is green on the runtime declared by `.nvmrc` and `package.json` `engines.node`.
- [x] Existing test suites remain green.
- [x] Any unavoidable API-shape change is documented with the affected boundary and rationale.
