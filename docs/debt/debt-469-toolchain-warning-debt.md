# DEBT-469: Toolchain Warning Debt — Restore the Abandoned Test-File-Size Policy and Gate on Zero Actionable Warnings

**Status:** Open (warning fixes and ratchets complete; suppression burn-down remains)
**Priority:** P3
**Date:** 2026-08-14
**Source:** Owner-directed estate investigation (2026-08-14): every quality-gate lane was executed on this branch with output captured and every warning line classified — all root-caused except W5, which remains an observed-but-unroot-caused startup flake carrying an observation duty — `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage` (436 files / 3,853 tests), `pnpm test:browser:coverage` (64 / 398), `pnpm db:test:up && pnpm test:integration:coverage` (38+1 skipped / 244+2 skipped), `pnpm build` (exit 0), plus the 2026-08-14 full-gate E2E log. A config experiment (restore-then-revert on `biome.json`) verified the headline fix before filing.
**Execution audit:** Re-run on current `dev` (`83873d6b`, 2026-08-15) before implementation; command-level receipts are recorded below. DEBT-466 Part A has landed since filing, so W6 is now a resolved historical failure signature rather than a gate exception.
**Implementation:** Resolution steps 1–4, 6, and the documentation-only step 7 completed on 2026-08-15. Step 5 is the explicitly separate split burn-down and remains Open.

---

## Description

The repository's standing practice has been to note warnings as "pre-existing" in gate summaries and move on. This item replaces that practice with a complete inventory, a root cause for each warning, and a fix-or-justify verdict — then installs the ratchets that keep the count of **actionable** warnings at zero. W1, W2, and W7 are now eliminated at the root; W3/W4 are non-actionable runner notices that still appear in lane output but gate nothing; W5 remains a narrowly documented exception with its own observation duty; W6 is historical because DEBT-466 Part A fixed it before this implementation. The final size-debt ledger is 28 reasoned `noExcessiveLinesPerFile` suppressions; including the repository's eight unrelated Biome directives, the full surface is now 36 `biome-ignore` directives across 34 files plus 14 `@ts-expect-error` uses across 7 files.

### Complete warning inventory (every lane, verbatim)

| # | Lane(s) | Warning (verbatim core) | Root cause | Verdict |
|---|---------|------------------------|------------|---------|
| W1 | `pnpm lint` | `Suppression comment has no effect.` at `src/adapters/gateways/stripe/stripe-webhook-processor.test.ts:1:1` (`// biome-ignore lint/style/noExcessiveLinesPerFile: …`) | The Biome 2.5.6 upgrade silently abandoned a deliberate policy (history below), so the rule the comment suppressed never fired | **Resolved** (Resolution 1–2): the policy is restored, all effective violations are reasoned, and the original suppression is load-bearing again |
| W2 | unit, browser (×2), integration | `Your Vite config uses features that are unsupported by 'configLoader: 'native'' … ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a '.mjs' extension or set "type": "module"` | The three configs were `.ts` files with ESM syntax in a CJS-typed package; after a `.mts` rename, their CommonJS-only `__dirname` use was the remaining native-loader incompatibility | **Resolved** (Resolution 3): all three configs are `.mts` and use `import.meta.dirname`; no ignore environment variable was added |
| W3 | browser (occasional) | `[vite] (client) Re-optimizing dependencies because vite config has changed` | Informational: the dep-optimizer cache keys on config hash, so alternating `test:browser` / `test:browser:coverage` re-optimizes once | **No action** — expected cache behavior, not a defect. Recorded so future gate readers don't re-investigate |
| W4 | E2E teardown | `[Clerk Testing] FAPI request failed after 4 attempts: … (Error: route.fetch: Test ended.)` | `@clerk/testing` route interception can keep retrying after Playwright ends a test and tears down its route; the final implementation gate emitted two copies after the successful `trial-start` test | **No action** — upstream teardown noise with no outcome effect. The current receipt supersedes the filing's narrower “failure-path-only” classification |
| W5 | gate practice | Browser lane occasionally fails its first bootstrap by ~1s (documented in `AGENTS.md` as retry-once) | Unroot-caused; plausibly the same dep-optimizer first-run race as W3 | **Keep the documented exception, add observation duty**: on the next occurrence, capture the failing log before retrying and attach it here. If it reproduces with W2 fixed and caches warm, file it as its own item |
| W6 | historical depth-3 and depth-10 E2E | `trial-start` failed with `pricing?checkout=error&plan=monthly` after retained same-tuple completions exceeded the fixed traversal depth | The pre-Part-A DEBT-466 subscription traversal bound stopped after three recovery creates; Part A's raised cap 10 later saturated at 11 retained terminal rungs | **Resolved by [DEBT-470](./debt-470-checkout-replay-tail-jump.md).** Subscription Checkout now uses a bounded exact-metadata list scan to seed the existing recovery key from the unique newest tail, so healthy recovery-create depth no longer scales with the retained chain. The temporary count-bearing preflight and its push exception are deleted; every `trial-start` failure is blocking. |
| W7 | local E2E when the caller exports `NO_COLOR` | `Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.` | When the caller exports `NO_COLOR=1`, Playwright 1.62.1 injects `FORCE_COLOR=1` into its web-server and worker children, producing 19 copies in the filing's audited full gate and 17 in the current-dev pre-fix focused smoke | **Resolved** (Resolution 6): `runCommandPlan` omits inherited `NO_COLOR` from only the marked Playwright child; the post-fix focused smoke emits zero copies |

