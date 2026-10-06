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

- Run `pnpm test:e2e` as well. It is mandatory for repo-owned dependency PRs, not conditional; if your `.env.local` lacks the authenticated E2E environment, the PR is not mergeable until someone with it runs `pnpm test:e2e` on the PR head and records the receipt in the PR body — say so there rather than skipping silently. **Do not run a Dependabot-authored head locally with shared `.env.local` credentials:** a dependency bump is executable code, and `pnpm test:e2e` loads `.env.local` into its environment ([DEBT-474](../_archive/debt/debt-474-ci-secret-scope-and-action-immutability.md) F1). The owner decided on 2026-09-19 to retain the no-shared-credentials boundary. Disclose the missing PR-time E2E evidence and its route-specific compensating run: `dev` updates receive promotion-PR and post-merge `main` E2E; default-branch security updates receive only post-merge `main` E2E. In both routes, the production Deployment Check withholds the new release until main's `test`, including E2E, passes. A bump needing PR-time E2E must be reviewed and re-authored as a normal owner PR, not run from the Dependabot head.

## Group PRs: Minor and Patch Updates

For grouped minor/patch Dependabot PRs:

1. Read the PR body and upstream changelog links for every package in the group.
2. Confirm the group does not include a known special-case tool. `@biomejs/biome` is intentionally split from the catch-all group because lint-rule shifts can block otherwise-good package updates.
3. Run the full local gate on the PR head when the change is repo-owned. For Dependabot-owned branches, the hosted gate omits E2E (see below) and the head must not be run locally with shared credentials; review the diff and changelogs and merge with the E2E gap disclosed. Treat the later promotion-PR E2E as evidence only for `dev`-targeted version updates; default-branch security updates have no promotion PR and receive only the post-merge `main` run, plus any separate fix PRs required to make the base truthful.
4. Merge only when GitHub Actions, Vercel, Codecov, and CodeRabbit are clean on the latest head.

If one package in a group causes an unrelated failure, split or defer that package. Do not let a style-tool or test-runner change hold unrelated patch updates hostage.

## Bundling Overlapping Dependabot PRs

PRs #805 and #829 set the pattern: when Dependabot PRs overlap, one repo-owned bundle regenerates `pnpm-lock.yaml` from current `dev`, and the bundle is proven to be exactly the union of the source PRs. Serially merging generated lockfiles is not an alternative.

### Decision rule

- Bundle when two or more open Dependabot PRs were generated from the same parent and merging one would invalidate the others' lockfiles, or when a source PR needs a repo-owned companion fix (#805's Next config pin, #829's Stripe CLI assertion and Biome schema).
- The isolation rules above still apply. Runtime-contract majors and dev-tooling majors keep their own PRs. A billing-sensitive package such as `stripe` joins a bundle only with its own recorded audit, as in #829.
- Leave the source PRs open and unmerged. Close them as superseded only after the bundle has exact-head CodeRabbit approval.
- Never hand-merge or textually merge `pnpm-lock.yaml`. pnpm generates the bundle lockfile; the verifier below only reads it.

### Procedure

The example bundles #826, #827 and #828, which is how #829 was built.

1. Fetch the source heads into local read-only refs. They live outside `refs/heads`, so nothing checks out, tracks or pushes Dependabot's branches:

   ```sh
   git fetch origin +refs/pull/826/head:refs/pr/826 +refs/pull/827/head:refs/pr/827 +refs/pull/828/head:refs/pr/828
   ```

2. Confirm the sources share one parent and that its manifest and lockfile match current `dev`. If not, ask Dependabot to rebase first:

   ```sh
   git rev-parse refs/pr/826^ refs/pr/827^ refs/pr/828^   # must print one commit three times
   git diff --quiet refs/pr/826^ origin/dev -- package.json pnpm-lock.yaml
   ```

3. Branch from current `dev`, apply each source's `package.json` change and stage the result. Dependabot has already applied `increase-if-necessary`, so these are the bundle's only manifest changes:

   ```sh
   git switch -c chore/bundle-dependabot-826-828 origin/dev
   git diff refs/pr/826^ refs/pr/826 -- package.json | git apply --3way   # repeat for each source that changes package.json
   git add package.json
   ```

   `--3way` merges each patch against the base it was made from. Git still reports a conflict when two sources edit neighbouring lines, even when they change different dependencies. Resolve each conflict before applying the next patch, since a conflicted `package.json` blocks further applies. Keep every source's specifier change, not either side whole, then run `git add package.json`.

4. Regenerate with scoped `pnpm update` commands at the source versions, under a maturity cutoff that matches when Dependabot generated the sources. `minimumReleaseAge` counts back from the current time, so a later regeneration admits transitives Dependabot could not see. That is how #829 first picked up `baseline-browser-mapping@2.11.15` when every source had 2.11.14. Use the oldest source head's commit time:

   ```sh
   CUTOFF=$(( ($(date +%s) - $(git log -1 --format=%ct refs/pr/826)) / 60 + 10080 ))
   # Every package any source bumps: #826's five, #827's Biome and #828's Stripe.
   pnpm update @clerk/nextjs@7.7.6 @clerk/ui@1.30.3 next@16.3.1 @clerk/testing@2.2.24 @stripe/cli@1.50.1 \
     @biomejs/biome@2.5.8 stripe@22.5.0 --lockfile-only --config.minimum-release-age=$CUTOFF
   ```

