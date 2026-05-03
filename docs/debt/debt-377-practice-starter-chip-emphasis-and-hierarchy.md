# DEBT-377 — Practice starter: chip emphasis inversion + flat hierarchy

**Status:** Open — implementation spec, awaiting audit + grade
**Severity:** P3 (cosmetic / hierarchy polish; observed friction, no functional break)
**Owner:** TBD
**Filed:** 2026-05-03
**Surface:** `app/(app)/app/practice` — `PracticeSessionStarter` ("Start a session" card)

**Audit verdict (2026-05-03):** Refined after source/design-system audit at SHA `39961e03`. Corrected the FilterChip test-impact description, added adjacent prior-debt context (DEBT-292 / DEBT-296 / DEBT-297 / DEBT-298), replaced over-broad design-system reassurance with a more precise "comprehensive but page anchors need sync" statement, resolved the open design questions inline, and sharpened the Refactoring UI / option analysis. Recommendation remains Option α.

---

## TL;DR

The practice starter card is **WCAG-compliant** and consistent with the current Pattern Registry tokens, but its typography hierarchy is *flat*: the multi-select **chip text** (`Co-occurring Disorders`, `Alcohol`, `Naltrexone`, …) is rendered with the **same size, weight, and color** as the **section labels** that introduce the chip groups (`Topic`, `Substance`, `Treatment`). Combined with the chip's pill shape, border, and fill, this makes individual chips **read as more visually prominent than the labels above them** — hierarchy inversion.

The fix is small, local, and does **not** require a system-wide redesign. The recommended option restores label-over-chip hierarchy by varying *one* dimension (font weight) on the unselected chip while preserving the contrast win from DEBT-295 and the boundary contract from DEBT-291 / DEBT-294 / DEBT-309.

---

## Primary concern (per user, foregrounded)

> *"Do you see the differences in the chip button fonts and how it's different on the hierarchy of the pages? It almost seems too emphasized according to the image. My primary concern on this piece of debt."*

User can articulate the problem more directly than the audit caught: the **chips are too emphasized** relative to the page chrome that frames them.

---

## Evidence (typographic audit)

### The collapse, by element

Every label-tier element on this card uses a small set of utility classes. Stripped to size/weight/color:

| Element | Source | Classes (size · weight · color) | Effective tier |
|---|---|---|---|
| Card heading "Start a session" | `practice-session-starter.tsx:108` | `text-base font-semibold text-foreground` | 16px / 600 / full-strength |
| Card subtitle "Tutor mode shows…" | `:111` | `text-sm text-muted-foreground` | 14px / 400 / muted |
| Section labels "Mode", "Status", "Difficulty" | `:122`, `:166`, `:187` | `text-sm font-medium text-foreground` | 14px / 500 / full-strength |
| `<label>` "Questions" | `:141` | `text-sm font-medium text-foreground` | 14px / 500 / full-strength |
| Disclosure summary labels "Topic", "Substance", "Treatment" | `:238` (`<summary>`) → `<span>` at `:239` | `text-sm font-medium text-foreground` | 14px / 500 / full-strength |
| **FilterChip text (unselected, all three groups)** | `components/ui/filter-chip.tsx:23,28` | `text-sm font-medium text-foreground` | **14px / 500 / full-strength** |
| FilterChip text (selected) | `filter-chip.tsx:23,27` | `text-sm font-medium text-primary-foreground` | 14px / 500 / inverted |
| SegmentedControl item text (active) | `tab-switch-styles.ts` | `text-sm font-medium text-primary-foreground` | 14px / 500 / inverted |
| SegmentedControl item text (inactive) | `tab-switch-styles.ts` | `text-sm font-medium text-muted-foreground` (hover → `text-foreground`) | 14px / 500 / muted (→ full on hover) |
| Disclosure right-side caption "All included by default" / "(N selected)" | `:241` | `text-xs font-normal text-foreground/60` | 12px / 400 / muted |
| Disclosure footer "(0 selected)" | `:264` | `text-xs text-foreground/60` | 12px / inherited 400 / muted |
| Availability stat "612 questions available." | `:277` | `text-sm text-muted-foreground` | 14px / 400 / muted |
| `Start session` button text | Button default | `text-sm font-medium` | 14px / 500 / inverted |