Institutional (not printed warnings, but the reason warnings persist):

- Before this implementation, `lint` / `lint:ci` (`biome check .` / `biome ci .`) exited 0 on warning-level diagnostics. Both scripts now pass `--error-on-warnings`; installed Biome 2.5.6 exposes that flag on both commands.
- Coverage is collected in CI on all three vitest lanes and uploaded to Codecov, but there is no `codecov.yml` and no `coverage.thresholds` in any vitest config — measurement without enforcement. The threshold ratchet is designed in [DEBT-468](./debt-468-test-estate-coverage-and-fixture-debt.md) Part 4, not here.

### W1 history — a policy lost in an upgrade, not a decision

- `c6d94e80` (2026-04-30, "Add Biome test file size warn rule") added to `biome.json` an override for `**/*.test.ts`, `**/*.test.tsx`, `**/*.browser.spec.tsx`: `nursery.noExcessiveLinesPerFile` at `level: warn`, `maxLines: 800` — a deliberate reviewability policy for test files.
- `a4464f2f` (2026-08-07, DEBT-414 H10) grew `stripe-webhook-processor.test.ts` past the limit (860 lines today) and added the line-1 suppression with a written reason — correct behavior under the policy.
- `d3d3e558` ("Upgrade Biome to 2.5.6") rewrote the override to `style.noExcessiveLinesPerFile: "off"` when the rule graduated out of nursery. The `warn`/`maxLines: 800` policy vanished as an upgrade side effect; nothing in the commit records deciding to drop it. That orphaned the suppression, producing W1.

The policy's motivation has since been vindicated: this documentation campaign's own audits repeatedly flagged 1,500+-line test files as hard to review, and the estate has **29 test files over 800 physical lines** (`wc -l` final census; largest `src/adapters/jobs/reconcile-stripe-subscriptions.test.ts` at 1,799, then `stripe-webhook-controller.test.ts` 1,775 and `clerk-webhook-controller.test.ts` 1,669).

### Filing experiment receipts (2026-08-14, restore-then-revert, worktree restored)

Restoring `style.noExcessiveLinesPerFile` to `{ "level": "warn", "options": { "maxLines": 800 } }` in the existing test override and re-running Biome:

1. `biome check src/adapters/gateways/stripe/stripe-webhook-processor.test.ts` → **clean**. The existing line-1 `// biome-ignore` comment suppresses the restored rule under Biome 2.5.6 as-is (no `biome-ignore-all` conversion needed), and the W1 unused-suppression warning disappears because the suppression now has effect.
2. `biome check .` → **27 warnings** repo-wide (the other over-limit files; Biome's line accounting differs slightly from raw `wc -l`, hence 27 rather than 28).
3. Copying the three configs verbatim to `.mts` and running one spec in each lane did **not** remove W2: Vite instead identified `__dirname` in each renamed config and said to use `import.meta.dirname`.
4. Replacing only those three `__dirname` references with `import.meta.dirname` made the same focused runs clean: unit 1 file / 17 tests, browser 1 / 2, integration 1 / 1, with no native-loader warning.
5. The full E2E gate with inherited `NO_COLOR=1` emitted W7 19 times. `env -u NO_COLOR pnpm test:e2e tests/e2e/smoke.spec.ts` then passed setup + smoke (2/2) with zero warning lines, proving the scoped environment fix.

### Current-dev execution-audit receipts (2026-08-15, all spikes reverted)

1. The complete test-glob census — `rg --files -g '*.test.ts' -g '*.test.tsx' -g '*.browser.spec.tsx' -0 | xargs -0 wc -l | sort -nr` filtered to `>800` — still returns **29 files**. The same three files remain largest at 1,798 / 1,774 / 1,668 lines. No `stripe-checkout-sessions*` file is over the limit, so the DEBT-467 deferral guard has no current census entry. The smallest raw-census entry, `tests/integration/idempotency-key-repository.integration.test.ts` at 803 physical lines, does not violate Biome's rule accounting.
2. Restoring `{ "level": "warn", "options": { "maxLines": 800 } }` in the test override and running `pnpm exec biome check . --max-diagnostics=100` still emits exactly **27 warnings**; the other Biome-effective oversized file is the already-suppressed `stripe-webhook-processor.test.ts`, for a post-implementation ledger of 28 load-bearing size suppressions. A focused check of that file is clean, proving its line-1 suppression still has effect. `biome.json` was restored to `"off"` and `git diff --exit-code -- biome.json` passed before this audit commit.
3. Copying all three current configs verbatim to `.mts` and running one spec per lane still produces the `__dirname` diagnostic: unit 1 file / 17 tests, browser 1 / 2 (the diagnostic appears twice because the browser config loads twice), integration 1 / 1. Replacing only the copied configs' three references with `import.meta.dirname` makes the same runs pass without the native-loader warning. The three copies were then deleted.
4. `pnpm exec biome check --help` and `pnpm exec biome ci --help` both list `--error-on-warnings`; `pnpm exec biome --version` reports 2.5.6.
5. `NO_COLOR=1 pnpm test:e2e tests/e2e/smoke.spec.ts` passes setup + smoke (2/2) but emits the exact NO_COLOR/FORCE_COLOR warning **17 times** on current `dev`. The caller environment enters at `runLocalE2E`'s `runPlan(plan, { env })`; the mutation seam is `runCommandPlan` in `scripts/e2e-local-orchestrator.ts`, where caller and per-step environments are merged immediately before the `spawn` invocation. That is the seam Resolution 6 changes; plan creation, database, migration, and seed environments stay untouched.
6. `AGENTS.md`'s full-gate section exactly preserves W5's narrow contract: capture the ~1-second `no tests / 1 error` browser-bootstrap log, retry that lane once, and treat a second failure as blocking. DEBT-468 Part 3 still coordinates fixture extraction with this item's split ledger, while Part 4 still owns the separately ADR-gated coverage-threshold ratchet. DEBT-466 Part A removed the old depth-3 allowance; the 2026-08-17 finite-cap recurrence is acceptable only with the new count-bearing preflight receipt, never from `checkout=error` alone.

## Impact

- A warning that has survived every gate summary since the Biome upgrade trains readers to skim past the warning section — which is how new warnings get absorbed silently.
- The lost policy is doing no work while the condition it guarded against grows: the three largest offenders are exactly the files DEBT-468's fixture analysis identifies as duplication-heavy, and reviewers (human and agent) demonstrably struggle with them.
- Warning-level diagnostics cannot block CI today, so the only enforcement is humans reading logs.

## Resolution (current-dev execution audit complete; coordinates with DEBT-468)

1. **Completed 2026-08-15 — restore the test-file-size policy** in `biome.json`'s existing test-glob override: `style.noExcessiveLinesPerFile` at `level: warn`, `options.maxLines: 800` — the original c6d94e80 parameters, in the rule's post-nursery group.
2. **Completed 2026-08-15 — annotate the current over-limit files in the same change.** Each Biome-effective oversized file has a head-of-file `// biome-ignore lint/style/noExcessiveLinesPerFile: <named reason> — split tracked by DEBT-469.` suppression. It is line 1 except in the five jsdom suites where the repository's mandatory `// @vitest-environment jsdom` pragma must remain line 1 and the suppression is line 2. This makes the debt visible and lets step 4 gate on zero warnings immediately.
3. **Completed 2026-08-15 — make the vitest configs native-ESM-compatible:** rename them to `.mts` (`vitest.config.mts`, `vitest.browser.config.mts`, `vitest.integration.config.mts`) and replace `path.resolve(__dirname, './')` with `path.resolve(import.meta.dirname, './')` in each. The `--config` references and live documentation now use the new names.
4. **Completed 2026-08-15 — turn warnings into failures:** add `--error-on-warnings` to both `lint` and `lint:ci`. An oversized new test file without a written reason — or any future warning-class regression — now fails CI instead of accruing. This is a lint-diagnostics gate, not an ADR-019 quality-metric gate; DEBT-468 Part 4 separately owns coverage thresholds.
5. **Open; explicitly out of scope for this implementation PR — burn down the suppressions by splitting files, largest and most-audited first.** Preferred seam: split by concern following the repo's own precedent (`stripe-checkout-sessions-*.test.ts`, the seven `practice-controller-*` suites). Sequence with DEBT-468 Part 3: fixture proposals (a), (b), (b2), and (c) mechanically shrink the biggest offenders (e.g., `stripe-webhook-controller.test.ts` carries 28 hand-rolled `webhookResult` literals), so extract-then-split avoids splitting duplication into more files. Each split removes that file's suppression. No completion deadline — but note the gate in step 4 alone does not make the suppression set monotonic (a new oversized file can add a reasoned suppression and pass): each new `noExcessiveLinesPerFile` suppression must cite this item or a successor debt item in its reason, reviewers reject uncited ones, and the suppression census recorded here is the shrink ledger — additions happen only deliberately and visibly.
6. **Completed 2026-08-15 — remove the local E2E color-environment conflict:** Playwright command steps mark `NO_COLOR` for omission, and `runCommandPlan` deletes that key from only those child environments after merging caller and step values. Database, migration, and seed children preserve the caller environment.
7. **Completed as documentation — record the non-actionables** (W3, W4) here so future gate summaries can cite this item instead of re-investigating, and keep W5's observation duty until it either reproduces (file it) or six months pass without recurrence (drop the exception note from `AGENTS.md`).

### Implementation receipts (2026-08-15)

- TDD red: after updating contracts first, `pnpm test --run scripts/e2e-local-orchestrator.test.ts scripts/run-local-integration.test.ts` failed 9 of 22 cases on the old `.ts` paths, missing lint flags, missing Playwright marker, and inherited `NO_COLOR`. Green: the same 2 files / 22 tests pass without the W2 warning after implementation.
- Config/lane proof: full unit is 436 files / 3,858 tests (this PR adds exactly 3 contract cases and no test files, preserving the current-dev 436 / 3,855 collection); browser remains 64 / 398; integration remains 38 passed + 1 skipped files / 244 passed + 2 skipped tests. All three logs contain zero native-loader/configLoader warnings.
- Ratchet proof: temporarily removing `stripe-webhook-processor.test.ts:1` made `pnpm lint` exit 1 on exactly one `noExcessiveLinesPerFile` warning; restoring it made `pnpm lint` and `pnpm lint:ci` pass with zero warnings.
- W7 proof: with base `NO_COLOR=1`, the new orchestrator contract preserves it for the first three database/migration/seed invocations and removes it from only Playwright. The real focused command `NO_COLOR=1 pnpm test:e2e tests/e2e/smoke.spec.ts` passed setup + smoke (2/2) and moved the exact warning count from 17 before the fix to 0 after it.
- Guard proof: the final 29-file raw census still contains no `src/adapters/gateways/stripe/stripe-checkout-sessions*` path, and the implementation diff contains no such path; nothing was annotated or changed on DEBT-467's parallel surface.
- Canonical gate: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm db:test:up && pnpm test:integration && pnpm build && pnpm test:e2e` passed in order. E2E finished 37 passed with one captured retry-recovered practice-flow flake; `trial-start` passed, no `checkout=error` signature appeared, and the NO_COLOR/FORCE_COLOR count remained zero. Two W4 Clerk teardown notices appeared after the successful final test, which corrects the filing's “never on a green run” claim without changing W4's non-actionable verdict.

### Suppression burn-down ledger (28 files at implementation)

Physical lines are the post-annotation `wc -l` values. The head comment in every row names its retained concern and cites DEBT-469. `tests/integration/idempotency-key-repository.integration.test.ts` remains in the raw physical census at 803 lines but is intentionally absent because it does not violate Biome's accounting and a suppression would itself be an unused-suppression warning.

| Physical lines | Test file |
|---------------:|-----------|
| 1,799 | `src/adapters/jobs/reconcile-stripe-subscriptions.test.ts` |
| 1,775 | `src/adapters/controllers/stripe-webhook-controller.test.ts` |
| 1,669 | `src/adapters/controllers/clerk-webhook-controller.test.ts` |
| 1,584 | `src/application/use-cases/finalize-exam-answers.test.ts` |
| 1,548 | `app/(marketing)/checkout/success/page.test.ts` |
| 1,531 | `src/adapters/gateways/stripe-payment-gateway.test.ts` |
| 1,510 | `app/(app)/app/questions/[slug]/question-page-client.test.tsx` |
| 1,418 | `app/pricing/page.test.tsx` |
| 1,345 | `tests/integration/controllers.integration.test.ts` |
| 1,345 | `app/(app)/app/practice/[sessionId]/practice-session-page-logic.test.ts` |
| 1,275 | `src/application/use-cases/get-previous-attempt.test.ts` |
| 1,265 | `app/(app)/app/practice/shared/question-flow-actions.test.ts` |
| 1,260 | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-review-stage.browser.spec.tsx` |
| 1,247 | `components/question/feedback.test.tsx` |
| 1,223 | `app/(app)/app/questions/[slug]/question-page-logic.test.ts` |
| 1,168 | `app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.browser.spec.tsx` |
| 1,149 | `tests/integration/session-attempt-repository.integration.test.ts` |
| 1,121 | `src/adapters/repositories/drizzle-attempt-repository.test.ts` |
| 942 | `app/api/cron/reconcile-stripe-subscriptions/route.test.ts` |
| 940 | `tests/integration/stripe-subscription-writer-lock-order.integration.test.ts` |
| 916 | `src/adapters/controllers/controller-output-datetime-contract.test.ts` |
| 890 | `proxy.test.ts` |
| 879 | `tests/integration/bug-regression-active-exam-latest-attempt-fallback.integration.test.ts` |
| 877 | `src/application/test-helpers/fakes/fake-attempt-repository.test.ts` |
| 872 | `app/(app)/app/practice/[sessionId]/page.test.tsx` |
| 860 | `src/adapters/gateways/stripe/stripe-webhook-processor.test.ts` |
| 853 | `app/(app)/app/shared/question-feedback-actions.test.ts` |
| 823 | `tests/e2e/helpers/reset-e2e-user-state.test.ts` |

**Rejected alternatives:**

- **`VITE_CONFIG_NATIVE_IGNORE_WARNING=true`** — mutes the messenger; the CJS/ESM mismatch would resurface as a hard break on Vite's next major.
- **Deleting the stale suppression and leaving the rule off** — resolves W1's letter while abandoning the policy the suppression served; the 29-file census shows the policy is needed more now than when it was written.
- **Restoring the rule with `maxLines` above the current maximum (e.g., 1,800)** — a threshold nothing violates enforces nothing and would ratchet in the wrong direction as files grow toward it.
- **Setting `"type": "module"` in `package.json`** — addresses the `.ts` file-mode mismatch but still requires replacing `__dirname`, and repackages every `.js`/config file in the repo as ESM; far larger blast radius than renaming three files.

## Verification

- [x] `pnpm lint` and `pnpm lint:ci` exit 0 **with `--error-on-warnings` active** on a clean tree
- [x] `pnpm test --run`, `pnpm test:browser`, `pnpm test:integration` produce no Vite configLoader warning; existing file/test collection is preserved plus the 3 intentional unit contract cases
- [x] `stripe-webhook-processor.test.ts:1` suppression is load-bearing (removing it locally makes lint fail) — the W1 condition cannot recur
- [x] Every Biome-effective oversized test file carries a reasoned head suppression referencing this item; the 28-file ledger is recorded above and decreases with each split PR
- [x] With caller `NO_COLOR=1`, `pnpm test:e2e tests/e2e/smoke.spec.ts` emits no `NO_COLOR`/`FORCE_COLOR` warning
- [x] W3/W4 documented as expected; W5 observation note remains present in `AGENTS.md`

## Related

- [DEBT-468](./debt-468-test-estate-coverage-and-fixture-debt.md) — fixture extraction shrinks the same oversized files this item splits; coverage-threshold ratchet lives there
- [DEBT-466](./debt-466-checkout-idempotency-replay-chain-exhaustion.md) / [DEBT-470](./debt-470-checkout-replay-tail-jump.md) — Part A resolved historical depth-3 W6; DEBT-470 resolves the later depth-10 recurrence and retires the count-bearing local exception, so every `pricing?checkout=error&plan=monthly` remains a defect signal
- [DEBT-465](./debt-465-test-quality-practices-adoption.md) — the practices campaign this investigation extends
- `c6d94e80`, `d3d3e558`, `a4464f2f` — the W1 timeline receipts
