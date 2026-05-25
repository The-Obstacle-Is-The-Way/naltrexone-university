# DEBT-393: Dependabot Triage and Config Hardening

**Priority:** P2 (three Dependabot PRs already open and red on CI; without a triage protocol and a tighter config, the weekly queue will accumulate noise and one of the three carries a real footgun — `@types/node` major-jumping past our Node LTS pin.)
**Created:** 2026-05-25
**Source:** Follow-up to [DEBT-392](../_archive/debt/debt-392-dependency-hygiene-audit.md) Tier 6b, which installed Dependabot. The first weekly run on 2026-05-25 opened three PRs (#336, #337, #338); all three are red on `test`, two are footgun-free real updates and one is a hard reject. There is no documented protocol for how we triage these and no `ignore` rule preventing the hard-reject class from recurring weekly.
**Related:** [DEBT-394](./debt-394-supply-chain-hardening.md) (supply-chain hardening; this doc deliberately leaves `cooldown`/`minimumReleaseAge` policy to DEBT-394 because those settings move together), [DEBT-392](../_archive/debt/debt-392-dependency-hygiene-audit.md) (parent), [DEBT-340 (archived, Clerk v7 + Next.js 16.2.1 upgrade)](../_archive/debt/debt-340-clerk-v7-nextjs-upgrade.md)

**Status:** Active

---

## Problem

DEBT-392 Tier 6b installed Dependabot with weekly grouped updates and no other policy. On 2026-05-25 (the first weekly Monday run), Dependabot opened three PRs against `dev`:

- **PR #336**: `chore(deps): bump actions/upload-artifact from 6 to 7` — GitHub Actions group, one major bump.
- **PR #337**: `chore(deps): bump the npm-minor-and-patch group with 11 updates` — npm minor/patch group (`@tailwindcss/postcss` 4.1.18→4.3.0, `drizzle-kit` 0.31.8→0.31.10, `pino` 10.3.0→10.3.1, `postgres` 3.4.8→3.4.9, `react` 19.2.4→19.2.6, `@types/react` 19.2.10→19.2.15, `react-dom` 19.2.4→19.2.6, `tailwind-merge` 3.4.0→3.6.0, `tailwindcss` 4.1.18→4.3.0, `@biomejs/biome` 2.3.13→2.4.15, `tsx` 4.21.0→4.22.3).
- **PR #338**: `chore(deps): bump @types/node from 24.12.4 to 25.9.1` — npm group major bump that does not belong here.

All three are failing the `test` job on GitHub Actions. The Vercel preview is green for all three. CodeRabbit was rate-limited during the open window and posted "Review limit reached" instead of a review.

The repo currently has:

- `.github/dependabot.yml` with `npm-minor-and-patch` and `actions-minor-and-patch` groups, weekly Monday 09:00 ET, `open-pull-requests-limit: 5`, prefix `chore(deps)`, and **no `ignore` rules, no `cooldown`, no separate handling for majors**.
- `package.json` with `engines.node: "24.x"` and `packageManager: "pnpm@10.33.4"` (set in DEBT-392 Tier 5).
- `.github/workflows/ci.yml` with `node-version: 24` (set in DEBT-392 Tier 5).
- No documented triage protocol for Dependabot output.

The footgun is `@types/node` 25 specifically: Node.js follows an odd/even LTS cadence where even majors become LTS the October after their April release (Node 24 LTS through April 2028) and odd majors are never LTS (Node 25 EOL ~June 2026). `@types/node@25.x` describes the Node 25 API surface, so installing it against a Node 24 runtime breaks typecheck — which is exactly what PR #338's CI shows. Without an `ignore` rule, Dependabot will reopen this PR every week until either Node 26 LTS lands (April 2026 release, October 2026 LTS) or we tell it not to.

The remaining two PRs are legitimate updates that need real engineering attention, not blind merges:

- PR #336 (`actions/upload-artifact` 6→7) is a major release with ESM migration and a new `archive` parameter. The `test` failure needs root-cause analysis before merge.
- PR #337 (npm minor/patch group of 11) failed `test` with a Biome 2.3.13→2.4.15 lint-rule shift surfacing `Sort these exports` and similar diagnostics. The right answer is probably to either accept the lint changes (fix the affected files) or split Biome out of the group so the rest of the patch updates can land independently.

---

## Findings

### A. PR #338 `@types/node` 24 → 25 — reject and prevent recurrence

**Evidence:**

```sh
gh pr view 338 --json title,statusCheckRollup --jq '{title, checks: [.statusCheckRollup[] | {name: (.name // .context), state: (.state // .conclusion)}]}'
```

CI failure mode (from `gh run view 26384122054 --job 77658994556 --log-failed`):

```
app/(app)/app/practice/hooks/bookmark-message-timeout.ts(30,3): error TS...
##[error]Process completed with exit code 2.
```

This is a `@types/node` 25 vs Node 24 runtime mismatch. The fix is not to bump the runtime — Node 25 is non-LTS (odd-numbered) with EOL around June 2026 per [Node.js Release Working Group cadence](https://nodejs.org/en/about/previous-releases). The right move is:

1. Close PR #338 with a one-line comment pointing at this doc.
2. Add an `ignore` rule in `.github/dependabot.yml` so Dependabot stops opening `@types/node` major bumps that exceed our active Node LTS major. The rule should also apply to `node` itself if it were ever a direct dep.
3. When we eventually plan the Node 24 → Node 26 LTS migration (post Oct 2026 LTS landing), we re-bump `@types/node` in the same PR as `engines.node`, `.nvmrc`, and CI `node-version`, exactly as DEBT-392 Tier 5 did for the 22 → 24 transition.

### B. PR #336 `actions/upload-artifact` 6 → 7 — investigate before merging

**Evidence:**

```sh
gh pr view 336 --json title,statusCheckRollup
gh pr diff 336
```

The diff is the trivial `uses:` bump in `.github/workflows/ci.yml`. The release notes (linked from the PR body) call out two real changes: ESM migration of the action package, and a new `archive: false` parameter that allows uploading single files unzipped. Neither requires a change on our side per se, but the `test` failure is real and needs to be diagnosed.

Action: investigate the failure (most likely a transient CI issue since the diff is one line and the action runtime change is internal). If the rerun is green and the workflow still uploads `playwright-report/` and `test-results/` artifacts correctly, merge. If the rerun fails reproducibly, close and document why.

### C. PR #337 npm minor/patch group of 11 — split or accept Biome lint shift

**Evidence:**

The failure log from `gh run view 26383965799 --job 77658543993 --log-failed`:

```
##[error]Sort these exports.
##[error]Process completed with exit code 1.
```

This is `@biomejs/biome` 2.4.15 introducing a new lint rule (or tightening an existing one). The other 10 packages in the group are unrelated and almost certainly fine; they're the kind of low-risk minor/patch bumps that benefit from grouping. But Biome's lint-rule shifts are a category of change that should not flow through silently — they touch the entire codebase's style contract.

Two options:

1. **Take the lint shift deliberately**: in a focused PR, bump Biome alone, run `pnpm lint:fix`, review the resulting diff, and merge. Then the rest of PR #337 either rebases (if the group structure stays) or splits naturally.
2. **Move Biome out of the group**: amend `.github/dependabot.yml` to put `@biomejs/biome` in its own group (or `ignore` it from the catch-all and let it open its own PRs). Then the other 10 packages in PR #337 form a clean rebased PR.

Option 2 is the structural fix and makes future weeks calmer. Option 1 is the immediate fix for THIS week's PR #337. Both should happen.

### D. No `cooldown` setting

Dependabot supports `cooldown.default-days` (and per-package-manager variants) that delays opening a PR until the new version has been published for N days. Without it, Dependabot opens PRs for versions that hit npm minutes ago. We are not setting it. This is its own small risk independent of supply-chain hardening: a freshly published version with a critical regression can sit in our PR queue before the upstream maintainers notice and yank.

DEBT-394 (supply-chain hardening) will set `minimumReleaseAge: 10080` minutes (7 days) on the pnpm side and needs `cooldown` on the Dependabot side to match, so the two settings don't fight. Whether we set Dependabot `cooldown` in THIS doc or wait for DEBT-394 is a sequencing choice. **Recommendation: set `cooldown.default-days: 7` here**, because (a) the protection has standalone value even without pnpm 11, (b) it doesn't depend on the pnpm 11 migration, and (c) it tightens the queue immediately rather than waiting on the larger hardening cycle.

### E. No documented triage protocol

There is no written rule today for how a Dependabot PR gets triaged. Future me, future agents, or a teammate facing the same queue should not have to re-derive the answer. A protocol section is a one-time write that makes every future weekly run cheaper.

---

## Remediation

Tier the work into single-concern PRs. Each PR independently revertable, each gated by `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build` (the full local gate) and CodeRabbit.

### Tier 1 — Triage the three open PRs

Three sub-tasks, each its own action (not necessarily its own PR, since these are PR decisions not source edits):

1. **Close PR #338** with a comment pointing at this doc and citing Node's odd/even LTS cadence. No source change required.
2. **PR #336**: rerun CI. If green on rerun, merge with `--squash --delete-branch`. If reproducibly red, root-cause first, then either fix-forward in a new PR or close with documentation.
3. **PR #337**: either (a) rebase after Tier 2 lands so Biome is no longer in the group, or (b) close and let Dependabot re-emit the cleaner group next Monday. If we choose (a), the rebase happens automatically once `.github/dependabot.yml` is updated and Dependabot regenerates.

### Tier 2 — `.github/dependabot.yml` policy update (single PR)

Add to the existing config:

1. **`ignore` rule for `@types/node` major beyond our active Node LTS major.** Today that's major 24; when we migrate to Node 26 LTS in late 2026, this rule moves with us. Pattern:

   ```yaml
   ignore:
     - dependency-name: "@types/node"
       update-types: ["version-update:semver-major"]
   ```

2. **Split `@biomejs/biome` out of the catch-all group** so its updates open as their own PRs and don't poison the rest of the minor/patch group. Either give Biome its own group, or use the `exclude-patterns` form on the existing group:

   ```yaml
   groups:
     npm-minor-and-patch:
       patterns: ['*']
       exclude-patterns: ['@biomejs/biome']
       update-types: [minor, patch]
   ```

3. **Add `cooldown.default-days: 7`** to both the `npm` and `github-actions` ecosystems so freshly published versions don't reach our PR queue before the wider community has had a week to surface regressions.

   ```yaml
   cooldown:
     default-days: 7
   ```

4. **Bump `open-pull-requests-limit`** consideration: leave at 5 for now; revisit if we routinely hit the cap.

Verification: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build`. Then push, wait for Dependabot to re-evaluate (it picks up config changes within a day), confirm next Monday's run produces only legitimate updates.

### Tier 3 — Triage protocol section (single PR, doc-only)

Add a short triage protocol to `docs/dev/dependency-update-protocol.md` (new file) or as a section of `docs/dev/dependency-strategy.md` if that already exists. Content:

- **Group PRs (minor + patch)**: read the changelogs linked from the PR body, run the full local gate, merge if green and CodeRabbit clean.
- **Major version PRs in dependencies that touch the runtime contract** (`@types/node`, `node`, anything that bumps `engines`): reject in isolation unless paired with a deliberate runtime-alignment PR (see DEBT-392 Tier 5 for the template).
- **Major version PRs in dev tooling** (Biome, Playwright, Vitest, jsdom): own PR, full gate, expect lint/test brittleness fallout per the DEBT-392 Tier 4 pattern (we already documented the jsdom 29 selector-tightening case there).
- **CI is red on a Dependabot PR**: never merge regardless of CodeRabbit state. Root-cause the failure. If it's a real regression in the new version, close the PR and document.
- **CodeRabbit rate-limited**: hard stop, do not merge. Wait for refill, request fresh review. (Established in DEBT-392 Tier 2.)
- **Supply-chain hygiene**: Dependabot does not vouch for package contents. After this doc lands, DEBT-394 layers on pnpm 11 `minimumReleaseAge` and `strictDepBuilds`, which DO defend against malicious publishes.

---

## Verification commands

```sh
# Confirm the three triage decisions landed
gh pr list --state all --search "is:pr author:app/dependabot created:>2026-05-25"

# Confirm dependabot.yml is well-formed
gh api repos/The-Obstacle-Is-The-Way/naltrexone-university/dependabot/secrets  # auth check only
yq '.updates[].ignore' .github/dependabot.yml
yq '.updates[].cooldown' .github/dependabot.yml

# Confirm @types/node stays pinned to major 24
jq -r '.devDependencies["@types/node"]' package.json

# Confirm protocol doc exists and is linked from index
ls docs/dev/dependency-update-protocol.md
grep -l 'dependency-update-protocol' docs/
```

---

## Acceptance criteria

- PR #338 closed with a comment citing this doc.
- PR #336 either merged green or closed with documented reason.
- PR #337 either rebased clean (post Tier 2) and merged, or closed in favor of next Monday's clean re-emission.
- `.github/dependabot.yml` contains an `ignore` rule for `@types/node` semver-major updates.
- `.github/dependabot.yml` contains a `cooldown.default-days: 7` setting on the npm ecosystem block (GitHub Actions ecosystem block too if practical).
- `@biomejs/biome` is no longer in the catch-all minor/patch group — either own group or excluded.
- `docs/dev/dependency-update-protocol.md` (or equivalent) exists and is linked from `docs/debt/index.md` and/or the development docs index.
- Next Monday's Dependabot run produces only legitimate updates (no `@types/node` major attempt; Biome bumps as standalone PRs).
- Full local gate green on every Tier 2 PR. CodeRabbit APPROVED before merge.

---

## Risk and reversibility

- **Tier 1 triage** is non-destructive (PR closes are reversible; merges follow the standard merge protocol).
- **Tier 2 config update** is fully reversible (revert the commit; Dependabot picks up the previous config on the next cycle).
- **Tier 3 doc** is text-only.
- The single judgment call is whether to set `cooldown` here vs. in DEBT-394. The recommendation is "here" because the value is standalone and the timing is unrelated to the pnpm 11 migration. DEBT-394 may retune the day count to match `minimumReleaseAge` once that lands.

---

## Done when

All acceptance criteria are met, both Tier 2 and Tier 3 PRs are merged to `dev` and synced to `main`, the three originating Dependabot PRs are resolved, the next weekly Dependabot run produces a clean queue, and this doc is moved to `docs/_archive/debt/` with a resolution paragraph mirroring the DEBT-390 / DEBT-392 archival pattern.
