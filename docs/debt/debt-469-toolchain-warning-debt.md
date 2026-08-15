# DEBT-469: Toolchain Warning Debt — Restore the Abandoned Test-File-Size Policy and Gate on Zero Actionable Warnings

**Status:** Open
**Priority:** P3
**Date:** 2026-08-14
**Source:** Owner-directed estate investigation (2026-08-14): every quality-gate lane was executed on this branch with output captured and every warning line classified — all root-caused except W5, which remains an observed-but-unroot-caused startup flake carrying an observation duty — `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage` (436 files / 3,853 tests), `pnpm test:browser:coverage` (64 / 398), `pnpm db:test:up && pnpm test:integration:coverage` (38+1 skipped / 244+2 skipped), `pnpm build` (exit 0), plus the 2026-08-14 full-gate E2E log. A config experiment (restore-then-revert on `biome.json`) verified the headline fix before filing.
**Execution audit:** Re-run on current `dev` (`83873d6b`, 2026-08-15) before implementation; command-level receipts are recorded below. DEBT-466 Part A has landed since filing, so W6 is now a resolved historical failure signature rather than a gate exception.

---

## Description

The repository's standing practice has been to note warnings as "pre-existing" in gate summaries and move on. This item replaces that practice with a complete inventory, a root cause for each warning, and a fix-or-justify verdict — then installs the ratchets that keep the count of **actionable** warnings at zero. Scope, so the goal and the checklist can both be true: W1, W2, and W7 are eliminated at the root; W3/W4 are non-actionable runner notices that still appear in lane output but gate nothing; W5 remains a narrowly documented exception with its own observation duty; W6 is historical because DEBT-466 Part A has fixed it on current `dev`. The estate is genuinely close: `pnpm typecheck` and `pnpm build` emit **zero** warnings, and the current-dev suppression sweep still finds 9 `biome-ignore` directives (7 files) plus 14 `@ts-expect-error` uses — all but one of them reasoned and behavior-verifying.

### Complete warning inventory (every lane, verbatim)

