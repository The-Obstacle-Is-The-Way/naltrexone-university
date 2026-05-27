# DEBT-399: Component-System Bypass Cleanup

**Priority:** P2 (concrete violations of the documented "all interactive click targets MUST use `<Button>`" rule from `docs/frontend/standards.md` § 2. Two known production-code raw `<button>` sites reinvent the Button component's focus-ring + disabled-state or hover behavior inline, and one history disclosure button is not covered by the current Pattern Registry I-6 app-shell exception unless the registry is extended. The 26 exact focus-ring copies across 19 files are correct-values-but-copy-paste, which means any future change to the canonical pattern requires editing 19+ files. This is the visible symptom of the meta-debt described in DEBT-398.)
**Created:** 2026-05-26
**Source:** Deep design-system audit conducted alongside DEBT-394 archival. Verified against the documented rules in `docs/frontend/standards.md` and `docs/frontend/pattern-registry.md`. The audit found three production raw `<button>` sites: two clear Button bypasses with manual focus-ring styling, plus one history disclosure toggle that has the required `aria-label` / `aria-expanded` / `aria-controls` attributes but is not an app-shell I-6 exception today. It also found 26 instances of the exact canonical focus-ring string across 19 files with no shared extraction, or 33 broader instances when counting the Button/Input/Select primitives, alternate ordering with `focus-visible:border-ring`, extra review/practice focus-ring consumers, and the `focus-within` variant.
**Related:** [docs/frontend/standards.md](../frontend/standards.md) (§ 2 Button mandate, § 3 focus-ring single canonical pattern), [docs/frontend/pattern-registry.md](../frontend/pattern-registry.md) (I-6 disclosure toggle pattern), [components/ui/button.tsx](../../components/ui/button.tsx), [DEBT-398](./debt-398-design-system-enforcement-gap.md) (the root meta-debt that allowed these violations to accumulate)

**Status:** Active

---

## Problem

`docs/frontend/standards.md` § 2 mandates: "All interactive click targets MUST use the `<Button>` component." § 3 mandates: "ONE canonical focus ring pattern: `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`." Pattern Registry I-6 carves out a narrow exception for app-shell disclosure toggles.

The current code violates both rules in two distinct ways:

1. **Three production raw `<button>` sites need cleanup decisions.** Two are clear Button bypasses with hand-rolled className strings that reinvent Button's focus ring, hover state, and disabled behavior. The history-session disclosure toggle has correct ARIA wiring, but it is not an app-shell control and does not match I-6's exact hover/focus treatment, so it must either migrate to `<Button>` or receive a dedicated Pattern Registry entry.

2. **The exact canonical focus-ring string appears 26 times across 19 files** in component code (33 broader instances if you also count related Button/Input/Select primitive classes, alternate ordering with `focus-visible:border-ring`, extra review/practice focus-ring consumers, and the `focus-within` variant in `choice-button.tsx`). Each occurrence is correct (matches the documented pattern), but each is a copy-paste. There is no shared Tailwind utility `.focus-ring`, no constant in `lib/shared-styles.ts`, and no broad extraction (one local `focusVisibleRing` constant exists in `components/app-desktop-nav.tsx:10-11` and is used only within that file). Any future change to the canonical pattern requires editing 19+ files. Each new component that needs focus-ring carries the risk of typo, drift, or subtle variation (`ring-[2px]` instead of `ring-[3px]`, `ring-ring/40` instead of `ring-ring/50`).

The combination means the design system is documented but functionally optional, and the cumulative copy-paste makes future enforcement (DEBT-398) harder than it should be.

---

## Findings

### A. Raw `<button>` cleanup decisions (3 production sites)

**Site 1 (HIGH severity): `app/(app)/app/shared/components/session-breakdown-list.tsx:39-49`**

Raw `<button type="button">` with className bundle:

```tsx
className="-mx-2 flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left font-medium text-foreground transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50"
```

This duplicates:
- Button's focus-ring pattern (documented canonical: `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`)
- Button's disabled state (documented canonical: `disabled:pointer-events-none disabled:opacity-50`)
- Button's hover transition (`transition-colors`)
- A custom hover bg (`hover:bg-muted/20` — note: this opacity is LIGHTER than `pattern-registry.md` § 1.2 § I-2 guidance, which says `/40` for in-card and `/50` for on-page; see Finding C)

The component should use `<Button variant="ghost">` (or a new variant if no existing one fits) with the layout classes preserved.

**Site 2 (MEDIUM): `app/(app)/app/history/components/history-sessions-tab.tsx:226-235`**

Raw `<button>` for disclosure toggle. The current implementation includes the required accessible disclosure wiring (`aria-label`, `aria-expanded`, and `aria-controls`), but Pattern Registry I-6 only permits raw `<button>` for app-shell disclosure controls when the exact I-6 focus/hover treatment is present. This history-row disclosure is not app shell and does not use I-6's hover treatment, so it is not registry-acceptable solely by I-6. Resolve by either migrating to `<Button variant="ghost" size="icon">` with equivalent layout, or by adding a dedicated history-row disclosure-toggle pattern to `pattern-registry.md` with rationale.

**Site 3 (MEDIUM): `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:214`**

Raw `<button>` with manual focus ring classes inline. Same shape as Site 1 — duplicates Button internals. Use `<Button>` with appropriate variant.

### B. 26 instances of the canonical focus-ring string repeated across 19 files

Verify with:

```sh
rg -c "focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-\[3px\]" app/ components/
```

The 19 files (with occurrence counts) per the audit:
- `components/mobile-nav.tsx` (3)
- `components/marketing/marketing-layout.tsx` (2)
- `app/pricing/pricing-view.tsx` (2)
- `app/(app)/app/dashboard/page.tsx` (2)
- `app/(app)/app/shared/components/session-breakdown-list.tsx` (2)
- `app/(app)/app/history/components/history-sessions-tab.tsx` (2)
- `app/layout.tsx` (1, skip-link)
- `components/app-desktop-nav.tsx` (1, extracted as `focusVisibleRing` const at lines 10-11 but used only within this file)
- `app/pricing/pricing-view-skeleton.tsx` (1)
- `components/ui/filter-chip.tsx` (1)
- `app/(app)/app/questions/[slug]/question-page-client.tsx` (1)
- `components/ui/tab-switch-styles.ts` (1)
- `app/(app)/app/layout.tsx` (1)
- `components/auth-nav.tsx` (1)
- `app/(app)/app/bookmarks/page.tsx` (1)
- `app/(app)/app/history/components/history-questions-tab.tsx` (1)
- `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` (1)
- `app/(app)/app/practice/components/practice-view.tsx` (1)
- `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx` (1)

The broader 33-instance family additionally includes the Button/Input/Select primitives, two extra review/practice focus-ring consumers, one alternate `focus-visible:border-ring` ordering in `exam-review-view.tsx`, and one `focus-within` variant in `components/question/choice-button.tsx`.

Each occurrence is CORRECT (matches the documented pattern), but each is a copy-paste. There is no canonical shared source. The partial extraction in `components/app-desktop-nav.tsx:10-11` (the `focusVisibleRing` constant) is the right shape but the wrong scope — it should be promoted to a shared location.

### C. Hover-opacity divergence from `pattern-registry.md` § 1.2

`app/(app)/app/shared/components/session-breakdown-list.tsx:58` uses `hover:bg-muted/20`. The pattern registry says non-card page-context rows should use `hover:bg-muted/50` or, for tonal rows, `hover:bg-foreground/[0.12]`. The `/20` choice is lighter than the documented scale and was not added to the registry as a new pattern with rationale.

This is fixable in the same PR that addresses Site 1 above — either:
- Adopt the registry pattern (`/50`)
- Or formally add the `/20` variant to `pattern-registry.md` § 1.2 with rationale (e.g., "list-row inside dashboard breakdown surface uses lighter hover to avoid competing with row content")

Don't ship a divergence without one of these two actions.

### D. Custom dark-mode opacities scattered without registry entry

`app/(app)/app/shared/components/session-breakdown-list.tsx:32` uses `dark:divide-foreground/20`. `app/(app)/app/history/components/history-sessions-tab.tsx:253` uses `dark:border-foreground/10`. Neither opacity (`/20`, `/10`) is in the nearest documented separator/border contracts: `pattern-registry.md` § 1.3 specifies `border-border`, `border-border/60`, `border-border/40`, and `dark:border-foreground/40`, while M-2 specifies `border-t border-border`, `/60`, or `/40` for content separators.

These are MEDIUM severity divergences. Either align to the documented scale or formally add the variants to the registry.

### E. Component file bloat

Two production component files exceed the 200-line "god component" guideline:

- `components/question/feedback.tsx` — 262 lines, handles correct/incorrect rendering, explanation tier system, references.
- `components/marketing/marketing-home.tsx` — 359 lines, composes hero, impact stats, features, CTA, pricing data.

These are component-architecture concerns rather than design-system enforcement concerns. They are out of scope for DEBT-399's component-system bypass cleanup. If their size proves to be an actual maintenance burden (vs. a "deep module" that earns its size per Ousterhout's discipline), file as a separate debt entry rather than bundling here.

