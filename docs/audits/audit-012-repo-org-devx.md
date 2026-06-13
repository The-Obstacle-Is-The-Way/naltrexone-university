# AUDIT-012 — Repository Organization, Dev Tooling & Agent Documentation Audit

**Project:** Naltrexone University
**Date:** 2026-06-13
**Branch:** `audit/repo-org-devx-2026-06`
**Scope:** Whole-repo organizational & DevX review — CI/CD and dev tooling, `AGENTS.md` / `CLAUDE.md` / `.claude/rules` accuracy, file/directory organization vs Clean Architecture, and code quality vs Clean Code + *A Philosophy of Software Design* (PoSD).
**Method:** Four parallel read-only audit agents (one per dimension), each grounding every claim in `file:line` evidence; headline findings independently re-verified by the lead before writing.
**Status:** Active — findings below should be triaged into `docs/debt/` / `docs/bugs/` and this audit archived once actioned.

---

## Executive Summary

**Verdict: the codebase is fundamentally sound. No significant reorganization is needed.** The hard, expensive-to-fix things — domain purity, inward-only dependency direction, a correctly-factored composition root, textbook test placement, clean error handling, zero untracked tech debt — are genuinely done right. This is a notably disciplined repository.

Every code/structure finding is **LOW severity polish**. The two findings that actually matter are **not in the code at all** — they are about *enforcement*:

1. **🔴 CRITICAL (platform/process):** `main` has **no branch protection and no rulesets**, on a **public** repo. CI runs the full gate on every push/PR but nothing requires it to be green — or requires the mandated CodeRabbit review — before a merge. The repo's documented safety guarantees are not enforced by the platform.
2. **🟠 MEDIUM (architecture):** Clean Architecture layering is upheld **by convention only**. There is no `dependency-cruiser`, `madge`, or boundary test — even though ADR-001 explicitly recommends them. The layers are clean *today*; the risk is silent drift the first time someone is in a hurry.

Everything else is a cluster of low-risk hygiene items: a handful of stale facts in `AGENTS.md`, `CLAUDE.md` duplicating content it explicitly says it shouldn't, six PascalCase filenames fighting the kebab-case majority, inconsistent route colocation, and one small logging-idiom duplication.

### Scorecard

| Dimension | Grade | One-line |
|-----------|-------|----------|
| CI/CD pipeline config | A | Zero failure-swallowing; full gate present and correctly ordered; anti-suppression guardrails baked in. |
| **Merge enforcement (platform)** | **F** | **No branch protection / rulesets on a public `main`. CI gates nothing.** |
| Lint / type / build config | A | `strict: true`, no `ignoreBuildErrors`, no disabled-rule cheating, zero `any`/`@ts-ignore`. |
| Agent/dev docs accuracy | B+ | Mostly accurate & well cross-referenced; a few stale facts + self-imposed-rule duplication. |
| Clean Architecture compliance | A− | Domain pure, deps inward, composition root correct — but enforced by convention, not tooling. |
| File organization | A− | Clean tree, no orphans/committed cruft; minor casing + colocation inconsistencies. |
| Code quality (Clean Code / PoSD) | A | Deep modules, strategic programming, zero untracked TODO/FIXME/HACK, disciplined error handling. |

---

## 1. CI/CD & Dev Tooling

**Headline: unusually disciplined config. Zero failure-swallowing anywhere.** No `continue-on-error`, no `|| true`, no `set +e`, no `--passWithNoTests`, no `--no-verify` in CI. The only `|| true` in the repo is a kill-stale-local-server line in `scripts/e2e-local-orchestrator.ts:75` (correct use). CI runs the full gate in the right order: typecheck → `biome ci` lint → DB migrate+seed → unit (coverage) → integration (coverage) → browser (coverage) → build → E2E smoke. Anti-suppression guardrails are *built into* CI: the "Enforce E2E skip policy" step (`ci.yml:91-104`) fails the build on any non-credential `test.skip(...)`, and `playwright forbidOnly` fails on a committed `test.only`. Meta-tests (`tests/ci-workflow.test.ts`, `playwright.config.test.ts`, `sentry-config.test.ts`) regression-protect the tooling itself.

### Findings