| # | Lane(s) | Warning (verbatim core) | Root cause | Verdict |
|---|---------|------------------------|------------|---------|
| W1 | `pnpm lint` | `Suppression comment has no effect.` at `src/adapters/gateways/stripe/stripe-webhook-processor.test.ts:1:1` (`// biome-ignore lint/style/noExcessiveLinesPerFile: …`) | The Biome 2.5.6 upgrade silently abandoned a deliberate policy (history below), so the rule the comment suppresses never fires | **Fix by restoring the policy** (Resolution 1–2), which makes this suppression meaningful again — verified by experiment |
| W2 | unit, browser (×2), integration | `Your Vite config uses features that are unsupported by 'configLoader: 'native'' … ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a '.mjs' extension or set "type": "module"` | All three vitest configs are `.ts` files with ESM syntax in a CJS-typed package; after renaming to `.mts`, their CommonJS-only `__dirname` use is the remaining native-loader incompatibility (`Use import.meta.dirname instead`) | **Fix at the root** (Resolution 3): rename the three configs to `.mts` **and** replace `__dirname` with `import.meta.dirname`. Do **not** set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` — that is silencing, and the underlying incompatibility would still bite on the Vite major |
| W3 | browser (occasional) | `[vite] (client) Re-optimizing dependencies because vite config has changed` | Informational: the dep-optimizer cache keys on config hash, so alternating `test:browser` / `test:browser:coverage` re-optimizes once | **No action** — expected cache behavior, not a defect. Recorded so future gate readers don't re-investigate |
| W4 | E2E (failure paths only) | `[Clerk Testing] FAPI request failed after 4 attempts: … (Error: route.fetch: Test ended.)` | `@clerk/testing` route interception keeps retrying after Playwright tears the page down mid-failure; appears only in already-failing runs (observed in the 2026-08-14 trial-start failure log) | **No action** — upstream, cosmetic, failure-path-only. Never observed on a green run |
| W5 | gate practice | Browser lane occasionally fails its first bootstrap by ~1s (documented in `AGENTS.md` as retry-once) | Unroot-caused; plausibly the same dep-optimizer first-run race as W3 | **Keep the documented exception, add observation duty**: on the next occurrence, capture the failing log before retrying and attach it here. If it reproduces with W2 fixed and caches warm, file it as its own item |
| W6 | historical E2E (resolved on current `dev`) | `trial-start` failing with `pricing?checkout=error&plan=monthly` after >3 same-day completed checkouts | The pre-Part-A DEBT-466 subscription traversal bound stopped after three recovery creates | **Resolved before this implementation** — [DEBT-466](./debt-466-checkout-idempotency-replay-chain-exhaustion.md) Part A raised and split the bound, and five consecutive retained-chain `trial-start` runs passed. This signature is now a real defect signal, not an acceptable gate exception |
| W7 | local E2E when the caller exports `NO_COLOR` | `Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.` | When the caller exports `NO_COLOR=1`, Playwright 1.62.1 unconditionally injects `FORCE_COLOR=1` into its web-server and worker children, producing 19 copies in the filing's audited full gate and 17 in the current-dev focused smoke | **Fix in the local E2E orchestrator** (Resolution 6): omit inherited `NO_COLOR` only from the Playwright command's child environment; Playwright overrides it anyway, and a focused smoke proved omission removes the warning |

Institutional (not printed warnings, but the reason warnings persist):

- `lint` / `lint:ci` (`biome check .` / `biome ci .`) exit 0 on warning-level diagnostics, so W1 has never blocked anything. Installed Biome 2.5.6 supports `--error-on-warnings` on both commands (verified in both `biome check --help` and `biome ci --help`).
- Coverage is collected in CI on all three vitest lanes and uploaded to Codecov, but there is no `codecov.yml` and no `coverage.thresholds` in any vitest config — measurement without enforcement. The threshold ratchet is designed in [DEBT-468](./debt-468-test-estate-coverage-and-fixture-debt.md) Part 4, not here.

### W1 history — a policy lost in an upgrade, not a decision

- `c6d94e80` (2026-04-30, "Add Biome test file size warn rule") added to `biome.json` an override for `**/*.test.ts`, `**/*.test.tsx`, `**/*.browser.spec.tsx`: `nursery.noExcessiveLinesPerFile` at `level: warn`, `maxLines: 800` — a deliberate reviewability policy for test files.
- `a4464f2f` (2026-08-07, DEBT-414 H10) grew `stripe-webhook-processor.test.ts` past the limit (860 lines today) and added the line-1 suppression with a written reason — correct behavior under the policy.
- `d3d3e558` ("Upgrade Biome to 2.5.6") rewrote the override to `style.noExcessiveLinesPerFile: "off"` when the rule graduated out of nursery. The `warn`/`maxLines: 800` policy vanished as an upgrade side effect; nothing in the commit records deciding to drop it. That orphaned the suppression, producing W1.

The policy's motivation has since been vindicated: this documentation campaign's own audits repeatedly flagged 1,500+-line test files as hard to review, and the estate now has **29 test files over 800 lines** (`wc -l` census; largest `src/adapters/jobs/reconcile-stripe-subscriptions.test.ts` at 1,798, then `stripe-webhook-controller.test.ts` 1,774 and `clerk-webhook-controller.test.ts` 1,668).

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
6. `AGENTS.md`'s full-gate section exactly preserves W5's narrow contract: capture the ~1-second `no tests / 1 error` browser-bootstrap log, retry that lane once, and treat a second failure as blocking. DEBT-468 Part 3 still coordinates fixture extraction with this item's split ledger, while Part 4 still owns the separately ADR-gated coverage-threshold ratchet. DEBT-466 Part A is implemented, so its former `checkout=error` allowance has been removed from this item's active exceptions.

## Impact

- A warning that has survived every gate summary since the Biome upgrade trains readers to skim past the warning section — which is how new warnings get absorbed silently.
- The lost policy is doing no work while the condition it guarded against grows: the three largest offenders are exactly the files DEBT-468's fixture analysis identifies as duplication-heavy, and reviewers (human and agent) demonstrably struggle with them.
- Warning-level diagnostics cannot block CI today, so the only enforcement is humans reading logs.

## Resolution (current-dev execution audit complete; coordinates with DEBT-468)

1. **Restore the test-file-size policy** in `biome.json`'s existing test-glob override: `style.noExcessiveLinesPerFile` at `level: warn`, `options.maxLines: 800` — the original c6d94e80 parameters, in the rule's post-nursery group.
2. **Annotate the current over-limit files in the same change.** Each of the ~27 newly-warned files gets a line-1 `// biome-ignore lint/style/noExcessiveLinesPerFile: <named reason> — split tracked by DEBT-469.` suppression, mirroring the one legitimate suppression that already exists. This makes the debt visible at the head of every oversized file instead of invisible in a disabled rule, and it makes the warning count zero *now* so step 4's gate can land immediately.
3. **Make the vitest configs native-ESM-compatible:** rename them to `.mts` (`vitest.config.mts`, `vitest.browser.config.mts`, `vitest.integration.config.mts`) and replace `path.resolve(__dirname, './')` with `path.resolve(import.meta.dirname, './')` in each. Update the `--config` references in `package.json`, `scripts/run-local-integration.ts` and its tests, plus live doc mentions. The focused three-lane spike proves both changes are required and together eliminate W2 with no observed behavior change. Re-run all three full lanes to verify the warning is gone and counts are unchanged.
4. **Turn warnings into failures:** add `--error-on-warnings` to both `lint` and `lint:ci`. From then on, an oversized new test file without a written reason — or any future warning-class regression — fails CI instead of accruing. (This is a lint-diagnostics gate, the same class as the existing error-level Biome rules — not a quality-*metric* gate, so ADR-019's observational posture, which governs coverage/CRAP/mutation metrics, is not implicated; DEBT-468 Part 4's coverage thresholds are the ones gated on a new ADR.)
5. **Burn down the suppressions by splitting files, largest and most-audited first.** Preferred seam: split by concern following the repo's own precedent (`stripe-checkout-sessions-*.test.ts`, the seven `practice-controller-*` suites). Sequence with DEBT-468 Part 3: fixture proposals (a), (b), (b2), and (c) mechanically shrink the biggest offenders (e.g., `stripe-webhook-controller.test.ts` carries 28 hand-rolled `webhookResult` literals), so extract-then-split avoids splitting duplication into more files. Each split removes that file's suppression. No completion deadline — but note the gate in step 4 alone does not make the suppression set monotonic (a new oversized file can add a reasoned suppression and pass): each new `noExcessiveLinesPerFile` suppression must cite this item or a successor debt item in its reason, reviewers reject uncited ones, and the suppression census recorded here is the shrink ledger — additions happen only deliberately and visibly.
6. **Remove the local E2E color-environment conflict:** mark the Playwright command step as omitting inherited `NO_COLOR`, and have `runCommandPlan` delete that key from only that child environment before spawn. Add an orchestrator contract test with `NO_COLOR=1`; the Playwright invocation must omit it while database/migration/seed invocations preserve the caller environment. Playwright already forces color for its web server and workers, so this changes no effective color behavior.
7. **Record the non-actionables** (W3, W4) here so future gate summaries can cite this item instead of re-investigating, and keep W5's observation duty until it either reproduces (file it) or six months pass without recurrence (drop the exception note from `AGENTS.md`).

**Rejected alternatives:**

- **`VITE_CONFIG_NATIVE_IGNORE_WARNING=true`** — mutes the messenger; the CJS/ESM mismatch would resurface as a hard break on Vite's next major.
- **Deleting the stale suppression and leaving the rule off** — resolves W1's letter while abandoning the policy the suppression served; the 29-file census shows the policy is needed more now than when it was written.
- **Restoring the rule with `maxLines` above the current maximum (e.g., 1,800)** — a threshold nothing violates enforces nothing and would ratchet in the wrong direction as files grow toward it.
- **Setting `"type": "module"` in `package.json`** — addresses the `.ts` file-mode mismatch but still requires replacing `__dirname`, and repackages every `.js`/config file in the repo as ESM; far larger blast radius than renaming three files.

## Verification

- [ ] `pnpm lint` and `pnpm lint:ci` exit 0 **with `--error-on-warnings` active** on a clean tree
- [ ] `pnpm test --run`, `pnpm test:browser`, `pnpm test:integration` produce no Vite configLoader warning; file/test counts unchanged from the baselines above
- [ ] `stripe-webhook-processor.test.ts:1` suppression is load-bearing (removing it locally makes lint fail) — the W1 condition cannot recur
- [ ] Every remaining oversized test file carries a reasoned line-1 suppression referencing this item; the suppression count is recorded here and decreases with each split PR
- [ ] With caller `NO_COLOR=1`, `pnpm test:e2e tests/e2e/smoke.spec.ts` emits no `NO_COLOR`/`FORCE_COLOR` warning
- [ ] W3/W4 documented as expected; W5 observation note present in `AGENTS.md` or retired with rationale

## Related

- [DEBT-468](./debt-468-test-estate-coverage-and-fixture-debt.md) — fixture extraction shrinks the same oversized files this item splits; coverage-threshold ratchet lives there
- [DEBT-466](./debt-466-checkout-idempotency-replay-chain-exhaustion.md) — Part A resolved historical W6; `pricing?checkout=error&plan=monthly` is again a real defect signal
- [DEBT-465](./debt-465-test-quality-practices-adoption.md) — the practices campaign this investigation extends
- `c6d94e80`, `d3d3e558`, `a4464f2f` — the W1 timeline receipts
