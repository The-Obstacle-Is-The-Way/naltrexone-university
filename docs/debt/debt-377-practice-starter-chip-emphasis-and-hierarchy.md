# DEBT-377 — Practice starter: chip chrome dominance + shape mismatch

**Status:** Open — implementation spec, awaiting audit + grade
**Severity:** P3 (cosmetic / hierarchy polish; observed friction, no functional break)
**Owner:** TBD
**Filed:** 2026-05-03
**Surface:** `app/(app)/app/practice` — `PracticeSessionStarter` ("Start a session" card)

**Audit verdict #1 (2026-05-03, SHA `39961e03`):** Refined after source/design-system audit. Corrected the FilterChip test-impact description, added adjacent prior-debt context (DEBT-292 / DEBT-296 / DEBT-297 / DEBT-298), tightened the design-system reassurance, resolved open design questions inline.

**Audit verdict #2 (2026-05-03, SHA `b3813de9` → V1 redirect):** Recommendation pivoted from font-weight tweak to a chrome-and-shape fix after visual exploration in Claude Design surfaced V1 ("Borderless tonal + rounded-md") as the actual answer. Diagnosis evolved through three iterations — font-weight → font-size → chrome density — and landed on **the chip's per-chip border and `rounded-full` shape** as the dominant levers, with text dimming as a supporting de-emphasis. Recommendation is now Option α = V1.

**Audit verdict #3 (2026-05-03, SHA `30c1c679`):** Refined after V1 source/design-system audit. Corrected the exact production diff to remove the stale border-color focus token (`focus-visible:border-ring`) when the `border` utility is removed, replaced the inaccurate "remove FilterChip from required-boundaries" instruction with the actual Contrast Policy update (rewrite the existing supplementary-fill row), added the missing Standards hover-pattern and Pattern Registry summary-table sync, recorded computed V1 text/fill contrast ratios, and made the light-mode fill fallback an explicit visual-QA decision rule.

---

## TL;DR

The chips in the "Start a session" card visually dominate the form because of their **chrome**, not their typography. Each unselected chip wraps itself in a 1px border, a fill, and a `rounded-full` pill shape, while every other interactive control on the same card (Tutor/Exam, Unanswered/Incorrect/Bookmarked, All/Easy/Medium/Hard) is borderless inside a shared frame and uses `rounded-md` corners. That visual mismatch — combined with full-strength chip text — is what makes ~28 chips outshout the labels and the SegmentedControls.

The fix is three coordinated changes to `components/ui/filter-chip.tsx`:

1. **Drop the per-chip border.** Identification via fill + cursor + hover + focus ring + `aria-pressed` (same model as dashboard rows / I-1 tonal-fill variant).
2. **Square the corners.** `rounded-full` → `rounded-md` to match the rest of the card's shape vocabulary.
3. **Dim the unselected text.** `text-foreground` → `text-foreground/80`, with `hover:text-foreground` restoring full strength on hover. Selected chips keep full-strength `text-primary-foreground` on `bg-primary`.

Selected chips become *more* distinct from unselected chips after this change, not less, because the dim/full asymmetry reinforces the bg-primary pop.

---

## Primary concern (per user, foregrounded)

> *"Do you see the differences in the chip button fonts and how it's different on the hierarchy of the pages? It almost seems too emphasized according to the image. My primary concern on this piece of debt."*
>
> *"Biggest notable change is the losing the border and then changing the shape."*

The user-foregrounded diagnosis evolved through this thread:
1. First framing — "the chip text is too emphasized." Doc landed on `font-medium` → `font-normal`.
2. Second framing — "do the chips have bigger font than Tutor/Exam/Unanswered?" Verified mechanically: **identical 14px / weight 500**. Eyes were tricked by container, not size.
3. Third framing — "maybe it's the padding and spacing within the pill." Verified mechanically: chip padding (`px-3 py-1.5`) is actually **smaller** than SegmentedControl item padding (`px-4 py-2`). Eyes were tricked by chrome (border + shape), not pad.
4. Final framing (after Claude Design V1 visual exploration) — **drop the border, square the corners, recede the unselected text.**

