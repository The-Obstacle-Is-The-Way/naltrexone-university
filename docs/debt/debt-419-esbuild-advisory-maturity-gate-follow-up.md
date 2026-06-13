# DEBT-419: esbuild Advisory Follow-Up After Maturity Gate Allows the Patch

**Priority:** P2 (dependency-security cleanup; current app exploitability is low, but `pnpm audit` remains red)
**Created:** 2026-06-13
**Status:** Open
**Related:** [AUDIT-012](../_archive/audits/audit-012-repo-org-devx.md), [BUG-249](../bugs/bug-249-dependency-security-automation-disabled.md)

---

## Context

AUDIT-012 SEC-1 found `pnpm audit --audit-level=moderate` red with 5 advisories. The audit-resolution branch cleared the mature `postcss` and `uuid` paths via `pnpm-workspace.yaml` overrides, reducing the remaining audit output to esbuild-only advisories:

```bash
$ pnpm audit --json
"metadata":{"vulnerabilities":{"info":0,"low":1,"moderate":1,"high":1,"critical":0}, ...}
```

Remaining advisories:

- `GHSA-gv7w-rqvm-qjhr` (high): esbuild Deno module binary-integrity vector. This app does not run esbuild through Deno; current real-world exploitability for the deployed SaaS is approximately nil.
- `GHSA-g7r4-m6w7-qqqr` (low): esbuild arbitrary file read when running the development server on Windows. The app is deployed on Vercel/Linux; this is local-development exposure only.
- `GHSA-67mh-4wv8-2f99` (moderate): old `esbuild@0.18.20` under `drizzle-kit>@esbuild-kit/esm-loader>@esbuild-kit/core-utils`, affecting esbuild dev-server behavior.

The patched esbuild version for the high and low advisories is `>=0.28.1`, but pnpm refused `esbuild@0.28.1` on 2026-06-13 because it was published on 2026-06-11 and is still inside the repository's 7-day `minimumReleaseAge` window:

```text
[ERR_PNPM_NO_MATURE_MATCHING_VERSION] ... esbuild@0.28.1 was published at 2026-06-11T22:47:05.085Z, within the minimumReleaseAge cutoff (2026-06-06T17:55:05.363Z)
```

Do not bypass the maturity gate for this advisory unless the owner explicitly accepts the supply-chain tradeoff.

## Scope

- After `esbuild@0.28.1` ages past the configured `minimumReleaseAge`, try a narrow `pnpm-workspace.yaml` override to `esbuild: 0.28.1` or the then-current mature patched version.
- Re-run `pnpm install --lockfile-only`.
- Re-run `pnpm audit --audit-level=moderate`.
- If the old `@esbuild-kit` path still keeps `GHSA-67mh-4wv8-2f99` or another esbuild advisory red, evaluate a mature `drizzle-kit` / `tsx` / `@esbuild-kit` path update separately.

## Acceptance Criteria

- [ ] `pnpm audit --audit-level=moderate` exits 0, or any remaining advisory is documented with a primary-source reachability analysis and an owner-accepted risk decision.
- [ ] Full quality gate passes on Node 24 after the lockfile change.
- [ ] No broad dependency replacement, Clerk UI removal, or Solana subtree removal is used as the fix.
