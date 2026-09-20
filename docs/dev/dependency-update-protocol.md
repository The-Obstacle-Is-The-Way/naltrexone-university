# Dependency Update Protocol

This is the on-call playbook for incoming Dependabot PRs and ad-hoc dependency work. It exists so dependency freshness work follows the same merge discipline as feature work: one concern, verified scope, full local gate, and CodeRabbit on the latest head.

## Default Rules

- Treat every dependency PR as executable code, even when it only changes a manifest or lockfile.
- Do not merge a red Dependabot PR, regardless of CodeRabbit state.
- Do not push commits to Dependabot-owned branches. Ask Dependabot to rebase or recreate, or spin a separate repo-owned fix PR.
- Do not bundle incidental app/test fixes into a dependency PR. Ship the fix first, then rebase the dependency PR.
- Run the full local gate before pushing any repo-owned dependency or protocol PR:

  ```sh
  pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm db:test:up && pnpm test:integration && pnpm build
  ```

- Run `pnpm test:e2e` as well. It is mandatory for repo-owned dependency PRs, not conditional; if your `.env.local` lacks the authenticated E2E environment, the PR is not mergeable until someone with it runs `pnpm test:e2e` on the PR head and records the receipt in the PR body — say so there rather than skipping silently. **Do not run a Dependabot-authored head locally with shared `.env.local` credentials:** a dependency bump is executable code, and `pnpm test:e2e` loads `.env.local` into its environment ([DEBT-474](../debt/debt-474-ci-secret-scope-and-action-immutability.md) F1). The owner decided on 2026-09-19 to retain the no-shared-credentials boundary. Disclose the missing PR-time E2E evidence and its route-specific compensating run: `dev` updates receive promotion-PR and post-merge `main` E2E; default-branch security updates receive only post-merge `main` E2E. In both routes, the production Deployment Check withholds the new release until main's `test`, including E2E, passes. A bump needing PR-time E2E must be reviewed and re-authored as a normal owner PR, not run from the Dependabot head.

## Group PRs: Minor and Patch Updates

For grouped minor/patch Dependabot PRs:

1. Read the PR body and upstream changelog links for every package in the group.
2. Confirm the group does not include a known special-case tool. `@biomejs/biome` is intentionally split from the catch-all group because lint-rule shifts can block otherwise-good package updates.
3. Run the full local gate on the PR head when the change is repo-owned. For Dependabot-owned branches, the hosted gate omits E2E (see below) and the head must not be run locally with shared credentials; review the diff and changelogs and merge with the E2E gap disclosed. Treat the later promotion-PR E2E as evidence only for `dev`-targeted version updates; default-branch security updates have no promotion PR and receive only the post-merge `main` run, plus any separate fix PRs required to make the base truthful.
4. Merge only when GitHub Actions, Vercel, Codecov, and CodeRabbit are clean on the latest head.

If one package in a group causes an unrelated failure, split or defer that package. Do not let a style-tool or test-runner change hold unrelated patch updates hostage.

## Runtime-Contract Majors

Reject isolated major updates that change the runtime contract:

- `@types/node`
- `node`
- package-manager/runtime pins such as `engines`, `.nvmrc`, CI `node-version`, or `packageManager`

These changes must ship in a coordinated runtime-alignment PR. The precedent is DEBT-392 Tier 5: Node runtime surfaces were moved together so CI, local development, Vercel, and type definitions agreed.

For example, `@types/node` 25 is not acceptable while the repo targets Node 24. Node type packages describe the runtime API surface; they are not a harmless dev-only freshness bump.

## Dev-Tooling Majors

Major updates in dev tooling get their own PR:

- Biome
- Playwright
- Vitest
- jsdom
- test environment packages

Expect lint and test brittleness, and treat it as migration work rather than noise. PR #328 (`jsdom` 26 -> 29) is the local precedent: upstream jsdom changed selector/CSS parsing behavior, and the repo had to replace query-string CSS selector assertions with direct `href` attribute assertions in `app/(app)/app/dashboard/page.test.tsx`.

The rule is not "avoid dev-tooling majors." The rule is "isolate them so their fallout is reviewable."

## Schema-Validation Majors

Major updates to Zod or another validation/schema library must include a boundary-fixture audit before merge. PR #330 is the local precedent: Zod 4 changed UUID/GUID validation semantics, so app-owned ID fixtures had to be checked against `zUuid = z.guid()` and Drizzle `uuid()` columns.

Audit controller schemas, repository row fixtures, mocked controller DTOs, shared factories/fakes, and integration fixtures for shape drift. Keep provider IDs and intentional-invalid negative tests provider-shaped/invalid; fix only fixtures that cross the real validation or database boundary.

## Red CI on Dependabot PRs

Red CI is a stop sign.

1. Read the failing job log.
2. Decide whether the failure is caused by the dependency, the current base branch, or CI environment policy.
3. If the base branch is wrong, ship a separate fix PR first.
4. Ask Dependabot to rebase or recreate after the fix lands.
5. Re-evaluate the dependency PR only after the hosted gate is clean.