### What the table reveals

1. **Section labels and chip text are typographically identical** — `text-sm font-medium text-foreground` for both. The label tier and the content tier are wearing the same voice.
2. **Chip rendering adds visual weight on top of identical typography.** Each unselected chip carries:
   - `border-foreground/45` (~3.40:1 vs current parent — a fully visible, AA-compliant SC 1.4.11 boundary; `filter-chip.tsx:28`)
   - `bg-foreground/[0.07]` (~1.21:1 vs parent — supplementary surface fill that rises to ~#2C2C2C in dark mode; `filter-chip.tsx:28`)
   - `rounded-full` shape — pill geometry adds perceived mass
   - `px-3 py-1.5` padding — physical size larger than the label text it sits beneath
3. **The aggregate effect is hierarchy inversion**: a single chip "Co-occurring Disorders" reads visually heavier than the label "Topic" that introduces 11 such chips.
4. **The page-heading-to-content delta is too small.** "Start a session" at `text-base font-semibold` is one size step (16→14) and one weight step (600→500) above the chips. By the standards of Refactoring UI's hierarchy chapter, that's a single-channel one-stop delta — not enough headroom for a card heading to dominate ~28 chip tokens on the page.

### Historical context — how we got here

This is **not random drift**; it is the cumulative result of a deliberate sequence of audits that each fixed a real problem but together collapsed the label/chip delta:

- **DEBT-290** (2026-03-09) — gave the disclosure containers `bg-foreground/5` tonal fill instead of border. *Helped surface depth; did not change typography.*
- **DEBT-291** (2026-03-09) — restored AA on chip border in light mode (`border-foreground/45`). *Strengthened chip outline.*
- **DEBT-292** (2026-03-09) — added the disclosure chevron and moved padding/focus structure onto the clickable `<summary>`. *Strengthened disclosure affordance; did not change chip typography.*
- **DEBT-294** (2026-03-09) — added `bg-foreground/[0.07]` rest fill to chips so they stop looking like transparent labels on the tonal parent. *Strengthened chip surface.*
- **DEBT-295** (2026-03-09) — promoted unselected chip text from `text-foreground/60` to full `text-foreground` to fix unselected-text contrast. *Strengthened chip text.*
- **DEBT-296** (2026-03-09) — swapped summary metadata hierarchy so zero-selected summaries say `All included by default` and footer metadata shows `(0 selected)`. *Strengthened disclosure copy hierarchy, not chip/label hierarchy.*
- **DEBT-297** (2026-03-10) — made "Start a session" a real `<h2>` with `text-base font-semibold`. *Strengthened the card title but left section labels and chip text at parity.*
- **DEBT-298** (2026-03-12) — standardized structural spacing/heading semantics across audited surfaces. *Confirmed current component heights and layout conventions; did not reopen chip typography.*
- **DEBT-309** (2026-03-13) — added `hover:border-foreground/60` and `dark:hover:border-foreground/70` for affordance. *Strengthened chip hover.*

Each step strengthened the chip. **Nothing in this sequence ever weakened the chip back to subordinate-to-label hierarchy.** The cumulative effect is what the user is now seeing: chips that read as primary content and labels that read as labels for primary content — but at parity rather than as a layer above.

DEBT-295's promotion to full `text-foreground` is the one to keep — reverting it would re-create the contrast complaint that filed DEBT-295 in the first place. The remaining channel for restoring hierarchy is **font weight**, **font size**, or a **stronger label tier** — see Options below.

---

## Refactoring UI lens (Wathan & Schoger)

This section intentionally paraphrases the book and the public Refactoring UI table of contents rather than pretending to quote proprietary text. The applicable principles are:

1. **Size is not everything; use weight and contrast to create hierarchy.** The current label/chip pair varies none of the three typographic dimensions: both are `text-sm font-medium text-foreground`.
2. **De-emphasize competing elements instead of only making the important thing louder.** The cleanest fix is not to make every section label bigger; it is to slightly reduce the unselected chip label's weight so labels regain the lead.
3. **Balance weight and contrast.** DEBT-295 correctly moved chip color to full `text-foreground` for contrast and interactive presence. DEBT-377 should not undo that. Weight is the safer remaining lever.
4. **Selected states must stay unmistakable.** Current selected chips already flip fill, border, and text color (`bg-primary border-primary text-primary-foreground`). That delta remains large even if unselected chip weight drops from 500 to 400.
5. **Flat designs still need depth and hierarchy.** DEBT-290/294/309 built surface depth and hover affordance; this debt finishes the typography tiering those visual changes exposed.

The card heading remains a secondary concern. `text-base font-semibold` is only one size and one weight step above the chip labels, but it was deliberately shipped by DEBT-297 and is not the user's foregrounded complaint in this pass.

---

## Secondary observations (intentionally not the headline)

These are real but **not** the user's primary concern. They are listed for completeness and explicitly considered for in-scope vs out-of-scope below.

### S1 — Stat prominence

`612 questions available.` at `text-sm text-muted-foreground` (`:277`) is useful decision support — it tells you whether the start button does anything. It is currently muted secondary-tier text, smaller and quieter than the chips themselves.

The typography policy already documents a `text-3xl font-bold font-display` "stat number" tier (`docs/frontend/standards.md:283`). Using it here would be a one-class change but introduces several design questions: should "questions available" really count as a hero stat? Does it dominate the form unhelpfully? **Probably medium-impact. Considered in Option α-extended below; not the recommended baseline.**

### S2 — Disclosure label asymmetry

Mode / Questions / Status / Difficulty render with their label OUTSIDE the control (label above, control below — `space-y-2` wrapper). Topic / Substance / Treatment render with their label INSIDE the disclosure summary row, as a `<span>` next to the chevron. Read top-to-bottom, the visual rhythm changes halfway through the form.

This is **not** a divergence from the design system — `<details>`/`<summary>` semantics force the label inside the clickable header. But the result is two different "label containers" in the same form. **Considered as a possible add-on; not the recommended baseline scope** — see Option α-extended.

### S3 — Substance chip row hangs

Substance has 10 chips fitting on one row at desktop width; Topic has 11 chips on two rows; Treatment has 12 on two rows. Substance's row visibly ends mid-card with empty space to the right.

This was user-observed, but it is **layout-dependent** and not obviously wrong: left-aligned wrapped chips preserve natural scan order, while centering the final row or forcing equal-width columns would create new rhythm and localization problems. **Out of scope** — address only if the row shape remains a concrete complaint after the typography fix.

### S4 — All-grayscale neutrals (palette personality)

`globals.css:129-167` defines all dark-mode neutrals at `0% 0%` saturation — pure grayscale. The whole card is rendered in shades of gray with no hue accent. Refactoring UI's color chapter argues for intentional color scales and notes that grays do not have to be purely gray.

This is a **brand-level question**, not a CSS-level question. The current grayscale palette is intentional and consistent with the app's existing dark, low-chroma visual direction. Changing it is a **whole-app re-skin** and out of scope for a P3 hierarchy fix. **Explicitly out of scope** — see "Out of scope" section.

---

## Design system status — answering the user's meta-question

> *"Do we have a design system? Is it sprawling? Have we diverged?"*

**Yes, we have a design system. It is comprehensive for engineering implementation, but it is not a designer-facing Figma/brand system.**

| Doc | Lines | Role |
|---|---|---|
| `docs/frontend/standards.md` | ~870 | Tokens, components, typography, spacing, accessibility, file naming |
| `docs/frontend/design-principles.md` | ~145 | Layout composition, action bar conventions, navigation zones |
| `docs/frontend/typography-policy.md` | ~210 | Two-pipeline model, content tiers, Markdown rules |
| `docs/frontend/contrast-policy.md` | ~95 | WCAG AA targets, classified required boundaries |
| `docs/frontend/pattern-registry.md` | ~1395 | Visual patterns with canonical classes, contrast computations, and decision trees |
| `docs/frontend/bookmark-surface-policy.md` | ~90 | Where bookmark appears/doesn't and why |
| `docs/frontend/pages/{practice,dashboard,bookmarks,quick-practice}.md` | per-page | Element-by-element audit of each surface mapped to Pattern Registry IDs |

The practice starter is documented element-by-element at `docs/frontend/pages/practice.md`, with every chip, control, and label mapped to a Pattern Registry ID (S-1, S-2, I-4, I-5). The pattern content is still useful, but the page inventory's source line anchors are stale relative to `practice-session-starter.tsx` at SHA `39961e03`. Acceptance criterion 4 below requires syncing that file during implementation.

**Are we sprawling?** For an engineering-owned design system, no. The docs are split by purpose: standards, typography, contrast, pattern registry, and per-page inventories. A hired product designer would usually expect these to be complemented by Figma source, brand direction, and visual principles; they would not expect the repo docs to replace those artifacts.

**Have we diverged?** The code has not diverged from the documented Pattern Registry; the Pattern Registry itself is missing a hierarchy rule for dense chip groups inside labeled filter sections. This debt fixes that system gap locally and then updates the registry.

**What real design teams usually add:** brand voice, color-personality rationale, typography pairing rationale, Figma components, and example states across breakpoints. We have strong technical reference; we are lighter on brand/design-vision artifacts. **That is a separate discussion, not this debt.**

---

## Why this is worth fixing now

Per memory `feedback_no_speculative_debt.md`, debt requires concrete evidence of harm, not "could theoretically be better." This debt clears the bar for two independent reasons:

1. **Observed user friction** — user explicitly reported difficulty being proud of the surface and named hierarchy inversion as the primary cause. That is the strongest single signal under the no-speculative-debt rule.
2. **Documented hierarchy inversion** — the typographic audit above is mechanical and reproducible: section labels and chip text share size, weight, and color tokens, while the chip surface adds border + fill + shape on top. This is not a "value prop" or a hypothetical scaling concern; it is a measurable typographic fact in the rendered HTML.

Both bars are met. Filing is justified.

---

## Options considered

All three options keep DEBT-291's AA boundary, DEBT-294's chip rest fill, DEBT-295's contrast win, DEBT-309's hover affordance, and Pattern Registry I-4 / I-5 surface tokens **intact**. They differ only in *how* they restore the label-over-chip hierarchy delta.

### Option α — Drop unselected chip font weight (recommended)

**Change scope:** `components/ui/filter-chip.tsx` only. Pattern Registry I-4 doc note. Test token assertions.

**The change:**

```diff
  // FilterChip unselected (current)
- 'border-foreground/45 bg-foreground/[0.07] text-foreground hover:bg-foreground/[0.12] hover:border-foreground/60 dark:border-foreground/40 dark:hover:border-foreground/70'

  // FilterChip unselected (proposed)
+ 'border-foreground/45 bg-foreground/[0.07] text-foreground hover:bg-foreground/[0.12] hover:border-foreground/60 dark:border-foreground/40 dark:hover:border-foreground/70'
  // …and the shared base goes from `font-medium` to `font-normal` ONLY for unselected,
  // so the variant table becomes:
  //   shared base (no weight)
  //   unselected: font-normal …
  //   selected:   font-medium border-primary bg-primary text-primary-foreground
```

Concretely the patch looks like (rough sketch — final to be refined in the implementation god prompt):

```tsx
className={cn(
  // shared base — drop font-medium from here
  'inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-sm transition-colors',
  'outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
  'disabled:pointer-events-none disabled:opacity-50',
  selected
    ? 'font-medium border-primary bg-primary text-primary-foreground'
    : 'font-normal border-foreground/45 bg-foreground/[0.07] text-foreground hover:bg-foreground/[0.12] hover:border-foreground/60 dark:border-foreground/40 dark:hover:border-foreground/70',
)}
```

**What this restores:**

| Element | Before | After |
|---|---|---|
| Section label | `text-sm font-medium text-foreground` | unchanged |
| Chip text (unselected) | `text-sm font-medium text-foreground` | `text-sm font-normal text-foreground` |
| Chip text (selected) | `text-sm font-medium text-primary-foreground` | unchanged |

The label vs chip-content delta is now **one font-weight step** (500 → 400), with everything else equal. Selected chips intentionally keep `font-medium` because being selected *should* assert: "this token is now contributing to the filter."

**Why this option:**

- **Smallest blast radius.** One file change in production code. One pattern-registry text update. Token assertions update in `filter-chip.test.tsx:42-68` by adding `font-normal` present / `font-medium` absent checks for unselected chips.
- **Preserves every prior debt's outcome.** DEBT-291 boundary, DEBT-294 fill, DEBT-295 text contrast, DEBT-309 hover — all unchanged.
- **Aligns with Refactoring UI.** Varies *one* dimension (weight) to restore hierarchy, leaves color and size alone.
- **No contrast risk.** WCAG AA targets are about luminance contrast, not weight. Going from weight 500 to 400 does not regress any documented ratio.
- **Acceptable interactive floor.** Refactoring UI's normal-weight band is 400-500, and this app already relies on full color, border, fill, cursor, hover, focus ring, and `aria-pressed` to communicate chip interactivity. The selected state keeps `font-medium`; the unselected state does not drop below 400.

**What this doesn't fix:**

- Stat prominence (S1) — still muted.
- Disclosure label asymmetry (S2) — still asymmetric.
- Page heading timidity — `text-base font-semibold` unchanged.
- Substance row hang (S3) — unchanged.
- Grayscale palette (S4) — unchanged.

If after shipping α the user still reports hierarchy concerns, file a focused follow-up. **Do not pre-empt with bigger changes.** If visual QA shows `font-normal` is genuinely too weak for chip labels, stop and report; do not silently switch to a section-label `font-semibold` approach in the implementation PR.

### Option α-extended — α + stat number + heading bump (medium)

Adds two atomic changes on top of α:

1. **Stat upgrade.** "612 questions available." promoted from `text-sm text-muted-foreground` to a stat-number-style render: a small stat block in the footer with the number rendered at `text-2xl font-bold font-display text-foreground` (smaller than dashboard stat-tier `text-3xl` because this is footer chrome, not a hero stat) and the unit text at `text-sm text-muted-foreground` to its right.

   Concretely: replace the single `<output>` line with a small `<output>` containing the formatted number + word "questions available", styled so the **count itself is visually loud** while the framing copy stays muted.

   Risk: this changes a contract that `practice-session-starter.test.tsx` may not assert directly (it does not appear to — confirm at implementation time), and requires the Pattern Registry to either add a "footer stat" sub-pattern or document this as a known reuse of the stat-number tier.

2. **Card heading bump.** "Start a session" from `text-base font-semibold text-foreground` to `text-lg font-semibold text-foreground`. One step up the size scale, same weight.

   Test impact: `practice-session-starter.test.tsx:88-90` asserts the exact class string `text-base font-semibold text-foreground`. Update that assertion.

**Why consider this option:**
- Addresses three layers of hierarchy weakness in one PR: chip emphasis (α), stat presence (S1), card heading timidity.
- Still scoped to `practice-session-starter.tsx` + `filter-chip.tsx` + 1 pattern-registry doc + 2 test files.

**Why not by default:**
- **The user's foregrounded concern is chip emphasis, not stat or heading.** Per the no-speculative-debt rule, do not pre-emptively bundle adjacent fixes that the user did not flag. Ship α; if S1 or heading timidity remains a real complaint after α, file follow-ups with concrete evidence.
- A bigger PR is harder to revert cleanly if any one piece misses. Single-axis changes per PR are the established cadence (DEBT-374 / 375 / 376 all shipped one-axis fixes).

### Option β — Drop chip text color instead of weight

**The change:** `text-foreground` → `text-foreground/85` on unselected chips. Keep `font-medium`.

**Why not:**
- **This partially re-opens DEBT-295's semantic decision.** That debt's whole point was promoting unselected chips from `text-foreground/60` to full `text-foreground` so that interactive labels read as primary controls. `text-foreground/85` is accessible (computed against current chip fill: ~11.31:1 light, ~9.05:1 dark), but it walks back the "full primary interactive label" decision and introduces an arbitrary opacity token that is not currently part of the Pattern Registry.
- The contrast policy already classifies chip border as the SC 1.4.11 required boundary (`docs/frontend/contrast-policy.md:61`) and the fill as supplementary. Dimming the *text* changes a different axis of the boundary contract and risks confusing future readers about what is and isn't required.
- Weight is a cleaner variable here. Weight does not have a WCAG-codified target the way color does.

**When to revisit:** if α ships and the chip-vs-label delta still feels too subtle, β becomes the natural next-step — but probably as `text-foreground/95` or `text-foreground/90` to keep the contrast win, which is a much narrower change than reverting to `/60`.

### Option γ — System-wide audit (deferred)

A full pass on label hierarchy across every surface (dashboard cards, history, billing, settings), color personality (move off pure grayscale neutrals), shared "label tier" component for all section-label use sites.

**Why not now:**
- Blast radius: 50+ files, every page-level form and surface in the app.
- The user explicitly said "let's focus on this practice page first."
- Per the no-speculative-debt rule, system-wide changes need evidence of system-wide harm, not extrapolation from one surface.
- Even if eventually warranted, you want to **prove the local fix works** on one surface before committing to the broader audit. α first; system audit only if at least two additional surfaces independently surface the same label/control hierarchy friction after this fix ships.

---

## Recommended option

**Option α (drop unselected chip weight to `font-normal`).** Smallest change, addresses the user's named primary concern, preserves every prior debt's win, single shared-component test delta plus docs. Defer α-extended until you've seen α in production and confirmed whether stat presence or heading timidity remains friction.

---

## Acceptance criteria

When α is implemented:

1. `components/ui/filter-chip.tsx` contains `font-normal` on the unselected branch and `font-medium` on the selected branch (or equivalent CVA structure achieving the same effect). The shared base no longer carries `font-medium`.
2. `components/ui/filter-chip.test.tsx` asserts `font-normal` on unselected and `font-medium` on selected. The current unselected test does **not** assert any font-weight token, so implementation must add a positive `font-normal` assertion and a negative `font-medium` assertion there. Existing assertions for `bg-foreground/[0.07]`, `border-foreground/45`, `text-foreground`, `hover:bg-foreground/[0.12]`, `hover:border-foreground/60`, `cursor-pointer`, `dark:border-foreground/40`, `dark:hover:border-foreground/70` remain unchanged and still pass.
3. `docs/frontend/pattern-registry.md` I-4 entry updated: shared base loses `font-medium`; selected variant adds `font-medium`; unselected variant adds `font-normal` (or equivalent prose). Design rationale paragraph adds one sentence linking back to DEBT-377: "Unselected chips intentionally render at `font-normal` so they sit one weight step below `text-sm font-medium text-foreground` section labels, restoring label-over-chip hierarchy without regressing the DEBT-295 contrast win."
4. `docs/frontend/pages/practice.md` FilterChip table updated to reflect the new shared/unselected/selected weight split.
5. No production behavior change: chips are still keyboard accessible, `aria-pressed` still flips on click, focus ring still appears, disabled state still pointer-events-none + opacity-50.
6. All gates green locally and in CI: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build`. E2E if local Clerk + Stripe billing env is available.
7. Visual verification screenshot in PR body, comparing before/after on the practice starter card with all three filter sections expanded so all chips are visible. Particular attention to: (a) Topic / Substance / Treatment labels visibly heavier than chip text, (b) Selected chips clearly heavier than unselected chips, (c) No regression to chip border, fill, hover, or focus.

---

## Out of scope (explicitly listed; do NOT bundle)

These are real observations, considered, and excluded from this debt. Per `feedback_no_speculative_debt.md`, do not file them as follow-up debts pre-emptively. Wait for concrete evidence after α ships:

- **S1: Stat prominence.** "612 questions available." — defer until α is in production. If the form still feels visually flat with proper label hierarchy restored, file as a separate P3 with screenshot evidence.
- **S2: Disclosure label asymmetry.** Topic/Substance/Treatment labels live inside the `<summary>` row while Mode/Status/Difficulty labels live above the control. Defer; changing disclosure composition is a separate layout problem.
- **S3: Substance row hangs.** User-observed but layout-dependent. Defer; left-aligned chip wrapping is currently the least surprising scan pattern.
- **S4: Grayscale palette / color personality.** User-observed concern, but brand-level rather than component-level. Out of scope for a hierarchy fix; revisit only through a deliberate brand/visual-direction pass.
- **Card heading bump.** `text-base font-semibold` → `text-lg font-semibold` is a one-line change but introduces a separate hierarchy axis adjustment. Defer; revisit if α-extended becomes the right shape after α ships.
- **Cross-surface label hierarchy audit.** Dashboard, billing, history, settings all use `text-sm font-medium text-foreground` for section labels. Auditing whether those surfaces have the same chip-vs-label inversion is a separate piece of work; this debt does not authorize that audit.

---

## Test plan

### Unit tests to update

- `components/ui/filter-chip.test.tsx`
  - Unselected styling test (`:42-68`): add a positive assertion that `font-normal` is present and a negative assertion that `font-medium` is **not** present in the unselected branch. There is no current font-weight assertion to "swap."
  - Selected styling test (`:33-40`): add a positive assertion that `font-medium` **is** present (currently the test only asserts `aria-pressed="true"` and `bg-primary`).

### Unit tests that must still pass unchanged

- `app/(app)/app/practice/components/practice-session-starter.test.tsx` — no class strings on the FilterChip render path are asserted in this test. It asserts the shadcn primitives, input shell, heading text (`:88-90`), filter fieldset grouping, disclosure summary tokens, footer count tokens, and section ordering. Those assertions should stay unchanged under Option α.
- `app/(app)/app/practice/page.test.tsx` — contains a misleadingly named `renders difficulty filter chips` test, but it only asserts the Difficulty segmented-control labels (`Easy`, `Medium`, `Hard`) and does not inspect `FilterChip` tokens. Leave unchanged.
- `app/(app)/app/practice/components/practice-session-starter.browser.spec.tsx` — asserts availability-count copy and starter interaction behavior, not chip class strings. Leave unchanged.

### Browser-mode tests

- None expected to break; the change is purely visual.

### E2E

- Practice flow E2E (`tests/e2e/practice.spec.ts`) does not assert chip class strings. Should still pass unchanged.

### Visual regression

- Pattern Registry-listed downstream consumers of FilterChip: practice-session-starter only (per current pattern-registry I-4 consumer list). Quick search confirms only one production import: `app/(app)/app/practice/components/practice-session-starter.tsx:8`. No other surface ships chips today, so the change is fully bounded to this card.

### Manual verification

- Open `/app/practice` (Clerk-authenticated browser).
- Expand all three disclosures (Topic, Substance, Treatment).
- Confirm: section labels read heavier than chip text. Selected chips read heavier than unselected. Chip rest fill, border, hover state, focus ring all unchanged. SegmentedControl unchanged.

---

## Rollback plan

If the implementation surfaces a regression:

1. Revert the `font-normal` change in `filter-chip.tsx` (single hunk).
2. Revert the corresponding `filter-chip.test.tsx` assertion update.
3. Revert the pattern-registry I-4 doc note.

Total revert is one commit, three files. No data, no migrations, no schema impact. Safe.

---

## References

### This debt
- Surface: `app/(app)/app/practice/components/practice-session-starter.tsx`
- Component: `components/ui/filter-chip.tsx`
- Component test: `components/ui/filter-chip.test.tsx`
- Surface test: `app/(app)/app/practice/components/practice-session-starter.test.tsx`

### Design system
- `docs/frontend/standards.md` — Typography (§4), tokens (§1)
- `docs/frontend/typography-policy.md` — Two-pipeline model, hardcoded UI text subfamilies
- `docs/frontend/contrast-policy.md` — Required vs supplementary boundary classification
- `docs/frontend/pattern-registry.md` — I-4 (FilterChip), I-5 (SegmentedControl), S-1 (Card), S-2 practice variant
- `docs/frontend/pages/practice.md` — Element-by-element practice page audit

### Prior debt (load-bearing context, do not regress)
- DEBT-290 (filter container tonal fill): `docs/_archive/debt/debt-290-practice-filter-tonal-fill-elevation.md`
- DEBT-291 (chip light-mode border AA): `docs/_archive/debt/debt-291-filter-chip-light-mode-border-contrast.md`
- DEBT-294 (chip rest fill depth + cursor): `docs/_archive/debt/debt-294-filter-chip-fill-depth-and-cursor.md`
- **DEBT-295 (chip unselected text weight)**: `docs/_archive/debt/debt-295-filter-chip-unselected-text-weight.md` — promoted text from `/60` to full foreground; this debt builds *on* that win, does not undo it
- DEBT-292 (disclosure indicator): `docs/_archive/debt/debt-292-filter-section-disclosure-indicator.md`
- DEBT-296 (summary text hierarchy swap): `docs/_archive/debt/debt-296-filter-section-summary-hierarchy-swap.md`
- DEBT-297 (starter card UI polish / heading): `docs/_archive/debt/debt-297-practice-starter-ui-polish.md`
- DEBT-298 (UI structural consistency audit): `docs/_archive/debt/debt-298-ui-structural-consistency.md`
- DEBT-309 (chip hover border affordance): `docs/_archive/debt/debt-309-filter-chip-hover-border-affordance.md`

### External
- *Refactoring UI* by Adam Wathan & Steve Schoger — hierarchy chapter topics include "Size isn't everything," "De-emphasize to emphasize," and "Balance weight and contrast"; color/depth chapters cover intentional shade systems and flat-design depth. This doc uses those as design principles, not direct quotations.

---

## Audit-resolved design decisions

1. **`font-normal` is the right floor for this implementation.** It stays inside the 400-500 normal UI-weight band, preserves full `text-foreground`, and leaves border/fill/hover/focus/pressed semantics intact. The selected state keeps `font-medium`, so selected chips still read louder than unselected chips.
2. **Do not change SegmentedControl.** Its inactive items use `font-medium` but also `text-muted-foreground`; its active item uses `bg-primary text-primary-foreground`. The same label/chip parity problem does not exist because the segmented control is a compact single control, not a dense multi-select fieldset under a label.
3. **Do not bump disclosure summary labels in α.** Mode/Questions/Status/Difficulty and Topic/Substance/Treatment should remain symmetric at `text-sm font-medium text-foreground`. If the card still feels flat after chip de-emphasis, revisit label/heading/stat hierarchy as a separate α-extended or follow-up debt.
