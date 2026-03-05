# BS-042: Contrast Consistency and WCAG Compliance Audit

**Created:** 2026-03-05
**Triggered by:** Visual review of choice button separation, verdict badge contrast (DEBT-278), and cross-surface inconsistency observations.

---

## The Concern

Multiple UI surfaces use different contrast strategies with no unified WCAG compliance standard:

1. **Choice buttons (A, B, C, D)** — after DEBT-273 reduced contrast for "surface hierarchy," the choices now blend into the card background. Borders and fills are nearly invisible.
2. **Verdict badge** — colored text on colored tint produces monochromatic low-contrast (DEBT-278).
3. **Dashboard** — uses the same `border-border/60 bg-muted/20` as choice buttons but "looks fine" — because it has more internal content, not better contrast.
4. **Feedback sections** — use semantic color borders (`border-success/20`, `border-destructive/20`) at low opacity, also failing contrast requirements.
5. **No WCAG contrast policy exists** — the pattern registry defines opacity scales for visual hierarchy but never validates them against computed contrast ratios.

---

## What We Have

The **Pattern Registry** (`docs/frontend/pattern-registry.md`) is detailed and canonical. It defines:

- Dark Mode Gray Stack (6 layers from 3.5% to 93% lightness)
- Background Opacity Scale (`/20`, `/40`, `/50`, `/60`)
- Border Opacity Scale (`/60`, `/40`, 100%)
- Semantic Status Background Scale (`/5`, `/10`, `/15`)

These scales were designed for **visual hierarchy** (layers step up, borders inside containers are subordinate to parent borders). They work as a design system for layering. But they were never validated against WCAG contrast requirements.

### Relevant WCAG Criteria

| Criterion | What It Covers | Minimum Ratio |
|-----------|---------------|---------------|
| SC 1.4.3 (AA) | Normal text (< 18pt or < 14pt bold) | 4.5:1 |
| SC 1.4.3 (AA) | Large text (>= 18pt or >= 14pt bold) | 3.0:1 |
| SC 1.4.11 (AA) | Non-text contrast: UI component boundaries, focus indicators, graphical objects | 3.0:1 |

SC 1.4.11 is the one that governs borders, interactive element boundaries, and visual indicators. It applies to the choice button borders, card borders, and any visual boundary the user needs to perceive to understand the UI structure.

---

## Computational Findings

All values computed from actual token values in `globals.css` using WCAG 2.1 relative luminance formula. Dark mode only (light mode has its own documented asymmetry — see Pattern Registry 1.2 caveat).

### Effective Dark Mode Gray Values

```
Page background (--background):    3.5%
Card surface (--card):              7.0%
bg-muted/20 on card:                7.8%   ← choice button fill
bg-muted/40 on card:                8.6%   ← choice button hover/selected
border-border/60 on card:          11.8%   ← choice button border
border-border (100%):              15.0%   ← card border
bg-muted (solid):                  11.0%   ← letter badge fill
muted-foreground:                  45.0%   ← secondary text
foreground:                        93.0%   ← primary text
```

### Border / Surface Contrast (SC 1.4.11 — needs >= 3:1)

| Surface Pair | Contrast | WCAG 1.4.11 |
|-------------|----------|-------------|
| Choice button border vs card | **1.13:1** | FAIL |
| Choice button fill vs card | **1.02:1** | FAIL |
| Card border vs page background | **1.32:1** | FAIL |
| Card border vs card fill | **1.24:1** | FAIL |
| border-success/20 vs card | **1.36:1** | FAIL |
| border-destructive/20 vs card | **1.17:1** | FAIL |
| border-border/60 vs card | **1.13:1** | FAIL |
| Choice hover vs choice base | **1.02:1** | FAIL |

**Every border/surface pair sampled in this table fails WCAG SC 1.4.11.**

Important scope note: this table focuses on muted-border/tinted-surface patterns (`border-border/60`, `border-success/20`, `border-destructive/20`) used in choice rows and feedback section cards. Not every border token in the app fails 3:1. Full semantic borders (for example `border-success`, `border-destructive`, `border-warning`) can exceed 3:1 depending on the background.

The gray stack's 3.5% → 7% → 11% → 15% progression creates elegant visual layering, but the gaps between layers are too small for WCAG compliance. 7% → 11.8% (choice border on card) is only 4.8 percentage points of lightness — far too little for 3:1 contrast.