---

## Why Existing Docs Were Not Enough

The Button mandate (`standards.md` § 2) exists. The focus-ring canonical pattern (`standards.md` § 3) exists. The opacity scale (`pattern-registry.md` § 1.2) exists. The dark-mode override scale (`pattern-registry.md` § 1.3) exists.

The gap is enforcement, not documentation. An agent or human author can introduce a raw `<button>` with a custom hover opacity and the code review (human OR CodeRabbit) is unlikely to flag it because:
- The change "looks fine" — colors are tokens, focus is present, transition is smooth.
- There is no automated rule failing on raw `<button>` outside `components/ui/`.
- There is no automated rule failing on arbitrary opacity values or off-scale opacities.
- The reviewer would have to manually compare the className string against `pattern-registry.md` § 1.2 to spot the `/20` divergence.

This debt is one half of the pair: DEBT-398 is the meta-debt (no enforcement); DEBT-399 is the visible symptom (existing violations). Both need to ship for the design system to actually be a system.

---

## Required Remediation

Ship in four single-concern PRs. Order matters: extract the shared utility FIRST so the migrations have something to migrate TO.

### PR 1 — Extract the canonical focus-ring as a shared utility

Branch: `feat/debt-399-pr-1-focus-ring-utility`

Use **Option A: Tailwind layer utility**. The pre-execution audit for this PR verified all of:

- `tailwindcss` and `@tailwindcss/postcss` are pinned to `4.3.0`.
- `app/globals.css` already uses the Tailwind v4 CSS-first entrypoint (`@import "tailwindcss";`) and an existing `@layer utilities` block.
- The local Tailwind 4.3 compiler accepts `@apply focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]` inside a custom `.ring-focus` utility.
- `lib/shared-styles.ts` is also a valid constant-export home, but using a CSS utility is the better fit for a visual design-system primitive and keeps PR 2's migration mechanical (`className="... ring-focus ..."`).

Add to `app/globals.css`:

```css
@layer utilities {
  .ring-focus {
    @apply focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px];
  }

  .ring-focus-within {
    @apply focus-within:outline-none focus-within:ring-ring/50 focus-within:ring-[3px];
  }
}
```

Then PR 2 can migrate existing call sites to `className="... ring-focus ..."` mechanically.

This PR ONLY adds the `.ring-focus` and `.ring-focus-within` utilities. It does NOT migrate existing sites and does NOT edit `components/theme-token-regression-source-scan.ts` or `components/theme-token-regression.test.tsx`; the DEBT-398 PR 3 enforcement gate covers raw-button and opacity drift, not focus-ring extraction. Existing-site migrations happen in PR 2.

### PR 2 — Migrate the 26 exact focus-visible occurrences plus the 1 focus-within occurrence to shared utilities

Branch: `refactor/debt-399-focus-ring-migration`

Mechanical sweep. For each of the 26 focus-visible sites across 19 files and the 1 focus-within site in `components/question/choice-button.tsx` (run the grep from Finding B for the authoritative list):

- Replace the literal `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]` with `ring-focus`.
- Replace the literal `focus-within:outline-none focus-within:ring-ring/50 focus-within:ring-[3px]` with `ring-focus-within`.
- Delete the local `focusVisibleRing` const in `components/app-desktop-nav.tsx` once the local usages are migrated.

After the sweep:

```sh
rg -c "focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-\[3px\]" app/ components/ -g "*.tsx" -g "*.ts"
```

Should return ZERO (or only the chosen single canonical source).

A grep for the focus-within literal should also return ZERO after `components/question/choice-button.tsx` migrates to `ring-focus-within`.

Full local gate including browser tests. The visual output must be byte-identical — this is pure refactor.

### PR 3 — Refactor the raw `<button>` bypasses and resolve the history disclosure toggle

Branch: `refactor/debt-399-button-component-migration`

For each site:

1. **`session-breakdown-list.tsx:39-49`** — replace raw `<button>` with `<Button variant="ghost">` (or a new variant if `ghost` doesn't capture the layout). Preserve layout classes (`-mx-2 flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left font-medium`). Drop the manual focus-ring, disabled, transition classes — Button provides them. Decide the hover opacity:
   - If `pattern-registry.md` § 1.2 scale matches the design intent: use `/50` or `/40` per registry.
   - If the divergent `/20` is intentional: ship a parallel small PR to add the variant to `pattern-registry.md` § 1.2 with rationale, then use the new registry-defined value.

2. **`history-sessions-tab.tsx` disclosure toggle** — the current code already has `aria-label`, `aria-expanded`, and `aria-controls`, but it is not an app-shell I-6 exception and does not use I-6's hover treatment. Either migrate it to a Button-based disclosure control or add a dedicated Pattern Registry entry for this row-disclosure pattern with rationale.

3. **`exam-review-view.tsx` raw `<button>`** — migrate to `<Button>` with appropriate variant. Same logic as Site 1.

For each migrated site, visually verify in browser (light + dark) that the rendered output is functionally equivalent. Use the agent-browser MCP if convenient, or local dev server + manual inspection.

Full local gate including E2E (these are user-interactive surfaces).

### PR 4 — Fix dark-mode opacity divergences (Finding D)

Branch: `style/debt-399-dark-mode-opacity-alignment`

Two divergent sites:

- `session-breakdown-list.tsx:32` — `dark:divide-foreground/20`
- `history-sessions-tab.tsx:253` — `dark:border-foreground/10`

For each: choose to align with `pattern-registry.md` § 1.3 (`/40`, `/60`, or full) OR to add the variant to the registry with rationale. Ship the choice.

This PR is lower priority — visual divergence is small, but the discipline matters. If scope pressure, defer this PR and document the divergence in DEBT-399 archive resolution as "left as-is, registry exception accepted."

---

## Out of Scope (file separately if pursued)

- **`feedback.tsx` / `marketing-home.tsx` line-count concerns (Finding E)** — out of scope for this debt. File as a separate debt entry if the maintenance burden ever justifies action; for now they are not blocking design-system enforcement.

- **`theme-token-regression.test.tsx` expansion** — covered by DEBT-398 PR 3. This debt's PRs may need to wait for that enforcement test to land OR file `// TODO(DEBT-399 PRs N)` exclusions in the test temporarily.

---

## Acceptance Criteria

PR 1 done when:

- Tailwind utilities `.ring-focus` and `.ring-focus-within` exist in `app/globals.css` and apply the exact canonical focus-ring patterns: `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]` and `focus-within:outline-none focus-within:ring-ring/50 focus-within:ring-[3px]`.
- The existing `.claude/rules/frontend.md` focus-ring mandate still names the canonical pattern; no rule-file update is required until PR 2 starts migrating usage to `.ring-focus`.
- The unit / browser tests pass with the utility in place but not yet adopted.

PR 2 done when:

- A grep of `app/` and `components/` for the literal canonical focus-ring string returns ZERO sites (or only the single canonical source).
- The visual output is byte-identical to pre-PR (no design regressions).
- Full local gate green including `pnpm test:browser`.

PR 3 done when:

- The two clear raw `<button>` bypasses are migrated to `<Button>`, and the history disclosure toggle is either migrated to `<Button>` or documented as a dedicated Pattern Registry exception.
- Visual parity verified in light + dark, desktop + mobile.
- Full local gate green including E2E.

PR 4 done when:

- The two dark-mode opacity divergences are either aligned to registry or the registry is extended with rationale.

---

## Risk and Reversibility

- **PR 1 (utility extraction)** — zero risk. Additive.
- **PR 2 (focus-ring migration)** — low risk. Pure refactor; visual output identical. Browser-mode tests catch regressions.
- **PR 3 (button migration)** — medium risk. Visual output may shift slightly because Button has its own variant defaults that differ from the raw inline styling. Mitigation: visual verification (light + dark, desktop + mobile) before merge.
- **PR 4 (dark-mode alignment)** — low risk. Visual change is small and bounded.

All four PRs independently revertable.

---

## Done When

All four PRs merged to `dev` and synced to `main`. The grep for `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-\[3px\]` returns one canonical source (or zero if the Tailwind utility approach). Raw `<button>` count outside `components/ui/` and registry-documented exceptions is zero. Dark-mode opacities align with `pattern-registry.md` § 1.3 or are documented as new registry entries. DEBT-399 doc archived to `docs/_archive/debt/` with resolution paragraph naming all four PRs.

Combined with DEBT-398's enforcement layer, the design system is now both documented AND enforced — future drift gets caught at lint / CI time rather than accumulating until the next manual audit.