| # | Sev | Finding | Evidence | Fix |
|---|-----|---------|----------|-----|
| CI-1 | 🔴 Critical | **`main` has no branch protection and no rulesets** — CI does not gate merges, and the "never merge without CodeRabbit" mandate is unenforced. Repo is **PUBLIC**. | `gh api .../branches/main/protection` → `404 Branch not protected`; `gh api .../rulesets` → `[]`; `gh repo view` → `visibility: PUBLIC`. Verified by lead. | Add a ruleset on `main`: require the `test` status check, require PR review, require `coderabbitai[bot]`, disallow direct pushes. Closes CI-2 risk too. |
| CI-2 | 🟡 Medium | Pre-push hook runs only `typecheck && test --run` — by design. With CI-1 unfixed, the *only* enforcement of lint/browser/integration/build/E2E is a CI run that nothing requires to be green. | `.husky/pre-push:3`; matches `CLAUDE.md`/`AGENTS.md:226` (doc is accurate). | Make CI the source of truth and a required check (CI-1). The lightweight hook is fine *once CI gates merges*. |
| CI-3 | 🟢 Low | Coverage is collected & uploaded but never enforced — no thresholds, `fail_ci_if_error: false`. Easy to mistake for a gate. | `ci.yml:132`; no `thresholds`/`lines:` in any vitest config. | Either add `coverage.thresholds` (and/or a Codecov status check) or document that coverage is observational only. |
| CI-4 | 🟢 Low | The `deploy` CI job is a no-op `echo`; real deploys run via Vercel Git integration independent of CI green. | `ci.yml:211-217`; `vercel.json`. | If CI should gate prod, drive `vercel deploy --prod` from CI behind `needs: [test]`, or require the GitHub check in Vercel. Otherwise leave as-is. |
| CI-5 | 🟢 Low | Optional TS strictness opt-ins not enabled: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. `strict: true` is on. | `tsconfig.json:5-6`. | Optional. Enable `noUncheckedIndexedAccess` as its own scoped task (expect churn). |

**Suppression inventory (whole repo, node_modules/.next excluded):** `@ts-ignore` **0**, `@ts-nocheck` **0**, `eslint-disable` **0**, `: any` in production **0**, `as any` **0**. `@ts-expect-error` 13 (all negative type-assertions *in tests* — correct usage). `biome-ignore` 11 (every one carries an inline rationale). `as unknown as` 243 — but only **2 in production** (`lib/db.ts:11` dev-singleton, `app/api/webhooks/clerk/route.ts:14` Clerk type seam); the other 241 are test fixtures already tracked as debt by `.claude/rules/fixture-integrity.md` (DEBT-402).

**Version hygiene:** Node consistent everywhere (`.nvmrc`=24, engines `24.x`, CI `24`), enforced by `.husky/check-node-version.sh`. pnpm pinned via `packageManager: pnpm@11.3.0` + Corepack + CI pin (engines `>=11.0.0` is just an advisory floor). CI uses `--frozen-lockfile`. **Dependabot is a model config** — npm + github-actions, separate version/security ecosystems, Biome/Stripe split out with documented rationale, `@types/node` major pinned to Node 24, 7-day cooldown.

---

## 2. Agent & Developer Documentation

**Headline: docs are in good shape — accurate, well cross-referenced, real (not aspirational) enforcement claims.** ~30 referenced BUG/DEBT/ADR/frontend-doc paths were spot-checked and resolve. The pre-push-hook description is correct in all three places it appears. The design-system enforcement files it claims exist do exist. The issues are a few stale facts and self-imposed-rule duplication, not rot.

### Findings

