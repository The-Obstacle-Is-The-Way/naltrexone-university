# DEBT-398: Design System Enforcement Gap

**Priority:** P1 (the design system documented in `docs/frontend/` exists but is functionally optional — agents and contributors do not auto-load it during code generation, no lint rule blocks the most common violations, and the result is a steady drip of "AI-generated code that looks right but bypasses the documented system." This is the meta-debt that produces DEBT-399 and amplifies the small individual violations into a cumulative aesthetic and maintenance drift.)
**Created:** 2026-05-26
**Source:** Deep documentation-gap audit conducted alongside DEBT-394 archival, re-verified before PR 1, PR 2, and PR 3 execution. The original audit catalogued every existing doc, confirmed `.claude/rules/frontend.md` was a 58-line routing / shadcn / error-state rule with no design-doc gateway, and traced four recent incidents (PR #342 env leak, PR #328 selector brittleness, PR #330 Zod fixture-boundary precedent, design system drift) back to the same root cause: docs existed as aspiration rather than loaded, executable policy. PR #354 shipped the path-scoped frontend gateway and PR #355 shipped the `standards.md` AI-agent preamble; PR 3 now closes the remaining enforcement gap by making new design-system violations fail in the default test gate.
**Related:** [.claude/rules/frontend.md](../../../.claude/rules/frontend.md) (gateway shipped in PR #354), [docs/frontend/standards.md](../../frontend/standards.md), [docs/frontend/pattern-registry.md](../../frontend/pattern-registry.md), [docs/frontend/contrast-policy.md](../../frontend/contrast-policy.md), [docs/frontend/design-principles.md](../../frontend/design-principles.md), [docs/frontend/typography-policy.md](../../frontend/typography-policy.md), [docs/frontend/bookmark-surface-policy.md](../../frontend/bookmark-surface-policy.md), [DEBT-399](./debt-399-component-system-bypass-cleanup.md) (the visible symptom this debt addresses at root)

**Status:** Resolved 2026-05-28 — shipped three PRs: PR 1 (#354) added the canonical UI patterns gateway to `.claude/rules/frontend.md`, cross-referencing all six design docs; PR 2 (#355) added the "For AI Agents" preamble to `docs/frontend/standards.md`, signaling the doc is authoritative; PR 3 (#356) shipped the `components/theme-token-regression-source-scan.ts` enforcement layer that fails CI on undocumented arbitrary opacity values and raw `<button>` outside `components/ui/`. After DEBT-399 PRs 1-4 shipped the cleanup (PRs #357, #358, #359, #360), zero temporary DEBT-399 markers remain in the regression scan — only the permanent `components/mobile-nav.tsx` Pattern Registry I-6 app-shell exception. AGENTS.md and CLAUDE.md were updated with the design-system discipline section in commit 40c6c67d as a stopgap before PR 1 shipped the rule gateway.

---

## Problem

The repo has a documented design system at `docs/frontend/`:

- `standards.md` — semantic tokens (no raw `.tsx` colors except documented third-party API seams), Button component mandate, single canonical focus-ring pattern (`focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`), spacing, typography, dark mode strategy.
- `pattern-registry.md` — canonical opacity scale (`/20`, `/40`, `/50`, `/60`, `/80` reserved, `/100` reserved), foreground-ramp tonal-row tokens (`bg-foreground/5`, `bg-foreground/[0.06]`, `bg-foreground/[0.07]`, `bg-foreground/[0.08]`, `bg-foreground/[0.12]`, `dark:hover:bg-foreground/[0.05]` in documented patterns only), and dark-mode override conventions.
- `contrast-policy.md` — WCAG AA contrast targets.
- `design-principles.md` — layout composition, navigation zones.
- `typography-policy.md` — explicit text-size choices (no implicit inheritance).
- `bookmark-surface-policy.md` — bookmark appearance decision tree.

These documents are intentional, careful, and authoritative IF READ. The branch now has a universal-context stopgap in `AGENTS.md` / `CLAUDE.md`, a path-scoped frontend gateway in `.claude/rules/frontend.md`, and an AI-agent preamble in `docs/frontend/standards.md`. The remaining problem is that no automated check enforces the full contract, so the design system is still not fully executable frontend policy.

### Why the documented system is not enforced

1. **Agents load `CLAUDE.md`, `AGENTS.md`, and path-scoped `.claude/rules/*.md` files automatically.** They DO NOT load `docs/frontend/*` automatically. `AGENTS.md` / `CLAUDE.md` provide universal design-system pointers, and PR #354 now gives `.claude/rules/frontend.md` the path-scoped gateway that activates specifically for UI work. This resolved the loading gap; PR 3 addresses the remaining automation gap.

2. **Before PR #354, `.claude/rules/frontend.md` was 58 lines** and did not cross-reference `standards.md` or `pattern-registry.md`. It covered routing, shadcn, and error-state patterns, but nothing about tokens, focus rings, opacity scale, or design system discoverability. PR #354 expanded it to the shipped gateway; keep that context when reading the PR 1 remediation below.

3. **No lint rule enforces token usage.** Biome lints code style; it does not distinguish documented foreground-ramp arbitrary opacity values from undocumented one-offs, and it does not block an invalid value such as `hover:bg-foreground/[0.03]` if introduced. No Tailwind-class allowlist rule or equivalent is installed in the current pnpm + Biome + Tailwind v4 toolchain.

4. **`components/theme-token-regression.test.tsx` exists** as the single mentioned enforcement guard, but its current coverage is still narrow: it renders selected high-risk components to assert semantic token usage, blocks specific historical raw-palette regressions, checks selected hover-token regressions, and verifies two WCAG contrast token invariants. It does not scan source files for new raw `<button>` bypasses or new undocumented opacity classes.

5. **No CI gate fails on new design-system violations yet.** Full local gate runs typecheck + lint + test + build. Today the test gate covers specific historical token regressions, but it does not yet interrogate Tailwind class usage broadly enough to block new raw-button or undocumented-opacity violations.

The cumulative effect is exactly what you'd predict: code that "fits the surrounding style" (i.e., perpetuates whatever drift is in adjacent files) but does not consult the canonical design system. Each generation adds incremental drift. Each drift makes the next "fits the surrounding style" generation worse.

---

## Findings

### A. `.claude/rules/frontend.md` did not gateway to the design system

The original 58-line file covered route constants, shadcn primitive usage, and error-state patterns. It did NOT:

- Reference `standards.md` (the canonical token + focus-ring + spacing rules).
- Reference `pattern-registry.md` (the canonical opacity scale + foreground ramp).
- Reference `contrast-policy.md` (the WCAG AA rules).
- Reference `design-principles.md`, `typography-policy.md`, or `bookmark-surface-policy.md`.
- Reference `theme-token-regression.test.tsx` (the existing enforcement test).
- Mandate "READ docs/frontend/standards.md BEFORE designing a new component."

PR #354 resolved this specific gateway gap by adding the canonical UI patterns section and cross-references to all six frontend design docs. PR 3 must not re-edit `.claude/rules/frontend.md`; it should rely on the shipped gateway and add automated enforcement only.

### B. The design docs did not flag themselves as agent-loadable

Before PR #355, `docs/frontend/standards.md` read as a human reference document and did not have a "For AI Agents" preamble that says "this document IS authoritative; do not skip it; do not invent patterns." PR #355 resolved that gap. PR 3 must not re-edit `docs/frontend/standards.md`; it should install the source-scan enforcement that the preamble now points to.

### C. No automated enforcement of token / opacity / focus-ring discipline

Searching the codebase:

- 26 instances of the exact canonical focus-ring string (`focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`) exist in component code. Each is correct, but each is a copy-paste — there is no Tailwind utility `.focus-ring` and no shared constant in `lib/shared-styles.ts`. Any future change to the canonical pattern requires editing 26 places across 19 files. (See DEBT-399 for the proposed fix.)
- Arbitrary foreground opacity values appear in component code, but the audit found that the main production values are documented foreground-ramp patterns in `pattern-registry.md` § 1.2 and the pattern-specific entries (`I-1`, `I-2`, `I-3`, `I-4`, `M-4`). Enforcement must therefore be allowlist-driven: documented values are allowed only in their documented contexts, while undocumented arbitrary values should fail. DEBT-399 covers the concrete existing opacity divergences that are not documented (`hover:bg-muted/20`, `dark:divide-foreground/20`, `dark:border-foreground/10`).
- `theme-token-regression.test.tsx` now has doc visibility via the PR #354 gateway and PR #355 preamble, but its implementation is still component-specific rather than source-scan enforcement.

### D. The "looks right but isn't" amplification loop

When an agent generates a new component, the most likely behavior is:

1. Read the surrounding component files for stylistic patterns.
2. Match those patterns in the new code.
3. Submit for review.

If the surrounding components contain the canonical pattern, the new code is correct. If the surrounding components contain drift (e.g., `hover:bg-muted/20` in a context where the registry expects `/40`, `/50`, or a documented foreground-ramp pattern), the new code inherits the drift. AI-generated code therefore amplifies existing drift faster than humans introduce it, because humans occasionally re-read the design docs while agents typically do not.

The result: even with good design docs and good intentions, the codebase drifts toward the median pattern of nearby code rather than toward the documented standard.

### E. Documentation gap incident map

The audit traced four specific recent incidents to documentation gaps. Three are addressed by other debt docs (DEBT-395, DEBT-396, DEBT-400). The fourth — design-system drift — is what THIS debt addresses:

| Incident | Cause | Addressed by |
|---|---|---|
| PR #342 env leak | `.claude/rules/testing.md` silent on env isolation | DEBT-395 |
| PR #328 selector brittleness | `.claude/rules/testing-react19.md` doesn't explain WHY | DEBT-396 |
| PR #330 Zod fixture-boundary precedent | No rule on schema-aware fixtures | DEBT-400 |
| Design system drift | `.claude/rules/frontend.md` doesn't gateway to design docs; no enforcement | **DEBT-398 (this doc)** |

---

## Why Existing Docs Were Not Enough

The design docs exist. They are reasonable. The gap is that they are TREATED AS REFERENCE rather than treated as loaded rules. The mechanism to bridge that gap is:

1. **Cross-reference from `.claude/rules/frontend.md`** so the design docs get pulled into agent context when frontend work is in progress.
2. **Add a "For AI Agents" preamble** to `docs/frontend/standards.md` so the doc itself signals it is authoritative when an agent does find it.
3. **Install an enforcement layer** (lint rule, CI gate, expanded regression test) so violations fail loudly rather than silently passing.
4. **Extract shared utilities** for the most-duplicated patterns (focus ring) so the design system has a single SOURCE rather than 26 exact copies across 19 files (33 occurrences if the broader `ring-ring/50` + `ring-[3px]` family is counted).

Each of these is small. The combination is what makes the design system actually a system.

---

## Required Remediation

Ship in three single-concern PRs.

### PR 1 — `.claude/rules/frontend.md` Gateway expansion

Branch: `feat/debt-398-pr-1-frontend-rule-gateway`

Replace the existing thin `.claude/rules/frontend.md` with an expanded version that gateways to the design docs. New sections to add (preserving existing routing / shadcn / error-state content):

```markdown
## Canonical UI Patterns (Standards Enforcement)

ALWAYS refer to these design docs as sources of truth when editing
files in `app/**`, `components/**`, or any UI surface:

- `docs/frontend/standards.md` — tokens, focus rings, spacing, typography
- `docs/frontend/pattern-registry.md` — opacity scale, foreground ramps, dark-mode rules
- `docs/frontend/contrast-policy.md` — WCAG AA contrast targets
- `docs/frontend/design-principles.md` — layout composition
- `docs/frontend/typography-policy.md` — text-size discipline
- `docs/frontend/bookmark-surface-policy.md` — bookmark appearance decision tree

Mandatory patterns — never diverge:

### 1. Focus rings (single canonical pattern)

Use the `<Button>` component (which has the ring built in) OR copy the
canonical pattern EXACTLY:

    focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]

Never hand-roll variants. Never change the ring opacity or width. If
your interactive element cannot use Button, copy the pattern, then ADD
the new component to `components/theme-token-regression.test.tsx` in
the same PR so the regression guard covers it.

### 2. Opacity scale (background + hover)

When using `bg-muted`, `bg-foreground`, or similar layer fills, use
ONLY the canonical opacities from `pattern-registry.md` § 1.2:

| Opacity | Use |
|---|---|
| `/20` | Tint (non-interactive backgrounds inside cards) |
| `/40` | Subtle hover inside cards |
| `/50` | Standard hover on page background |
| `/60` | Exception-only emphasized hover (requires design review) |
| `/80` | RESERVED — do not use |
| `/100` | RESERVED for solid fills only — do not use for hover |
| Documented foreground-ramp values (`/5`, `/[0.06]`, `/[0.07]`, `/[0.08]`, `/[0.12]`, `dark:hover:bg-foreground/[0.05]`) | Allowed ONLY in the exact Pattern Registry contexts (`I-1`, `I-2`, `I-3`, `I-4`, `M-4`) |
| Undocumented arbitrary values (`/[0.03]`, `/[0.10]`, `/[13%]`, etc.) | NEVER USE — add the pattern to the registry first or choose an existing token |

If your use case is not on the scale, add it to `pattern-registry.md`
with a rationale, THEN implement.

### 3. Semantic tokens (NEVER raw colors)

Use `bg-primary`, `text-foreground`, `text-muted-foreground`,
`border-border`, etc.

NEVER use raw hex (`#fff`, `#121212`) or palette colors (`bg-zinc-400`,
`text-slate-300`) in `.tsx` UI code except documented third-party API
seams such as Clerk `appearance.variables`.

Enforcement: `components/theme-token-regression.test.tsx` blocks raw
palette regressions in selected high-risk components. Add new components
to this test when they expand the design surface and need token/opacity
coverage.

### 4. Component-system mandate

All interactive click targets MUST use the `<Button>` component
(standards.md § 2). Raw `<button>` is allowed only inside
`components/ui/` primitives and app-shell disclosure toggles per
Pattern Registry I-6.

DEBT-399 completed the cleanup of existing bypass sites.

### 5. Dark-mode strategy

Semantic tokens handle light/dark automatically. Component-specific
`dark:` overrides are allowed ONLY when they appear in
`pattern-registry.md` or `contrast-policy.md`. If the same dark
override appears in 2+ components, promote it into a shared primitive
or a constant in `lib/shared-styles.ts`.

---

## Discoverability rule

If you cannot find a pattern documented in the design docs above, do
not invent one. Either:

(a) Add it to `pattern-registry.md` with rationale and design review,
    THEN implement.

(b) File a debt doc proposing the addition and link it from
    `docs/debt/index.md`.

NEVER ship a one-off pattern that diverges from the documented system
without a corresponding doc entry.
```

This is the single highest-leverage edit in this debt cycle. With it, every future agent editing `app/**` or `components/**` will have the design system in loaded context.

### PR 2 — `docs/frontend/standards.md` "For AI Agents" preamble

Branch: `feat/debt-398-pr-2-standards-md-agent-preamble`

Add near the top of `docs/frontend/standards.md`, after the existing
introductory "See also" list and before the horizontal rule / table of
contents. The preamble must stay before § 1 so agents see the binding
context before the token rules:

```markdown
## For AI Agents (Claude Code, Cursor, Codex, etc.)

This document is **authoritative**. Claude Code loads the matching
gateway summary from `.claude/rules/frontend.md` whenever it edits
files in `app/**` or `components/**`; general agent guidance in
`AGENTS.md` also points AI coding agents here. Do NOT skip it. Do NOT
invent patterns.

When making a UI change:

1. **Read this document first.** It is the source of truth for tokens,
   focus rings, spacing, typography, and component-system mandates.
2. **Check `pattern-registry.md`** for opacity scales, foreground ramps,
   dark-mode rules.
3. **Check `contrast-policy.md`** if your change involves foreground or
   background pair choices.
4. **If the pattern you need does not exist here, add it to
   `pattern-registry.md` first** (with rationale and design review),
   THEN implement in code.

Violations should be caught at code review. DEBT-398 PR 3 ships the
regression-test enforcement that will make CI catch new violations
automatically. See `.claude/rules/frontend.md` for the mandatory
pattern enforcement summary.
```

Pure doc edit. No code changes. The point is to signal to any agent that does find the doc (even without the `.claude/rules/frontend.md` gateway) that it is binding.

### PR 3 — Enforcement layer: expanded regression test + optional lint/script gate

Branch: `feat/debt-398-pr-3-regression-test-enforcement`

This PR adds the automated enforcement that makes the documented system actually enforceable. Two artifacts:

1. **Expand `components/theme-token-regression.test.tsx`** (preferred first enforcement layer because Vitest is already in the default gate) to add source-scan enforcement alongside the existing render/contrast assertions:
   - Scan production UI source files only: `app/**/*.tsx` and `components/**/*.tsx`, excluding `*.test.tsx`, `*.browser.spec.tsx`, `**/*test-helpers.tsx`, `**/*.probes.tsx`, and `components/ui/**` for raw-button enforcement. Use the already-installed `fast-glob` dependency plus `readFileSync`; do not shell out to `rg` from Vitest.
   - Fail on any new raw `<button>` outside `components/ui/**`. Permanent allowlist: `components/mobile-nav.tsx` because Pattern Registry I-6 documents app-shell disclosure toggles as a raw-button exception when the exact hover/focus treatment and `aria-label` / `aria-expanded` / `aria-controls` are present. The original temporary DEBT-399 allowlist covered `app/(app)/app/shared/components/session-breakdown-list.tsx`, `app/(app)/app/history/components/history-sessions-tab.tsx`, and `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx`; DEBT-399 PR 3 removed those three temporary exemptions when it migrated the sites.
   - Fail on new undocumented opacity-bearing Tailwind classes. The scanner should compare exact token occurrences against an allowlist sourced from `pattern-registry.md`, and any allowlist entry that is not globally valid must include the expected file/context. This is necessary because documented foreground-ramp values are context-bound, while values like `hover:bg-foreground/[0.03]` are invalid even though Tailwind can compile them.
   - The documented foreground-ramp/background values that must NOT false-positive are: muted/layer-2 scale `/20`, `/40`, `/50`; exception-only `/60` only when an explicit Pattern Registry entry and test allowlist entry are added in the same PR; reserved `/80` and `/100` must not be allowed for hover. Foreground-ramp patterns currently documented include `bg-foreground/5`, `bg-foreground/[0.06]`, `bg-foreground/[0.07]`, `bg-foreground/[0.08]`, `hover:bg-foreground/[0.06]`, `hover:bg-foreground/[0.08]`, `hover:bg-foreground/[0.12]`, `dark:hover:bg-foreground/[0.05]`, `dark:bg-foreground/[0.12]`, `dark:bg-foreground/20`, `text-foreground/60`, `text-foreground/80`, `hover:text-foreground/80`, `border-foreground/20`, `border-foreground/40`, `border-foreground/50`, `hover:border-foreground/55`, `dark:border-foreground/40`, `dark:border-foreground/60`, `dark:border-foreground/70`, `dark:hover:border-foreground/50`, and `dark:hover:border-foreground/70` in their documented contexts (`S-2`, `I-1`, `I-2`, `I-3`, `I-4`, `I-6`, `L-4`, `F-7`, `M-1`, `M-4`, and button/input/select primitives).
   - Existing undocumented opacity divergences had to be explicit temporary DEBT-399 exceptions, not silent allowlist entries: `hover:bg-muted/20` in `session-breakdown-list.tsx` and `exam-review-view.tsx`, `divide-border/20` / `dark:divide-foreground/20` in `session-breakdown-list.tsx`, and `border-border/30` / `dark:border-foreground/10` in `history-sessions-tab.tsx`.
   - Add small helper-level assertions that prove the scanner fails on synthetic violations (`<button type="button">`, `hover:bg-foreground/[0.03]`, and `bg-muted/[13%]`) and passes documented examples (`hover:bg-foreground/[0.12]` in an I-2 context and `dark:hover:bg-foreground/[0.05]` in an I-3 context). Do not require committed fixture files.
   - Document in the test file: "Add new source-scan allowlist entries only when the Pattern Registry documents the pattern; temporary DEBT-399 exemptions must shrink."

The test should be runnable as part of the default `pnpm test --run` gate so CI fails on regressions.

2. **Optional lint/script gate decision** — current audit result: ship the Vitest scan first. `eslint-plugin-tailwindcss@3.18.3` exists and advertises Tailwind v4 peer compatibility, but this repo uses Biome rather than ESLint and installing ESLint solely for one Tailwind rule is out of scope. Biome 2 supports GritQL linter plugins for JavaScript/CSS, but no repo plugin is installed and a robust TSX class-token allowlist in GritQL would be more speculative than the explicit Vitest scanner. Tailwind v4 itself does not provide an official project-specific arbitrary-opacity allowlist gate. File a separate P3 follow-up only if the Vitest source scan proves too slow or too noisy.

The expanded regression test alone is acceptable as the first enforcement layer if it blocks the documented regression classes and lives in the default `pnpm test --run` gate. File a separate P3 follow-up only if a true lint-layer gap remains after that test exists.

---

## Acceptance Criteria

PR 1 done when:

- `.claude/rules/frontend.md` contains the "Canonical UI Patterns" section with cross-references to all six canonical design docs.
- A grep of the new file finds explicit mentions of `standards.md`, `pattern-registry.md`, `contrast-policy.md`, `design-principles.md`, `typography-policy.md`, and `bookmark-surface-policy.md`.
- The five mandatory pattern sections are present and grep-locatable.

PR 2 done when:

- `docs/frontend/standards.md` has the "For AI Agents" preamble at the top.
- The preamble is explicit that the doc is authoritative.
- The preamble references `.claude/rules/frontend.md` as the shipped path-scoped gateway summary.
- The preamble accurately states that CI enforcement lands in PR 3, not in PR 2.

PR 3 done when:

- An automated check exists in `components/theme-token-regression.test.tsx` that fails on undocumented opacity-bearing Tailwind classes while allowlisting documented Pattern Registry values only in their documented contexts.
- An automated check exists that fails on new raw `<button>` outside `components/ui/`, while preserving the permanent `components/mobile-nav.tsx` I-6 exception and the three temporary DEBT-399 exemptions.
- The check is part of the default `pnpm test --run` or `pnpm lint` gate.
- Helper-level tests or a documented scratch proof confirm the scanner fails when violation patterns are introduced (`<button type="button">`, `hover:bg-foreground/[0.03]`, `bg-muted/[13%]`) and passes documented Pattern Registry examples.

---

## Risk and Reversibility

- **PR 1 (frontend.md gateway)** — zero risk. Doc-only. Reversion is a single revert.
- **PR 2 (standards.md preamble)** — zero risk. Doc-only.
- **PR 3 (enforcement)** — low-to-medium risk. The regression test may catch existing violations that were not in the audit. Current pre-execution sweep confirms four production raw-button files outside `components/ui/**`: the permanent `components/mobile-nav.tsx` I-6 exception plus the three DEBT-399 cleanup sites. Current opacity sweep confirms known DEBT-399 divergences (`hover:bg-muted/20`, `divide-border/20`, `dark:divide-foreground/20`, `border-border/30`, `dark:border-foreground/10`) that must be temporary DEBT-399 exemptions if PR 3 ships before DEBT-399 cleanup. That sequencing is intentional: ship PR 3 first with explicit shrinking exemptions so CI blocks new drift immediately, then remove the exemptions as DEBT-399 lands. The enforcement must not fail on documented Pattern Registry foreground-ramp values.

---

## Done When

All three PRs merged to `dev` and synced to `main`. A new agent editing `app/**` or `components/**` will have the design system in loaded context via the gateway in `.claude/rules/frontend.md`. The `docs/frontend/standards.md` doc has the "For AI Agents" preamble. The enforcement layer fails CI on new violations. DEBT-398 doc archived to `docs/_archive/debt/` with resolution paragraph naming all three PRs.

The cumulative drift loop ("AI generates code that matches drifted neighbors, amplifying drift") is broken — agents now have the documented system in context AND the enforcement layer catches regressions immediately.