### Text Contrast (SC 1.4.3 — needs >= 4.5:1 for normal text)

| Text Pair | Contrast | WCAG 1.4.3 |
|-----------|----------|-------------|
| text-foreground on choice bg | **15.77:1** | PASS |
| text-foreground on card | **16.05:1** | PASS |
| text-muted-foreground on choice bg | **3.87:1** | FAIL (normal text) |
| Letter badge text on bg-muted | **14.57:1** | PASS |

**Text-foreground is fine everywhere. `text-muted-foreground` fails for normal-size text** (3.87:1 vs 4.5:1 required). It passes for large text (>= 18pt or >= 14pt bold), so its use in `text-sm` labels is a violation.

### Verdict Badge Contrast (DEBT-278, for reference)

| Combo | Light | Dark (solid) | Dark (dark:bg-*/60) |
|-------|-------|-------------|---------------------|
| Success + foreground | 5.07:1 PASS | 2.55:1 FAIL | 5.55:1 PASS |
| Destructive + foreground | 4.64:1 PASS | 4.10:1 FAIL | 7.75:1 PASS |

DEBT-278 proposes solving the badge specifically with `dark:bg-*/60`, following the button.tsx pattern.

---

### Audit Coverage (Current Revision)

Production grep coverage (`app/**` + `components/**`, `.tsx` only, excluding tests/specs) found **43 opacity-modifier usages across 18 files**.

This document includes explicit WCAG computations for the highest-impact surfaces currently driving UX concern:
- Choice button neutral base/hover/border (`choice-button.tsx`)
- Card border vs page/card surfaces (`card.tsx` + token math)
- Feedback section semantic borders (`feedback.tsx`)
- Verdict badge options (DEBT-278 table)
- Foreground/muted-foreground text on representative dark surfaces

Additional contrast-relevant patterns exist in the codebase and should be included in a follow-up full sweep if we want true exhaustive component-by-component WCAG accounting:
- Warning banners/cards (`app/(app)/app/layout.tsx`, `app/(app)/app/billing/page.tsx`, `app/(app)/app/questions/[slug]/question-page-client.tsx`)
- Error/toast surfaces (`components/error-card.tsx`, `components/ui/notification-provider.tsx`)
- Markdown clinical pearl border (`components/markdown/Markdown.tsx`)
- Other opacity-based separators/hover states (`app/(app)/app/history/components/history-sessions-tab.tsx`, `app/(app)/app/shared/components/session-breakdown-list.tsx`)

---

## Why the Dashboard "Looks Fine" but Choices Don't

The dashboard and choice buttons use **identical contrast tokens** (`border-border/60 bg-muted/20` inside Card). The computed contrast is the same (~1.13:1 for borders). But:

1. **Dashboard rows have dense text content** — the text itself (at 15.77:1 foreground contrast) defines the visual boundary. You don't need the border to see the row.
2. **Choice buttons are sparse** — one short sentence per button. The border and fill are the PRIMARY visual cues for button identity. When those are 1.13:1 contrast, the buttons vanish.
3. **Feedback sections use semantic color borders** — `border-success/20` and `border-destructive/20` add a color hue difference (green/red vs gray), making them slightly more perceptible than a gray-on-gray border at the same contrast ratio, due to chromatic contrast.

The pattern registry correctly identified that `border-border/60` is for "rows nested inside cards (subordinate to card border)." But choice buttons aren't subordinate rows — they're the **primary interactive elements** on the page. They need stronger visual identity than a muted data row.

---

## What Needs to Happen

### 1. Add WCAG Contrast Targets to Pattern Registry

The pattern registry is the right place for this. Proposed addition to Part 1:

```markdown
### 1.5 WCAG Contrast Targets

| Category | Minimum | Standard | Reference |
|----------|---------|----------|-----------|
| Normal text (< 18pt) | 4.5:1 | SC 1.4.3 AA | All text-sm, text-base, text-xs labels |
| Large text (>= 18pt or >= 14pt bold) | 3.0:1 | SC 1.4.3 AA | Headings, prominent labels |
| Non-text UI components | 3.0:1 | SC 1.4.11 AA | Borders, focus rings, icons, graphical indicators |

All opacity scales in §1.2–1.4 must be validated against these targets on their intended parent surface.
```

