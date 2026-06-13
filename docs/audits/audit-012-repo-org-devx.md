# AUDIT-012 - Repository Organization, Dev Tooling, and Agent Documentation

**Project:** Naltrexone University
**Date:** 2026-06-13
**Scope:** CI/CD and developer tooling, GitHub enforcement, dependency security automation, `AGENTS.md` / `CLAUDE.md` / `.claude/rules` accuracy, file organization, Clean Architecture boundaries, and code-quality guardrails.
**Method:** Source re-verification from repository files plus GitHub API checks with `gh`. Counts and absence claims were re-run directly instead of copied from prior audit text.
**Status:** Active. Decision-required findings are now resolved in **Resolution Decisions (Locked — 2026-06-13)** below; these are not yet implemented. Findings should be triaged into `docs/bugs/` or `docs/debt/`, then this audit should be archived after remediation.

---

## Executive Summary

The repository is structurally strong. Clean Architecture layers are visible, domain production code is import-pure by scan, CI runs the meaningful quality gates, agent skills are centrally vendored with tracked symlinks, and source TODO/suppression hygiene is strong.

The repository is **not** fully enforced or fully documented. The three highest-priority work items are:

1. **CI-1 / CRITICAL:** `main` is public and unprotected. There are no branch protection rules and no repository rulesets. CI exists, but GitHub does not require it before merge or direct push.
2. **SEC-1 / HIGH:** Dependency security automation is not actually delivering security fixes. GitHub reports vulnerability alerts/security updates disabled, Dependabot security update entries have `open-pull-requests-limit: 0`, and `pnpm audit --audit-level=moderate` currently exits non-zero with 5 vulnerabilities, including 1 high.
3. **ARCH-1 / MEDIUM:** Clean Architecture boundaries are documented and currently healthy in high-value scans, but there is no mechanical import-boundary enforcement.

The repo does **not** need a major reorganization before feature work. It needs enforcement and documentation cleanup: protect `main`, enable security automation and resolve the red audit, add boundary enforcement, fix stale agent docs, and codify a few conventions already present in the code.

---

## Resolution Decisions (Locked — 2026-06-13)

The decision-required findings were resolved from first principles for *this* codebase. The governing principle: **the primary contributor is an AI-agent fleet, and the repo's revealed strategy is executable, no-new-dependency guardrails over convention** (see `scripts/check-file-size.sh`, `components/theme-token-regression-source-scan.ts`, the E2E skip-policy CI step, and `tests/ci-workflow.test.ts`). "No-new-dependency" means reusing existing project dependencies such as `fast-glob` is fine; adding another architecture-tool package is not. For an agent-operated repo, ambiguity is a defect, consistency is a safety feature, and the right fix is almost always a test/scan in an idiom the repo already owns — not a new dependency or a blunt metric. These decisions are locked: the executor implements them as written and does not re-open them.

- **ARCH-1 (boundary enforcement) → custom Vitest import-boundary test. Do NOT add `dependency-cruiser`.** The repo already owns this exact idiom (`theme-token-regression-source-scan.ts`), has only four layers (the rules are small enough to hand-write), and SEC-1 just flagged supply-chain surface — adding a new architecture dependency now is self-contradictory. Implement the test with existing repo primitives (`fast-glob` is already present) or TypeScript compiler APIs; it must inspect static `import`, `export ... from`, side-effect imports, and dynamic `import()` specifiers. Wire the test into the normal `pnpm test` gate. This audit supersedes ADR-001's old `madge` / `dependency-cruiser` recommendation; keep ADR-001 aligned.

- **ARCH-2 (filename casing) → adopt strict kebab-case and enforce it, as one package.** Rename the 6 PascalCase files **and** the 2 camelCase files (`lib/content/draftTaxonomy.ts`, `lib/content/parseMdxQuestion.ts`) via `git mv` + import updates, and extend the source-scan to fail CI on future drift. **Keep** the 11 currently allowed multi-dot names after stripping standard test suffixes (`.test`, `.spec`, `.browser.spec`, `.integration.test`, `.e2e`): `page.manage-billing.test.tsx`, `post-exam-review-view.fixtures.ts`, `practice-session-page-controller.browser.fixtures.ts`, `practice-session-page-controller.browser.probes.tsx`, `practice-session-page-controller.browser.setup.ts`, `use-practice-session-exam-results-continuity.fixtures.ts`, `question-page-controller.browser.fixtures.ts`, `lib/container.skip-clerk.test.ts`, `tests/e2e/global.setup.ts`, `reset-bookmarks-for-e2e-user.default-services.test.ts`, and `actions.stripe.integration.test.ts`. Do NOT rename without adding the check (rename-without-enforce just re-drifts). 8 real casing outliers in 880 scanned files is pattern-noise that makes agents guess wrong; the enforcement idiom already exists, so locking it in is cheap.

- **ARCH-4 ("controller" overload) → keep `src/adapters/controllers/*` as the canonical "controller"; rename the 2 production presentation hooks to `use-*-page-model.ts`.** Add a one-line glossary entry to `AGENTS.md` distinguishing adapter controllers (Clean Architecture role) from presentation models (view hooks). An ambiguous architectural noun is the highest-cost defect for agent contributors — it invites wiring a use-case call into a view hook. This is not literally a two-file diff: update imports, tests, probes, fixtures, helper names, and non-archived docs that reference the two hooks. Avoid "presenter" — also a reserved Clean Architecture term.

- **CI-3 (coverage) → do NOT add a coverage-threshold gate; document coverage as observational.** Coverage is a tool, not a target; a numeric gate invites assertion-free tests, and agents game blunt metrics harder than humans. The real defense is the mandated TDD + 2,771 tests. Resolution is a one-line note in the testing docs, not a config change.

- **CI-5 (`noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`) → defer to a dedicated DEBT item, flagged "recommended-soon."** Genuinely desirable for an agent-driven repo (a guardrail agents cannot ignore), but a repo-wide flip mid-audit makes an unreviewable diff and is orthogonal to this audit's goal. Its own focused PR — soon, not "someday."

- **Large files → make the checker inventory truthful, then document or extract exactly as scoped.** A full checker scan currently reports 12 warnings, not just `practice-view.tsx` and `stripe-checkout-sessions.ts`. First update `check-file-size.sh` so non-production support files (`*.browser.probes.tsx` and `src/application/test-helpers/**`) are excluded explicitly rather than allowlisted. Then document the intentional production large files with a WHY header plus `is_known_exempt`. For `stripe-checkout-sessions.ts` ONLY, attempt one Extract-Function on the inspect/expire-existing-session block and keep it only if the full gate stays green; otherwise document it through the same WHY+allowlist mechanism. Do NOT split `practice-view.tsx` into shallow pieces (PoSD: deep modules beat shallow ones).

---

## Scorecard

