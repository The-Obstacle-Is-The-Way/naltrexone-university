# Quick Practice — Dark Mode UI Audit

**Date:** 2026-03-06
**Page:** `/app/practice/quick`
**Theme:** Dark mode only (light mode not audited here)
**Source files:** `quick-practice-client.tsx`, `practice-view.tsx`, `question-card.tsx`, `choice-button.tsx`, `segmented-control.tsx`, `tab-switch-styles.ts`, `card.tsx`

**Status:** Historical audit plus current-state note. The element-by-element findings below for choice buttons and the segmented control document the pre-DEBT-280 state that motivated the refinement. Current live tokens after DEBT-280 are summarized in the next section.

---

## Current State After DEBT-280

### Choice Buttons

- Rest (dark, unselected, no verdict): `dark:border-foreground/40` with no dark fill override
- Hover (dark, unselected): `dark:hover:border-foreground/55 dark:hover:bg-foreground/8`
- Selected (dark, neutral): `dark:border-foreground/70 dark:bg-foreground/15`
- Letter badge remains unchanged: `dark:border-foreground/60 dark:bg-foreground/20`

### Shared Tab-Switch Container

- Container classes: `inline-flex rounded-lg border border-border bg-muted p-1`
- The shared `dark:border-foreground/40` override was removed from `tabSwitchContainerClasses`

---

## Page Structure

Top to bottom:

1. **Nav bar** — global app navigation
2. **Page heading** — "Quick Practice" + subtitle + "Back to Practice" link
3. **Segmented control** — Unanswered / Incorrect / Bookmarked tabs with counts
4. **Question card** — stem text + 4 choice buttons (A–D)
5. **Action bar** — Submit, Next, Bookmark buttons

---

## Dark Mode Token Reference

From `app/globals.css` `.dark {}`:

| Token | HSL | Hex | Description |
|-------|-----|-----|-------------|
| `--background` | `0 0% 3.5%` | `#090909` | Page background |
| `--foreground` | `0 0% 93%` | `#EDEDED` | Primary text |
| `--card` | `0 0% 7%` | `#121212` | Card surface |
| `--muted` | `0 0% 11%` | `#1C1C1C` | Muted surface |
| `--muted-foreground` | `0 0% 51.5%` | `#838383` | Secondary text |
| `--border` | `0 0% 15%` | `#262626` | Default border |
| `--primary` | `0 0% 93%` | `#EDEDED` | Primary accent (= foreground) |
| `--primary-foreground` | `0 0% 3.5%` | `#090909` | Text on primary |

---

## Element-by-Element Audit (Pre-DEBT-280 Historical Snapshot)

### 1. Question Card Container

**Source:** `components/ui/card.tsx`
**Classes:** `bg-card text-card-foreground flex flex-col gap-0 rounded-2xl border p-6 shadow-sm`

| Property | Token | Computed (dark) | Notes |
|----------|-------|----------------|-------|
| Background | `bg-card` | `#121212` | Slightly elevated from page `#090909` |
| Border | `border-border` (default) | `#262626` | Very subtle — ~1.3:1 vs both page and card bg |
| Text | `text-card-foreground` | `#EDEDED` | High contrast on card — no issue |

**Observation:** The card border is near-invisible, which is fine — the card is defined by its fill elevation and shadow. This is the baseline surface that choice buttons sit on.

---

### 2. Choice Buttons (Rest State, Pre-DEBT-280)

**Source:** `components/question/choice-button.tsx:30-33`
**Classes (dark, unselected, no verdict):** `dark:border-foreground/40 dark:bg-foreground/8`