| # | Sev | Finding | Evidence | Fix |
|---|-----|---------|----------|-----|
| DOC-1 | 🟠 High | `AGENTS.md` states `Node >=20.19.0` — wrong and load-bearing. Reality is Node 24, hard-enforced by a hook; an agent following the doc on Node 20/22 hits a blocking failure. | `AGENTS.md:215` vs `.nvmrc`=`24`, engines `node: 24.x`, `.husky/check-node-version.sh`. Verified by lead. | Change to `Node 24.x (per .nvmrc), pnpm >=11.0.0`. |
| DOC-2 | 🟡 Medium | `CLAUDE.md` violates its own charter ("Claude-specific supplement only; don't duplicate `AGENTS.md`"). It re-states the full quality-gate command, the entire integration-DB setup, the E2E `.env.local` block (verbatim), and the design-system mandates. | `CLAUDE.md:3-5` (charter) vs `CLAUDE.md:83-128` ≈ `AGENTS.md:138-155,437-461`. | Replace duplicated blocks with pointers to `AGENTS.md` sections; keep only Claude-specific notes (Chrome MCP, agent-browser profile flags). |
| DOC-3 | 🟡 Medium | The E2E `.env.local` prereqs block is triplicated *inside* `AGENTS.md`, and the push/PR gate sections are near-duplicated. ~80 lines that must be kept byte-identical by hand. | `AGENTS.md:143-155` ≈ `621-635`; gate blocks `127-171` ≈ `603-635`. | Collapse to one canonical block + anchor links. |
| DOC-4 | 🟡 Medium | The fakes list omits `FakeQuestionFeedbackRepository` (it exists & is exported). Risk: an agent re-rolls a `vi.fn()` for a fake that already exists — the exact anti-pattern the docs warn against. | Barrel `src/application/test-helpers/fakes/index.ts` has it; `grep -c` in `AGENTS.md` & `.claude/rules/testing.md` = **0**. Verified by lead. | Add it to both lists (`AGENTS.md:513`, `.claude/rules/testing.md:23`). |
| DOC-5 | 🟢 Low | Dead link: `AGENTS.md:239` points to `docs/debt/debt-416-...` but the file was archived. | File is at `docs/_archive/debt/debt-416-agent-skills-provenance-and-refresh.md`. Verified by lead. | Update path to `_archive`. |
| DOC-6 | 🟢 Low | `README.md` is a thin, drifted skeleton: `pnpm db:migrate` with no `DATABASE_URL` prefix (AGENTS.md warns this hits remote Neon), no Node-24 note, no pointer to `AGENTS.md` as SSOT. | `README.md:9,33`. | Point README at `AGENTS.md` and fix the `DATABASE_URL=` prefix. |
| DOC-7 | 🟢 Low | `docs/dev/` (13 files) and `docs/frontend/` (10 files) lack an `index.md`, unlike the other doc dirs — undiscoverable via index. | `ls docs/dev docs/frontend`. | Add `index.md` to both for navigation parity. |

**The three skill dirs (`.agents` / `.claude` / `.codex`) — NOT a problem; already the correct design.** `.agents/skills/` is the canonical source (15 real skills + `skills.manifest.json`). `.claude/skills/` and `.codex/skills/` are **git-tracked symlinks** (mode `120000`) into `.agents/skills/` — zero-cost pointers so Claude Code and Codex CLI each find skills at their expected path. No duplication, no consolidation needed. The one risk is a naive agent "fixing" the perceived duplication by deleting the symlinks — `AGENTS.md:231` already warns against this. **Recommendation: leave it alone.**

