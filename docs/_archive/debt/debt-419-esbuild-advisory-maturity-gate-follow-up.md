# DEBT-419: esbuild Advisory Follow-Up After Maturity Gate Allows the Patch

**Priority:** P2 (dependency-security cleanup; esbuild advisories cleared, audit residue is out-of-scope library paths)
**Created:** 2026-06-13
**Resolved:** 2026-06-19
**Status:** Resolved — all esbuild advisories cleared via a mature `esbuild@0.28.1` override (PR #467, merge `3766ab92`); prod-verified on `main`.
**Related:** [AUDIT-012](../audits/audit-012-repo-org-devx.md), [BUG-249](../bugs/bug-249-dependency-security-automation-disabled.md)

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

- [x] `pnpm audit --audit-level=moderate` exits 0, or any remaining advisory is documented with a primary-source reachability analysis and an owner-accepted risk decision. — **Met via the second clause for this debt's scope.** Every esbuild advisory is cleared (0 esbuild advisories remain); the audit is non-zero only for out-of-scope library paths, documented in PR #467 and under "Out-of-scope residue" below.
- [x] Full quality gate passes on the runtime declared by `.nvmrc` and `package.json` `engines.node` after the lockfile change. — Node 24 (`v24.16.0`): typecheck, lint, 2874 unit tests, and `pnpm build` all green; CI green on the exact head `a578d4ca`; prod-verified on `main` (`3766ab92`).
- [x] No broad dependency replacement, Clerk UI removal, or Solana subtree removal is used as the fix. — One-line `pnpm-workspace.yaml` override (`esbuild: '>=0.28.1'`) plus the regenerated lockfile; nothing else changed.

## Resolution

Shipped in **PR #467** and merged to `main` as merge commit `3766ab92` on 2026-06-19 (fix commit `a578d4ca`). The 7-day `minimumReleaseAge` gate that blocked this on 2026-06-13 aged out on 2026-06-18 (`esbuild@0.28.1` published 2026-06-11T22:47Z) — the gate was respected, not bypassed. The branch was rebased onto the latest `main` and re-verified (fresh CodeRabbit review, 0 actionable) before merge.

The entire change is one line in the `overrides` block of `pnpm-workspace.yaml`:

```diff
 overrides:
   postcss: 8.5.15
   uuid: 14.0.0
+  esbuild: '>=0.28.1'
```

plus the regenerated `pnpm-lock.yaml`. This unified **every** esbuild in the tree on `0.28.1` (previously three versions: `0.18.20`, `0.25.12`, `0.28.0`), including the copy under `drizzle-kit > @esbuild-kit/esm-loader > @esbuild-kit/core-utils` — so the old `esbuild@0.18.20` that kept `GHSA-67mh-4wv8-2f99` red is gone, while the harmless `@esbuild-kit` wrapper packages remain.

### esbuild advisories — all cleared

| Advisory | Severity | Was | Now |
|----------|----------|-----|-----|
| `GHSA-gv7w-rqvm-qjhr` | high | esbuild Deno binary-integrity | ✅ cleared (≥0.28.1) |
| `GHSA-g7r4-m6w7-qqqr` | low | esbuild Windows dev-server file read | ✅ cleared (≥0.28.1) |
| `GHSA-67mh-4wv8-2f99` | moderate | old `esbuild@0.18.20` via `@esbuild-kit` | ✅ cleared (path now on 0.28.1) |

### Out-of-scope residue (owner-accepted)

`pnpm audit` is still non-zero, but **no remaining advisory is esbuild** and none is in DEBT-419's scope. As of 2026-06-19 the residue is `undici` (via `vitest > jsdom` dev/test tooling), `js-yaml` (via the Solana wallet adapter), and `@opentelemetry/core` (via `@sentry/nextjs`) — dev-only or runtime-library paths where a narrow override would require replacing or waiting on the owning package, which this debt's third acceptance criterion explicitly disallows. The `undici` advisory set in particular grew after PR #467 was authored; track it under a fresh dependency-security item if/when the owner wants the audit driven fully to zero.

## Verification

- `pnpm why esbuild` → `Found 1 version of esbuild: esbuild@0.28.1`.
- `grep -oE "esbuild@[0-9]+\.[0-9]+\.[0-9]+" pnpm-lock.yaml | sort -u` → `esbuild@0.28.1` only.
- `pnpm audit --json` → count of advisories where `module_name == "esbuild"` is **0**.
- `pnpm install --lockfile-only` → no lockfile diff (stable); supply-chain maturity policy passes (`esbuild@0.28.1` accepted).
- Full gate on Node 24 green; CodeRabbit 0-actionable on the exact head `a578d4ca`; prod-verified on `main` (`3766ab92`); independently re-reviewed by an adversarial second agent (verdict READY, no code changes required).