| Dimension | Grade | Basis |
|---|---:|---|
| CI workflow coverage | A- | `.github/workflows/ci.yml` runs typecheck, lint, unit coverage, integration, browser, build, and conditional E2E policy. One intentional `|| true` exists in the E2E skip-policy grep block. |
| Merge enforcement | F | Public `main` has no branch protection and no repository rulesets. |
| Dependency/security automation | D | Dependabot version update config exists, but vulnerability alerts/security updates are disabled and `pnpm audit` is red. |
| Type/lint/build config | A- | `strict: true` and Biome are active. `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are not enabled. |
| Agent/dev docs accuracy | B | Detailed and useful, but stale Node guidance, duplicated gate/E2E prose, an archived-link miss, and an incomplete fake list need correction. |
| Clean Architecture compliance | A- | Domain production code has zero non-relative imports by scan; adapters do not import app/components by scan; enforcement is convention-only. |
| File organization | A- | Coherent overall. Remaining issues are naming drift, route-local sprawl, and overloaded "controller" terminology. |
| Code-quality guardrails | A- | TODO/suppression hygiene is strong. Large-file policy and bare-catch conventions need tighter documentation/enforcement. |

---

## 1. CI/CD, Security Automation, and Tooling

### CI-1 - CRITICAL - `main` has no merge protection

**Verdict:** Confirmed.

Evidence:

```bash
$ gh repo view --json nameWithOwner,visibility,isPrivate,defaultBranchRef
{"defaultBranchRef":{"name":"main"},"isPrivate":false,"nameWithOwner":"The-Obstacle-Is-The-Way/naltrexone-university","visibility":"PUBLIC"}

$ gh api repos/:owner/:repo/branches/main --jq '{name, protected}'
{"name":"main","protected":false}

$ gh api repos/:owner/:repo/branches/main/protection --include
HTTP/2.0 404 Not Found

$ gh api repos/:owner/:repo/rulesets --include
HTTP/2.0 200 OK
[]

$ find . -iname CODEOWNERS -print
# no output