The chip dominance is real; the cause is chrome density and shape mismatch, not typography.

---

## Evidence

### What I verified mechanically

- **Font size and weight are identical** across section labels, SegmentedControl items, and chips: all `text-sm font-medium` = 14px / 500. Source: `practice-session-starter.tsx:122,141,166,187,238`, `tab-switch-styles.ts:16`, `filter-chip.tsx:23`.
- **Chip padding is smaller than SegmentedControl item padding**: chip `px-3 py-1.5` vs SegmentedControl item `px-4 py-2`. Chip is the more compact element.
- **The chip's chrome is what differs**: `border` + `border-foreground/45` per-chip outline, `bg-foreground/[0.07]` per-chip fill, `rounded-full` shape. SegmentedControl items have *no individual border* (only the container has one) and use `rounded-md` shape.
- **Color asymmetry compounds the effect**: chip text is full `text-foreground` (~93% white in dark mode), while SegmentedControl *inactive* items are `text-muted-foreground` (~52% gray). Same font size, brighter color reads heavier.
- **Density**: ~28 chips collectively occupy the lower half of the form. SegmentedControls are 2-4 items per row, framed inside their containers.

### Chrome-density audit

| Control | Per-element border? | Shape | Fill (rest) | Text |
|---|---|---|---|---|
| SegmentedControl item (Tutor / Exam / Unanswered / etc.) | No (container has the border) | `rounded-md` | Inactive transparent against `bg-muted` container; active `bg-primary` | Inactive `text-muted-foreground`, active `text-primary-foreground` |
| FilterChip (current) | **Yes — `border` + `border-foreground/45` per chip** | **`rounded-full`** | `bg-foreground/[0.07]` | `text-foreground` (full strength) |
| FilterChip (V1 proposed) | **No** | **`rounded-md`** | `bg-foreground/[0.07]` (unchanged) | `text-foreground/80` (with `hover:text-foreground`) |

