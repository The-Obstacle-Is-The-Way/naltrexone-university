# AUDIT-012 - Repository Organization, Dev Tooling, and Agent Documentation

**Project:** Naltrexone University
**Date:** 2026-06-13
**Scope:** CI/CD and developer tooling, GitHub enforcement, dependency security automation, `AGENTS.md` / `CLAUDE.md` / `.claude/rules` accuracy, file organization, Clean Architecture boundaries, and code-quality guardrails.
**Method:** Source re-verification from repository files plus GitHub API checks with `gh`. Counts and absence claims were re-run directly instead of copied from prior audit text.
**Status:** Active. Findings below should be triaged into `docs/bugs/` or `docs/debt/`, then this audit should be archived after remediation.

---

## Executive Summary

The repository is structurally strong. Clean Architecture layers are visible, domain production code is import-pure by scan, CI runs the meaningful quality gates, agent skills are centrally vendored with tracked symlinks, and source TODO/suppression hygiene is strong.

The repository is **not** fully enforced or fully documented. The three highest-priority work items are:

1. **CI-1 / CRITICAL:** `main` is public and unprotected. There are no branch protection rules and no repository rulesets. CI exists, but GitHub does not require it before merge or direct push.
2. **SEC-1 / HIGH:** Dependency security automation is not actually delivering security fixes. GitHub reports vulnerability alerts/security updates disabled, Dependabot security update entries have `open-pull-requests-limit: 0`, and `pnpm audit --audit-level=moderate` currently exits non-zero with 5 vulnerabilities, including 1 high.
3. **ARCH-1 / MEDIUM:** Clean Architecture boundaries are documented and currently healthy in high-value scans, but there is no mechanical import-boundary enforcement.

The repo does **not** need a major reorganization before feature work. It needs enforcement and documentation cleanup: protect `main`, enable security automation and resolve the red audit, add boundary enforcement, fix stale agent docs, and codify a few conventions already present in the code.

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

- Add a GitHub repository ruleset or branch protection rule for `main`.
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

The tests are blocking; only coverage upload failure is non-blocking. If coverage thresholds are intended, enforce them in Vitest or a required Codecov status check.

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

Required fix:

- Do not flip these repo-wide casually.
- Create a staged debt item for `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Enable only after resulting churn is reviewed.

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
- Enable Dependabot security updates or configure security-update entries to create PRs instead of using `open-pull-requests-limit: 0`.
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

- Add a staged CSP plan in report-only mode first.
- Include Clerk, Stripe, Sentry, and Next.js asset requirements.
- Promote to enforcement only after browser/E2E validation.

### SEC-3 - LOW - No public security contact file

**Verdict:** New hardening finding.

Evidence:

```bash
$ find public app -path '*security*' -o -path '*/.well-known/*' -print
# no output
```

Required fix:

- Add `public/.well-known/security.txt` with the preferred vulnerability contact and disclosure policy, or explicitly decide not to publish one.

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

- Add `FakeQuestionFeedbackRepository` to `AGENTS.md` and `.claude/rules/testing.md`, or point both docs at `src/application/test-helpers/fakes/index.ts` as the source of truth and keep only examples inline.

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

- Update the link to `docs/_archive/debt/debt-416-agent-skills-provenance-and-refresh.md` or route through `docs/debt/index.md`.

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
$ rg -n "madge --circular|dependency-cruiser" docs/adr/adr-001-clean-architecture-layers.md
docs/adr/adr-001-clean-architecture-layers.md:388:1. **Dependency Check:** Run `madge --circular src/` — no circular dependencies
docs/adr/adr-001-clean-architecture-layers.md:389:2. **Import Enforcement:** Use `dependency-cruiser` with rules preventing inner layers importing outer layers (Biome does not provide import boundary enforcement)

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

Required fix:

- Add a fast Vitest import-boundary test or dependency-cruiser rule that fails on:
  - non-relative production imports in `src/domain`;
  - application importing adapters/framework code;
  - adapters importing `app/**` or `components/**`;
  - outer layers bypassing documented composition/controller entry points where a boundary exists.

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

There are exactly 6 PascalCase source/test files. A stricter filename-policy scan over the same 880 files finds 861 strict kebab-case matches and 19 nonmatching names. Those 19 include the 6 PascalCase files above, 2 camelCase utility files:

```text
lib/content/draftTaxonomy.ts
lib/content/parseMdxQuestion.ts
```

and 11 multi-dot fixture/setup/integration names such as `lib/container.skip-clerk.test.ts`, `tests/e2e/global.setup.ts`, and `app/(app)/app/billing/page.manage-billing.test.tsx`.

The old global `~897` file count is stale. The verified source/test file count in the scanned directories is 880.

Required fix:

- Decide whether component files may remain PascalCase. If not, rename the 6 files and update imports.
- Decide whether camelCase utility files are allowed. If not, rename the 2 `lib/content` files.
- If enforcing strict kebab-case, decide whether multi-dot fixture/setup names are allowed before adding a check.

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

- Move route-local hooks/helpers under `hooks/` or `_lib/` for the question slug route.
- Keep this as organization-only cleanup.

### ARCH-4 - LOW - "controller" means two different things

**Verdict:** Confirmed.

Evidence:

```bash
$ find src/adapters/controllers app -name '*controller*.ts' -o -name '*controller*.tsx' | sort
app/(app)/app/practice/[sessionId]/hooks/use-practice-session-page-controller.ts
app/(app)/app/questions/[slug]/use-question-page-controller.ts
src/adapters/controllers/bookmark-controller.ts
src/adapters/controllers/create-action.ts
src/adapters/controllers/practice-controller.ts
src/adapters/controllers/question-feedback-controller.ts
src/adapters/controllers/question-view-controller.ts
src/adapters/controllers/quiz-controller.ts
src/adapters/controllers/review-controller.ts
src/adapters/controllers/session-controller.ts
```

Required fix:

- Keep `src/adapters/controllers/*` for server-action/API controller adapters.
- Prefer `use-*-page-model`, `use-*-page-state`, or `use-*-screen-controller` for client hook orchestration, and document the naming rule.

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
- Require a short comment or helper when a catch intentionally suppresses an error.

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
$ find src lib app components scripts db -type f \( -name '*.ts' -o -name '*.tsx' \) \
  -not -path '*/node_modules/*' -not -path '*/.next/*' \
  -not -name '*.test.ts' -not -name '*.test.tsx' \
  -not -name '*.spec.ts' -not -name '*.spec.tsx' -not -name '*.browser.spec.tsx' \
  -not -path '*/test-helpers/*' -print0 \
  | xargs -0 wc -l | sort -nr | head
   38496 total
     772 db/schema.ts
     572 app/(app)/app/history/components/history-questions-tab.tsx
     556 app/(app)/app/questions/[slug]/question-page-client.tsx
     547 src/adapters/repositories/drizzle-attempt-repository.ts
     539 app/(app)/app/practice/components/practice-view.tsx
     495 src/adapters/gateways/stripe/stripe-checkout-sessions.ts

$ sh scripts/check-file-size.sh src/adapters/gateways/stripe/stripe-checkout-sessions.ts app/'(app)'/app/practice/components/practice-view.tsx 2>&1
⚠ src/adapters/gateways/stripe/stripe-checkout-sessions.ts exceeds 350 lines (495). To suppress: add a WHY comment to the file AND add it to is_known_exempt in scripts/check-file-size.sh.
⚠ app/(app)/app/practice/components/practice-view.tsx exceeds 350 lines (539). To suppress: add a WHY comment to the file AND add it to is_known_exempt in scripts/check-file-size.sh.
```

Known large files such as `db/schema.ts`, `history-questions-tab.tsx`, `question-page-client.tsx`, and `drizzle-attempt-repository.ts` have documented rationale headers or exemptions. `practice-view.tsx` and `stripe-checkout-sessions.ts` exceed the warning threshold and are not exempted.

Required fix:

- Either split those files or add explicit rationale headers/debt references and update the file-size checker allowlist if the size is intentional.

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

- Add branch protection or a repository ruleset for `main`.
- Require PRs and successful CI.
- Block force pushes and deletions.
- Consider CODEOWNERS for owner review.

### 2. Enable dependency security automation and resolve the current audit (SEC-1, HIGH)

Correct and second priority. This was missing from the earlier positive framing.

Scope:

- Enable vulnerability alerts/security updates.
- Remove `open-pull-requests-limit: 0` from security update entries or otherwise create a real security PR flow.
- Run `pnpm audit --audit-level=moderate`; patch or document each remaining vulnerability.

### 3. Add mechanical architecture boundary enforcement (ARCH-1, MEDIUM)

Correct. Documentation alone is insufficient for a Clean Architecture invariant.

Recommended approach:

- Prefer a fast custom Vitest scan first because the rules are repository-specific and easy to express.
- Use dependency-cruiser later if graph visualization or broader dependency policies become useful.

### 4. Fix stale and duplicated agent docs (DOC-1 through DOC-5)

Correct.

Scope:

- Update Node/pnpm requirements.
- Remove duplicate universal process from `CLAUDE.md`.
- Keep one canonical full-gate/E2E section in `AGENTS.md`.
- Add `FakeQuestionFeedbackRepository` or point to the fake barrel file.
- Fix the archived debt-doc link.

### 5. Repair README and docs discoverability (DOC-6, DOC-7)

Correct.

Scope:

- Add runtime requirements and a pointer to `AGENTS.md`.
- Add `docs/dev/index.md` and `docs/frontend/index.md`.

### 6. Decide and enforce file naming policy (ARCH-2)

Correct but not urgent.

Risk:

- Renaming component files can create noisy diffs and import churn.
- Do this separately from behavior changes.

### 7. Clean up question-route colocation and controller naming (ARCH-3, ARCH-4)

Correct but lower priority.

Scope:

- Move question route hooks under `hooks/` or `_lib/`.
- Rename client hook "controller" files only if the team agrees on the vocabulary.

### 8. Address large-file policy gaps (CODE-2 and large-file correction)

Correct.

Scope:

- Split `stripe-checkout-sessions.ts` around pure construction helpers.
- Split or document `practice-view.tsx`.
- Update `scripts/check-file-size.sh` only with explicit rationale.

### 9. Codify allowed bare catches and logging/reporting helpers (CODE-1, CODE-3)

Correct but low priority.

Scope:

- Document allowed bare-catch categories.
- Add helpers only where duplication is real; do not centralize UI reporter code into application services.

### 10. Add security hardening backlog items (SEC-2, SEC-3)

Correct.

Scope:

- Add CSP in report-only mode first.
- Add or explicitly decline `/.well-known/security.txt`.

---

## Reprioritized Execution Order

1. CI-1: protect `main`.
2. SEC-1: enable vulnerability alerts/security updates and resolve `pnpm audit`.
3. ARCH-1: add boundary enforcement.
4. DOC-1/DOC-4/DOC-5: quick correctness fixes in agent docs.
5. DOC-2/DOC-3: de-duplicate universal process guidance.
6. CI-3/CI-5: decide coverage thresholds and strictness-flag rollout.
7. CODE-2/large-file policy: split or document large files.
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
git ls-files -s .claude/skills .codex/skills
find .agents/skills -name SKILL.md | wc -l
node -e "const m=require('./.agents/skills/skills.manifest.json'); console.log(m.skills.length)"
sh scripts/check-file-size.sh src/adapters/gateways/stripe/stripe-checkout-sessions.ts app/'(app)'/app/practice/components/practice-view.tsx
```