5. `pnpm update` rewrites caret ranges (`^22.4.0` became `^22.5.0`), which breaks `increase-if-necessary`. Restore the staged manifest and resynchronize the lockfile's specifiers under the same cutoff:

   ```sh
   git checkout -- package.json
   pnpm install --lockfile-only --config.minimum-release-age=$CUTOFF
   ```

   If this install fails, stop. The manifest from step 3 is wrong, for example a mistyped specifier, and the lockfile still holds step 4's specifiers. Fix `package.json`, stage it, and repeat step 5.

6. Verify, and paste the printed table into the PR body:

   ```sh
   pnpm install --frozen-lockfile
   node --import tsx scripts/verify-lockfile-union.ts --base 'refs/pr/826^' --source refs/pr/826 --source refs/pr/827 --source refs/pr/828 --candidate pnpm-lock.yaml
   ```

   If the frozen install fails, stop: the lockfile does not match `package.json`, so go back to step 5. Run the verifier through `node --import tsx`, not `pnpm exec`. Steps 4 and 5 leave `node_modules` stale, and `pnpm exec` then runs a plain `pnpm install` first (pnpm's `verify-deps-before-run`), which can rewrite `pnpm-lock.yaml` before the verifier reads it.

   The two checks cover different things. The frozen install proves that the lockfile matches `package.json`. The verifier proves that the lockfile is the union of the sources, and each importer entry it compares includes the manifest `specifier`. So a pin dropped or altered while resolving step 3 fails one check or the other.

Each argument is a git revision or a lockfile path. The verifier refuses a name that is both, and a candidate that is also a source, by name or by identical content. Revisions always come from the repository in the current directory, even inside a git hook that exports `GIT_DIR`. It parses the YAML and compares every root and workspace importer, including whether it exists at all, and each importer's dependencies. It also compares every `packages` and `snapshots` entry, and the top-level metadata such as `lockfileVersion`, `settings` and `overrides`. Key order and layout never count as changes. The script runs the same way through a symlink or without its `.ts` extension.

| Exit | Meaning |
|---:|---|
| 0 | The candidate changes exactly the union of the source changes. |
| 1 | Unexpected failure, such as `git` being unavailable. Nothing was verified. |
| 2 | Usage or input error: a missing revision or file, an unreadable path, invalid YAML, a document that is not a pnpm lockfile, or YAML that pnpm never writes (a `---` document marker or any directive such as `%YAML` or `%TAG`, anchors, aliases, explicit tags, non-string keys, or `.nan` and `.inf`). |
| 4 | Extra: the candidate changes an entry no source changes. |
| 8 | Missing: the candidate omits a source change. |
| 16 | Unmatched: the candidate changes an entry to a value no source proposes. |
| 32 | Conflict: two sources change one entry differently. |

Failure codes add up when several categories fail; 28 means extra, missing and unmatched. A newer transitive usually means a wrong cutoff: regenerate rather than edit the lockfile. A conflict needs a deliberate choice, such as asking Dependabot to recreate the sources from one base or bundling fewer of them. Record that choice in the PR.

A correct bundle can still report missing when the sources overlap. For example, one source drops `is-number@6.0.0` because it moves to 7, while another source's new dependency still needs 6. The bundle rightly keeps 6.0.0, so the verifier reports the first source's removal as missing, and no regeneration clears it. Treat that the same way as a conflict: confirm in `pnpm why` that the kept entry is needed, then record the overlap and the decision in the PR.

Peer suffixes overlap in the same way. pnpm writes a package's resolved peers into its key, as in `stripe@22.5.0(@types/node@24.13.4)`. If one source bumps `@types/node` and another bumps `stripe`, a correct bundle has a key that neither source has. It then reports that key as extra, the sources' own keys as missing, and the importer entry as a conflict. Regenerating or recreating the sources does not clear it, because the sources already share a base. Confirm that every unexpected key combines versions the sources chose, then record the overlap in the PR. The report shortens long values, so compare the full entries in the lockfiles themselves. The verifier has no override flag.

Receipt, 2026-10-05: starting from the sources' parent, steps 3 to 5 reproduced #829's lockfile byte for byte, with `package.json` identical to #826's. The verifier printed #829's hand-built counts: packages 54 / 23 / 7 into a union of 74, snapshots 72 / 38 / 22 into 92, importer entries 10 / 5 / 5 into 12, and 72 / 86 key deltas, all matched. The same steps without the cutoff exited 28, with 385 extra, 18 missing and 14 unmatched entries.

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
