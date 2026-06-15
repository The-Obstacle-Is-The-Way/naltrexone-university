# DEBT-418: Enable Stricter Index and Optional Property Type Checks

**Priority:** P2 (recommended-soon agent-safety guardrail; deferred only to avoid a repo-wide audit-resolution diff)
**Created:** 2026-06-13
**Status:** Resolved
**Related:** [AUDIT-012](../audits/audit-012-repo-org-devx.md)

---

## Context

AUDIT-012 confirmed that TypeScript strict mode is enabled, but stricter indexed-access, optional-property, control-flow, override, return, and file-casing checks were not all enabled.

Resolved verification after this PR:

```bash
$ rg -n '"(strict|noUncheckedIndexedAccess|exactOptionalPropertyTypes|noFallthroughCasesInSwitch|noImplicitOverride|noImplicitReturns|forceConsistentCasingInFileNames)"\\s*: true' tsconfig.json; echo exit=$?
7:    "strict": true,
8:    "noUncheckedIndexedAccess": true,
9:    "exactOptionalPropertyTypes": true,
10:    "noFallthroughCasesInSwitch": true,
11:    "noImplicitOverride": true,
12:    "noImplicitReturns": true,
13:    "forceConsistentCasingInFileNames": true,
exit=0
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
