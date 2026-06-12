# DEBT-416: Agent Skills/Rules Have No Provenance Manifest or Refresh Mechanism (Vendored Snapshots Frozen at 2026-02-01)

**Priority:** P2 (guidance-quality + context supply-chain hygiene; affects every agent on every task. See [Severity & Priority](#severity--priority) for the P3 floor argument.)
**Created:** 2026-06-12
**Source:** Owner asked how the vendored agent skills are kept current — where each came from, whether any have newer upstream versions, and whether `.claude` / `.codex` / `.agents` are aligned for all agents. Investigation found the cross-agent *alignment* is already structurally guaranteed (symlinks), but the vendored *content* is a frozen 2026-02-01 snapshot with no recorded provenance and no refresh path, and several vendored skills now overlap with — and in one case are demonstrably superseded by — first-class plugin skills + MCP servers in the live agent runtime.
**Related:** [Debt Index](./index.md), [`AGENTS.md`](../../AGENTS.md), [`CLAUDE.md`](../../CLAUDE.md), [`.claude/rules/`](../../.claude/rules), DEBT-393/394 (Dependabot triage + `minimumReleaseAge` supply-chain maturity gate — the npm dependency analogue of this context-dependency gap), DEBT-409 (Tailwind scanning `docs/` into prod CSS — the last "stale vendored content leaked into the live product" class).
**Status:** **Open — investigated, scoped, no content mutated.** This is a docs-only audit. No skill file, symlink, or rule was changed while filing it. The structural alignment and provenance below were verified mechanically on branch `docs/debt-416-agent-skills-provenance-and-refresh`.

---

## TL;DR

1. **Alignment is already solved — this is the good news.** `.agents/skills/` is the single source of truth (git-tracked). `.claude/skills/*` and `.codex/skills/*` are **committed symlinks** (git mode `120000`) with **identical blob SHAs** pointing into `../../.agents/skills/*`. All agents read byte-identical files; drift between `.claude` / `.codex` / `.agents` is not possible by construction. Nothing to "re-align."
2. **The real debt is provenance + staleness, not alignment.** All 15 skills were vendored in three commits on **2026-02-01**. Since then only the first-party `agent-browser` skill has been touched (2026-03-18). The other **14 are frozen ~4.3 months** with **no record of which upstream version/commit they were copied from** — so "is this the 100% most current version?" is currently **unanswerable from the repo**.
3. **The live runtime now ships overlapping plugin skills + MCP servers** (`stripe:*`, `vercel:*`, `frontend-design`, Stripe MCP, Vercel MCP). For Stripe this is **demonstrable supersession**: the vendored `stripe-best-practices` is a thin 31-line snapshot of content the live `stripe:stripe-best-practices` plugin + Stripe MCP now serve in a richer, maintained form. An agent can silently read the stale copy instead.

The fix is **process, not a one-time bump**: record provenance, document a refresh command per skill, and decide vendored-vs-plugin precedence so the set can't silently rot again.

---

## Problem

This repo feeds agents two kinds of always-on context:

- **Skills** — 15 capability packs under `.agents/skills/`, surfaced to Claude Code via `.claude/skills/` and to Codex via `.codex/skills/`.
- **Rules** — 9 path-scoped guidance files under `.claude/rules/` (first-party, authored against this codebase), gatewayed from `CLAUDE.md`.

The owner's concern: skills get updated upstream over time, but we vendored static copies. Are agents being fed the **current** version, and is everything **aligned and usable to all agents**?

The alignment half is fine (symlinks — see Evidence §1). The currency half is not: we have **no provenance manifest** (no record of source repo + vendored commit/version per skill), **no refresh mechanism** (no script, no cadence, no upstream-diff check), and a **new overlap surface** (live plugin/MCP skills that did not exist when these were vendored). The result is a context "supply chain" with none of the hygiene we already enforce for npm dependencies (DEBT-393/394).

## Evidence

All citations verified mechanically on `docs/debt-416-agent-skills-provenance-and-refresh` (Node 24, `pnpm@11.3.0`).

### 1. Cross-agent alignment is structurally guaranteed (symlinks, identical blobs)

`.agents/skills/` holds the real directories (159 tracked files across 15 skills). Both consumer dirs are committed symlinks into it:

```text
git ls-files -s .claude/skills | head -3
120000 e298b7be3c12986d2ad8818a12bd923317c4acab 0  .claude/skills/agent-browser
120000 606af2691199106cebc136feb4c7e4f79cf14f16 0  .claude/skills/api-security-best-practices
120000 bc7c1ae4be8544754bd005c2ba89acd6c5153fe0 0  .claude/skills/clean-architecture

git ls-files -s .codex/skills | head -3
120000 e298b7be3c12986d2ad8818a12bd923317c4acab 0  .codex/skills/agent-browser          # same blob SHA
120000 606af2691199106cebc136feb4c7e4f79cf14f16 0  .codex/skills/api-security-best-practices  # same blob SHA
120000 bc7c1ae4be8544754bd005c2ba89acd6c5153fe0 0  .codex/skills/clean-architecture     # same blob SHA
```

Every `.claude/skills/<x>` and `.codex/skills/<x>` pair shares the same blob SHA (the symlink target string `../../.agents/skills/<x>`), so both agents resolve to the same files. **There is no `.claude`-vs-`.codex` drift to fix.** The live Claude Code session confirms all 15 resolve (they appear in the available-skills list).

### 2. Staleness timeline — frozen at 2026-02-01, never refreshed

```text
git log --reverse --format='%ad %h %s' --date=short -- .agents/skills | head -3
2026-02-01 1c003700 Add Vercel agent skills for React/Next.js optimization
2026-02-01 8829326e Add comprehensive agent skills for full-stack development
2026-02-01 566af6db Add testing infrastructure documentation and agent-browser skill
```

Every skill landed on **2026-02-01** in three bulk commits. The only post-vendoring edits are to `agent-browser` (first-party tooling, last touched 2026-03-18 — Clerk-auth/ref-click documentation). **14 of 15 skills carry zero local modifications since vendoring** — which is good news for refresh risk (no custom edits to preserve, see Remediation), but it also means they are pristine ~4.3-month-old upstream snapshots with no version stamp.

### 3. Provenance + currency audit (per skill)

Determined from SKILL.md frontmatter (`author`/`version`/`license`/`metadata`), file shape, and upstream confirmation via web search. "Pin?" = does the frontmatter record a version. "Self-updating?" = does the skill fetch fresh content at runtime. "Live overlap" = a plugin skill or MCP server in the current runtime that covers the same ground.

| Skill | Upstream (confirmed unless noted) | Pin? | Self-updating? | Live overlap / supersession |
|---|---|---|---|---|
| `agent-browser` | **First-party** (mirrors `docs/tooling/agent-browser.md`) | no | no | Chrome MCP tools (`mcp__claude-in-chrome__*`) cover similar ground — keep first-party, note precedence |
| `api-security-best-practices` | community (1 file, 23 KB) — source unconfirmed | no | no | overlaps `security-review` skill + built-in `/security-review` command |
| `clean-architecture` | community (43 files, R.C. Martin) — source unconfirmed | no | no | overlaps repo-owned `.claude/rules/architecture.md` + `domain-layer.md` |
| `clerk` | **`clerk/skills`** (official router stub) | no | no | overlaps `vercel:auth` (Clerk via Marketplace) |
| `clerk-webhooks` | **`clerk/skills`** (official; `author: clerk`, `v1.0.0`, MIT) | **yes** (v1.0.0) | no | — |
| `neon-drizzle-setup` | **`neondatabase/agent-skills`** (official) | no | no | overlaps `using-drizzle-queries`, `vercel:vercel-storage` |
| `neon-postgres` | **`neondatabase/agent-skills`** (official, 29 files) | no | no | — |
| `security-review` | **community `author: affaan-m`, `v1.0`** (not Anthropic) | **yes** (v1.0) | no | **overlaps Anthropic's built-in `/security-review` command AND the `security-review` skill in the live list** — three things named "security-review" |
| `stripe-best-practices` | **Stripe** (thin 31-line snapshot) | no | no | **SUPERSEDED** by live `stripe:stripe-best-practices` plugin + Stripe MCP (richer: Accounts v2 / Treasury / restricted-keys / deprecated-API migration) |
| `stripe-subscriptions` | Stripe/community (thin, 1 file) | no | no | overlaps `stripe:stripe-best-practices` + repo's own Stripe code |
| `using-drizzle-queries` | Drizzle/Neon skill — source unconfirmed | no | no | overlaps `neon-*` skills |
| `vercel-composition-patterns` | **Vercel** (`author: vercel`, `v1.0.0`, MIT) | **yes** | no | overlaps live `vercel:react-best-practices` plugin |
| `vercel-react-best-practices` | **Vercel** (`author: vercel`, `v1.0.0`, MIT, 59 files) | **yes** | no | **overlaps** live `vercel:react-best-practices` plugin |
| `web-design-guidelines` | **Vercel** (`author: vercel`, `v1.0.0`; `vercel-labs/web-interface-guidelines`) | **yes** | **YES — WebFetches `…/main/command.md` fresh per run** | overlaps `frontend-design:frontend-design`; content auto-current, only the wrapper can rot |
| `webapp-testing` | **Anthropic official** (ships LICENSE.txt; bundled with Claude Code) | no | no | overlaps live `verify` / `run` skills + Chrome MCP + `agent-browser` |

Confirmed upstreams (web search, 2026-06-12): [`clerk/skills`](https://github.com/clerk/skills), [`neondatabase/agent-skills`](https://github.com/neondatabase/agent-skills) (refresh via `npx skills add neondatabase/agent-skills -s neon-postgres`), and the Vercel-authored frontmatter on the three `vercel`/`web-design` skills.

### 4. `web-design-guidelines` is the gold-standard pattern to copy

Its SKILL.md does not embed the rules — it fetches them live:

```text
.agents/skills/web-design-guidelines/SKILL.md:26
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

So its *content* is always current at runtime; only the thin wrapper (or a moved upstream path) can go stale. This is the model for any skill whose upstream publishes a fetchable canonical source (see Remediation Option D).

### 5. Stripe is concrete supersession, not theoretical

The vendored `stripe-best-practices` is 31 lines of API-selection guidance with no version. The live runtime ships **both** a `stripe:stripe-best-practices` plugin (advertising Connect Accounts v2, Treasury, controller properties, restricted-key/webhook security, deprecated-API migration — none of which the vendored copy contains) **and** a Stripe MCP server (`mcp__plugin_stripe_stripe__*`) for live docs/resource lookups. An agent doing Stripe work can land on the stale 5 KB snapshot. Given this app's billing is its revenue path, stale Stripe guidance is the highest-signal item in the table.

### 6. Rules are a different axis (first-party, not vendored)

`.claude/rules/*` (9 files) are authored against *this* codebase, not copied from upstream, so "upstream currency" does not apply. Their freshness axis is **internal consistency with `AGENTS.md` + the code** — already governed by `CLAUDE.md`'s maintenance rule ("when `AGENTS.md` or `.claude/rules/` changes, update… in the same patch"). They are out of scope for the vendored-refresh work below, included here only to answer the owner's "rules and anything else" completeness ask. Recent mtimes (several 2026-06-01) show they are actively maintained.

## Blast Radius

- **Runtime (app/users):** none. Skills/rules are agent-authoring context, never shipped to users or executed in production. This is not a correctness or security defect in the product.
- **Agent output quality:** real but diffuse. Agents may follow ~4-month-old guidance or a thinner snapshot when a richer maintained source exists (Stripe being the sharp case).
- **Confusion surface:** three "security-review" entries (community skill + Anthropic command + live skill) and duplicate Stripe/Vercel guidance (vendored vs plugin) create ambiguous precedence.
- **Silent rot:** with no manifest and no cadence, the gap widens every month invisibly — exactly the failure mode the npm `minimumReleaseAge` policy (DEBT-394) exists to prevent for code dependencies, absent here for context dependencies.

## Remediation Options

### Option A — Provenance manifest + documented refresh process (**recommended**)

Add `.agents/skills/SKILLS.md` (or `skills.manifest.json`) recording, per skill: **source repo + upstream path**, **vendored commit/version**, **license**, **first-party vs vendored**, **self-updating?**, **live-plugin/MCP overlap + chosen precedence**, and the **exact refresh command**. Stamp a `version`/`source` into each SKILL.md frontmatter where missing. Document a "how to refresh skills" section in `AGENTS.md`. Optionally add a low-cost periodic check (scheduled agent or CI job) that diffs each vendored skill against its upstream HEAD and opens an issue on drift — the context analogue of Dependabot.

*Effort:* moderate, mostly research to confirm the 4 unconfirmed upstreams (`api-security-best-practices`, `clean-architecture`, `stripe-subscriptions`, `using-drizzle-queries`). *Risk:* near-zero (docs/metadata only).

### Option B — Resolve plugin/MCP duplication (precedence decision)

For each vendored skill with a live overlap (Stripe ×2, Vercel ×2, `web-design-guidelines` vs `frontend-design`, `webapp-testing` vs `verify`/`run`/MCP, `security-review` ×3), explicitly decide: **(i)** drop the vendored copy and rely on the live plugin/MCP; **(ii)** keep vendored, pin it, and note "prefer plugin X when available"; or **(iii)** keep both with documented precedence. The point is to kill *silent* divergence. Stripe is the obvious first candidate to drop-or-pin.

### Option C — Refresh-in-place now (re-vendor from upstream HEAD)

Re-pull each vendored skill from its current upstream and stamp the version/commit. Low merge risk because §2 shows 14/15 have no local edits. Larger and needs per-skill sanity review; best sequenced **after** A establishes the manifest so each refresh is recorded. Treat as the follow-up execution PR(s), not part of this filing.

### Option D — Convert thin pointer-skills to self-updating

Where an upstream publishes a fetchable canonical source, adopt the `web-design-guidelines` fetch-fresh pattern instead of a frozen snapshot. Candidates: anything that is a thin wrapper over a maintained doc. Eliminates staleness for those by construction.

### Option E — Accept + document (no change) for the safe subset

`agent-browser` (first-party, actively maintained) and any skill confirmed already-current need only a manifest entry, no refresh. This doc discharges the "known and explained" part for them.

## Recommendation

Do **A first** (manifest + refresh process + `AGENTS.md` section) as the next PR — it is the durable fix and makes "is this current?" answerable. Pair it with **B for Stripe immediately** (drop-or-pin the superseded `stripe-best-practices` in favor of the plugin + MCP) since that is the highest-value, lowest-effort win. Sequence **C** (bulk re-vendor) and **D** (self-updating conversions) as follow-up PRs once the manifest exists to record them. Keep rules (§6) out of scope — they are already governed by `CLAUDE.md`.

Do **not** bulk-overwrite all 15 skills in one unscoped commit: it would erase the (currently nonexistent) provenance trail and bundle the `agent-browser` first-party edits with vendored refreshes.

## Severity & Priority

Rated **P2.** It is not P1 (zero runtime/user/security harm — agent context only). It is above cosmetic because it (a) degrades agent output quality on every task, silently and increasingly; (b) now actively risks agents preferring stale vendored snapshots over maintained live plugins/MCP (Stripe is concrete); and (c) is a self-inflicted *context* supply-chain gap that contradicts the repo's own heavily-invested *code* supply-chain hygiene (DEBT-393/394).

**P3 floor:** if "agent guidance quality" is treated as non-blocking polish rather than first-class, P3 is defensible — nothing breaks today and the worst case is suboptimal suggestions a human reviewer catches. Left at **P2** because the gap compounds monthly and the Stripe supersession is already live.

## Acceptance Criteria (for the Option-A follow-up PR, not this filing)

- [ ] `.agents/skills/SKILLS.md` (or `skills.manifest.json`) exists with a row per skill: source repo, upstream path, vendored commit/version, license, first-party-vs-vendored, self-updating flag, live-overlap + precedence, refresh command.
- [ ] The 4 unconfirmed upstreams (`api-security-best-practices`, `clean-architecture`, `stripe-subscriptions`, `using-drizzle-queries`) are identified or explicitly marked "origin unknown — treat as frozen first-party fork."
- [ ] Each SKILL.md missing a `version`/`source` has one added (or the manifest is declared the single source of truth and SKILL.md frontmatter is left as-is by intent).
- [ ] `AGENTS.md` gains a short "Refreshing agent skills" section pointing at the manifest + per-skill refresh commands.
- [ ] A precedence decision is recorded for every vendored↔plugin/MCP overlap (Option B), with Stripe resolved (drop or pin).
- [ ] The symlink invariant is asserted somewhere lightweight (doc note or a tiny test) so a future `.claude`/`.codex` copy-instead-of-symlink regression is caught.
- [ ] No change to `agent-browser` content or to the `.claude`/`.codex` symlink structure unless deliberately re-pointed.

## Non-Goals / Out of Scope

- Re-authoring `.claude/rules/*` (first-party; governed by `CLAUDE.md`).
- Changing the symlink architecture — it is correct and should be preserved.
- Executing the bulk refresh (Option C) inside this filing — it is scoped as follow-up so each refresh is recorded against the new manifest.

## Rollback

This filing is docs-only (one new doc + index row + Next-Debt-ID bump). Revert is a single-commit `git revert`. No skill, symlink, rule, schema, or runtime surface is touched.
