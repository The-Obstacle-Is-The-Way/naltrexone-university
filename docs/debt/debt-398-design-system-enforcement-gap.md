# DEBT-398: Design System Enforcement Gap

**Priority:** P1 (the design system documented in `docs/frontend/` exists but is functionally optional — agents and contributors do not auto-load it during code generation, no lint rule blocks the most common violations, and the result is a steady drip of "AI-generated code that looks right but bypasses the documented system." This is the meta-debt that produces DEBT-399 and amplifies the small individual violations into a cumulative aesthetic and maintenance drift.)
**Created:** 2026-05-26
**Source:** Deep documentation-gap audit conducted alongside DEBT-394 archival. The audit catalogued every existing doc, identified that `.claude/rules/frontend.md` is 58 lines and does not cross-reference `docs/frontend/standards.md` or `pattern-registry.md`, and traced four recent incidents (PR #342 env leak, PR #328 selector brittleness, PR #350 Zod fixtures, design system drift) back to the same root cause: docs exist as aspiration, agents don't load them, no enforcement layer catches violations.
**Related:** [.claude/rules/frontend.md](../../.claude/rules/frontend.md) (currently 58 lines, too thin), [docs/frontend/standards.md](../frontend/standards.md), [docs/frontend/pattern-registry.md](../frontend/pattern-registry.md), [docs/frontend/contrast-policy.md](../frontend/contrast-policy.md), [docs/frontend/design-principles.md](../frontend/design-principles.md), [DEBT-399](./debt-399-component-system-bypass-cleanup.md) (the visible symptom this debt addresses at root)

**Status:** Active

---

## Problem

The repo has a documented design system at `docs/frontend/`:

- `standards.md` — semantic tokens (NEVER raw hex), Button component mandate, single canonical focus-ring pattern (`focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`), spacing, typography, dark mode strategy.
- `pattern-registry.md` — canonical opacity scale (`/20`, `/40`, `/50`, `/60`, `/80` reserved, `/100` reserved), foreground ramp tokens, dark-mode override conventions.
- `contrast-policy.md` — WCAG AA contrast targets.
- `design-principles.md` — layout composition, navigation zones.
- `typography-policy.md` — explicit text-size choices (no implicit inheritance).
- `bookmark-surface-policy.md` — bookmark appearance decision tree.

These documents are intentional, careful, and authoritative IF READ. The problem is that NOTHING in the toolchain ensures they get read at code-generation time.

### Why the documented system is not enforced

1. **Agents load `CLAUDE.md`, `AGENTS.md`, and path-scoped `.claude/rules/*.md` files automatically.** They DO NOT load `docs/frontend/*` automatically. So when an agent generates a new component, the agent is operating with general testing rules, general git workflow, general architecture — but with no design-system context.

2. **`.claude/rules/frontend.md` is 58 lines** and does not cross-reference `standards.md` or `pattern-registry.md`. It covers routing, shadcn, and error-state patterns, but nothing about tokens, focus rings, opacity scale, or design system discoverability.

3. **No lint rule enforces token usage.** Biome lints code style; it does not block `bg-foreground/[0.06]` arbitrary values vs canonical `/20`, `/40`, `/50`. No `eslint-plugin-tailwindcss-only-allowed-classes` or equivalent is installed.

4. **`components/theme-token-regression.test.tsx` exists** as the single mentioned enforcement guard, but its coverage is narrow (referenced once in `standards.md` line 69) and it is not part of any documented rule that would tell an agent to extend it when adding a new component.

5. **No CI gate fails on design-system violations.** Full local gate runs typecheck + lint + test + build, none of which interrogate Tailwind class usage against the design-system contract.

The cumulative effect is exactly what you'd predict: code that "fits the surrounding style" (i.e., perpetuates whatever drift is in adjacent files) but does not consult the canonical design system. Each generation adds incremental drift. Each drift makes the next "fits the surrounding style" generation worse.

---

## Findings

### A. `.claude/rules/frontend.md` does not gateway to the design system

The current 58-line file covers route constants, shadcn primitive usage, and error-state patterns. It does NOT:

- Reference `standards.md` (the canonical token + focus-ring + spacing rules).
- Reference `pattern-registry.md` (the canonical opacity scale + foreground ramp).
- Reference `contrast-policy.md` (the WCAG AA rules).
- Reference `theme-token-regression.test.tsx` (the existing enforcement test).
- Mandate "READ docs/frontend/standards.md BEFORE designing a new component."

An agent loaded with this rule has no path to discover the design system.

### B. The design docs do not flag themselves as agent-loadable

`docs/frontend/standards.md` reads as a human reference document. It does not have a "For AI Agents" preamble that says "this document IS authoritative; do not skip it; do not invent patterns." An agent that DOES happen to find the doc has no signal that it is binding.

### C. No automated enforcement of token / opacity / focus-ring discipline

Searching the codebase:

- 26 instances of the exact canonical focus-ring string (`focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`) exist in component code. Each is correct, but each is a copy-paste — there is no Tailwind utility `.focus-ring` and no shared constant in `lib/shared-styles.ts`. Any future change to the canonical pattern requires editing 26 places across 19 files. (See DEBT-399 for the proposed fix.)
- Arbitrary opacity values (`/[0.06]`, `/[0.08]`, `/[0.12]`) appear in component code that bypasses the `pattern-registry.md` § 1.2 scale. (See DEBT-399 for the fix.)
- `theme-token-regression.test.tsx` exists but its scope is opaque from outside (not referenced in any rule file).

### D. The "looks right but isn't" amplification loop

When an agent generates a new component, the most likely behavior is:

1. Read the surrounding component files for stylistic patterns.
2. Match those patterns in the new code.
3. Submit for review.

If the surrounding components contain the canonical pattern, the new code is correct. If the surrounding components contain drift (e.g., `bg-foreground/[0.06]`), the new code inherits the drift. AI-generated code therefore amplifies existing drift faster than humans introduce it, because humans occasionally re-read the design docs while agents typically do not.

The result: even with good design docs and good intentions, the codebase drifts toward the median pattern of nearby code rather than toward the documented standard.

### E. Documentation gap incident map

The audit traced four specific recent incidents to documentation gaps. Three are addressed by other debt docs (DEBT-395, DEBT-396, DEBT-400). The fourth — design-system drift — is what THIS debt addresses:

| Incident | Cause | Addressed by |
|---|---|---|
| PR #342 env leak | `.claude/rules/testing.md` silent on env isolation | DEBT-395 |
| PR #328 selector brittleness | `.claude/rules/testing-react19.md` doesn't explain WHY | DEBT-396 |
| PR #350 fixture drift | No rule on schema-aware fixtures | DEBT-400 |
| Design system drift | `.claude/rules/frontend.md` doesn't gateway to design docs; no enforcement | **DEBT-398 (this doc)** |

---

## Why Existing Docs Were Not Enough

The design docs exist. They are reasonable. The gap is that they are TREATED AS REFERENCE rather than treated as loaded rules. The mechanism to bridge that gap is:

1. **Cross-reference from `.claude/rules/frontend.md`** so the design docs get pulled into agent context when frontend work is in progress.
2. **Add a "For AI Agents" preamble** to `docs/frontend/standards.md` so the doc itself signals it is authoritative when an agent does find it.
3. **Install an enforcement layer** (lint rule, CI gate, expanded regression test) so violations fail loudly rather than silently passing.
4. **Extract shared utilities** for the most-duplicated patterns (focus ring) so the design system has a single SOURCE rather than 42 copies.

Each of these is small. The combination is what makes the design system actually a system.

---

## Required Remediation

Ship in three single-concern PRs.

### PR 1 — `.claude/rules/frontend.md` Gateway expansion

Branch: `docs/debt-398-frontend-rule-gateway`

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
| `/[0.06]`, `/[0.08]`, `/[0.12]`, etc. | NEVER USE — arbitrary values bypass the scale |

If your use case is not on the scale, add it to `pattern-registry.md`
with a rationale, THEN implement.

### 3. Semantic tokens (NEVER raw colors)

Use `bg-primary`, `text-foreground`, `text-muted-foreground`,
`border-border`, etc.

NEVER use raw hex (`#fff`, `#121212`) or palette colors (`bg-zinc-400`,
`text-slate-300`).

Enforcement: `components/theme-token-regression.test.tsx` blocks raw
palette usage. Add new components to this test if they use foreground
colors or hover effects.

### 4. Component-system mandate

All interactive click targets MUST use the `<Button>` component
(standards.md § 2). Raw `<button>` is allowed only inside
`components/ui/` primitives and app-shell disclosure toggles per
Pattern Registry I-6.

See DEBT-399 for the active cleanup of existing bypass sites.

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

Branch: `docs/debt-398-standards-agent-preamble`

Add at the top of `docs/frontend/standards.md` (before § 1):

```markdown
## For AI Agents (Claude Code, Cursor, Codex, etc.)

This document is **authoritative** and is loaded into your context via
`.claude/rules/frontend.md` whenever you edit files in `app/**` or
`components/**`. Do NOT skip it. Do NOT invent patterns.

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

Violations are caught at code review and CI. Merging without
conformance means rework. See `.claude/rules/frontend.md` for the
mandatory pattern enforcement summary.
```

Pure doc edit. No code changes. The point is to signal to any agent that does find the doc (even without the `.claude/rules/frontend.md` gateway) that it is binding.

### PR 3 — Enforcement layer: lint rule + expanded regression test

Branch: `tools/debt-398-design-system-enforcement`

This PR adds the automated enforcement that makes the documented system actually enforceable. Two artifacts:

1. **Lint rule for arbitrary Tailwind opacity values** — research the right tool. Options:
   - `eslint-plugin-tailwindcss` rule `no-arbitrary-value` (or similar) configured to disallow `\/\[0\.\d+\]`, `\/\[\d+%\]` patterns.
   - Biome custom rule (Biome supports custom rules via plugin API as of 2.x).
   - A bespoke shell script in `.husky/pre-push` that greps for arbitrary opacity patterns in `app/**/*.tsx` and `components/**/*.tsx` and fails if found outside an allowlist.
   - Pick the option that fits the existing toolchain — Biome is the active linter, so prefer the Biome route if a plugin exists.

2. **Expand `components/theme-token-regression.test.tsx`** to cover:
   - All raw `<button>` usages outside `components/ui/` (fails if a new one is added).
   - Arbitrary opacity values matching `/\/\[0\.\d+\]/` or `/\/\[\d+%\]/` patterns (fails if a new one is added).
   - Documented in the test file: "Add new components here when extending the design surface."

The test should be runnable as part of the default `pnpm test --run` gate so CI fails on regressions.

If neither lint approach is feasible in one PR, the expanded regression test alone is acceptable as the enforcement layer — file the lint rule as a P3 follow-up.

---

## Acceptance Criteria

PR 1 done when:

- `.claude/rules/frontend.md` contains the "Canonical UI Patterns" section with cross-references to all five design docs.
- A grep of the new file finds explicit mentions of `standards.md`, `pattern-registry.md`, `contrast-policy.md`.
- An agent loading the rule will see the five mandatory patterns.

PR 2 done when:

- `docs/frontend/standards.md` has the "For AI Agents" preamble at the top.
- The preamble is explicit that the doc is authoritative.
- The preamble references `.claude/rules/frontend.md` as the enforcement layer.

PR 3 done when:

- An automated check exists (lint rule OR expanded regression test OR both) that fails on arbitrary opacity values.
- An automated check exists that fails on new raw `<button>` outside `components/ui/`.
- The check is part of the default `pnpm test --run` or `pnpm lint` gate.
- A test confirms the check actually fails when the violation pattern is introduced (positive negative test).

---

## Risk and Reversibility

- **PR 1 (frontend.md gateway)** — zero risk. Doc-only. Reversion is a single revert.
- **PR 2 (standards.md preamble)** — zero risk. Doc-only.
- **PR 3 (enforcement)** — low-to-medium risk. The regression test or lint rule may catch existing violations that were not in the audit. Failure mode is "test was green, now red on existing code." This is a feature (the violations should be visible), but it means PR 3 may need to ship alongside DEBT-399 PR 1 (component-system bypass cleanup) so the existing violations are fixed before the gate goes live. Sequence: ship DEBT-399 first OR mark the known violations as `// TODO(DEBT-399)` exclusions in the regression test temporarily.

---

## Done When

All three PRs merged to `dev` and synced to `main`. A new agent editing `app/**` or `components/**` will have the design system in loaded context via the gateway in `.claude/rules/frontend.md`. The `docs/frontend/standards.md` doc has the "For AI Agents" preamble. The enforcement layer fails CI on new violations. DEBT-398 doc archived to `docs/_archive/debt/` with resolution paragraph naming all three PRs.

The cumulative drift loop ("AI generates code that matches drifted neighbors, amplifying drift") is broken — agents now have the documented system in context AND the enforcement layer catches regressions immediately.