DEBT-393 produced two examples:

- PR #342 fixed a component-test isolation problem surfaced while investigating PR #336.
- PR #343 fixed the CI policy gap where Dependabot PRs could not access production secrets but the workflow still required E2E credential validation.

Those fixes were intentionally separate from the Dependabot-owned PR. Keep that pattern.

## CodeRabbit Rate Limits

If CodeRabbit posts a rate-limit warning, stop.

- Do not merge on green status checks alone.
- Wait for the refill window.
- Request a fresh `@coderabbitai review` on the latest head.
- Require a substantive non-rate-limited review on that exact head before merging.

An empty state flip or a stale prior review does not satisfy the repo rule.

## Dependabot PRs and Secrets

**Owner decision, 2026-09-19; implementation 2026-09-20:** retain [GitHub's secure default](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-on-actions). Dependabot PR workflows cannot read repository Actions secrets; they use the separate Dependabot secret store, which remains empty (API count: zero on 2026-09-20). Copy no shared TEST-account credentials into it. The automatic read-only `GITHUB_TOKEN` still exists; “no secrets” here means no shared provider or E2E credentials, not an absence of GitHub's built-in token.

Current workflow boundaries (step names are the stable anchors):

- `Build` derives `NEXT_PUBLIC_SKIP_CLERK` from Clerk public-key availability, with shape-valid placeholders when credentials are absent; no secret expression or Clerk switch is job-scoped.
- `E2E smoke` receives real TEST-mode Clerk, Stripe, and E2E values only for main pushes and non-Dependabot same-repository PRs. The actor guard stays.
- `Evidence summary` reports the actual E2E step outcome and explicitly says shared TEST credentials are withheld from Dependabot; main E2E gates production promotion. Fork and earlier-failure reasons are unchanged.

Dependabot PR CI still runs typecheck, lint, unit, browser, integration and build. Vercel/Codecov checks and exact-head CodeRabbit approval remain separate merge requirements, not a claim that every bot PR automatically receives a substantive review. The E2E omission is deliberate, not pending. Do not call later evidence PR-time proof: `dev`-targeted updates get promotion-PR E2E and main E2E; security updates targeting `main` get only main E2E. [Vercel's production gate](./deployment-procedure.md#production-deployment-check) blocks production-domain assignment until main's check passes. Its build-time migrations still run before the gate and must remain compatible with the serving release.

**Upgrade trigger:** paying customers or a second engineer. Establish a separate Stripe Sandbox (including its own products/prices) and Clerk development instance before considering Dependabot E2E credentials. A second user or a restricted key inside a shared account is not that isolation. Step scoping limits which commands receive secrets; it does not prevent dependency code executing in E2E from reading them. Release-age rules, install-script allowlists and SHA-pinned actions reduce different risks; none makes shared pre-review credential exposure acceptable.

## Dependabot Config Policy

The current `.github/dependabot.yml` intentionally separates concerns:

- `cooldown.default-days: 7` delays version-update PRs so newly published packages have a maturity window before entering the queue.
- `versioning-strategy: increase-if-necessary` keeps `package.json` ranges stable when the existing range already admits the update, reducing manifest churn.
- Group-level `applies-to: version-updates` makes it explicit that routine grouped PRs target freshness, not advisories.
- Separate `applies-to: security-updates` entries omit cooldown so security advisories are not delayed by the maturity window.
- The security-only entries set `open-pull-requests-limit: 0` (PR #611). A Dependabot entry emits version updates as well as security updates by default, so without the limit these no-`target-branch` entries also opened ungrouped version PRs straight at `main` with default `increase` semantics (the #604/#605 leak; the #465 `actions/checkout` major merged that way). Zero disables version updates only: per GitHub's dependabot-options-reference, `open-pull-requests-limit` does not carry the security-updates badge, and security updates run under a separate internal limit of ten — GitHub's own security-updates guide recommends exactly this limit-0 + `applies-to: security-updates` + no-`target-branch` shape for "security updates only" entries.
- `@types/node` semver-major updates are ignored until a deliberate runtime-alignment PR moves the repo to a new active LTS major.
- `@biomejs/biome` is split from the catch-all npm group so lint contract changes arrive as their own reviewable PR.

These settings do not prove package contents are benign. They only shape Dependabot's queue.

## Supply-Chain Boundary

Dependabot tells us a version exists. It does not vouch for the package contents.

Malicious-publish defenses shipped under DEBT-394 and are live in `pnpm-workspace.yaml`: `minimumReleaseAge: 10080`, `blockExoticSubdeps`, `trustPolicy`, and `strictDepBuilds` / `allowBuilds`. Keep Dependabot `cooldown.default-days: 7` matched to `minimumReleaseAge: 10080` so Dependabot does not open PRs for versions pnpm policy intentionally refuses to install. Age-gate exceptions (`minimumReleaseAgeExclude`) are temporary by design — see docs/dev/supply-chain-overrides.md; the block is removed entirely when its last entry ages in (issue #539 precedent).