### 2. Audit and Fix Specific Violations

These are the concrete problems to resolve, roughly priority-ordered:

| ID | Violation | Current | Impact |
|----|-----------|---------|--------|
| V1 | Choice button border barely visible | `border-border/60` = 1.13:1 | High — primary interactive element |
| V2 | Choice button fill indistinguishable from card | `bg-muted/20` = 1.02:1 | High — buttons blend into card |
| V3 | `text-muted-foreground` fails for `text-sm` | 3.87:1 vs 4.5:1 required | Medium — labels, timestamps, secondary text |
| V4 | Card border barely visible on page | `border` = 1.32:1 | Low — cards identified by content, not border |
| V5 | Semantic borders too faint | `border-success/20` = 1.36:1 | Low — hue provides chromatic cue |
| V6 | Hover state imperceptible | `bg-muted/20` → `bg-muted/40` = 1.02:1 | Medium — hover feedback matters for interactivity |

### 3. Possible Approaches (Not Decided)

**For V1/V2 (choice buttons):**
- Increase border opacity: `border-border` (full) instead of `border-border/60` — gives 1.24:1 (still fails 3:1, but more visible)
- Use a dedicated choice-button border token at higher lightness
- Add `shadow-md` or stronger shadow for depth-based separation instead of border-based
- Increase `bg-muted` opacity for more fill contrast

**For V3 (muted-foreground on text-sm):**
- Bump `--muted-foreground` lightness from 45% to ~50% to hit 4.5:1 on dark muted surfaces (threshold is ~49.2% on `bg-muted/20` over `bg-card`)
- Or only use `text-muted-foreground` at `text-base` or larger sizes

**For V4/V5 (card and semantic borders):**
- These may be acceptable as-is — cards are identified by content and elevation, not just borders
- Semantic borders add chromatic contrast (color hue), which aids perception even at low luminance contrast

**Important constraint:** DEBT-273 just shipped (March 4, one day ago). Any changes to choice button contrast must be justified by WCAG compliance, not just aesthetic preference, to avoid the oscillation of "too much contrast → not enough contrast → too much again."

---

## Existing System Strengths

Credit where due — the pattern registry IS the right architecture. The problem is a gap in the validation layer, not a design system failure:

- Token scales are well-organized and intentional
- Border hierarchy rule ("inner borders subordinate to parent") is correct
- Light-mode asymmetry is documented and accounted for
- Hover opacity context-dependence is documented
- DEBT-263 (text contrast) already fixed `text-success` and `text-destructive` HSL values for WCAG compliance

The fix is to add WCAG contrast ratio targets as a first-class constraint in the pattern registry, then validate all existing tokens against them computationally.

---

## Open Questions

1. **Should we target WCAG AA or AAA?** AA (3:1 non-text, 4.5:1 text) is the industry standard. AAA (4.5:1 non-text, 7:1 text) is aspirational. Most apps target AA.
2. **Is the gray stack fundamentally too compressed?** 3.5% → 7% → 11% → 15% may not have enough headroom for 3:1 contrast between adjacent layers. If so, the fix is at the token level, not the component level.
3. **Should choice buttons have a distinct pattern ID?** Currently they use I-3 (interactive row inside card), same as non-interactive rows. They may need their own pattern with stronger visual identity.
4. **Is full WCAG 1.4.11 compliance realistic for a dark-mode-first app?** Many production dark-mode apps (Spotify, Discord, VS Code) don't achieve 3:1 on all borders. The question is whether we set that as a target and close the gap, or accept a pragmatic threshold.

---

## Relationship to Other Work

| Doc | Relationship |
|-----|-------------|
| DEBT-278 (Verdict Badge) | Specific fix for badge contrast — proceed independently |
| DEBT-273 (Choice Button Surface Hierarchy) | The change that reduced choice button contrast — may need partial revision |
| DEBT-263 (Text Contrast) | Already fixed `text-success`/`text-destructive` tokens for WCAG — same methodology applies here |
| DEBT-262 (Light-Mode Opacity Scale) | Documents the light-mode asymmetry — related but separate |
| Pattern Registry §1.2–1.4 | The opacity scales that need WCAG validation added |
