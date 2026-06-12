# DEBT-416: Agent Skills Need Provenance Manifest and Refresh Mechanism

**Priority:** P2 (agent-guidance quality + context supply-chain hygiene; see [Severity & Priority](#severity--priority))
**Created:** 2026-06-12
**Source:** Owner asked how the vendored agent skills are kept current: where each came from, whether any have newer upstream versions, and whether `.claude` / `.codex` / `.agents` are aligned for all agents. An adversarial audit found cross-agent alignment is already structurally guaranteed, but the skill set has no manifest, no repeatable refresh process, and multiple material upstream drifts.
**Related:** [Debt Index](../../debt/index.md), [`AGENTS.md`](../../../AGENTS.md), [`CLAUDE.md`](../../../CLAUDE.md), [`.claude/rules/`](../../../.claude/rules), DEBT-393/394 (npm supply-chain maturity gate), DEBT-409 (stale vendored content leaking into product CSS)
**Status:** **Resolved 2026-06-12 — refresh executed and merged to `dev` + `main` (fast-forward to `b98f8d0d`); doc archived.** Skill content, the provenance manifest (`.agents/skills/skills.manifest.json` + schema), the `AGENTS.md` refresh workflow, and this log were updated and merged. `.claude/skills/*`, `.codex/skills/*`, `.claude/rules/*`, package files, and runtime app/source files were not changed. Closed as a direct merge (no PR/CodeRabbit) per owner waiver for docs/skills-only register hygiene; the full local gate including `pnpm build` was green before each fast-forward.

---

## TL;DR

1. **Alignment is solved.** `.agents/skills/` is the real source tree. `.claude/skills/*` and `.codex/skills/*` are committed symlinks, git mode `120000`, with identical blob SHAs pointing to `../../.agents/skills/<name>`. There are exactly 15 skills.
2. **Provenance was missing, but this audit resolved it and execution added a manifest.** No skill needs a hand-wavy "source unknown" label. The four previously-unresolved skills map to concrete sources: `sickn33/antigravity-awesome-skills`, `pproenca/dot-skills`, and Fullstack Recipes (`andrelandgraf/fullstackrecipes` live recipe/renamed skill surfaces). `.agents/skills/skills.manifest.json` now records the source, commit/version, license, precedence, refresh mode, and refresh command for every skill.
3. **The material stale copies were refreshed or deliberately preserved.** `stripe-best-practices`, `clerk`, `clerk-webhooks`, `neon-postgres`, `vercel-react-best-practices`, `using-drizzle-queries`, and the low/no-op metadata/license drifts were updated. `agent-browser` was preserved as a first-party fork after a manual diff; `neon-drizzle-setup` and `stripe-subscriptions` were kept as thin live-recipe pointers.
4. **The old live-plugin claim was overstated for this runtime.** This Codex session has Browser/Chrome/GitHub/Gmail/etc. plugins, but `tool_search` did not expose Stripe or Vercel MCP/plugin tools. The current **upstream** Stripe skill does recommend Stripe MCP (`https://mcp.stripe.com`) and `stripe_implementation_planner`; that is not the same as the MCP being installed here.

The durable fix is now in place: a manifest plus a documented refresh workflow. A scheduled drift-check automation remains future hardening, not part of this execution.

## Problem

This repo feeds agents 15 always-on skills from `.agents/skills/`, surfaced through `.claude/skills/` and `.codex/skills/`. Before this audit there was no repo-owned answer to:

1. Where exactly did each skill come from?
2. How exactly does a future engineer update it without clobbering local edits?

The result is a context dependency graph with less hygiene than the npm dependency graph. The repo already enforces supply-chain maturity for packages; agent context needs the same basic provenance and refresh discipline.

## Evidence

All commands below were run on branch `docs/debt-416-agent-skills-provenance-and-refresh` on 2026-06-12 with `npx skills` 1.5.11. Upstream snapshots were cloned into `/tmp/debt416-upstreams`.

### 1. Cross-agent alignment is structurally guaranteed

`git ls-files -s .claude/skills` and `git ls-files -s .codex/skills` both return 15 entries, all mode `120000`. A pairwise blob check showed every `.claude/skills/<name>` and `.codex/skills/<name>` entry has the same blob SHA and the same symlink target string:

```text
agent-browser  claude=120000:e298b7be...  codex=120000:e298b7be...  same=true  target=../../.agents/skills/agent-browser
api-security-best-practices  claude=120000:606af269...  codex=120000:606af269...  same=true  target=../../.agents/skills/api-security-best-practices
...
webapp-testing  claude=120000:8cb954a8...  codex=120000:8cb954a8...  same=true  target=../../.agents/skills/webapp-testing
```

`find .agents/skills -mindepth 1 -maxdepth 1 -type d | sort` returns exactly the 15 skill directories listed in [Provenance Matrix](#provenance-matrix). `find .agents/skills -mindepth 2 -maxdepth 2 -name SKILL.md | wc -l` returns `15`. No `.claude` or `.codex` entry is a real copied directory.

### 2. Timeline: introduced 2026-02-01; only `agent-browser` changed afterward

`git log --reverse --date=short --format='%ad %h %s' -- .agents/skills`:

```text
2026-02-01 1c003700 Add Vercel agent skills for React/Next.js optimization
2026-02-01 8829326e Add comprehensive agent skills for full-stack development
2026-02-01 566af6db Add testing infrastructure documentation and agent-browser skill
2026-02-01 df08614f Address CodeRabbit feedback
2026-03-18 fad56172 Update agent-browser documentation for Clerk authentication reliability
2026-03-18 1a4c1a9c Enhance agent-browser documentation for Clerk authentication
2026-03-18 0b459e3f Refine agent-browser documentation for Clerk authentication reliability
2026-03-18 ef5bc783 Remove CDP bridge; make --profile the recommended agent-browser auth path
2026-03-18 712f3105 Update agent-browser documentation for Clerk authentication reliability
2026-03-18 eafb29dd Document agent-browser ref-click failures with React components and provide workarounds
2026-03-18 02bd66b3 Refactor agent-browser documentation to consolidate Clerk authentication guidance
2026-03-18 09efa5d0 Update agent-browser documentation to clarify React interaction reliability issues
```

Correction from the earlier draft: there are **three add commits plus one same-day CodeRabbit follow-up** on 2026-02-01, not just three total `.agents/skills` commits. For the 14 non-`agent-browser` skills, `git log --date=short --format='%ad %h %s' -- <those paths>` returns only `2026-02-01 8829326e ...` and `2026-02-01 1c003700 ...`.

Computed against 2026-06-12:

- 2026-02-01 to 2026-06-12 = 130.96 days = ~4.3 months.
- 2026-03-18 to 2026-06-12 = 86 days = ~2.8 months.

### 3. Frontmatter and local pins

Repo facts from `rg -n "^(name|description|author|version|license|metadata|allowed-tools):|^---$" .agents/skills/*/SKILL.md`:

- `agent-browser`: no version/license; `allowed-tools: Bash(agent-browser:*)`.
- `api-security-best-practices`: no version/license.
- `clean-architecture`: no version/license.
- `clerk`: no version/license.
- `clerk-webhooks`: `license: MIT`, `metadata.author: clerk`, `metadata.version: "1.0.0"`, `allowed-tools: WebFetch`.
- `neon-drizzle-setup`: no version/license.
- `neon-postgres`: no version/license.
- `security-review`: `author: affaan-m`, `version: "1.0"`, no license in frontmatter.
- `stripe-best-practices`: no version/license.
- `stripe-subscriptions`: no version/license.
- `using-drizzle-queries`: no version/license.
- `vercel-composition-patterns`: `license: MIT`, `metadata.author: vercel`, `metadata.version: '1.0.0'`.
- `vercel-react-best-practices`: `license: MIT`, `metadata.author: vercel`, `metadata.version: "1.0.0"`.
- `web-design-guidelines`: `metadata.author: vercel`, `metadata.version: "1.0.0"`, `metadata.argument-hint`.
- `webapp-testing`: `license: Complete terms in LICENSE.txt`.

So the old "Pin?" column was only partly useful. Several skills have metadata versions, but the versions are not enough to refresh because they do not record source repo, source path, or vendored commit.

### 4. `web-design-guidelines` is genuinely self-updating

`.agents/skills/web-design-guidelines/SKILL.md:26` points at:

```text
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

`.agents/skills/web-design-guidelines/SKILL.md:29` instructs the agent to use WebFetch to retrieve the latest rules. `curl -L --fail https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md` returned HTTP 200 on 2026-06-12, and the cloned `vercel-labs/web-interface-guidelines` `command.md` was byte-identical to the raw URL response. The wrapper itself is identical to current `vercel-labs/agent-skills/skills/web-design-guidelines/SKILL.md`.

### 5. Stripe supersession is real upstream drift, not runtime plugin availability

Local `stripe-best-practices` is a single 31-line `SKILL.md`. Current Stripe source is [`stripe/ai`](https://github.com/stripe/ai) at commit `2b60be10f6f8` (2026-06-12), path `skills/stripe-best-practices`, with 7 files / 401 lines. It adds:

- explicit latest API version `2026-05-27.dahlia`;
- Stripe MCP setup (`https://mcp.stripe.com`) and `stripe_implementation_planner` as the first choice before writing payment/billing code;
- restricted API key guidance (`rk_` default over `sk_`);
- routing table for Checkout Sessions, Payment Element, Setup Intents, Accounts v2, Metronome, Billing, Tax, Treasury, and security;
- references for billing, Connect, payments, security, tax, and treasury;
- current dynamic-payment-method rule: do not pass `payment_method_types` except Terminal.

This is material drift. But this Codex runtime did **not** expose a live Stripe MCP/plugin via `tool_search`; the accurate precedence is: use Stripe MCP if configured, otherwise use the refreshed `stripe/ai` skill content, and do not rely on the stale local snapshot.

### 6. Independent verification (adversarial re-check, 2026-06-12)

The provenance and drift findings above were re-verified from a second clone/session against live GitHub and upstream endpoints (not the cloned `/tmp` snapshots), to confirm the sources are real, current, and runnable:

- **All 15 source paths exist and contain `SKILL.md`**, confirmed via the GitHub contents API (`gh api repos/<owner>/<repo>/contents/<path>`): `clerk/skills` → `skills/core/clerk` + `skills/features/clerk-webhooks`; `neondatabase/agent-skills` → `skills/neon-postgres`; `vercel-labs/agent-skills` → `skills/{composition-patterns,react-best-practices,web-design-guidelines}`; `stripe/ai` → `skills/stripe-best-practices` (+ `references/`); `anthropics/skills` → `skills/webapp-testing`; `sickn33/antigravity-awesome-skills` → `skills/api-security-best-practices`; `pproenca/dot-skills` → `skills/.experimental/clean-architecture`; `davila7/claude-code-templates` → `cli-tool/components/skills/development/cc-skill-security-review`; `andrelandgraf/fullstackrecipes` → `.agents/skills/agent-browser` + `skills/drizzle-queries`.
- **Every claimed upstream commit matched the live `git ls-remote … HEAD`** on 2026-06-12: `clerk/skills a0ef3ed7`, `neondatabase/agent-skills 58ec9227`, `vercel-labs/agent-skills f8a72b96`, `andrelandgraf/fullstackrecipes 4449331e`, `pproenca/dot-skills 9c015c68`, `anthropics/skills 57546260`, `stripe/ai 2b60be10`, `davila7/claude-code-templates 39249a75`, `vercel-labs/web-interface-guidelines 4e799d45`. Only `sickn33/antigravity-awesome-skills` advanced the same day (`cb7f9b78` → `e42c4dba`); immaterial to provenance.
- **Drift spot-checks confirmed:** `stripe/ai` skill = 7 files (`SKILL.md` + 6 `references/`: billing, connect, payments, security, tax, treasury), with `mcp.stripe.com`, `2026-05-27.dahlia`, and `stripe_implementation_planner` all present; `clerk-webhooks` upstream `SKILL.md` = 344 lines / `version: 1.2.0`; `vercel-labs/agent-skills` `react-best-practices/rules` = 72 files (~70 rules) vs local 59 (~57).
- **Pointer-skill live URLs resolve:** `fullstackrecipes.com/api/recipes/{neon-drizzle-setup,stripe-subscriptions}`, the `web-interface-guidelines` raw `command.md`, and `neon.com/docs/ai/skills/neon-postgres/SKILL.md` all return HTTP 200; `mcp.stripe.com` returns HTTP 401 (auth-gated endpoint, present as expected).

Net: the source repos, paths, current commits, and material-drift findings in the [Provenance Matrix](#provenance-matrix) are independently confirmed; the refresh commands target real, current paths.

## Provenance Matrix

Current upstream commits verified on 2026-06-12:

- `clerk/skills`: `a0ef3ed7841d` (2026-06-09)
- `neondatabase/agent-skills`: `58ec9227d3f2` (2026-06-12)
- `vercel-labs/agent-skills`: `f8a72b960372` (2026-06-10)
- `andrelandgraf/fullstackrecipes`: `4449331ed5ae` (2026-06-08)
- `sickn33/antigravity-awesome-skills`: `cb7f9b7851ba` (2026-06-12)
- `pproenca/dot-skills`: `9c015c68df33` (2026-06-12)
- `anthropics/skills`: `575462609294` (2026-06-09)
- `stripe/ai`: `2b60be10f6f8` (2026-06-12)
- `davila7/claude-code-templates`: `39249a751d30` (2026-06-12)
- `vercel-labs/web-interface-guidelines`: `4e799d45c17a` (2026-04-06)

| Skill | Source + current upstream | Our vendored version | Drift | License | Self-updating? | Overlap + precedence | Refresh command |
|---|---|---|---|---|---|---|---|
| `agent-browser` | Mixed: local first-party fork of the generic Fullstack Recipes `andrelandgraf/fullstackrecipes/.agents/skills/agent-browser`; underlying CLI docs source is [`vercel-labs/agent-browser`](https://github.com/vercel-labs/agent-browser). | Local content last edited 2026-03-18; no version pin. `docs/tooling/agent-browser.md` says CLI version verified `0.21.1`. | Current Fullstack Recipes generic skill is shorter and lacks this repo's Clerk auth and React click-failure sections. Our local copy has valuable first-party additions; do not overwrite wholesale. | Fullstack Recipes repo package is MIT; local fork has no frontmatter license. | No. | Browser/Chrome plugins exist in this runtime, but AGENTS.md documents `agent-browser` for Clerk-authenticated visual verification. **Precedence:** keep both; project-specific `agent-browser` notes win when AGENTS.md calls for that CLI. | Manual merge only: `tmp=$(mktemp -d); git clone --depth=1 https://github.com/andrelandgraf/fullstackrecipes.git "$tmp/fullstackrecipes"; diff -u .agents/skills/agent-browser/SKILL.md "$tmp/fullstackrecipes/.agents/skills/agent-browser/SKILL.md"`; merge command-reference changes while preserving local Clerk/DEBT-323 sections and `docs/tooling/agent-browser.md`. |
| `api-security-best-practices` | [`sickn33/antigravity-awesome-skills`](https://github.com/sickn33/antigravity-awesome-skills), paths `skills/api-security-best-practices` and `plugins/antigravity-awesome-skills-claude/skills/api-security-best-practices`. | 907-line single file, 2026-02-01, no pin. | Current upstream is 915 lines. Only changes: adds `risk: unknown`, `source: community`, `date_added: "2026-02-27"`, and a 4-line `Limitations` section. | Upstream repo: MIT for code/tooling; `LICENSE-CONTENT` says original non-code content is CC BY 4.0 unless a more specific notice applies. | No. | Overlaps local `security-review`, but this one is API-specific. **Precedence:** keep both; use `security-review` for repo-wide sensitive changes and this skill for API-specific design/review. | `tmp=$(mktemp -d); git clone --depth=1 --filter=blob:none --sparse https://github.com/sickn33/antigravity-awesome-skills.git "$tmp/src"; git -C "$tmp/src" sparse-checkout set skills/api-security-best-practices; rsync -a --delete "$tmp/src/skills/api-security-best-practices/" .agents/skills/api-security-best-practices/` |
| `clean-architecture` | [`pproenca/dot-skills`](https://github.com/pproenca/dot-skills), path `skills/.experimental/clean-architecture`. | 43 files, 2026-02-01, no pin. | All files we vendor are byte-identical to current upstream. Current upstream adds `metadata.json`, `references/_sections.md`, and `assets/templates/_template.md`. | Upstream repo: MIT. | No. | Overlaps `AGENTS.md` architecture rules and `.claude/rules/architecture.md` / `domain-layer.md`. **Precedence:** repo rules win; this skill is supplemental Clean Architecture reference. | `tmp=$(mktemp -d); git clone --depth=1 https://github.com/pproenca/dot-skills.git "$tmp/src"; rsync -a --delete "$tmp/src/skills/.experimental/clean-architecture/" .agents/skills/clean-architecture/` |
| `clerk` | Official [`clerk/skills`](https://github.com/clerk/skills), path `skills/core/clerk`. | 54-line router plus old `.claude-plugin/plugin.json`; no pin. | Current upstream is 161 lines, adds `license: MIT`, `metadata.version: 2.0.0`, SDK version detection, CLI, billing/subscriptions, mobile, framework-specific patterns, Backend API, and expanded quick navigation. | Upstream plugin manifest: MIT. | No. | No Clerk plugin/MCP is installed in this runtime. **Precedence:** keep local until official plugin is installed; if installed, prefer official current Clerk plugin. | `tmp=$(mktemp -d); git clone --depth=1 https://github.com/clerk/skills.git "$tmp/src"; rsync -a --delete "$tmp/src/skills/core/clerk/" .agents/skills/clerk/` |
| `clerk-webhooks` | Official [`clerk/skills`](https://github.com/clerk/skills), path `skills/features/clerk-webhooks`. | 131-line skill plus old `.claude-plugin/plugin.json`; `metadata.version: "1.0.0"`. | Current upstream is 344 lines plus `references/` and `evals/`; bumps version to `1.2.0`, adds compatibility field, mandatory `verifyWebhook(req)` guidance, public route examples, notification/org membership examples, framework adapters, idempotency/retry/error handling. | Upstream plugin manifest and local frontmatter: MIT. | No. | No Clerk plugin/MCP is installed in this runtime. **Precedence:** keep-and-refresh; official current Clerk skill wins over local stale copy. | `tmp=$(mktemp -d); git clone --depth=1 https://github.com/clerk/skills.git "$tmp/src"; rsync -a --delete "$tmp/src/skills/features/clerk-webhooks/" .agents/skills/clerk-webhooks/` |
| `neon-drizzle-setup` | Fullstack Recipes [`andrelandgraf/fullstackrecipes`](https://github.com/andrelandgraf/fullstackrecipes), live recipe `https://fullstackrecipes.com/api/recipes/neon-drizzle-setup`; repo metadata in `src/lib/recipes/data.tsx`. Not present in current `neondatabase/agent-skills`. | 16-line pointer skill, 2026-02-01, no pin. | Current live recipe is 198 lines and adds Neon MCP setup, `neondatabase/agent-skills` install, better-env config, `@vercel/functions` pooling, Drizzle Kit config, package scripts, and driver tradeoffs. | Fullstack Recipes package: MIT. | Yes, if the agent follows the live recipe URL/MCP resource; wrapper itself can still drift. | Overlaps `neon-postgres` and Fullstack recipe guidance. **Precedence:** use `neon-postgres` for Neon platform details; use this recipe only for the concrete Next.js + Drizzle + Vercel setup sequence. | Wrapper refresh: `curl -fsSL -H "Accept: text/plain" https://fullstackrecipes.com/api/recipes/neon-drizzle-setup >/tmp/neon-drizzle-setup.current.md`; keep `.agents/skills/neon-drizzle-setup/SKILL.md` as a pointer skill unless intentionally vendoring the 198-line recipe. |
| `neon-postgres` | Official [`neondatabase/agent-skills`](https://github.com/neondatabase/agent-skills), path `skills/neon-postgres`; live docs endpoint `https://neon.com/docs/ai/skills/neon-postgres/SKILL.md`. | 29 files, 2026-02-01, no pin. | Material shape change. GitHub current is a single 276-line router; live docs endpoint is a slightly newer 264-line variant. It emphasizes docs/llms, `neonctl init --agent`, MCP setup, branch/egress companion skills, and current Neon Auth/Data API/branching guidance. Local vendored reference files are stale. | Upstream repo: Apache-2.0. | Yes for docs verification, but local wrapper/reference files are static. | Neon MCP is not installed in this runtime. **Precedence:** keep-and-refresh; if Neon MCP is configured, use MCP/CLI for live resource actions and the skill for routing. | `tmp=$(mktemp -d); git clone --depth=1 https://github.com/neondatabase/agent-skills.git "$tmp/src"; rsync -a --delete "$tmp/src/skills/neon-postgres/" .agents/skills/neon-postgres/`; then compare live docs: `curl -fsSL https://neon.com/docs/ai/skills/neon-postgres/SKILL.md >/tmp/neon-postgres.live.md && diff -u .agents/skills/neon-postgres/SKILL.md /tmp/neon-postgres.live.md`. |
| `security-review` | [`davila7/claude-code-templates`](https://github.com/davila7/claude-code-templates), path `cli-tool/components/skills/development/cc-skill-security-review`. | 495-line file, `author: affaan-m`, `version: "1.0"`. | Byte-identical to current upstream. | Upstream repo: MIT. | No. | Overlaps local `api-security-best-practices`; no separate built-in security-review command was exposed in this Codex runtime. **Precedence:** keep; this is the default repo security checklist, API skill is narrower. | `tmp=$(mktemp -d); git clone --depth=1 --filter=blob:none --sparse https://github.com/davila7/claude-code-templates.git "$tmp/src"; git -C "$tmp/src" sparse-checkout set cli-tool/components/skills/development/cc-skill-security-review; rsync -a --delete "$tmp/src/cli-tool/components/skills/development/cc-skill-security-review/" .agents/skills/security-review/` |
| `stripe-best-practices` | Official Stripe [`stripe/ai`](https://github.com/stripe/ai), path `skills/stripe-best-practices`. | 31-line single file, 2026-02-01, no pin. | Material supersession: current upstream is 7 files / 401 lines with Stripe MCP-first guidance, latest API version `2026-05-27.dahlia`, RAK guidance, Accounts v2, Metronome, Tax, Treasury, security, and references. | Upstream repo: MIT. | No; current upstream can use Stripe MCP if configured. | Stripe MCP/plugin not installed in this runtime, but current upstream explicitly prefers MCP. **Precedence:** if Stripe MCP is configured, use `stripe_implementation_planner` first; otherwise use current `stripe/ai` skill. Drop or refresh this stale copy. | `tmp=$(mktemp -d); git clone --depth=1 https://github.com/stripe/ai.git "$tmp/src"; rsync -a --delete "$tmp/src/skills/stripe-best-practices/" .agents/skills/stripe-best-practices/` |
| `stripe-subscriptions` | Fullstack Recipes [`andrelandgraf/fullstackrecipes`](https://github.com/andrelandgraf/fullstackrecipes), live cookbook `https://fullstackrecipes.com/api/recipes/stripe-subscriptions`; metadata in `src/lib/recipes/data.tsx`. Current repo no longer publishes `skills/stripe-subscriptions`. | 54-line pointer skill, 2026-02-01, no pin. | Current live cookbook is 1,073 lines and inlines `feature-flags-setup` + `stripe-sync`. It now explicitly installs Stripe AI skills (`bunx skills add stripe/ai ...`), includes schema, sync, checkout, portal, and webhook code. | Fullstack Recipes package: MIT. | Yes, if the agent follows live recipe URLs; wrapper itself can drift. | Overlaps `stripe-best-practices` and repo-owned Stripe code. **Precedence:** use Stripe AI/MCP for Stripe API choices; use this only as a generic recipe, not as authority over this repo's existing billing architecture. | Wrapper refresh: `curl -fsSL -H "Accept: text/markdown" https://fullstackrecipes.com/api/recipes/stripe-subscriptions >/tmp/stripe-subscriptions.current.md`; keep `.agents/skills/stripe-subscriptions/SKILL.md` as pointer unless intentionally vendoring the 1,073-line cookbook. |
| `using-drizzle-queries` | Fullstack Recipes current source is renamed [`andrelandgraf/fullstackrecipes`](https://github.com/andrelandgraf/fullstackrecipes), path `skills/drizzle-queries`; legacy slug redirects from `using-drizzle-queries` to `drizzle-queries` in `src/lib/recipes/data.tsx`. | 151-line embedded content, 2026-02-01, no pin. | Current installable skill is named `drizzle-queries`, 120 lines with tighter trigger description. Current live recipe is 114 lines. It removes old "Working with Drizzle" boilerplate and keeps concise Drizzle query examples. | Fullstack Recipes package: MIT. | No; local embeds content. | Overlaps `neon-drizzle-setup` and repo Drizzle patterns. **Precedence:** keep as Drizzle query quick reference, but record alias decision: either rename skill to `drizzle-queries` or preserve `using-drizzle-queries` as a local alias. | Alias-preserving refresh: `tmp=$(mktemp -d); git clone --depth=1 https://github.com/andrelandgraf/fullstackrecipes.git "$tmp/src"; rsync -a --delete "$tmp/src/skills/drizzle-queries/" .agents/skills/using-drizzle-queries/`; then edit frontmatter `name:` back to `using-drizzle-queries` unless the follow-up intentionally renames directory + symlinks. |
| `vercel-composition-patterns` | Official [`vercel-labs/agent-skills`](https://github.com/vercel-labs/agent-skills), path `skills/composition-patterns`. | 10 files, `metadata.version: '1.0.0'`. | All files we vendor are byte-identical. Current upstream adds `README.md`, `metadata.json`, `rules/_sections.md`, and `rules/_template.md`. | Local/upstream frontmatter: MIT. | No. | No Vercel plugin/MCP is installed in this runtime. **Precedence:** keep-and-refresh local copy. | `tmp=$(mktemp -d); git clone --depth=1 https://github.com/vercel-labs/agent-skills.git "$tmp/src"; rsync -a --delete "$tmp/src/skills/composition-patterns/" .agents/skills/vercel-composition-patterns/` |
| `vercel-react-best-practices` | Official [`vercel-labs/agent-skills`](https://github.com/vercel-labs/agent-skills), path `skills/react-best-practices`. | 59 files, `metadata.version: "1.0.0"`. | Material drift: local says 57 rules; current says 70 rules. Upstream adds 17 files, including new rules for cheap condition before await, analyzable import paths, resource hints, script defer/async, no inline components, split hooks, deferred values, shared module state, nested fetch parallelism, etc. Existing `async-defer-await` and `bundle-barrel-imports` also changed. | Local/upstream frontmatter: MIT. | No. | No Vercel plugin/MCP is installed in this runtime. **Precedence:** keep-and-refresh local copy; if a Vercel plugin is later installed, prefer plugin/current source. | `tmp=$(mktemp -d); git clone --depth=1 https://github.com/vercel-labs/agent-skills.git "$tmp/src"; rsync -a --delete "$tmp/src/skills/react-best-practices/" .agents/skills/vercel-react-best-practices/` |
| `web-design-guidelines` | Official [`vercel-labs/agent-skills`](https://github.com/vercel-labs/agent-skills), path `skills/web-design-guidelines`, fetching [`vercel-labs/web-interface-guidelines`](https://github.com/vercel-labs/web-interface-guidelines) `command.md`. | 39-line wrapper, `metadata.version: "1.0.0"`. | Wrapper is byte-identical to current upstream. Live `command.md` resolves HTTP 200 and is 180 lines. | Wrapper has no frontmatter license; fetched guideline repo is MIT. | Yes. | Anthropic `frontend-design` exists in `anthropics/skills` but is not installed in this runtime. **Precedence:** keep both if installed; this skill is rule-audit oriented, `frontend-design` is aesthetic direction. | `tmp=$(mktemp -d); git clone --depth=1 https://github.com/vercel-labs/agent-skills.git "$tmp/src"; rsync -a --delete "$tmp/src/skills/web-design-guidelines/" .agents/skills/web-design-guidelines/`; verify `curl -fsSL https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md >/tmp/web-interface-guidelines.command.md`. |
| `webapp-testing` | Official [`anthropics/skills`](https://github.com/anthropics/skills), path `skills/webapp-testing`. | 6 files; `license: Complete terms in LICENSE.txt`. | Only `LICENSE.txt` differs: upstream fills `Copyright 2026 Anthropic, PBC.` in the Apache-2.0 boilerplate. `SKILL.md`, scripts, and examples are byte-identical. | Apache-2.0 text in skill `LICENSE.txt`. | No. | Browser/Chrome plugins exist in this runtime, and local `webapp-testing` overlaps Playwright-based verification. **Precedence:** for repo frontend verification, follow AGENTS/browser instructions first; use this skill when writing native Playwright scripts. | `tmp=$(mktemp -d); git clone --depth=1 https://github.com/anthropics/skills.git "$tmp/src"; rsync -a --delete "$tmp/src/skills/webapp-testing/" .agents/skills/webapp-testing/` |

## Refresh Process

### Manifest

Create `.agents/skills/skills.manifest.json` as the source of truth for provenance. Use JSON, not a Markdown table, because refresh scripts and scheduled drift checks can consume it.

Exact schema:

```json
{
  "$schema": "./skills.manifest.schema.json",
  "generatedAt": "2026-06-12",
  "skills": [
    {
      "name": "stripe-best-practices",
      "localPath": ".agents/skills/stripe-best-practices",
      "sourceKind": "github",
      "sourceUrl": "https://github.com/stripe/ai",
      "sourcePath": "skills/stripe-best-practices",
      "upstreamCommit": "2b60be10f6f8",
      "upstreamVersion": null,
      "vendoredCommit": "8829326e",
      "vendoredVersion": null,
      "license": "MIT",
      "selfUpdating": false,
      "liveOverlap": "Stripe MCP at https://mcp.stripe.com when configured",
      "precedence": "use Stripe MCP planner first; otherwise refreshed stripe/ai skill",
      "refreshMode": "copy-directory",
      "refreshCommand": "tmp=$(mktemp -d); git clone --depth=1 https://github.com/stripe/ai.git \"$tmp/src\"; rsync -a --delete \"$tmp/src/skills/stripe-best-practices/\" .agents/skills/stripe-best-practices/",
      "localPreservationNotes": "No local edits to preserve."
    }
  ]
}
```

Required fields per skill: `name`, `localPath`, `sourceKind`, `sourceUrl`, `sourcePath`, `upstreamCommit`, `upstreamVersion`, `vendoredCommit`, `vendoredVersion`, `license`, `selfUpdating`, `liveOverlap`, `precedence`, `refreshMode`, `refreshCommand`, `localPreservationNotes`. Use `null` only when a version does not exist upstream; never omit a field.

### Safe Refresh Workflow

Document this in `AGENTS.md` under "Refreshing agent skills":

1. Start clean for skills:

   ```bash
   git diff --quiet -- .agents/skills .claude/skills .codex/skills || {
     echo "Uncommitted skill/symlink changes exist; preserve or commit them before refresh.";
     exit 1;
   }
   ```

2. Update the manifest's upstream commits first:

   ```bash
   git ls-remote https://github.com/stripe/ai.git refs/heads/main
   git ls-remote https://github.com/vercel-labs/agent-skills.git refs/heads/main
   git ls-remote https://github.com/clerk/skills.git refs/heads/main
   git ls-remote https://github.com/neondatabase/agent-skills.git refs/heads/main
   ```

3. Refresh one skill at a time using its manifest `refreshCommand`. Do not bulk-overwrite all skills in one commit.

4. For `agent-browser`, do a manual three-way merge. Preserve this repo's Clerk-authentication and React click-failure guidance from `.agents/skills/agent-browser/SKILL.md` and `docs/tooling/agent-browser.md`. Only merge generic command-reference changes from Fullstack Recipes or the upstream CLI.

5. For pointer skills (`neon-drizzle-setup`, `stripe-subscriptions`, `web-design-guidelines`), verify the live URLs resolve before changing local content:

   ```bash
   curl -fsSL -H "Accept: text/plain" https://fullstackrecipes.com/api/recipes/neon-drizzle-setup >/tmp/neon-drizzle-setup.md
   curl -fsSL -H "Accept: text/markdown" https://fullstackrecipes.com/api/recipes/stripe-subscriptions >/tmp/stripe-subscriptions.md
   curl -fsSL https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md >/tmp/web-interface-guidelines.md
   ```

6. After each skill refresh, review the diff before moving on:

   ```bash
   git --no-pager diff -- .agents/skills/<skill>
   ```

7. Re-check the symlink invariant:

   ```bash
   node - <<'NODE'
   const { execFileSync } = require('child_process');
   const parse = (dir) => execFileSync('git', ['ls-files', '-s', dir], { encoding: 'utf8' })
     .trim().split('\n').filter(Boolean).map((line) => {
       const match = line.match(/^(\d+) ([0-9a-f]+) \d+\s+(.+)$/);
       return { mode: match[1], sha: match[2], path: match[3], skill: match[3].split('/').pop() };
     });
   const claude = new Map(parse('.claude/skills').map((entry) => [entry.skill, entry]));
   const codex = new Map(parse('.codex/skills').map((entry) => [entry.skill, entry]));
   for (const [skill, c] of claude) {
     const x = codex.get(skill);
     const target = execFileSync('git', ['cat-file', '-p', c.sha], { encoding: 'utf8' }).trim();
     if (c.mode !== '120000' || x?.mode !== '120000' || c.sha !== x.sha || target !== `../../.agents/skills/${skill}`) {
       throw new Error(`skill symlink invariant failed for ${skill}`);
     }
   }
   console.log(`verified ${claude.size} skill symlink pairs`);
   NODE
   ```

8. Run `npx skills ls --json` and confirm exactly the expected skill names. If `using-drizzle-queries` is renamed to `drizzle-queries`, update `.claude/skills`, `.codex/skills`, AGENTS/CLAUDE references, and this manifest in the same commit.

### Cadence

First implementation was **manual per-skill refresh plus manifest** on 2026-06-12. A scheduled drift check remains in scope as a later hardening task. The drift check can be a small script that reads `.agents/skills/skills.manifest.json`, clones/fetches each source, diffs against `.agents/skills/<name>`, and opens a debt issue or PR when upstream changed.

## Remediation Options

### Option A - Manifest + refresh process (recommended)

Add `.agents/skills/skills.manifest.json`, a JSON schema, and an `AGENTS.md` "Refreshing agent skills" section using the process above. Then refresh skills one at a time, recording upstream commit/version and any local preservation notes.

### Option B - Resolve precedence for duplicate guidance

Record precedence decisions in the manifest for Stripe, Vercel, Browser/Chrome, security-review/API-security, and repo architecture rules. The point is not necessarily to delete every duplicate; it is to make precedence explicit.

### Option C - Refresh material drifts first

Prioritize `stripe-best-practices`, `clerk`, `clerk-webhooks`, `neon-postgres`, `vercel-react-best-practices`, `neon-drizzle-setup`, `stripe-subscriptions`, and `using-drizzle-queries` because they have material upstream drift.

### Option D - Convert pointer skills to live-fetch wrappers

For Fullstack Recipes and web-design guidelines, prefer thin wrappers that fetch the live canonical recipe/guideline at runtime. That avoids vendoring large recipe bodies that can rot quickly.

## Recommendation

Option A was executed on 2026-06-12: the manifest/schema were added, material drifts were refreshed, and precedence/local-preservation notes were recorded. Treat `agent-browser` separately in all future refreshes as a local fork: preserve project-specific Clerk/React verification guidance and only merge generic CLI updates.

Do **not** bulk-overwrite all 15 skills in one unscoped commit. That would erase local intent, especially for `agent-browser`, and would make review harder.

## Severity & Priority

Rated **P2**. This does not affect runtime product behavior, so it is not P1. It is more than polish because agents consume these skills on every task, several are materially stale, and the Stripe/Clerk/Neon/Vercel drifts can push future agents toward outdated implementation guidance in billing, auth, database, and frontend work.

P3 is defensible only if agent guidance is treated as non-blocking reviewer-assist context. Left at P2 because this repo deliberately relies on agents for implementation and review, and context supply-chain drift compounds silently.

## Acceptance Criteria

- [x] `.agents/skills/skills.manifest.json` and `.agents/skills/skills.manifest.schema.json` exist with one complete entry per skill using the schema in [Manifest](#manifest).
- [x] Every manifest row records source repo/path or live URL, upstream commit/version, vendored commit/version, license, self-updating flag, overlap/precedence decision, refresh mode, exact refresh command, and local preservation notes.
- [x] The four formerly-unconfirmed sources are resolved exactly as this audit found: `api-security-best-practices` -> `sickn33/antigravity-awesome-skills`; `clean-architecture` -> `pproenca/dot-skills`; `stripe-subscriptions` -> Fullstack Recipes live cookbook; `using-drizzle-queries` -> Fullstack Recipes `drizzle-queries` legacy alias.
- [x] Materially drifted skills are refreshed or explicitly deferred in the manifest with a reason: `stripe-best-practices`, `clerk`, `clerk-webhooks`, `neon-postgres`, `vercel-react-best-practices`, `neon-drizzle-setup`, `stripe-subscriptions`, `using-drizzle-queries`.
- [x] `agent-browser` refresh preserves local Clerk-auth and React click-failure guidance; no wholesale overwrite.
- [x] `using-drizzle-queries` has an explicit alias decision: preserve old local name or rename to `drizzle-queries` and update symlinks/references.
- [x] `AGENTS.md` gains a "Refreshing agent skills" section pointing at the manifest and the safe refresh workflow.
- [x] The `.claude/skills` and `.codex/skills` symlink invariant is checked after refresh; every pair remains mode `120000`, identical blob SHA, target `../../.agents/skills/<name>`.
- [x] `npx skills ls --json` reports the expected project skills after refresh.
- [x] No `.claude/rules/*` content is changed as part of this debt unless a separate first-party rule update is intentionally scoped.

## Non-Goals / Out of Scope

- Changing the symlink architecture. It is correct.
- Re-authoring `.claude/rules/*`; those are first-party repo rules governed by `CLAUDE.md`.
- Installing external MCP servers or plugins in this docs-only audit.
- Running build, integration, browser, or E2E gates for this docs/skills-only refresh.

## Execution Log (2026-06-12)

| Skill | Action | Upstream commit | Notable content change |
|---|---|---:|---|
| `agent-browser` | Manual merge / no content change | `4449331ed5ae` | Fullstack Recipes generic skill was shorter and would delete local Clerk-authentication notes, React click-failure / DEBT-323 guidance, and `docs/tooling/agent-browser.md`; local fork preserved. |
| `api-security-best-practices` | Refreshed | `76f1bb6d62d6` | Added upstream community metadata (`risk`, `source`, `date_added`) and `Limitations`; third-party content review passed. |
| `clean-architecture` | Refreshed | `9c015c68df33` | Added upstream `metadata.json`, `references/_sections.md`, and rule template; `SKILL.md` content remained the same; third-party content review passed. |
| `clerk` | Refreshed | `a0ef3ed7841d` | Replaced thin old router with current v2.0.0 Clerk router: SDK version detection, CLI, billing, mobile/framework/backend API routing; stale plugin metadata removed. |
| `clerk-webhooks` | Refreshed | `a0ef3ed7841d` | Updated to v1.2.0 with `verifyWebhook(req)`-first guidance, public route examples, idempotency/retry handling, framework references, and evals; stale plugin metadata removed. |
| `neon-drizzle-setup` | Pointer check / no content change | `4449331ed5ae` | Live recipe URL returned HTTP 200 and 198 lines; wrapper kept thin and recipe body was not vendored. |
| `neon-postgres` | Refreshed | `58ec9227d3f2` | Replaced stale 29-file static references with current official single-router skill focused on live docs, `neonctl init --agent`, MCP/CLI setup, branching, Auth, Data API, and platform APIs. Live docs endpoint had minor wording drift from GitHub HEAD. |
| `security-review` | No-op refresh | `39249a751d30` | Local content already matched upstream; third-party content review passed. |
| `stripe-best-practices` | Refreshed | `2b60be10f6f8` | Replaced 31-line stale snapshot with official Stripe AI skill plus six reference files: MCP-first planner guidance, API `2026-05-27.dahlia`, restricted keys, Accounts v2, Metronome, Tax, Treasury, and security guidance. |
| `stripe-subscriptions` | Pointer check / no content change | `4449331ed5ae` | Live cookbook URL returned HTTP 200 and 1,073 lines; wrapper kept thin and cookbook body was not vendored. |
| `using-drizzle-queries` | Refreshed with alias preserved | `4449331ed5ae` | Copied current Fullstack Recipes `skills/drizzle-queries` content and restored frontmatter `name: using-drizzle-queries` to avoid symlink/reference churn. |
| `vercel-composition-patterns` | Refreshed | `f8a72b960372` | Added upstream README, metadata, rule sections, and rule template; existing rule content stayed stable. |
| `vercel-react-best-practices` | Refreshed | `f8a72b960372` | Updated from 57 to 70-rule current Vercel set, adding rules for cheap-condition-before-await, analyzable paths, shared module state, static I/O hoisting, nested fetch parallelism, split hooks, deferred values, resource hints, script defer/async, idle callbacks, and related guidance. |
| `web-design-guidelines` | Wrapper no-op + live check | `f8a72b960372` | Wrapper already matched Vercel upstream. Live `web-interface-guidelines` `command.md` returned HTTP 200 and 180 lines; live guideline repo HEAD was `4e799d45c17a`. |
| `webapp-testing` | Refreshed | `575462609294` | Preserved upstream Apache-2.0 license file and filled copyright holder as `Copyright 2026 Anthropic, PBC.`; skill/scripts/examples were unchanged. |

Manifest files added: `.agents/skills/skills.manifest.json` and `.agents/skills/skills.manifest.schema.json`. `AGENTS.md` now documents the safe per-skill refresh process. No `.claude/skills/*`, `.codex/skills/*`, `.claude/rules/*`, package files, or runtime source files were changed.

## Rollback

Revert the refresh commits with `git revert` if needed. The refresh touched only `.agents/skills/**`, `.agents/skills/skills.manifest*.json`, `AGENTS.md`, and DEBT-416/index documentation; symlink architecture, Claude rules, package files, and runtime app/source files were left untouched.
