# DEBT-495: braces Denial-of-Service Advisory With No Fixed Release

> Close using [the archive convention](../../../AGENTS.md#closing-and-archiving-documentation-records).

**Status:** Accepted (accepted risk) — 2026-10-03 UTC, under the owner's delegation ([Verified closeout](#verified-closeout--2026-10-03-utc)). Dependabot alert #77 stays **open** as the watcher for a fix; it was dismissed on 2026-10-03 and reopened on 2026-10-04 ([Correction](#correction--2026-10-04-alert-77-reopened)). The other recheck triggers are in the register's Deferred table.
**Priority:** P3
**Date:** 2026-10-03
**Resolved:** 2026-10-03
**Verification receipts:** [Triage](#triage--2026-10-03), [Verified closeout](#verified-closeout--2026-10-03-utc)

---

## Summary

Dependabot alert #77 (GHSA-vfj7-8cjw-p6xm, high) reports `braces` ≤ 3.0.3: a deeply nested brace pattern exhausts the stack, which is a denial of service. No fixed release exists. npm's latest `braces` is 3.0.3, and the advisory lists no patched version, although `pnpm audit` names a `>=3.0.4` that does not exist. No pin or override can close it. The installed copy is reached only by repository-fixed glob patterns, so it is not exploitable here, and the risk is accepted with recheck triggers.

## Evidence

Investigated on 2026-10-03, against `main` at `2c4113e1`, and rechecked against `dev` at `3e56a7e1`: npm's latest `braces` is still 3.0.3, and the advisory still names no patched version.

- **Chain.** `braces@3.0.3` is required only by `micromatch@4.0.8`, which reaches the lockfile two ways:
  - `fast-glob@3.3.3`, a direct dependency;
  - Jest and Metro tooling inside `react-native@0.84.1`, from `@clerk/ui`'s Solana wallet stack. That is the same unused tree DEBT-476 §F analysed for `stream-json`.

  *Corrected 2026-10-06: [DEBT-504](../../debt/debt-504-dependabot-alert-triage-2026-10.md) stopped installing `react-native`, so `fast-glob` is now the only chain and the Web3 recheck trigger no longer applies to `braces`.*
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

## Verified closeout — 2026-10-03 UTC

- **Filed** in #1353 (**5402919324** on `c330911e`; merged `19d383ea`). CodeRabbit raised two findings:
  - the register tied this record's closure to DEBT-493's, which was accepted and corrected;
  - a P3 record cannot be accepted, which was declined: the terminal-close rule it cited governs terminal-close sweep findings, and DEBT-408, DEBT-437 and DEBT-476 record accepted risks at P3 and P2.
- **Released** through promotion #1355 (`e2981bea`): main CI **37162107658** `test` passed **23:46:32Z**; production assigned **23:46:33.856Z**; `main` and `dev` trees `3dc0ed23`; production health 200 (`{"ok":true,"db":true}`).
- **Alert #77** (GHSA-vfj7-8cjw-p6xm) dismissed as `tolerable_risk` at **2026-10-03 23:32:48Z**, with a comment pointing to this record. At that time npm's latest `braces` was still 3.0.3 and the advisory named no patched version.
- **Monitoring.** The recheck triggers in Triage are the register's Deferred row. Any one of them reopens this record and the alert.

## Correction — 2026-10-04: alert #77 reopened

The dismissal above hid the one trigger that can arrive without our action: a fixed `braces` release. The owner relayed a review note saying so, and GitHub's documentation confirms it:
- **Dismissal stops tracking.** A manually dismissed Dependabot alert stays dismissed when a patched version ships. Only an auto-triage rule set to dismiss "until a patch is available" reopens on its own.
- **Dismissal stops the fix.** Dependabot security updates are enabled for this repository, but they raise a fix PR only for an open alert.
- **Nothing else watched.** The register's Deferred row is read only when someone reviews the register, so the first recheck trigger in Triage had no watcher.

**What changed.**
- Alert #77 was reopened at **2026-10-04 01:07:06Z**. While it is open, Dependabot raises the fix PR as soon as a patched `braces` is published within `micromatch`'s range.
- The risk acceptance stands; only the watcher changed. The open alert is a known, accepted risk, not an untriaged one.
- **The other two triggers** need code or configuration to change, and the Deferred row still carries them: a glob built from untrusted input, and Clerk enabling Web3 sign-in.
- **Alert #55** (`stream-json`, [DEBT-476](./debt-476-dependabot-alert-triage-2026-09.md)) was dismissed by the owner on 2026-09-16 and is left as the owner decided.

## Related

- [DEBT-476](./debt-476-dependabot-alert-triage-2026-09.md) §F: the same unused Solana tree, for `stream-json`.