**`AGENTS.md` structure:** 743 lines / ~37 KB — large but defensible as a single SSOT for *all* agents (Codex/Cursor don't read `.claude/rules/`, so some duplication of testing examples there is intentional). The real issue is internal repetition (DOC-3), not raw size. Trimming the triplicated blocks would remove ~80 lines with zero information loss.

---

## 3. File Organization & Clean Architecture

**Direct verdict: fundamentally sound — NO significant reorganization needed.** The hard things are correct; every finding here is cosmetic except the missing enforcement (ARCH-1).

- **Domain purity — PASS, zero violations.** The only non-relative imports anywhere in `src/domain/` are `vitest` (in tests) and intra-domain helpers. No Next/React/Drizzle/Clerk/Stripe/lib leakage.
- **Application layer — PASS** for production. One framework import (`react-dom/server`) exists only in a test helper (`src/application/test-helpers/render-hook.tsx:2`).
- **Adapters — PASS.** No imports from `app/` or `components/`. Adapter→`lib/` imports (e.g. `controller-helpers`, `routes`, `logger`) are the documented composition seam, and the container import is type-only + lazy (`lib/controller-helpers.ts:2,16`) — no runtime cycle.
- **`src/` vs `lib/` split — coherent.** Composition root correctly factored into `lib/container/{controllers,gateways,repositories,use-cases,types}.ts` per ADR-012. No business logic leaks into `lib/`; the one gray-zone file (`lib/manage-billing/manage-billing-core.ts`) is DI'd redirect/UX orchestration — a framework concern, correctly placed.
- **Test placement — textbook.** Colocated unit/browser, centralized integration/e2e, exactly per ADR-012. No `.DS_Store` committed, no empty dirs, no orphans.

### Findings

| # | Sev | Finding | Evidence | Fix |
|---|-----|---------|----------|-----|
| ARCH-1 | 🟠 Medium | **Clean Architecture is enforced by convention only.** No `dependency-cruiser`, no `madge --circular`, no Biome `noRestrictedImports`, no custom boundary test — despite ADR-001 §Compliance explicitly recommending dependency-cruiser + madge. | No `.dependency-cruiser.*`; no `madge` in `package.json`; `biome.json` has no import-boundary rule. | Add `dependency-cruiser` (or a tiny custom Vitest grep-test) that fails on forbidden imports. Cheapest high-leverage fix — locks in the excellent current state before drift. |
| ARCH-2 | 🟢 Low | 6 PascalCase filenames fight the ~897-file kebab-case majority; worst in `components/question/` where the *same component* mixes cases. No documented filename convention exists. | `components/markdown/Markdown.tsx`, `Markdown.test.tsx`, `components/question/{ChoiceButton.browser.spec,QuestionCard.test,QuestionCard.browser.spec,Feedback.test}.tsx`. | Rename to kebab-case; add a one-line filename-casing rule to `AGENTS.md`. |
| ARCH-3 | 🟢 Low | Route colocation is inconsistent. `history/` & `practice/` use `components/`+`hooks/` subdirs; `bookmarks/`, `billing/`, and `questions/[slug]/` keep files flat — the last dumps ~20 `use-question-page-*` hooks in the route root despite having a `components/` subdir. | `app/(app)/app/questions/[slug]/` vs `.../practice/`, `.../history/`. | Pick one convention (subdir split past N files) and apply it; move `questions/[slug]` hooks into a `hooks/` dir. |
| ARCH-4 | 🟢 Low | "controller" is overloaded: React presentation hooks `use-*-page-controller.ts` vs adapter server-action controllers in `src/adapters/controllers/`. Readability hazard. | `app/(app)/app/**/hooks/use-*-page-controller.ts` vs `src/adapters/controllers/*-controller.ts`. | Rename presentation hooks (e.g. `use-*-page-state.ts`) or document the dual meaning. |

**Root level — clean, nothing misplaced.** `proxy.ts` is correctly at root (it's the Next 16 `middleware.ts` rename — must be there). All config/instrumentation/Sentry/`.d.ts` files are where they conventionally must live.

---

## 4. Code Quality (Clean Code & PoSD)

**Headline: unusually disciplined. The smells I went looking for are absent.**

- **Zero untracked tech debt.** `TODO`/`FIXME`/`HACK`/`XXX` in source (excluding tests): **0**. Every debt reference is a dated `DEBT-xxx`/`BUG-xxx` tag pointing at a doc. No commented-out code. This is rare and excellent — strategic, not tactical, programming.
- **Big files are deep, not god-files.** The largest (`drizzle-attempt-repository.ts:547`, `stripe-checkout-sessions.ts:495`, `practice-view.tsx:539`) each carry a reviewed, dated "why this exceeds the 300-line guideline" header (DEBT-224/234) that holds up: counts funnel through one `countWhere`, the hard query decomposes into named private helpers, complexity is essential (Stripe's lifecycle) not accidental. `db/schema.ts:772` is flat table declarations.
- **`createAction` is a model deep module** (`src/adapters/controllers/create-action.ts:26`): a tiny signature hides Zod validation + DI resolution + try/catch→`ActionResult` + meta-tagging, which keeps all 12 practice-controller actions tiny. The opposite of shallow pass-through.
- **Error handling is disciplined.** Single typed `ApplicationError` source with a closed 11-code union (ADR-006), consistent code usage, causes preserved at boundaries (Postgres unique → `CONFLICT` with `{ cause }`). All 16 bare-`catch {}` sites are intentional best-effort telemetry guards, each with a WHY comment ("telemetry must not change request outcomes"); the primary error path is always handled. **No genuinely swallowed errors.**
- **Naming & comments are strong.** No `doStuff`/`temp`/`obj`/`foo` hits; comments explain WHY not WHAT; no boolean-parameter proliferation (the 240 `: boolean` are named object fields).

### Findings

| # | Sev | Finding | Evidence | Fix |
|---|-----|---------|----------|-----|
| CODE-1 | 🟢 Low | The best-effort `try { logger.x } catch {}` logging idiom is duplicated across 8 files (two as a private `safeLog`). | `question-view-controller.ts:63`, `submit-answer.ts:77`, + `with-idempotency.ts`, `drizzle-rate-limiter.ts`, `create-checkout-session.ts`, `question-feedback-actions.ts`, `bookmark-toggle.ts`, `practice-page-session-start.ts`. | Extract a shared `safeLog(logger, level, ctx, msg)` into `src/application/shared/`. Removes ~21 repeated blocks. Highest-value, lowest-risk cleanup. |
| CODE-2 | 🟢 Low | `createStripeCheckoutSession` is the most complex single function and most likely to grow. | `src/adapters/gateways/stripe/stripe-checkout-sessions.ts:133`. | Optional: extract the "inspect & possibly expire existing session" block (`:207-389`) into a helper returning a decision object. Not a defect. |
| CODE-3 | 🟢 Low | The intentional bare-catch convention isn't codified, so a reviewer could mistake it for a swallowed error. | 16 documented best-effort catches across `src/`/`app/`. | Codify the "telemetry/logging must not change outcomes" pattern in `.claude/rules/`. |

---

## Consolidated Action List (prioritized)

| Priority | Item | Finding | Type | Effort |
|----------|------|---------|------|--------|
| **1** | Add branch protection / ruleset on `main` (require `test` check + PR review + CodeRabbit; block direct push) | CI-1, CI-2 | Platform setting | XS |
| **2** | Add automated dependency-boundary enforcement (`dependency-cruiser` or custom Vitest test) | ARCH-1 | New config + CI step | S |
| **3** | Fix stale `AGENTS.md` Node version → 24.x; fix DEBT-416 link; add `FakeQuestionFeedbackRepository` to fakes lists | DOC-1, DOC-4, DOC-5 | Doc edit | XS |
| **4** | De-duplicate `CLAUDE.md` per its own charter; collapse triplicated `AGENTS.md` E2E/gate blocks | DOC-2, DOC-3 | Doc edit | S |
| **5** | Decide coverage policy: enforce thresholds or document as observational | CI-3 | Config / doc | XS |
| **6** | Normalize 6 PascalCase filenames → kebab-case; add filename-casing rule | ARCH-2 | Rename + doc | S |
| **7** | Standardize route colocation (esp. `questions/[slug]` hooks); disambiguate "controller" | ARCH-3, ARCH-4 | Refactor | M |
| **8** | Extract shared `safeLog`; codify bare-catch convention | CODE-1, CODE-3 | Refactor + doc | S |
| **9** | Wire `README.md` to SSOT; add `docs/dev` + `docs/frontend` index.md | DOC-6, DOC-7 | Doc edit | XS |
| 10 | (Optional) `noUncheckedIndexedAccess`; extract checkout-session helper; CI-driven deploy gate | CI-5, CODE-2, CI-4 | Various | M |

**Suggested tracking:** CI-1/CI-2 → a BUG (security/process gap). ARCH-1, DOC-2/DOC-3, ARCH-2/ARCH-3, CODE-1 → DEBT items. The XS doc fixes (DOC-1/DOC-4/DOC-5) can be batched into a single "doc-drift" PR.

---

## What's Genuinely Good (credit where due)

- **No failure-swallowing in CI**, plus anti-suppression guardrails (`forbidOnly`, E2E skip-policy step) that *fail the build* on drift.
- **Zero `any`, zero `@ts-ignore`, zero untracked TODO/FIXME/HACK.** `strict: true`, no Next build-error escape hatches.
- **Domain purity and inward dependency direction are real**, not aspirational — the hard part of Clean Architecture, genuinely achieved.
- **Deep modules + disciplined, documented error handling** with a single typed error source.
- **Self-aware about its own size**: live enforcement layers (DEBT-234 line-count warning, theme-token regression scan) and inline "why this is a deep module" justifications with review dates.
- **Model Dependabot config** and a Node-version-enforcement hook most repos lack.

The two things worth doing first — branch protection and dependency-boundary enforcement — are both *additive* (a setting and a config), not reorganizations. Fix those and the repository is in genuinely excellent shape.

---

## Appendix — Method

Four parallel read-only `general-purpose` agents, one per dimension (CI/tooling, agent docs, file org/architecture, code quality/PoSD). Each was instructed to verify before asserting and to cite `file:line`. The lead independently re-confirmed the Critical finding (`gh api` branch-protection + rulesets + repo visibility) and the High/Medium doc-drift claims (Node version, DEBT-416 path, fakes barrel) before publishing. No files outside this audit doc and the audits index were modified.
