# DEBT-495: braces Denial-of-Service Advisory With No Fixed Release

> Close using [the archive convention](../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Open — the risk is accepted under the owner's delegation (2026-10-03). Once this record is on `main`, Dependabot alert #77 is dismissed as `tolerable_risk` pointing here, and the record is archived as Accepted, with the recheck triggers below in the Deferred table
**Priority:** P3
**Date:** 2026-10-03
**Resolved:** —
**Verification receipts:** [Triage](#triage--2026-10-03)

---

## Summary

Dependabot alert #77 (GHSA-vfj7-8cjw-p6xm, high) reports `braces` ≤ 3.0.3: a deeply nested brace pattern exhausts the stack, which is a denial of service. No fixed release exists. npm's latest `braces` is 3.0.3, and the advisory lists no patched version, although `pnpm audit` names a `>=3.0.4` that does not exist. No pin or override can close it. The installed copy is reached only by repository-fixed glob patterns, so it is not exploitable here, and the risk is accepted with recheck triggers.

## Evidence

Investigated on 2026-10-03, against `main` at `2c4113e1`, and rechecked against `dev` at `3e56a7e1`: npm's latest `braces` is still 3.0.3, and the advisory still names no patched version.

- **Chain.** `braces@3.0.3` is required only by `micromatch@4.0.8`, which reaches the lockfile two ways:
  - `fast-glob@3.3.3`, a direct dependency;
  - Jest and Metro tooling inside `react-native@0.84.1`, from `@clerk/ui`'s Solana wallet stack. That is the same unused tree DEBT-476 §F analysed for `stream-json`.
- **Callers.** No production module in `app/`, `components/`, `lib/` or `src/` imports `fast-glob`, `micromatch` or `braces`, so neither the Next.js server nor the client bundle reaches them. The callers are:
  - operator scripts: `scripts/seed/file-reader.ts` (the seed's content patterns), `scripts/import-draft-questions.ts` (`**/recall.md`, `**/vignettes.md`) and `scripts/crap-report.ts`;
  - test-only source scans: four under `tests/`, and `components/theme-token-regression-source-scan.ts`, which only `components/theme-token-regression.test.tsx` imports.

  Every pattern they pass is a constant in the repository. No input from a request, a learner or the network ever becomes a glob.
- **The other advisory `pnpm audit` lists**, `stream-json` (GHSA-528h-pc64-c93x), is alert #55, dismissed `not_used` on 2026-09-16 under DEBT-476 §F. It is unchanged.

## Triage — 2026-10-03

- **Disposition.** Accept the risk. A stack-exhaustion DoS needs an attacker-controlled brace pattern, and here only the repository writes patterns. The worst case is an operator script or a test failing on a pattern the repository itself added.
- **Not done, and why.**
  - No override: there is no fixed version to override to.
  - No replacement of `fast-glob`: Node's `fs.glob`, or a matcher without brace expansion, would change scripts and tests for no reachable risk.
  - No stub package for the Solana tree: as DEBT-476 recorded, that would silently break Clerk's Web3 sign-in if it were ever enabled.
- **Recheck triggers.** Any one reopens this record and the alert:
  - a fixed `braces` release, or a `micromatch` or `fast-glob` release that drops it, which is then taken by bump or override;
  - any runtime code that passes a request-, learner- or network-derived string to a glob;
  - Clerk enabling a Web3 strategy in this application, which would bring the Solana tree into use.

## Related

- [DEBT-476](../_archive/debt/debt-476-dependabot-alert-triage-2026-09.md) §F: the same unused Solana tree, for `stream-json`.