$ gh api repos/:owner/:repo/hooks --jq '.[] | {name, active, events}'
# no output
```

No repository branch protection, repository ruleset, `CODEOWNERS`, repo webhook, or merge queue was found. Vercel deployment settings may exist outside this repository, but this audit found no GitHub-enforced merge gate.

Required fix:

- Add a GitHub repository ruleset for `main`.
- Require pull requests.
- Require the CI jobs that cover typecheck, lint, unit, integration, browser, build, and E2E policy.
- Require branches to be up to date before merge unless merge queue is introduced.
- Restrict force pushes and branch deletions.
- Add `CODEOWNERS` if owner review is desired.

### CI-2 - LOW - Pre-push hook is intentionally partial

**Verdict:** Confirmed.

Evidence:

```bash
$ rg -n "pnpm typecheck && pnpm test --run" .husky/pre-push AGENTS.md
.husky/pre-push:3:pnpm typecheck && pnpm test --run
AGENTS.md:226:- `pre-push`: runs `pnpm typecheck && pnpm test --run`
```

`AGENTS.md` correctly states that the pre-push hook is lightweight and that agents must run the full gate before pushing. This is acceptable only if CI is required by GitHub. Without CI-1, lint/browser/integration/build/E2E can be bypassed by direct push or merge.

Required fix:

- Keep the hook lightweight unless the team explicitly wants slower local pushes.
- Fix CI-1 so the full workflow is the enforcement layer.

### CI-3 - LOW - Coverage upload is non-blocking

**Verdict:** Confirmed; severity remains low.

Evidence:

```bash
$ rg -n "test:coverage|test:integration:coverage|test:browser:coverage|fail_ci_if_error|pnpm build" .github/workflows/ci.yml
.github/workflows/ci.yml:114:        run: pnpm test:coverage
.github/workflows/ci.yml:117:        run: pnpm test:integration:coverage
.github/workflows/ci.yml:125:        run: pnpm test:browser:coverage
.github/workflows/ci.yml:132:          fail_ci_if_error: false
.github/workflows/ci.yml:135:        run: pnpm build
```

The tests are blocking; only coverage upload failure is non-blocking.

**Decision (locked):** Do not add a coverage-threshold gate. Document coverage as observational — quality is enforced by the mandated TDD discipline (2,771 unit tests), not a numeric target that invites assertion-free tests. Resolution is a one-line note in the testing docs, not a config change. See Resolution Decisions.

### CI-4 - LOW - CI has one intentional `|| true`

**Verdict:** Imprecise if described as "zero failure swallowing."

Evidence:

```bash
$ rg -n "continue-on-error|set \+e|\|\| true|--passWithNoTests|--no-verify" .github scripts
.github/workflows/ci.yml:97:            || true)"
scripts/e2e-local-orchestrator.ts:75:    await execa('sh', ['-c', "lsof -ti:3000 | xargs kill -9 2>/dev/null || true"], {
scripts/e2e-local-orchestrator.test.ts:59:  expect(command).toBe("lsof -ti:3000 | xargs kill -9 2>/dev/null || true");

$ rg -n "Enforce E2E skip policy|grep -nH|grep -v|\|\| true" .github/workflows/ci.yml
.github/workflows/ci.yml:91:      - name: Enforce E2E skip policy
.github/workflows/ci.yml:95:          violations="$(grep -nH "test\.skip(" tests/e2e/*.spec.ts \
.github/workflows/ci.yml:96:            | grep -v "test\.skip(!hasClerkCredentials, 'Missing Clerk E2E credentials');" \
.github/workflows/ci.yml:97:            || true)"
```

Correct statement: no CI step is globally allowed to fail; there is one intentional `|| true` to make a no-match grep safe.

### CI-5 - LOW - Optional strictness flags are disabled

**Verdict:** Confirmed.

Evidence:

```bash
$ rg -n '"strict": true' tsconfig.json
tsconfig.json:7:    "strict": true,

$ rg -n "noUncheckedIndexedAccess|exactOptionalPropertyTypes" tsconfig.json; echo exit=$?
exit=1
```

**Decision (locked):**

- Defer to a dedicated DEBT item, flagged **recommended-soon** (not "someday") — stricter index/optional typing is a guardrail agents cannot ignore, so it is genuinely valuable here.
- Do NOT flip these repo-wide inside the audit-resolution pass; a repo-wide diff is unreviewable mid-audit and is orthogonal to this audit's goal. Land it as its own focused PR. See Resolution Decisions.

### SEC-1 - HIGH - Dependency security automation is disabled and `pnpm audit` is red

**Verdict:** New finding; this materially changes the action order.

Evidence:

```bash
$ gh api repos/:owner/:repo --jq '.security_and_analysis // {}'
{"dependabot_security_updates":{"status":"disabled"},"secret_scanning":{"status":"enabled"},"secret_scanning_non_provider_patterns":{"status":"disabled"},"secret_scanning_push_protection":{"status":"enabled"},"secret_scanning_validity_checks":{"status":"disabled"}}

$ gh api repos/:owner/:repo/vulnerability-alerts --include
HTTP/2.0 404 Not Found

$ gh api repos/:owner/:repo/automated-security-fixes --include
{"enabled":false,"paused":false}

$ rg -n "open-pull-requests-limit: 0|applies-to: security-updates|npm-security|package-ecosystem: npm|directory: /" .github/dependabot.yml
.github/dependabot.yml:4:  - package-ecosystem: npm
.github/dependabot.yml:5:    directory: /
.github/dependabot.yml:54:  - package-ecosystem: npm
.github/dependabot.yml:55:    directory: /
.github/dependabot.yml:60:    open-pull-requests-limit: 0
.github/dependabot.yml:64:      npm-security:
.github/dependabot.yml:65:        applies-to: security-updates
.github/dependabot.yml:97:    open-pull-requests-limit: 0
.github/dependabot.yml:102:        applies-to: security-updates
```

`pnpm audit --audit-level=moderate` exited non-zero and reported:

```text
5 vulnerabilities found
Severity: 1 low | 3 moderate | 1 high
esbuild: Missing binary integrity verification in Deno module enables remote code execution via NPM_CONFIG_REGISTRY
```

Required fix:

- Enable GitHub vulnerability alerts.
- Enable Dependabot security updates and remove `open-pull-requests-limit: 0` from security-update entries so security PRs can be created.
- Enable automated security fixes if the team accepts automated patch PRs.
- Resolve the current `pnpm audit` findings or document why each remaining advisory is not exploitable in this app.
- Keep routine version updates targeting `dev` if that is the branch strategy, but security updates need an actual delivery path.

### SEC-2 - MEDIUM - No Content Security Policy

**Verdict:** New hardening finding.

Evidence:

```bash
$ rg -n "headers\(\)|X-Content-Type-Options|Referrer-Policy|X-Frame-Options|Permissions-Policy|Strict-Transport-Security|Content-Security-Policy|contentSecurityPolicy|csp" next.config.ts app lib
next.config.ts:13:  async headers() {
next.config.ts:19:            key: 'X-Content-Type-Options',
next.config.ts:23:            key: 'Referrer-Policy',
next.config.ts:27:            key: 'X-Frame-Options',
next.config.ts:31:            key: 'Permissions-Policy',
next.config.ts:35:            key: 'Strict-Transport-Security',
app/layout.tsx:71:  const nonce = (await headers()).get('x-nonce') ?? undefined;
```

Required fix:

- Add `Content-Security-Policy-Report-Only` in `next.config.ts` for `/:path*` first.
- Include Next assets plus Clerk, Stripe, Sentry/reporting, and existing nonce requirements.
- Validate with browser tests/E2E before promoting to enforcement.

### SEC-3 - LOW - No public security contact file

**Verdict:** New hardening finding.

Evidence:

```bash
$ find public app -path '*security*' -o -path '*/.well-known/*' -print
# no output
```

Required fix:

- Add `public/.well-known/security.txt` with the preferred vulnerability contact and disclosure policy.

### Security checks verified as good

Webhook and cron authentication are not findings:

```bash
$ rg -n "stripe-signature|rawBody|signature|constructEvent|verifyWebhook|timingSafeEqual" app/api/stripe/webhook/handler.ts src/adapters/gateways/stripe/stripe-webhook-processor.ts app/api/webhooks/clerk/route.ts app/api/cron/reconcile-stripe-subscriptions/route.ts
app/api/stripe/webhook/handler.ts:36:    const signature = req.headers.get('stripe-signature');
app/api/stripe/webhook/handler.ts:75:    const rawBody = await req.text();
app/api/stripe/webhook/handler.ts:79:        rawBody,
app/api/stripe/webhook/handler.ts:80:        signature,
src/adapters/gateways/stripe/stripe-webhook-processor.ts:74:    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
app/api/webhooks/clerk/route.ts:1:import { verifyWebhook } from '@clerk/nextjs/webhooks';
app/api/webhooks/clerk/route.ts:14:  const verifiedEvent = await verifyWebhook(req as unknown as ClerkRequestLike);
app/api/cron/reconcile-stripe-subscriptions/route.ts:1:import { createHash, timingSafeEqual } from 'node:crypto';
app/api/cron/reconcile-stripe-subscriptions/route.ts:50:  return timingSafeEqual(tokenHash, secretHash);
```

Markdown rendering uses sanitization:

```bash
$ rg -n "rehypeSanitize|skipHtml" components/markdown/Markdown.tsx
components/markdown/Markdown.tsx:6:import rehypeSanitize from 'rehype-sanitize';
components/markdown/Markdown.tsx:73:        rehypePlugins={[rehypeSanitize]}
components/markdown/Markdown.tsx:74:        skipHtml
```

---

## 2. Agent and Developer Documentation

### DOC-1 - HIGH - `AGENTS.md` has stale Node setup guidance

**Verdict:** Confirmed.

Evidence:

```bash
$ rg -n "Node >=20\.19\.0" AGENTS.md
AGENTS.md:215:# Requirements: Node >=20.19.0, pnpm

$ cat .nvmrc
24

$ rg -n '"node": "24\.x"|"pnpm": ">=11\.0\.0"' package.json
package.json:5:    "node": "24.x",
package.json:6:    "pnpm": ">=11.0.0"

$ rg -n "actual_major|requires: Node" .husky/check-node-version.sh
.husky/check-node-version.sh:22:  actual_major="$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
.husky/check-node-version.sh:23:  if [ -z "$actual_major" ] || [ "$actual_major" != "$required_major" ]; then
.husky/check-node-version.sh:25:    echo "  .nvmrc requires: Node ${required_major}.x" >&2
.husky/check-node-version.sh:26:    if [ -n "$actual_major" ]; then
.husky/check-node-version.sh:27:      echo "  Currently active: v${actual_major}.x" >&2
```

Required fix:

- Change AGENTS setup guidance to `Node 24.x` and `pnpm >=11.0.0`.

### DOC-2 - MEDIUM - `CLAUDE.md` duplicates universal process despite being a supplement

**Verdict:** Confirmed.

Evidence:

```bash
$ rg -n "All project rules|Full Quality Gate|pnpm typecheck && pnpm lint|Quick file check when you rely on \.env\.local|pnpm test:e2e" CLAUDE.md
CLAUDE.md:3:> **All project rules are in [`AGENTS.md`](./AGENTS.md).** This file contains Claude Code-specific supplements only.
CLAUDE.md:105:### ⚠️ Full Quality Gate (BEFORE EVERY PUSH — not just PRs)
CLAUDE.md:111:pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build
CLAUDE.md:119:# Quick file check when you rely on .env.local:
CLAUDE.md:125:pnpm test:e2e
```

Required fix:

- Replace duplicated universal instructions in `CLAUDE.md` with concise links back to `AGENTS.md`.
- Keep only Claude-specific operational notes there.

### DOC-3 - LOW - Full-gate/E2E prose is duplicated across agent docs

**Verdict:** Confirmed, but corrected from the old wording.

Evidence:

```bash
$ rg -n "pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build|Quick file check when you rely on \.env\.local|pnpm test:e2e" AGENTS.md CLAUDE.md
AGENTS.md:138:pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build
AGENTS.md:146:# Quick file check when you rely on .env.local:
AGENTS.md:152:pnpm test:e2e
AGENTS.md:618:pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build
AGENTS.md:626:# Quick file check when you rely on .env.local:
AGENTS.md:632:pnpm test:e2e
CLAUDE.md:111:pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build
CLAUDE.md:119:# Quick file check when you rely on .env.local:
CLAUDE.md:125:pnpm test:e2e
```

Correct statement: the block appears twice in `AGENTS.md` and once in `CLAUDE.md`, not three times inside `AGENTS.md`.

Required fix:

- Keep one canonical AGENTS section.
- Link other locations to it.

### DOC-4 - MEDIUM - Fake repository list omits `FakeQuestionFeedbackRepository`

**Verdict:** Confirmed.

Evidence:

```bash
$ rg -n "FakeQuestionFeedbackRepository" AGENTS.md .claude/rules/testing.md src/application/test-helpers/fakes/index.ts
src/application/test-helpers/fakes/index.ts:14:export { FakeQuestionFeedbackRepository } from './fake-question-feedback-repository';
```

Required fix:

- Make `src/application/test-helpers/fakes/index.ts` the explicit source of truth in `AGENTS.md` and `.claude/rules/testing.md`; keep inline fake lists as examples only and include `FakeQuestionFeedbackRepository` if an example list remains.

### DOC-5 - LOW - Agent skill provenance link points to moved debt doc

**Verdict:** Confirmed.

Evidence:

```bash
$ rg -n -o "docs/debt/debt-416-agent-skills-provenance-and-refresh.md|docs/_archive/debt/debt-416-agent-skills-provenance-and-refresh.md|../_archive/debt/debt-416-agent-skills-provenance-and-refresh.md" AGENTS.md docs/debt/index.md docs/_archive/debt/debt-416-agent-skills-provenance-and-refresh.md
AGENTS.md:239:docs/debt/debt-416-agent-skills-provenance-and-refresh.md
docs/debt/index.md:38:../_archive/debt/debt-416-agent-skills-provenance-and-refresh.md

$ test -e docs/debt/debt-416-agent-skills-provenance-and-refresh.md; echo $?
1

$ test -e docs/_archive/debt/debt-416-agent-skills-provenance-and-refresh.md; echo $?
0
```

Required fix:

- Update the link directly to `docs/_archive/debt/debt-416-agent-skills-provenance-and-refresh.md`.

### DOC-6 - LOW - Root README has setup drift risk

**Verdict:** Confirmed.

Evidence:

```bash
$ rg -n "Node|AGENTS" README.md; echo exit=$?
exit=1

$ rg -n "^# |pnpm db:migrate|pnpm db:seed|pnpm" README.md
README.md:1:# Naltrexone University
README.md:15:- pnpm
README.md:21:pnpm install
README.md:23:pnpm db:migrate
README.md:24:pnpm dev
```

The README does not state Node 24/pnpm 11 and shows migrations without the explicit `.env.local`/`DATABASE_URL` caution used elsewhere.

Required fix:

- Add a short "canonical setup lives in AGENTS.md" pointer.
- Update runtime requirements.
- Clarify when `pnpm db:migrate` uses `.env.local`.

### DOC-7 - LOW - Missing docs indexes for dense subtrees

**Verdict:** Confirmed, count corrected.

Evidence:

```bash
$ find docs/dev -maxdepth 1 -type f | wc -l
      13
$ find docs/frontend -maxdepth 1 -type f | wc -l
       6
$ test -e docs/dev/index.md; echo $?
1
$ test -e docs/frontend/index.md; echo $?
1
```

Required fix:

- Add `docs/dev/index.md` and `docs/frontend/index.md` with short summaries and routing guidance.

---

## 3. File Organization and Clean Architecture

### ARCH-1 - MEDIUM - Import boundaries are enforced by convention

**Verdict:** Confirmed.

Evidence:

```bash
$ rg -n "AUDIT-012|dependency-cruiser|madge" docs/adr/adr-001-clean-architecture-layers.md
docs/adr/adr-001-clean-architecture-layers.md:388:1. **Import Boundary Enforcement:** ADR-001's original `madge` / `dependency-cruiser` recommendation is superseded by AUDIT-012. Implement the boundary check as a custom Vitest source scan using existing project dependencies; do not add `dependency-cruiser` or `madge` unless a future ADR explicitly reopens that decision.

$ find . -maxdepth 3 \( -name '.dependency-cruiser*' -o -name '*madge*' \) -print
# no output

$ rg -n "dependency-cruiser|depcruise|madge|noRestrictedImports|restricted-import|no-restricted-imports" package.json biome.json vitest*.config.ts tests src app lib components .github .claude AGENTS.md CLAUDE.md; echo exit=$?
exit=1
```

Current source shape is good:

```bash
$ rg -n "^(import|export) .* from ['\"][^./]|^import ['\"][^./]" src/domain --glob '!**/*.test.ts' --glob '!**/*.spec.ts' --glob '!**/test-helpers/**'; echo exit=$?
exit=1

$ rg -n "from ['\"](@/app|@/components|app/|components/)" src/adapters --glob '!**/*.test.ts' --glob '!**/*.spec.ts'; echo exit=$?
exit=1
```

**Decision (locked):** Implement as a **custom Vitest import-boundary test**, modeled on `components/theme-token-regression-source-scan.ts`. **Do NOT add `dependency-cruiser`** — the repo owns this scan idiom, has only four layers, and SEC-1 just flagged supply-chain surface. Wire it into the normal `pnpm test` gate. Use existing repo primitives only (`fast-glob` already exists) or TypeScript compiler APIs. The scan must parse static `import`, `export ... from`, side-effect imports, and dynamic `import()` specifiers; regex-only matching is acceptable only if tests cover those four import shapes. It must fail on:

- non-relative production imports in `src/domain`;
- production `src/application/**` imports from `@/src/adapters/**`, `@/app/**`, `@/components/**`, `@/lib/**`, `@/db/**`, Next/React/Clerk/Stripe/Drizzle, or `server-only`;
- production `src/adapters/**` imports from `@/app/**`, `@/components/**`, `app/**`, or `components/**`;
- production outer layers bypassing documented composition/controller entry points where an explicit boundary exists.

### ARCH-2 - LOW - Naming convention drift remains

**Verdict:** Confirmed with precise counts.

Evidence:

```bash
$ find app components src lib db scripts tests -type f \( -name '*.ts' -o -name '*.tsx' \) \
  -not -path '*/node_modules/*' -not -path '*/.next/*' \
  | awk -F/ '{
      name=$NF
      sub(/\.(test|spec|browser|integration|e2e)(\.[^.]+)?$/, "", name)
      sub(/\.(ts|tsx)$/, "", name)
      if (name ~ /^[A-Z]/) print $0
    }'
components/markdown/Markdown.test.tsx
components/markdown/Markdown.tsx
components/question/ChoiceButton.browser.spec.tsx
components/question/Feedback.test.tsx
components/question/QuestionCard.browser.spec.tsx
components/question/QuestionCard.test.tsx
```

There are exactly 6 PascalCase source/test files. A stricter filename-policy scan over the same 880 files finds 861 strict kebab-case matches and 19 nonmatching stems after stripping standard test suffixes (`.test`, `.spec`, `.browser.spec`, `.integration.test`, `.e2e`). Those 19 include the 6 PascalCase files above, 2 camelCase utility files:

```text
lib/content/draftTaxonomy.ts
lib/content/parseMdxQuestion.ts
```

and these 11 allowed multi-dot fixture/setup/integration names:

```text
app/(app)/app/billing/page.manage-billing.test.tsx
app/(app)/app/practice/[sessionId]/components/post-exam-review-view.fixtures.ts
app/(app)/app/practice/[sessionId]/hooks/practice-session-page-controller.browser.fixtures.ts
app/(app)/app/practice/[sessionId]/hooks/practice-session-page-controller.browser.probes.tsx
app/(app)/app/practice/[sessionId]/hooks/practice-session-page-controller.browser.setup.ts
app/(app)/app/practice/[sessionId]/hooks/use-practice-session-exam-results-continuity.fixtures.ts
app/(app)/app/questions/[slug]/question-page-controller.browser.fixtures.ts
lib/container.skip-clerk.test.ts
tests/e2e/global.setup.ts
tests/e2e/helpers/reset-bookmarks-for-e2e-user.default-services.test.ts
tests/integration/actions.stripe.integration.test.ts
```

The old global `~897` file count is stale. The verified source/test file count in the scanned directories is 880.

**Decision (locked):** Adopt strict kebab-case and enforce it, **as one package**:

- Rename the 6 PascalCase files **and** the 2 camelCase files (`lib/content/draftTaxonomy.ts`, `lib/content/parseMdxQuestion.ts`) via `git mv`, updating all imports.
- Extend the source-scan to fail CI on future filename drift. The policy is: after stripping one standard suffix from `.test`, `.spec`, `.browser.spec`, `.integration.test`, or `.e2e` and then stripping `.ts` / `.tsx`, the remaining stem must be strict kebab-case unless it exactly matches one of the 11 allowed multi-dot names listed above. Do NOT rename without adding the check — rename-without-enforce just re-drifts.
- **Keep** the 11 listed multi-dot fixture/setup names — they are a legitimate pattern, not violations. See Resolution Decisions.

### ARCH-3 - LOW - Some routes keep too much implementation at route root

**Verdict:** Confirmed, count corrected.

Evidence:

```bash
$ find "app/(app)/app/questions/[slug]" -maxdepth 2 -type f | sort
app/(app)/app/questions/[slug]/components/question-not-found-card.test.tsx
app/(app)/app/questions/[slug]/components/question-not-found-card.tsx
app/(app)/app/questions/[slug]/page.tsx
app/(app)/app/questions/[slug]/question-page-client.test.tsx
app/(app)/app/questions/[slug]/question-page-client.tsx
app/(app)/app/questions/[slug]/use-question-page-actions.browser.spec.tsx
app/(app)/app/questions/[slug]/use-question-page-actions.ts
app/(app)/app/questions/[slug]/use-question-page-controller.test.ts
app/(app)/app/questions/[slug]/use-question-page-controller.ts
app/(app)/app/questions/[slug]/use-question-page-data.browser.spec.tsx
app/(app)/app/questions/[slug]/use-question-page-data.ts
app/(app)/app/questions/[slug]/use-question-page-derived-state.test.ts
app/(app)/app/questions/[slug]/use-question-page-derived-state.ts
app/(app)/app/questions/[slug]/use-question-page-effects.browser.spec.tsx
app/(app)/app/questions/[slug]/use-question-page-effects.test.ts
app/(app)/app/questions/[slug]/use-question-page-effects.ts
app/(app)/app/questions/[slug]/use-question-page-navigation.test.ts
app/(app)/app/questions/[slug]/use-question-page-navigation.ts
app/(app)/app/questions/[slug]/use-question-page-progress.test.ts
app/(app)/app/questions/[slug]/use-question-page-progress.ts
```

The question slug route has 16 `use-question-page-*` files at route root plus `page.tsx` and `question-page-client.*`. Practice/history routes are more organized with subdirectories such as `components/` and `hooks/`.

Required fix:

- Move route-local `use-question-page-*` hooks, tests, test helpers, and `question-page-controller.browser.fixtures.ts` under a new `hooks/` directory for the question slug route.
- Leave `page.tsx`, `question-page-client.*`, and `components/` at route root; do not introduce `_lib/` here.
- Keep this as organization-only cleanup.

### ARCH-4 - LOW - "controller" means two different things

**Verdict:** Confirmed.

Evidence:

```bash
$ find app -type f \( -name 'use-*controller.ts' -o -name 'use-*controller.tsx' \) -not -name '*test*' -not -name '*spec*' | sort
app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts
app/(app)/app/questions/[slug]/use-question-page-controller.ts

$ find src/adapters/controllers -maxdepth 1 -type f -name '*controller.ts' | sort
src/adapters/controllers/billing-controller.ts
src/adapters/controllers/bookmark-controller.ts
src/adapters/controllers/clerk-webhook-controller.ts
src/adapters/controllers/practice-controller.ts
src/adapters/controllers/question-controller.ts
src/adapters/controllers/question-feedback-controller.ts
src/adapters/controllers/question-view-controller.ts
src/adapters/controllers/review-controller.ts
src/adapters/controllers/stats-controller.ts
src/adapters/controllers/stripe-webhook-controller.ts
src/adapters/controllers/tag-controller.ts

$ rg -n "use-question-page-controller|use-practice-session-page-controller|useQuestionPageController|usePracticeSessionPageController|PracticeSessionPageController|QuestionPageController" app --glob '*.{ts,tsx}' | wc -l | tr -d ' '
162
```

**Decision (locked):**

- Keep `src/adapters/controllers/*` as the canonical "controller" (the Clean Architecture adapter role).
- Rename the 2 production presentation hooks to `use-*-page-model.ts` (Fowler's Presentation Model). Avoid "presenter" — also a reserved Clean Architecture term.
- Update the associated imports, test/probe/fixture/helper filenames, exported hook/type names, and non-archived docs that reference the two hooks. Archived docs may keep historical names.
- Add a one-line glossary entry to `AGENTS.md` distinguishing adapter controllers from presentation models, so the agent fleet stops conflating them. See Resolution Decisions.

### Agent skill symlink invariant - GOOD

**Verdict:** Confirmed.

Evidence:

```bash
$ git ls-files -s .claude/skills .codex/skills | awk '{print $1}' | sort -u
120000

$ find .agents/skills -name SKILL.md | wc -l | tr -d ' '
15

$ node -e "const m=require('./.agents/skills/skills.manifest.json'); console.log(m.skills.length)"
15
```

`.claude/skills/*` and `.codex/skills/*` are tracked symlinks into `.agents/skills/*`, and the manifest count matches the number of vendored `SKILL.md` files. Do not delete or recreate these symlinks during skill refresh work.

---

## 4. Code Quality and PoSD

### CODE-1 - LOW - Error-reporting catch idioms are duplicated but not dangerous

**Verdict:** Confirmed; recommendation refined.

Evidence:

```bash
$ rg -n "safeLog|logger\.|reportClientError|catch \{" src/adapters/controllers/question-view-controller.ts src/application/use-cases/submit-answer.ts src/adapters/shared/with-idempotency.ts src/application/use-cases/create-checkout-session.ts app/'(app)'/app/shared/question-feedback-actions.ts app/'(app)'/app/shared/bookmark-toggle.ts
src/adapters/controllers/question-view-controller.ts:63:function safeLog(
src/adapters/controllers/question-view-controller.ts:71:  } catch {
src/adapters/controllers/question-view-controller.ts:132:      safeLog(
src/adapters/controllers/question-view-controller.ts:149:      safeLog(
src/application/use-cases/submit-answer.ts:77:  private safeLog(
src/application/use-cases/submit-answer.ts:84:    } catch {
src/application/use-cases/submit-answer.ts:239:      this.safeLog(
src/adapters/shared/with-idempotency.ts:66:    input.logger.warn(
src/adapters/shared/with-idempotency.ts:106:          input.logger.error(
src/adapters/shared/with-idempotency.ts:120:        } catch {
src/application/use-cases/create-checkout-session.ts:44:      this.logger.warn(
src/application/use-cases/create-checkout-session.ts:48:    } catch {
app/(app)/app/shared/question-feedback-actions.ts:65:    } catch {
app/(app)/app/shared/question-feedback-actions.ts:78:      } catch {
app/(app)/app/shared/question-feedback-actions.ts:140:    } catch {
app/(app)/app/shared/question-feedback-actions.ts:154:      } catch {
app/(app)/app/shared/bookmark-toggle.ts:54:    } catch {
app/(app)/app/shared/bookmark-toggle.ts:67:      } catch {
```

There are two private `safeLog` helpers and several best-effort reporter/logging catches. This is not a correctness bug today.

Required fix:

- Add a small shared helper for application/adapters logger safety only if the pattern grows.
- Keep UI reporter helpers in `app/(app)/app/shared` rather than forcing them into application code.
- Document that telemetry/reporting failures must not mask primary user outcomes.

### CODE-2 - LOW - Stripe checkout session function is long

**Verdict:** Confirmed.

Evidence:

```bash
$ rg -n "createStripeCheckoutSession" src/adapters/gateways/stripe/stripe-checkout-sessions.ts
src/adapters/gateways/stripe/stripe-checkout-sessions.ts:133:export async function createStripeCheckoutSession({
```

`createStripeCheckoutSession` spans lines 133-495 and mixes validation, idempotency, metadata, price mapping, and Stripe call construction.

Required fix:

- Extract pure helpers around metadata/session parameter construction first.
- Preserve existing tests and fake gateway patterns.

### CODE-3 - LOW - Bare-catch policy is implicit

**Verdict:** Confirmed; no swallowed primary-path error was found.

Evidence:

```bash
$ rg -n "catch \{" src lib app --glob '!**/*.test.ts' --glob '!**/*.test.tsx' --glob '!**/*.spec.ts' --glob '!**/*.spec.tsx' --glob '!**/*.browser.spec.tsx' | wc -l | tr -d ' '
16

$ rg -n "catch \{" src lib app --glob '!**/*.test.ts' --glob '!**/*.test.tsx' --glob '!**/*.spec.ts' --glob '!**/*.spec.tsx' --glob '!**/*.browser.spec.tsx'
lib/env.ts:18:  } catch {
lib/manage-billing/manage-billing-core.ts:43:  } catch {
lib/report-client-error.ts:66:  } catch {
src/adapters/controllers/question-view-controller.ts:71:  } catch {
src/adapters/shared/with-idempotency.ts:120:        } catch {
app/(app)/app/practice/practice-page-session-start.ts:101:    } catch {
app/(app)/app/questions/[slug]/question-page-client.tsx:65:  } catch {
src/application/use-cases/submit-answer.ts:84:    } catch {
src/application/use-cases/create-checkout-session.ts:48:    } catch {
app/(app)/app/shared/question-feedback-actions.ts:65:    } catch {
app/(app)/app/shared/question-feedback-actions.ts:78:      } catch {
app/(app)/app/shared/question-feedback-actions.ts:140:    } catch {
app/(app)/app/shared/question-feedback-actions.ts:154:      } catch {
app/(app)/app/shared/bookmark-toggle.ts:54:    } catch {
app/(app)/app/shared/bookmark-toggle.ts:67:      } catch {
app/(app)/app/shared/transitioned-async-action.ts:14:        } catch {

$ rg -n "bare-catch|Telemetry must|Reporter failures" .claude/rules AGENTS.md CLAUDE.md
# no output
```

The 16 bare catches are not all telemetry guards: `lib/env.ts` is a base64 decode fallback and `question-page-client.tsx` is a URL parse fallback. The rest are best-effort logging/reporting/cleanup/rollback paths or UI fallback paths. No currently identified bare catch silently swallows a meaningful primary-path failure.

Required fix:

- Document the allowed bare-catch categories:
  - telemetry/reporting/logging failures;
  - rollback/cleanup best effort when the original error is preserved;
  - parse/decode fallback to a safe default.
- Require a short comment when a catch intentionally suppresses an error. Add a shared helper only after at least three sibling application/adapters files need the same logger-safe wrapper.

### Source TODO/FIXME/HACK/XXX hygiene - GOOD

**Verdict:** Confirmed.

Evidence:

```bash
$ rg -n '\b(TODO|FIXME|HACK|XXX)\b' src lib app components scripts db --glob '!**/*.test.ts' --glob '!**/*.test.tsx' --glob '!**/*.spec.ts' --glob '!**/*.spec.tsx' --glob '!**/*.browser.spec.tsx' --glob '!db/migrations/**'; echo exit=$?
exit=1
```

There are tracked `DEBT-*` and `BUG-*` markers, but no untracked source TODO/FIXME/HACK/XXX markers in the scanned production paths.

### TypeScript suppression inventory - GOOD, counts corrected

**Verdict:** Confirmed with corrected counts.

Code-file inventory, excluding `node_modules`, `.next`, lockfile, markdown, and generated artifacts:

```bash
$ for p in '@ts-ignore' '@ts-nocheck' 'eslint-disable' '@ts-expect-error' 'biome-ignore' 'as unknown as' 'as any'; do
  printf '%-18s ' "$p"
  rg -n --glob '*.{ts,tsx,js,jsx,mjs,cjs}' --glob '!node_modules/**' --glob '!.next/**' --glob '!pnpm-lock.yaml' "$p" . | wc -l
done
@ts-ignore          0
@ts-nocheck         0
eslint-disable      0
@ts-expect-error    13
biome-ignore        11
as unknown as       281
as any              0

$ rg -n ': any\b' src lib app components scripts db --glob '*.{ts,tsx}' --glob '!**/*.test.ts' --glob '!**/*.test.tsx' --glob '!**/*.spec.ts' --glob '!**/*.spec.tsx' --glob '!**/*.browser.spec.tsx' --glob '!db/migrations/**'; echo exit=$?
exit=1

$ rg -n 'as unknown as' src lib app components scripts db --glob '*.{ts,tsx}' --glob '!**/*.test.ts' --glob '!**/*.test.tsx' --glob '!**/*.spec.ts' --glob '!**/*.spec.tsx' --glob '!**/*.browser.spec.tsx' --glob '!**/test-helpers/**' --glob '!db/migrations/**'
app/api/webhooks/clerk/route.ts:14:  const verifiedEvent = await verifyWebhook(req as unknown as ClerkRequestLike);
lib/db.ts:11:const globalForDb = globalThis as unknown as {
```

Correct statement: production has exactly 2 `as unknown as` casts and zero `as any` / `: any` in the scanned production paths. Code-file total `as unknown as` count is 281, mostly in tests/helpers. Do not quote the older 243/241 split.

### Large-file policy is partially enforced

**Verdict:** New finding and correction to prior praise.

Evidence:

```bash
$ find src lib app components db -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 | xargs -0 sh scripts/check-file-size.sh 2>&1 | sort
⚠ app/(app)/app/practice/[sessionId]/hooks/practice-session-page-controller.browser.probes.tsx exceeds 350 lines (354). To suppress: add a WHY comment to the file AND add it to is_known_exempt in scripts/check-file-size.sh.
⚠ app/(app)/app/practice/[sessionId]/hooks/use-practice-session-question-flow.ts exceeds 350 lines (448). To suppress: add a WHY comment to the file AND add it to is_known_exempt in scripts/check-file-size.sh.
⚠ app/(app)/app/practice/components/practice-view.tsx exceeds 350 lines (539). To suppress: add a WHY comment to the file AND add it to is_known_exempt in scripts/check-file-size.sh.
⚠ app/(app)/app/questions/[slug]/question-page-logic.ts exceeds 350 lines (429). To suppress: add a WHY comment to the file AND add it to is_known_exempt in scripts/check-file-size.sh.
⚠ app/(app)/app/questions/[slug]/use-question-page-controller.ts exceeds 350 lines (373). To suppress: add a WHY comment to the file AND add it to is_known_exempt in scripts/check-file-size.sh.
⚠ components/marketing/marketing-home.tsx exceeds 350 lines (359). To suppress: add a WHY comment to the file AND add it to is_known_exempt in scripts/check-file-size.sh.
⚠ src/adapters/controllers/clerk-webhook-controller.ts exceeds 350 lines (377). To suppress: add a WHY comment to the file AND add it to is_known_exempt in scripts/check-file-size.sh.
⚠ src/adapters/controllers/practice-controller.ts exceeds 350 lines (377). To suppress: add a WHY comment to the file AND add it to is_known_exempt in scripts/check-file-size.sh.
⚠ src/adapters/gateways/stripe/stripe-checkout-sessions.ts exceeds 350 lines (495). To suppress: add a WHY comment to the file AND add it to is_known_exempt in scripts/check-file-size.sh.
⚠ src/adapters/repositories/drizzle-practice-session-repository.ts exceeds 350 lines (364). To suppress: add a WHY comment to the file AND add it to is_known_exempt in scripts/check-file-size.sh.
⚠ src/application/test-helpers/fakes/fake-attempt-repository.ts exceeds 350 lines (427). To suppress: add a WHY comment to the file AND add it to is_known_exempt in scripts/check-file-size.sh.
⚠ src/application/test-helpers/fakes/fake-practice-session-repository.ts exceeds 350 lines (389). To suppress: add a WHY comment to the file AND add it to is_known_exempt in scripts/check-file-size.sh.
```

Known large files such as `db/schema.ts`, `history-questions-tab.tsx`, `question-page-client.tsx`, and `drizzle-attempt-repository.ts` have rationale headers or exemptions. The size checker currently exits 0 and runs only through lint-staged, so it is a warning guardrail, not a full-repo blocking gate.

**Decision (locked):**

- Update `scripts/check-file-size.sh` so non-production support files are excluded explicitly: `*.browser.probes.tsx` and `src/application/test-helpers/**` must not be added to `is_known_exempt`.
- `practice-view.tsx`, `use-practice-session-question-flow.ts`, `question-page-logic.ts`, `use-question-page-controller.ts` / its post-ARCH-4 page-model name, `marketing-home.tsx`, `clerk-webhook-controller.ts`, `practice-controller.ts`, and `drizzle-practice-session-repository.ts`: document via WHY header + `is_known_exempt`. Do not extract these in this audit-resolution pass.
- `stripe-checkout-sessions.ts`: attempt **one** Extract-Function on the inspect/expire-existing-session block (the billing-critical file is where clarity pays off). The extraction should return a structured decision object rather than exposing shared mutable locals such as `replacementIdempotencyKey` and expire-fatality state. Keep it only if the full gate stays green; otherwise document via the same WHY+allowlist mechanism. See Resolution Decisions.

---

## What Is Genuinely Good

These claims were independently re-derived:

- Full CI workflow coverage exists. Typecheck, lint, unit coverage, integration tests, browser tests, build, and conditional E2E policy are in `.github/workflows/ci.yml`.
- Domain production code is pure by import scan. `src/domain` has zero production non-relative imports.
- Adapters do not import app/components by scan. No production adapter import from `app/**` or `components/**` was found.
- Controller action wrapping is a real shared seam in `src/adapters/controllers/create-action.ts`.
- Application errors are typed in `src/application/errors/application-errors.ts`.
- Agent skill symlinks are tracked and coherent. 15 manifest entries match 15 vendored `SKILL.md` files.
- Source TODO suppression hygiene is strong. No untracked TODO/FIXME/HACK/XXX markers were found in scanned production source paths.
- Version-update Dependabot config exists for npm and GitHub Actions. This does not offset SEC-1 because security alerts and automated security fixes are disabled.

---

## Consolidated Action List and Recommendation Soundness

### 1. Protect public `main` (CI-1, CRITICAL)

Correct and highest priority. The repository is public and has no GitHub-side merge gate.

Scope:

- Add a repository ruleset for `main`.
- Require PRs and successful CI.
- Block force pushes and deletions.
- Consider CODEOWNERS for owner review.

### 2. Enable dependency security automation and resolve the current audit (SEC-1, HIGH)

Correct and second priority. This was missing from the earlier positive framing.

Scope:

- Enable vulnerability alerts/security updates.
- Remove `open-pull-requests-limit: 0` from security update entries so a real security PR flow exists.
- Run `pnpm audit --audit-level=moderate`; patch or document each remaining vulnerability.

### 3. Add mechanical architecture boundary enforcement (ARCH-1, MEDIUM)

Correct. Documentation alone is insufficient for a Clean Architecture invariant.

**Locked approach:**

- Implement as a custom Vitest import-boundary test (see Resolution Decisions). Do NOT add `dependency-cruiser` — SEC-1 supply-chain context plus the existing source-scan idiom make a no-new-dependency test the correct choice.

### 4. Fix stale and duplicated agent docs (DOC-1 through DOC-5)

Correct.

Scope:

- Update Node/pnpm requirements.
- Remove duplicate universal process from `CLAUDE.md`.
- Keep one canonical full-gate/E2E section in `AGENTS.md`.
- Make `src/application/test-helpers/fakes/index.ts` the explicit source of truth for available fakes in both `AGENTS.md` and `.claude/rules/testing.md`; keep inline fake lists as examples only and include `FakeQuestionFeedbackRepository` if an example list remains.
- Fix the archived debt-doc link.

### 5. Repair README and docs discoverability (DOC-6, DOC-7)

Correct.

Scope:

- Add runtime requirements and a pointer to `AGENTS.md`.
- Add `docs/dev/index.md` and `docs/frontend/index.md`.

### 6. Enforce file naming policy (ARCH-2)

Locked: adopt + enforce strict kebab-case as one package (rename 8 files + extend the source-scan; keep multi-dot fixtures). See Resolution Decisions.

Risk:

- Renaming creates import churn — do it via `git mv` in its own commit, separate from behavior changes, and verify the full gate.

### 7. Clean up question-route colocation and controller naming (ARCH-3, ARCH-4)

Lower priority, but the vocabulary call is now locked.

Scope:

- ARCH-3: move question-route `use-question-page-*` files and local hook helpers under `hooks/` (organization-only). Do not use `_lib/` for this route.
- ARCH-4 (locked): rename the 2 production presentation hooks to `use-*-page-model.ts`, update tests/probes/fixtures/helpers/imports/non-archived docs, and add the `AGENTS.md` glossary line. See Resolution Decisions.

### 8. Address large-file policy gaps (CODE-2 and large-file correction)

Correct.

Scope (locked):

- Update `scripts/check-file-size.sh` so `*.browser.probes.tsx` and `src/application/test-helpers/**` are excluded as test/support files, not allowlisted.
- `stripe-checkout-sessions.ts`: attempt one Extract-Function on the inspect/expire block; keep only if the gate stays green, else document.
- Intentional production files still over 350 lines after that should receive a WHY header + `is_known_exempt`. Do not extract them in this pass except for the scoped Stripe checkout function attempt above.
- `practice-view.tsx`: document via WHY header + `is_known_exempt` (do not split a deep module).

### 9. Codify allowed bare catches and logging/reporting helpers (CODE-1, CODE-3)

Correct but low priority.

Scope:

- Document allowed bare-catch categories.
- Do not add a shared helper in this pass. Add one later only after at least three sibling application/adapters files need the same logger-safe wrapper; do not centralize UI reporter code into application services.

### 10. Add security hardening backlog items (SEC-2, SEC-3)

Correct.

Scope:

- Add `Content-Security-Policy-Report-Only` in `next.config.ts` for `/:path*` first, covering Next assets plus Clerk, Stripe, and Sentry/reporting endpoints; validate with browser tests/E2E before enforcement.
- Add `public/.well-known/security.txt` with the repository's preferred vulnerability contact and disclosure policy. Do not decline this for a public SaaS repo unless the owner explicitly overrides the audit.

---

## Reprioritized Execution Order

1. CI-1: protect `main`.
2. SEC-1: enable vulnerability alerts/security updates and resolve `pnpm audit`.
3. ARCH-1: add boundary enforcement.
4. DOC-1/DOC-4/DOC-5: quick correctness fixes in agent docs.
5. DOC-2/DOC-3: de-duplicate universal process guidance.
6. CI-3: document coverage as observational (no gate). CI-5: file `noUncheckedIndexedAccess` as a recommended-soon DEBT item (no repo-wide flip in this pass).
7. CODE-2/large-file policy: fix checker exclusions, attempt the one Stripe extraction, then document intentional large production files.
8. ARCH-2/ARCH-3/ARCH-4: naming and organization cleanup.
9. CODE-1/CODE-3: error-handling convention doc/helper cleanup.
10. SEC-2/SEC-3/DOC-6/DOC-7: security/contact/docs discoverability polish.

---

## Verification Appendix

Re-run these commands before executing the audit. GitHub settings, vulnerability advisories, and counts can change outside this file.

```bash
# GitHub enforcement and security settings
gh repo view --json nameWithOwner,visibility,isPrivate,defaultBranchRef
gh api repos/:owner/:repo/branches/main --jq '{name, protected}'
gh api repos/:owner/:repo/branches/main/protection --include
gh api repos/:owner/:repo/rulesets --include
gh api repos/:owner/:repo --jq '.security_and_analysis // {}'
gh api repos/:owner/:repo/vulnerability-alerts --include
gh api repos/:owner/:repo/automated-security-fixes --include

# Dependency security
pnpm audit --audit-level=moderate

# Architecture boundaries
rg -n "^(import|export) .* from ['\"][^./]|^import ['\"][^./]" src/domain --glob '!**/*.test.ts' --glob '!**/*.spec.ts' --glob '!**/test-helpers/**'
rg -n "from ['\"](@/app|@/components|app/|components/)" src/adapters --glob '!**/*.test.ts' --glob '!**/*.spec.ts'
rg -n "dependency-cruiser|depcruise|madge|noRestrictedImports|restricted-import|no-restricted-imports" package.json biome.json vitest*.config.ts tests src app lib components .github .claude AGENTS.md CLAUDE.md

# Docs drift
rg -n "Node >=20\.19\.0|FakeQuestionFeedbackRepository|debt-416-agent-skills" AGENTS.md CLAUDE.md .claude/rules README.md
rg -n "pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build|Quick file check when you rely on \.env\.local|pnpm test:e2e" AGENTS.md CLAUDE.md

# Suppressions and TODOs
rg -n '\b(TODO|FIXME|HACK|XXX)\b' src lib app components scripts db --glob '!**/*.test.ts' --glob '!**/*.test.tsx' --glob '!**/*.spec.ts' --glob '!**/*.spec.tsx' --glob '!**/*.browser.spec.tsx' --glob '!db/migrations/**'
for p in '@ts-ignore' '@ts-nocheck' 'eslint-disable' '@ts-expect-error' 'biome-ignore' 'as unknown as' 'as any'; do
  printf '%-18s ' "$p"
  rg -n --glob '*.{ts,tsx,js,jsx,mjs,cjs}' --glob '!node_modules/**' --glob '!.next/**' --glob '!pnpm-lock.yaml' "$p" . | wc -l
done
rg -n ': any\b' src lib app components scripts db --glob '*.{ts,tsx}' --glob '!**/*.test.ts' --glob '!**/*.test.tsx' --glob '!**/*.spec.ts' --glob '!**/*.spec.tsx' --glob '!**/*.browser.spec.tsx' --glob '!db/migrations/**'
rg -n 'as unknown as' src lib app components scripts db --glob '*.{ts,tsx}' --glob '!**/*.test.ts' --glob '!**/*.test.tsx' --glob '!**/*.spec.ts' --glob '!**/*.spec.tsx' --glob '!**/*.browser.spec.tsx' --glob '!**/test-helpers/**' --glob '!db/migrations/**'

# Naming, symlinks, and file size
find app components src lib db scripts tests -type f \( -name '*.ts' -o -name '*.tsx' \) -not -path '*/node_modules/*' -not -path '*/.next/*' | awk -F/ '{ name=$NF; sub(/\.(test|spec|browser|integration|e2e)(\.[^.]+)?$/, "", name); sub(/\.(ts|tsx)$/, "", name); if (name ~ /^[A-Z]/) print $0 }'
node - <<'NODE'
const { execFileSync } = require('node:child_process');
const files = execFileSync('find', ['app','components','src','lib','db','scripts','tests','-type','f','(','-name','*.ts','-o','-name','*.tsx',')','-not','-path','*/node_modules/*','-not','-path','*/.next/*'], {encoding:'utf8'}).trim().split('\n').filter(Boolean).sort();
const out = [];
for (const p of files) {
  const raw = p.split('/').pop();
  let stem = raw.replace(/\.(ts|tsx)$/,'');
  stem = stem.replace(/\.(browser\.spec|integration\.test|test|spec|e2e)$/,'');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stem)) out.push(`${stem}\t${p}`);
}
console.log(`total=${files.length}`);
console.log(`outliers=${out.length}`);
console.log(out.join('\n'));
NODE
git ls-files -s .claude/skills .codex/skills
find .agents/skills -name SKILL.md | wc -l
node -e "const m=require('./.agents/skills/skills.manifest.json'); console.log(m.skills.length)"
find src lib app components db -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 | xargs -0 sh scripts/check-file-size.sh 2>&1 | sort
```