| Property | Token | Computed on card (#121212) | Contrast vs card |
|----------|-------|-----------------------------|-----------------|
| Border | `foreground/40` | `#6A6A6A` (40% white on #121212) | ~3.2:1 |
| Fill | `foreground/8` | `#232323` (8% white on #121212) | ~1.2:1 |

**Concerns:**

- **C1: Gray fill looks unnatural.** The `bg-foreground/8` fill creates a visible gray tone (`#232323`) against the card (`#121212`). The buttons look like gray boxes floating on a dark card. Before DEBT-279, these had no dark fill override — they blended flush with the card surface.

- **C2: Border is too heavy.** `border-foreground/40` at `#6A6A6A` is visually prominent. It draws a hard box around each choice. The question card itself only has `border-border` (`#262626`) — so the choice borders are ~2.6x brighter than their parent container's border. This inversion of the hierarchy makes the choices feel caged/boxed rather than contained.

- **C3: Letter badge border compounds the heaviness.** The badge (`dark:border-foreground/60 dark:bg-foreground/20`) adds another bright ring inside each already-heavy button border, creating a double-border visual weight.

---

### 3. Choice Buttons (Hover State, Pre-DEBT-280)

**Source:** `choice-button.tsx:35-37`
**Classes (dark, unselected, hover):** `dark:hover:border-foreground/70 dark:hover:bg-foreground/15`

| Property | Token | Computed on card (#121212) | Contrast vs card |
|----------|-------|-----------------------------|-----------------|
| Border | `foreground/70` | `#ABABAB` | ~7.0:1 |
| Fill | `foreground/15` | `#333333` | ~1.6:1 |

**Concerns:**

- **C4: Fill change from rest to hover is subtle.** `#232323` → `#333333` is only ~6 lightness points. In the screenshot, hovering on choice B is barely distinguishable from the non-hovered choices. The border jump (40% → 70%) is the primary hover signal — the fill change is nearly lost.

- **C5: Border becomes very bright on hover.** `#ABABAB` on a dark card is quite eye-catching. The hover border is now brighter than the question stem text would be in a typical reading flow.

---

### 4. Choice Buttons (Selected State, Pre-DEBT-280)

**Source:** `choice-button.tsx:40-42`
**Classes (dark, selected):** `dark:border-foreground/70 dark:bg-foreground/20`

| Property | Token | Computed on card (#121212) | Contrast vs card |
|----------|-------|-----------------------------|-----------------|
| Border | `foreground/70` | `#ABABAB` | ~7.0:1 |
| Fill | `foreground/20` | `#3E3E3E` | ~1.9:1 |

**Concerns:**

- **C6: Selected border = hover border.** Both use `foreground/70`. The only difference between "hovering an unselected choice" and "looking at the selected choice" is the fill (15% vs 20%). This 5-percentage-point fill gap is extremely subtle and hard to perceive.

- **C7: Selected fill barely differs from hover fill.** `#333333` → `#3E3E3E` is ~4 lightness points. The user has to rely almost entirely on the radio input's hidden state and the letter badge subtle styling to know which choice is selected.

---

### 5. Segmented Control (Pre-DEBT-280)

**Source:** `components/ui/tab-switch-styles.ts`
**Container classes:** `inline-flex rounded-lg border border-border bg-muted p-1 dark:border-foreground/40`

| Property | Token | Computed | Notes |
|----------|-------|---------|-------|
| Container bg | `bg-muted` | `#1C1C1C` | Slightly lighter than card |
| Container border | `dark:border-foreground/40` | `#6A6A6A` | Same heavy border as choice buttons |
| Active tab bg | `bg-primary` | `#EDEDED` | High contrast — looks good |
| Active tab text | `text-primary-foreground` | `#090909` | Dark on light — no issue |
| Inactive tab text | `text-muted-foreground` | `#838383` on `#1C1C1C` | ~4.6:1 — passes 4.5:1 but just barely |

**Concerns:**

- **C8: Container border matches choice button heaviness.** `dark:border-foreground/40` on the segmented control gives it the same "caged" feel as the choice buttons. The control is small and visually contained — a lighter border or no explicit dark border would let the bg-muted surface define it.

---

### 6. Action Bar (Submit / Next / Bookmark)

**Source:** `practice-view.tsx:275-347`
**Button variant classes:** Standard `Button` with `variant="outline"` and `variant="default"`, `rounded-full`

**Observation:** The action bar buttons use the standard shadcn Button component. They appear fine — the default/outline variants have their own established hover/active patterns. No dark-mode-specific concerns noted here.

---

## Summary of Concerns (Pre-DEBT-280)

| # | Element | Issue | Severity |
|---|---------|-------|----------|
| C1 | Choice button (rest) | Gray fill (`bg-foreground/8`) looks unnatural — buttons should blend with card | Aesthetic |
| C2 | Choice button (rest) | Border (`border-foreground/40`) too heavy — 2.6x brighter than parent card border | Aesthetic |
| C3 | Letter badge | Double-border effect compounds visual heaviness | Aesthetic |
| C4 | Choice button (hover) | Fill change rest→hover barely perceptible (8%→15%) | UX/Hierarchy |
| C5 | Choice button (hover) | Border becomes very bright at 70% — draws too much attention | Aesthetic |
| C6 | Choice button (selected) | Border same as hover — states not distinguishable by border alone | UX/Hierarchy |
| C7 | Choice button (selected) | Fill hover→selected barely perceptible (15%→20%) | UX/Hierarchy |
| C8 | Segmented control | Container border same heavy treatment as choice buttons | Aesthetic |

**Root cause:** DEBT-279 added `dark:border-foreground/40` and `dark:bg-foreground/8` uniformly to pass WCAG SC 1.4.11 (3:1 for non-text boundaries). The contrast targets are met, but the aesthetic result is heavy — particularly for choice buttons, which are the most visually prominent interactive elements on the page. The stepped fill hierarchy (8→15→20) is technically present but perceptually weak.

---

## Potential Options Explored (Historical)

### Option A: Remove fill, lighten border

Remove the gray fill entirely — let buttons match the card background. Keep the border but soften it.

```
Rest:     bg-transparent  border-foreground/30   (border ~2.5:1 — below 3:1, FAILS WCAG)
Hover:    bg-foreground/10 border-foreground/50
Selected: bg-foreground/15 border-foreground/60
```

**Problem:** Dropping the rest border below 3:1 fails SC 1.4.11 unless the border is classified as decorative (and something else identifies the component). The choice buttons are identifiable by their layout, text, and letter badges — so the border could arguably be decorative. But this is a gray area.

### Option B: Transparent fill at rest, border stays compliant

```
Rest:     bg-transparent     border-foreground/40  (same border, no fill)
Hover:    bg-foreground/10   border-foreground/50
Selected: bg-foreground/18   border-foreground/60
```

Buttons at rest match the card surface — no gray box look. Fill only appears on interaction. Border stays at 3:1+ for WCAG. The fill steps (0→10→18) are wider and more perceptible than the current (8→15→20).

**Tradeoff:** Removes the "all four choices are visually grouped" affordance that the uniform fill provides. The border alone + letter badges + layout may be sufficient grouping.

### Option C: Reduce border weight, widen fill steps

Keep a fill but make the border less dominant. Widen the gap between states.

```
Rest:     bg-foreground/5    border-foreground/35
Hover:    bg-foreground/12   border-foreground/50
Selected: bg-foreground/22   border-foreground/60
```

Subtler rest state, more separation between hover and selected. But still has a visible gray tint at rest.

### Option D: Border-only at rest, fill on interaction (user suggestion direction)

The user suggested: "could it return to all black with a lighter border?"

```
Rest:     bg-transparent     border-foreground/35  (lighter border — ~2.8:1, just under 3:1)
Hover:    bg-foreground/8    border-foreground/50
Selected: bg-foreground/15   border-foreground/65
```

Close to the user's instinct. The rest border at /35 would be ~2.8:1 — just under the WCAG 3:1 threshold. If we classify the border as decorative (buttons are identifiable by badge + text + fieldset grouping), this could work. Otherwise, /40 is the minimum for compliance.

### Option E: Hybrid — transparent fill, /40 border, stronger state differentiation

```
Rest:     bg-transparent     border-foreground/40  (WCAG compliant)
Hover:    bg-foreground/12   border-foreground/55
Selected: bg-foreground/20   border-foreground/70  ring-1 ring-foreground/30
```

Keep WCAG compliance. The selected state gets an additional ring to clearly differentiate from hover. The fill steps (0→12→20) are wider and more perceptible.

---

## Open Questions (Resolved)

1. **Is the choice button border a "required boundary" under SC 1.4.11?** Yes — the border helps communicate the clickable area and is kept at `/40` (~3.46:1). Dropping below 3:1 is not justified for choice buttons. Resolved in [DEBT-280](../../_archive/debt/debt-280-choice-button-dark-mode-surface-refinement.md) Approach A.

2. **Should the fill hierarchy be widened or removed at rest?** Removed at rest. New progression: 0 → 8 → 15 (gaps of 8 and 7 — both perceptible). Resolved in [DEBT-280](../../_archive/debt/debt-280-choice-button-dark-mode-surface-refinement.md).

3. **Should the segmented control border get its own treatment?** Yes — the `dark:border-foreground/40` override is removed from `tabSwitchContainerClasses`. The container border is classified as decorative (active pill provides identification). Falls back to `border-border`. Documented in [contrast-policy.md](../contrast-policy.md) §2. Resolved in [DEBT-280](../../_archive/debt/debt-280-choice-button-dark-mode-surface-refinement.md).

4. **What did the page look like before DEBT-279?** No dark fill overrides, default `border-border` (`#262626`). DEBT-280 restores the transparent fill at rest while keeping the WCAG-compliant `/40` border — a middle ground between pre-DEBT-279 aesthetics and compliance.

---

## Scope Note

This audit covers the Quick Practice question-answering page only. The Practice Starter page (`/app/practice`) now has its own page inventory at [practice.md](./practice.md), and its filter-container/chip surface work is tracked under [DEBT-290](../../debt/debt-290-practice-filter-tonal-fill-elevation.md).