Three of the four columns differ between SegmentedControl and the current FilterChip. After V1, only the fill column differs (chips keep their tonal fill so they read as tappable surfaces; SegmentedControl items live inside a framed container and don't need the per-item fill).

### Historical context — how we got here

- **DEBT-290** (2026-03-09) — gave the disclosure containers `bg-foreground/5` tonal fill. Helped surface depth.
- **DEBT-291** (2026-03-09) — restored AA on chip border in light mode (`border-foreground/45`). Strengthened chip outline. **V1 removes this border entirely; this debt's premise (chip border IS the SC 1.4.11 required boundary) gets reclassified — the fill remains a supplementary tonal cue, while identification rests on text + cursor + hover + focus ring + `aria-pressed`, mirroring the dashboard rows pattern (I-1).**
- **DEBT-292** (2026-03-09) — added the disclosure chevron and moved padding/focus structure onto the clickable `<summary>`. Strengthened disclosure affordance. Untouched by V1.
- **DEBT-294** (2026-03-09) — added `bg-foreground/[0.07]` rest fill to chips. **V1 keeps this fill; its role expands from "depth on top of a required border" to the chip's tonal surface cue, while the component remains identified by text + cursor + hover + focus ring + `aria-pressed`.**
- **DEBT-295** (2026-03-09) — promoted unselected chip text from `text-foreground/60` to full `text-foreground` to fix unselected-text contrast. **V1 dims to `text-foreground/80` (still well above AA at this fill); restores full `text-foreground` on hover. This is a *dim*, not a *revert* — `/80` sits halfway between DEBT-295's full `/100` and the pre-DEBT-295 `/60`, recovering the hierarchy delta without re-creating the original contrast complaint.**
- **DEBT-296** (2026-03-09) — swapped summary metadata hierarchy. Untouched by V1.
- **DEBT-297** (2026-03-10) — made "Start a session" a real `<h2>` with `text-base font-semibold`. Untouched by V1.
- **DEBT-298** (2026-03-12) — standardized structural spacing/heading semantics. Untouched by V1.
- **DEBT-309** (2026-03-13) — added `hover:border-foreground/60` and `dark:hover:border-foreground/70` for affordance. **V1 removes the border, so this hover-border affordance is replaced by `hover:bg-foreground/[0.12]` (fill ramp) + `hover:text-foreground` (text-strength ramp).**

---

## Refactoring UI lens (Wathan & Schoger, paraphrased)

The applicable principles for V1 (the doc uses these as design principles, not direct quotations):

1. **Borders add visual noise; create depth via background contrast instead.** A grid of 28 individually-bordered chips is exactly the buzzing-outline pattern the book warns against. Without per-chip borders, the disclosure container's tonal fill provides depth and the chip's own subtle fill provides surface differentiation.
2. **Use a small, consistent shape vocabulary.** Mixing `rounded-full` (chips) with `rounded-md` (every other interactive control) creates two competing geometric systems. Picking one — `rounded-md`, since that's what every other control already uses — unifies the system.
3. **De-emphasize the unselected so the selected pops.** Hierarchy comes from making competing elements *recede*, not just from making the important thing louder. Dimming unselected chip text while keeping selected at full strength widens the selected/unselected delta.
4. **Match chrome to importance.** Filter chips for tag selection are *secondary metadata* UI. They should not have more chrome than primary controls (the SegmentedControls). After V1, they have *less* chrome — appropriate for their role.
5. **Function-form alignment.** Pills (`rounded-full`) read as **tags** — decorative metadata badges. Rectangular rounded buttons read as **toggle controls** — what filter chips functionally are. The shape change isn't cosmetic; it's correcting a function-form mismatch.

External precedent is directional, not load-bearing: Material Design 3's tonal chip family, Linear-style dense filters, and Notion-style database tags all demonstrate that dense filter controls can remain tappable without every unselected item carrying its own stroked edge. The local source of truth is still this repo's existing `rounded-md` control vocabulary (`SegmentedControl`, form controls, and Button defaults).

---

## Secondary observations (not the headline; out of scope for this debt)

These are real but **not** the user's primary concern. Listed for completeness; explicitly out of scope below.

### S1 — Stat prominence

`612 questions available.` at `text-sm text-muted-foreground` (`:277`) is muted secondary-tier text. The typography policy already documents a `text-3xl font-bold font-display` "stat number" tier. Out of scope for this debt; revisit only if the form still feels visually flat after V1 ships.

### S2 — Disclosure label asymmetry

Mode/Questions/Status/Difficulty render their label OUTSIDE the control; Topic/Substance/Treatment render their label INSIDE the `<summary>` row. Native disclosure semantics force this asymmetry. Out of scope.

### S3 — Substance chip row hangs

Substance has 10 chips fitting on one row; Topic has 11 on two rows; Treatment has 12 on two rows. Layout-dependent and not obviously wrong. Out of scope.

### S4 — All-grayscale neutrals (palette personality)

Brand-level question, not CSS-level. Out of scope; revisit only through a deliberate brand/visual-direction pass.

### S5 — Card heading bump

`text-base font-semibold` → `text-lg font-semibold` would deepen the hierarchy gap, but it's a separate axis adjustment. Out of scope; revisit if V1 alone doesn't seat the hierarchy.

---

## Design system impact

V1 touches four design-system docs that need synchronized updates:

1. **Pattern Registry I-4 (FilterChip).** Rewrite the rest/hover/selected token tables and the Part 9 summary row. The current entry classifies the chip border as the SC 1.4.11 required boundary at ~3.40:1 — V1 changes that classification: the chip becomes a borderless tonal-fill surface analogous to the I-1 dashboard nested-row model, with identification via text + cursor + hover + focus ring + `aria-pressed` rather than a stroked edge.
2. **Standards.md "Border Radius" table + hover-pattern table.** Currently lists `Chips / pills | rounded-full` and says filter chips use `hover:bg-foreground/[0.12] hover:border-foreground/60`. V1 changes these to `Filter chips | rounded-md` and `hover:bg-foreground/[0.12] hover:text-foreground`, with a footnote that filter chips are functionally toggle controls (matching SegmentedControl shape vocabulary), distinct from decorative tag/badge pills which may continue using `rounded-full` if introduced later.
3. **Pages/practice.md FilterChip table.** Update shipped state to V1 tokens. Sync line-number anchors against the post-implementation `practice-session-starter.tsx`.
4. **Contrast Policy supplementary-fill row.** The Contrast Policy already lists FilterChip under §2 "Classified supplementary fills"; it does **not** have a separate FilterChip row under "Classified required boundaries" to delete. Rewrite the existing "Practice filter chips rest fill (I-4 variant)" row so it no longer says the border carries the required-boundary role, updates `text-foreground` to `text-foreground/80` with the computed AA ratios, and describes the borderless identification model.

---

## Why this is worth fixing now

Per memory `feedback_no_speculative_debt.md`:
1. **Observed user friction** — user explicitly reported chip dominance and could not let it go through three iterations of misdiagnosis until the visual exploration confirmed the chrome was the cause.
2. **Reproducible visual evidence** — Claude Design rendered V1 against the current state and the chip de-emphasis is mechanically observable in the side-by-side.
3. **System coherence win** — V1 isn't just "fix the chip"; it's "make the chip's chrome match the rest of the card's chrome vocabulary." That's a system-coherence improvement, not a one-off cosmetic tweak.

All three bars are met.

---

## Options considered

### Option α — V1: Borderless + rounded-md + dimmed text (recommended)

**Change scope:** `components/ui/filter-chip.tsx` (production), `components/ui/filter-chip.test.tsx` (token assertions), `docs/frontend/pattern-registry.md` (I-4 rewrite + Part 9 summary row), `docs/frontend/standards.md` ("Border Radius" table row + hover-pattern table row), `docs/frontend/contrast-policy.md` (FilterChip supplementary-fill row reclassification), `docs/frontend/pages/practice.md` (FilterChip table sync).

**The exact production diff:**

```diff
  // FilterChip — components/ui/filter-chip.tsx (current)
- 'inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
+ 'inline-flex cursor-pointer items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
- 'outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
+ 'outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]',
  'disabled:pointer-events-none disabled:opacity-50',
  selected
-   ? 'border-primary bg-primary text-primary-foreground'
+   ? 'bg-primary text-primary-foreground'
-   : 'border-foreground/45 bg-foreground/[0.07] text-foreground hover:bg-foreground/[0.12] hover:border-foreground/60 dark:border-foreground/40 dark:hover:border-foreground/70',
+   : 'bg-foreground/[0.07] text-foreground/80 hover:bg-foreground/[0.12] hover:text-foreground',
```

What changed:
- **Shared base loses `border` and `rounded-full`.** Adds `rounded-md`. (The `border` utility was setting `border-width: 1px`; without it, no border renders at all.)
- **Focus styling loses `focus-visible:border-ring`.** With no rendered border width, the border-color focus token is stale/no-op. The visible focus ring remains via `focus-visible:ring-ring/50 focus-visible:ring-[3px]`.
- **Selected loses `border-primary`.** That class was redundant on `bg-primary` anyway (same color); now removed cleanly.
- **Unselected loses all four border-related classes** (`border-foreground/45`, `hover:border-foreground/60`, `dark:border-foreground/40`, `dark:hover:border-foreground/70`).
- **Unselected text color drops** from `text-foreground` to `text-foreground/80`. Hover restores full `text-foreground`.

What stays the same:
- `text-sm` (14px) — unchanged
- `font-medium` (weight 500) — unchanged on both selected and unselected
- `px-3 py-1.5` — chip padding unchanged
- `bg-foreground/[0.07]` rest fill — unchanged
- `hover:bg-foreground/[0.12]` hover fill — unchanged
- `cursor-pointer` — unchanged
- Focus-visible ring — unchanged (`focus-visible:ring-ring/50 focus-visible:ring-[3px]`)
- `aria-pressed`, disabled handling — unchanged

**Why this option:**

- **Targets the actual cause.** The user's chip-dominance complaint comes from chrome (border + shape), not typography. V1 fixes chrome.
- **Unifies the visual vocabulary.** Every interactive control on the card now uses `rounded-md`. Refactoring UI's "small, consistent shape vocabulary" rule met.
- **Strengthens selected/unselected delta.** Dimming unselected text while keeping selected at full strength makes selecting a chip a louder action, not a quieter one.
- **Function-form alignment.** Filter chips become rectangular rounded toggles (matching their function), not decorative pills (which suggest tags).
- **Preserves DEBT-294 fill and DEBT-295's contrast intent in modulated form.** Fill unchanged; text dim is `/80`, not a revert to `/60`. Hover lifts to full `text-foreground`, so the contrast win re-asserts on interaction.

**What this doesn't fix:**
- S1-S5 (stat prominence, disclosure asymmetry, row hang, palette, heading bump) — explicitly out of scope.

**What this might surface:**
- After dropping the border, the disclosure container fill (`bg-foreground/5`) and the chip rest fill (`bg-foreground/[0.07]`) provide a 2-percentage-point foreground-opacity delta. Computed against current tokens: dark parent `#1d1d1d` → chip `#2c2c2c` is ~1.21:1; light parent `#f2f3f3` → chip `#e1e3e4` is ~1.16:1. This is intentionally supplementary, not a required 3:1 boundary. The text remains comfortably AA: `text-foreground/80` resolves to ~8.18:1 in dark mode and ~9.67:1 in light mode against the chip fill. Do **not** preemptively bump the fill; only fall back to `bg-foreground/[0.10]` if light-mode visual QA shows borderless chips collapsing into the disclosure container.

### Option α-extended — α + stat number + heading bump (medium)

V1 plus:
1. "612 questions available." promoted to a stat-number block (`text-2xl font-bold font-display` for the number, `text-sm text-muted-foreground` for "questions available"). Test impact: review whether `practice-session-starter.test.tsx` asserts the current copy/format.
2. Card heading "Start a session" bumped from `text-base font-semibold` to `text-lg font-semibold`. Test impact: `practice-session-starter.test.tsx:88-90` updates.

**Why not by default:** the user's foregrounded concern is chip dominance. Per `feedback_no_speculative_debt.md`, do not pre-emptively bundle adjacent fixes that the user did not flag. Ship α; revisit α-extended only if the form still reads flat after α lands.

### Option β — Drop chip text size (rejected)

`text-sm` → `text-xs` for unselected chips. Genuine size hierarchy.

**Why not:**
- 12px on long chip labels in dense grids ("Treatment & Pharmacotherapy", "Pharmacology & Neuroscience") strains readability.
- The disclosure right-side caption and footer counter are already `text-xs`; chip text would collapse to the same tier as metadata copy.
- V1 achieves the de-emphasis goal *without* shrinking text, which is the lower-risk path.

**When to revisit:** if α ships and the chip-vs-label delta still feels too subtle, β-style size reduction becomes the natural next-step. Defer until evidence.

### Option γ — System-wide audit (deferred)

Cross-surface label hierarchy audit, color personality audit, etc. Out of scope; α first, audit only after evidence on additional surfaces.

---

## Recommended option

**Option α (V1: borderless + rounded-md + dimmed text).** Three coordinated chrome changes to a single component file. The two headline levers — drop border, square corners — were the user's foregrounded conclusions; the dim is the supporting third lever from Claude Design's V1 rendering. Single-component test impact, four design-system docs to sync. Bigger reach than the original font-weight α was scoped for, but bounded and reversible.

---

## Acceptance criteria

When α (V1) is implemented:

1. **`components/ui/filter-chip.tsx`** matches the exact production diff above. The shared base contains `rounded-md` (not `rounded-full`) and does NOT contain the `border` utility class. Focus styling keeps `focus-visible:ring-ring/50 focus-visible:ring-[3px]` and removes stale `focus-visible:border-ring`. Selected variant: `bg-primary text-primary-foreground` (no `border-primary`). Unselected variant: `bg-foreground/[0.07] text-foreground/80 hover:bg-foreground/[0.12] hover:text-foreground` (no border classes at all).
2. **`components/ui/filter-chip.test.tsx`** updated:
   - **Unselected styling test (`:42-68`)**: assert `rounded-md` present, `rounded-full` absent, base `border` absent, `focus-visible:border-ring` absent, `focus-visible:ring-ring/50` present, `focus-visible:ring-[3px]` present, `border-foreground/45` absent, `dark:border-foreground/40` absent, `text-foreground/80` present, `text-foreground` absent (the bare `text-foreground` token), `hover:text-foreground` present, `hover:border-foreground/60` absent, `dark:hover:border-foreground/70` absent. Existing `bg-foreground/[0.07]`, `hover:bg-foreground/[0.12]`, `cursor-pointer` assertions remain unchanged.
   - **Selected styling test (`:33-40`)**: add `rounded-md` present, `rounded-full` absent, base `border` absent, `focus-visible:border-ring` absent, `border-primary` absent assertions. Existing `bg-primary`, `aria-pressed="true"` assertions unchanged.
   - **`text-sm font-medium` still present on both branches** (text size and weight do not change in V1).
3. **`docs/frontend/pattern-registry.md` I-4 entry** rewritten:
   - Shared base loses `border`, `rounded-full`, and `focus-visible:border-ring`; gains `rounded-md`.
   - Selected variant loses `border-primary`.
   - Unselected variant loses all border tokens; gains `text-foreground/80` and `hover:text-foreground`.
   - Design rationale paragraph rewritten to reflect: "FilterChip moves to the I-1 borderless tonal-fill family. Identification rests on text + fill + cursor + hover + focus ring + `aria-pressed`, not on a stroked edge. Shape unified to `rounded-md` to match SegmentedControl items and Button defaults — filter chips are functionally toggle controls, not decorative pills."
   - Add a single sentence linking back to DEBT-377 explaining the V1 redirect from font-weight to chrome.
   - Part 9 summary row for `I-4 | Filter Chip` updated to hover `hover:bg-foreground/[0.12] hover:text-foreground`, radius `rounded-md`, boundary `borderless tonal fill`.
4. **`docs/frontend/standards.md`**:
   - "Border Radius" table: the row currently reading `Chips / pills | rounded-full` becomes `Filter chips | rounded-md` (or equivalent prose distinguishing functional toggle chips from any future decorative tag pills). Confirm there are no remaining production consumers of `rounded-full` chip styling outside this debt's scope.
   - "Interactive row/card hover" table: replace the filter-chip sentence `hover:bg-foreground/[0.12] hover:border-foreground/60` with `hover:bg-foreground/[0.12] hover:text-foreground` and note that the rest state is borderless tonal fill.
5. **`docs/frontend/contrast-policy.md`**: rewrite the existing §2 "Classified supplementary fills" row for "Practice filter chips rest fill (I-4 variant)" rather than adding/removing a row elsewhere. New row: `bg-foreground/[0.07] text-foreground/80` rest, `hover:bg-foreground/[0.12] hover:text-foreground` hover, fill ratio ~1.21:1 dark / ~1.16:1 light vs the tonal parent, text ratio ~8.18:1 dark / ~9.67:1 light, identification via text + cursor + hover fill/text lift + focus ring + `aria-pressed`.
6. **`docs/frontend/pages/practice.md` FilterChip table** synced to V1 tokens, plus a single sentence in the practice variant section noting the rounded-md change. Source-line anchors against `practice-session-starter.tsx` confirmed current at implementation SHA.
7. **No production behavior change**: chips are still keyboard accessible, `aria-pressed` still flips on click, focus ring still appears, disabled state still pointer-events-none + opacity-50, hover still produces a perceptible state change.
8. **All gates green** locally and in CI: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build`. E2E if local Clerk + Stripe billing env is available.
9. **Visual verification screenshot in PR body** comparing before/after on the practice starter card with all three filter sections expanded so all chips are visible (dark mode primary; light mode secondary screenshot for parity check). Particular attention to:
   - (a) Section labels (Topic/Substance/Treatment) visibly heavier than chip text;
   - (b) Selected chips clearly heavier than unselected chips (the bg-primary pop should now read louder against dimmer unselected siblings);
   - (c) Chip shape matches SegmentedControl shape (`rounded-md`);
   - (d) Hover state still produces a visible change (fill ramp + text strengthening);
   - (e) Light mode chip rest still reads as a tappable surface despite the lower-contrast tonal fill. Fall back to the `bg-foreground/[0.10]` rest-fill bump only if the borderless `/[0.07]` chip fill visually collapses into the `bg-foreground/5` disclosure container in screenshots or manual QA.

---

## Out of scope (explicitly listed; do NOT bundle)

- **S1**: Stat prominence.
- **S2**: Disclosure label asymmetry.
- **S3**: Substance chip row hang.
- **S4**: Grayscale palette / color personality.
- **S5**: Card heading bump.
- **Cross-surface label hierarchy audit.** Out of scope per `feedback_no_speculative_debt.md`.
- **SegmentedControl visual changes.** Untouched. The same shape vocabulary is now shared, but SegmentedControl tokens and behavior do not change.
- **Selected-state border restoration.** The current `border-primary` on selected was redundant against `bg-primary`. Removing it is a clean simplification, not a regression.

---

## Test plan

### Unit tests to update
- `components/ui/filter-chip.test.tsx` — assertion updates per Acceptance Criterion 2.

### Unit tests that must still pass unchanged
- `app/(app)/app/practice/components/practice-session-starter.test.tsx` — does not assert FilterChip class strings. Assertions on shadcn primitives, input shell, heading text (`:88-90`), filter fieldset grouping, disclosure summary tokens, footer count tokens, section ordering — all unchanged.
- `app/(app)/app/practice/page.test.tsx` — `renders difficulty filter chips` test inspects SegmentedControl labels, not FilterChip tokens. Leave unchanged.
- `app/(app)/app/practice/components/practice-session-starter.browser.spec.tsx` — interaction behavior, not chip class strings. Leave unchanged.

### Browser-mode tests
- None expected to break; the change is purely visual.

### E2E
- `tests/e2e/practice.spec.ts` does not assert chip class strings. Should still pass unchanged.

### Visual regression
- FilterChip has exactly one production consumer: `app/(app)/app/practice/components/practice-session-starter.tsx:8`. No other surface ships chips today. The change is fully bounded to this card.

### Manual verification
- Open `/app/practice` (Clerk-authenticated browser).
- Expand all three disclosures (Topic, Substance, Treatment).
- Confirm each Acceptance Criterion 9(a)-(e) bullet visually.

---

## Rollback plan

If V1 surfaces a regression, revert the single hunk in `filter-chip.tsx`, the corresponding `filter-chip.test.tsx` assertion changes, and the four design-system doc updates (Pattern Registry, Standards, Contrast Policy, page doc). Total revert: one commit, six files. No data, no migrations, no schema impact. Safe.

---

## References

### This debt
- Surface: `app/(app)/app/practice/components/practice-session-starter.tsx`
- Component: `components/ui/filter-chip.tsx`
- Component test: `components/ui/filter-chip.test.tsx`
- Surface test: `app/(app)/app/practice/components/practice-session-starter.test.tsx`

### Design system
- `docs/frontend/standards.md` — Tokens (§1), Border Radius (§6), Typography (§4)
- `docs/frontend/typography-policy.md` — Two-pipeline model
- `docs/frontend/contrast-policy.md` — Required vs supplementary boundary classification
- `docs/frontend/pattern-registry.md` — I-1 (Hoverable Row, tonal-fill variant), I-4 (FilterChip), I-5 (SegmentedControl), S-1 (Card), S-2 practice variant
- `docs/frontend/pages/practice.md` — Element-by-element practice page audit

### Prior debt (load-bearing context)
- DEBT-290 (filter container tonal fill): `docs/_archive/debt/debt-290-practice-filter-tonal-fill-elevation.md`
- **DEBT-291 (chip light-mode border AA)**: `docs/_archive/debt/debt-291-filter-chip-light-mode-border-contrast.md` — V1 removes the border this debt strengthened; reclassified accordingly.
- DEBT-292 (disclosure indicator): `docs/_archive/debt/debt-292-filter-section-disclosure-indicator.md`
- **DEBT-294 (chip rest fill depth + cursor)**: `docs/_archive/debt/debt-294-filter-chip-fill-depth-and-cursor.md` — V1 keeps this fill; its role expands from a depth cue beside a required border to the chip's tonal surface cue, while identification still comes from text + cursor + hover + focus ring.
- **DEBT-295 (chip unselected text weight)**: `docs/_archive/debt/debt-295-filter-chip-unselected-text-weight.md` — V1 dims to `/80` (not a revert to `/60`); hover restores full strength.
- DEBT-296 (summary text hierarchy swap): `docs/_archive/debt/debt-296-filter-section-summary-hierarchy-swap.md`
- DEBT-297 (starter card heading polish): `docs/_archive/debt/debt-297-practice-starter-ui-polish.md`
- DEBT-298 (UI structural consistency audit): `docs/_archive/debt/debt-298-ui-structural-consistency.md`
- **DEBT-309 (chip hover border affordance)**: `docs/_archive/debt/debt-309-filter-chip-hover-border-affordance.md` — V1 removes the border this debt added hover affordance to; replaced by `hover:bg-foreground/[0.12]` + `hover:text-foreground`.

### External
- *Refactoring UI* by Adam Wathan & Steve Schoger — applicable principles (paraphrased): borders add noise, depth via background contrast, small consistent shape vocabulary, de-emphasize unselected so selected pops, match chrome to importance.
- Material Design 3 / Linear / Notion — directional precedent for dense filter/tag controls that rely on tonal fills and state contrast rather than per-item strokes. These are visual references only; repo-local tokens remain the implementation authority.
- shadcn/ui / local component vocabulary — local `Button`, `Input`, `Select`, and `SegmentedControl` defaults use `rounded-md`; DEBT-377 aligns functional filter chips with that control shape rather than treating them as decorative pills.

### Visual exploration source
- Claude Design canvas "Practice chip hierarchy" (2026-05-03) — V1 rendering against current state confirmed the chrome-and-shape diagnosis as the right axis after font-weight and font-size were ruled out via mechanical verification.

---

## Audit-resolved design decisions

1. **Headline levers are border + shape; text dim is supporting.** The user's most direct articulation was "losing the border and changing the shape." Text dim from `text-foreground` to `text-foreground/80` is the third V1 lever, supporting the de-emphasis goal but secondary to the chrome changes.
2. **Selected chips lose `border-primary` cleanly.** That class was redundant against `bg-primary` (same color); removing it is a simplification, not a behavior change.
3. **Hover restores full `text-foreground`.** This re-asserts the DEBT-295 contrast win on interaction, so the dim is a *resting* state only — not a permanent reduction.
4. **Selected fill unchanged** (`bg-primary`). Selected/unselected delta widens because unselected gets quieter; selected pop stays exactly as it was.
5. **Do not change SegmentedControl.** Its current shape (`rounded-md`) and behavior are exactly what we're aligning chips to.
6. **Do not bump section labels or card heading in α.** Section labels at `text-sm font-medium text-foreground` already read heavier than dimmed chip text. If after V1 the form still reads flat at the *heading* level, revisit α-extended as a follow-up.
7. **Light-mode contingency.** Computed text contrast clears AA with room (`text-foreground/80` is ~8.18:1 dark / ~9.67:1 light against the V1 chip fill). Fill contrast is intentionally low and supplementary (~1.21:1 dark / ~1.16:1 light vs the tonal parent). Keep `bg-foreground/[0.07]` by default; bump to `bg-foreground/[0.10]` only if light-mode screenshots or manual QA show the borderless chip rest surface no longer reads as tappable. Do not silently substitute other tokens during implementation; if the fallback is needed, call it out in the PR.
