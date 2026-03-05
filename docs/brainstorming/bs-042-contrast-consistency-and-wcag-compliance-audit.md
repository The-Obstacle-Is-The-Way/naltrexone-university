# BS-042: Contrast Consistency and WCAG Compliance Audit

**Created:** 2026-03-05
**Triggered by:** Visual review of choice button separation, verdict badge contrast (DEBT-278), and cross-surface inconsistency observations.
**Post-fix update:** 2026-03-05 (DEBT-279 implementation pass 1)

This document now contains both:
- pre-remediation baseline findings (captured first on 2026-03-05), and
- post-remediation verification measurements after the DEBT-279 implementation pass.

---

## The Concern

Multiple UI surfaces use different contrast strategies with no unified WCAG compliance standard:

1. **Choice buttons (A, B, C, D)** — after DEBT-273 reduced contrast for "surface hierarchy," the choices now blend into the card background. Borders and fills are nearly invisible.
2. **Verdict badge** — colored text on colored tint produces monochromatic low-contrast (DEBT-278).
3. **Dashboard** — uses the same `border-border/60 bg-muted/20` as choice buttons but "looks fine" — because it has more internal content, not better contrast.
4. **Feedback sections** — use semantic color borders (`border-success/20`, `border-destructive/20`) at low opacity, also failing contrast requirements.
5. **A WCAG contrast policy now exists, but implementation is non-compliant** — `docs/frontend/contrast-policy.md` is canonical, but current component patterns still fail the documented AA targets.

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

## Computational Findings (Pre-Remediation Baseline)

All values computed from actual token values in `globals.css` using WCAG 2.1 relative luminance formula. Dark mode only (light mode has its own documented asymmetry — see Pattern Registry 1.2 caveat).

Runtime spot-check note (2026-03-05): browser-computed values from an actual review-mode question page (`body` 9/9/9, `card` 18/18/18, unselected choice fill ~20/20/20, unselected choice border ~30/30/30) match the token-derived composites below. A separate dashboard page audit confirmed identical effective values: row fill `rgb(20,20,20)`, row border `rgb(30,30,30)`, card `rgb(18,18,18)`, muted text `rgb(115,115,115)` — producing 1.12:1 (border), 1.02:1 (fill), 3.89:1 (muted text), 1.32:1 (card border). A history page audit confirmed the page-level variant: row fill `rgb(13,13,13)`, row border `rgb(26,26,26)`, muted tab/filter text on `bg-muted` at 3.59:1, caption text on page bg at 4.20:1, and `text-muted-foreground/60` ("Unanswered") at ~2.19:1. All are consistent with token-derived predictions.

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
| History session row border (`border-border/60`) vs page bg (`history-sessions-tab.tsx:181`) | **1.14:1** | FAIL |
| History session row fill (`bg-muted/20`) vs page bg (`history-sessions-tab.tsx:181`) | **1.02:1** | FAIL |
| Reference divider (`border-border/40`) vs card | **1.08:1** | FAIL |
| Session breakdown divider (`border-border/30`) vs expanded row bg (`history-sessions-tab.tsx:245`) | **~1.06:1** | FAIL (likely decorative — spacing communicates grouping) |
| List item divider (`divide-border/20`) vs expanded row bg (`session-breakdown-list.tsx:28`) | **~1.04:1** | FAIL (likely decorative — `py-2` padding separates items) |
| Neutral badge fill (`bg-muted`) vs neutral choice fill (`bg-muted/20`) | **1.08:1** | FAIL |
| Neutral badge border (`border`) vs neutral choice fill (`bg-muted/20`) | **1.22:1** | FAIL |
| Clinical pearl accent (`border-foreground/20`) vs success card fill (`bg-success/5`) | **1.78:1** | FAIL |
| Choice hover vs choice base | **1.02:1** | FAIL |
| Outline action button border (`border-input`) vs page background | **1.32:1** | FAIL |
| Outline action button border (`border-input`) vs history session row fill (`history-sessions-tab.tsx:224-227`) | **1.28:1** | FAIL |

**Every border/surface pair sampled in this table fails WCAG SC 1.4.11.**

Important scope note: this table focuses on muted-border/tinted-surface patterns (`border-border/60`, `border-success/20`, `border-destructive/20`) used in choice rows and feedback section cards. Not every border token in the app fails 3:1. Full semantic borders (for example `border-success`, `border-destructive`, `border-warning`) can exceed 3:1 depending on the background.

The gray stack's 3.5% → 7% → 11% → 15% progression creates elegant visual layering, but the gaps between layers are too small for WCAG compliance. 7% → 11.8% (choice border on card) is only 4.8 percentage points of lightness — far too little for 3:1 contrast.

Additional context from runtime capture: page background (3.5%) vs card fill (7%) computes to ~**1.06:1**. That by itself is not automatically an SC 1.4.11 failure, but it explains why users rely heavily on borders/elevation to perceive containment.

### Text Contrast (SC 1.4.3 — needs >= 4.5:1 for normal text)

| Text Pair | Contrast | WCAG 1.4.3 |
|-----------|----------|-------------|
| text-foreground on choice bg | **15.77:1** | PASS |
| text-foreground on card | **16.05:1** | PASS |
| text-muted-foreground on choice bg | **3.87:1** | FAIL (normal text) |
| text-muted-foreground on card (`Reference` heading) | **3.95:1** | FAIL (normal text) |
| text-muted-foreground on success card (`Clinical Pearl` label) | **3.73:1** | FAIL (normal text) |
| text-muted-foreground on wrong-answer card (`bg-background/50` over card) | **4.10:1** | FAIL (normal text) |
| text-muted-foreground — inactive nav links on page bg | **4.20:1** | FAIL (normal text) |
| text-muted-foreground — inactive segmented-control items on `bg-muted` | **3.59:1** | FAIL (normal text) |
| text-muted-foreground — history page subtitle on page bg (`history-page-client.tsx:38`) | **4.20:1** | FAIL (normal text) |
| text-muted-foreground — history caption ("Showing X–Y…") on page bg (`history-sessions-tab.tsx:118`) | **4.20:1** | FAIL (normal text) |
| text-muted-foreground — history tab/filter inactive items on `bg-muted` (`history-tab-bar.tsx`, `history-sessions-tab.tsx:121-147`) | **3.59:1** | FAIL (normal text) |
| text-muted-foreground — dashboard labels/timestamps on row bg | **3.89:1** | FAIL (normal text) |
| text-muted-foreground/60 — "Unanswered" status in session breakdown (`session-breakdown-list.tsx:68`) | **~2.2:1** | FAIL (normal text — compounds V3 base with 60% opacity) |
| `text-warning-foreground` on `bg-warning/10` (PastDueBanner, dark mode) | **~1.03:1** | FAIL (normal text) |
| Letter badge text on bg-muted (no parent opacity) | **14.57:1** | PASS |
| Wrong-unselected choice text (effective `opacity-50`) on choice bg | **4.73:1** | PASS (barely) |
| Wrong-unselected badge letter (effective `opacity-50`) on badge bg | **4.37:1** | FAIL (normal text) |

**Text-foreground is fine in default states. `text-muted-foreground` fails for normal-size text** across multiple real usages in the app (3.59:1–4.20:1 vs 4.5:1 required), and the wrong-unselected `opacity-50` state in `components/question/choice-button.tsx` pushes badge letters to 4.37:1 (also below AA). A separate severe failure also exists in dark mode warning surfaces (`text-warning-foreground` on `bg-warning/10` at ~1.03:1).

### Verdict Badge Contrast (DEBT-278, for reference)

| Combo | Light | Dark (solid) | Dark (dark:bg-*/60) |
|-------|-------|-------------|---------------------|
| Success + foreground | 5.07:1 PASS | 2.55:1 FAIL | 5.55:1 PASS |
| Destructive + foreground | 4.64:1 PASS | 4.10:1 FAIL | 7.75:1 PASS |

DEBT-278 proposes solving the badge specifically with `dark:bg-*/60`, following the `components/ui/button.tsx` pattern.

---

### Audit Coverage (Current Revision)

Production grep coverage (`app/**` + `components/**`, `.tsx` only, excluding tests/specs) found **44 opacity-modifier usages across 18 files**.

This document includes explicit WCAG computations for the highest-impact surfaces currently driving UX concern:
- Choice button neutral base/hover/border (`components/question/choice-button.tsx`)
- Choice wrong-unselected opacity state (`components/question/choice-button.tsx`) and its effect on badge letter contrast
- Card border vs page/card surfaces (`components/ui/card.tsx` + token math)
- Feedback section semantic borders (`components/question/feedback.tsx`)
- Feedback section secondary/label text (`text-muted-foreground`) (`components/question/feedback.tsx`, `components/markdown/Markdown.tsx`)
- Dashboard + bookmarks real-world usages of `text-muted-foreground` at `text-sm`/`text-xs` (`app/(app)/app/dashboard/page.tsx`, `app/(app)/app/bookmarks/page.tsx`)
- App navigation + header action links on page background (`components/app-desktop-nav.tsx`, `components/mobile-nav.tsx`, `components/auth-nav.tsx`, `lib/shared-styles.ts`)
- Verdict badge options (DEBT-278 table)
- Review-mode outline action button border (`app/(app)/app/questions/[slug]/question-page-client.tsx` using `components/ui/button.tsx` outline variant)
- Foreground/muted-foreground text on representative dark surfaces
- Practice tag filter containers (`app/(app)/app/practice/components/practice-session-starter.tsx` — `border-border/60 bg-muted/20`, plus `text-muted-foreground` at `text-xs`/`text-sm` on description, status labels, available count)
- Practice segmented controls via shared tab-switch classes (`components/ui/tab-switch-styles.ts` consumed by `components/ui/segmented-control.tsx`) — inactive `text-muted-foreground` on `bg-muted`
- Session breakdown "Unanswered" label (`app/(app)/app/shared/components/session-breakdown-list.tsx` — `text-muted-foreground/60`, compounds V3)
- Session breakdown dividers (`divide-border/20`) and history session dividers (`border-border/30`)
- History session rows on page background (`app/(app)/app/history/components/history-sessions-tab.tsx` — `border-border/60 bg-muted/20` resolve to ~1.14:1 border and ~1.02:1 fill against page bg)
- History "View breakdown" outline button inside muted rows (`app/(app)/app/history/components/history-sessions-tab.tsx` — `variant=\"outline\"` resolves to `dark:border-input`, ~1.28:1 against row fill)
- App-level warning banner in dark mode (`app/(app)/app/layout.tsx` PastDueBanner, `bg-warning/10` + `text-warning-foreground`)

Additional contrast-relevant patterns exist in the codebase and should be included in a follow-up full sweep if we want true exhaustive component-by-component WCAG accounting:
- Additional warning cards (`app/(app)/app/billing/page.tsx`, `app/(app)/app/questions/[slug]/question-page-client.tsx`)
- Error/toast surfaces (`components/error-card.tsx`, `components/ui/notification-provider.tsx`)
- Markdown clinical pearl border (`components/markdown/Markdown.tsx`)
- Review-mode nav/action controls beyond the sampled outline border case (`app/(app)/app/questions/[slug]/question-page-client.tsx`)
- Other opacity-based separators/hover states (`app/(app)/app/history/components/history-sessions-tab.tsx`, `app/(app)/app/shared/components/session-breakdown-list.tsx`)

---

## Why the Dashboard "Looks Fine" but Choices Don't

The dashboard and choice buttons use **identical contrast tokens** (`border-border/60 bg-muted/20` inside Card). The computed contrast is the same (~1.13:1 for borders). But:

1. **Dashboard rows have dense text content** — the text itself (at 15.77:1 foreground contrast) defines the visual boundary. You don't need the border to see the row.
2. **Choice buttons are sparse** — one short sentence per button. The border and fill are the PRIMARY visual cues for button identity. When those are 1.13:1 contrast, the buttons vanish.
3. **Feedback sections use semantic color borders** — `border-success/20` and `border-destructive/20` add a color hue difference (green/red vs gray), making them slightly more perceptible than a gray-on-gray border at the same contrast ratio, due to chromatic contrast.
4. **Dashboard, bookmarks, nav, and segmented controls still have real text-contrast violations** — they use `text-muted-foreground` at `text-sm`/`text-xs` for labels/metadata and inactive controls (`app/(app)/app/dashboard/page.tsx`, `app/(app)/app/bookmarks/page.tsx`, `components/app-desktop-nav.tsx`, `components/mobile-nav.tsx`, `components/ui/tab-switch-styles.ts`), which computes to 3.59:1–4.20:1 on sampled dark surfaces (below 4.5:1 AA).

The pattern registry correctly identified that `border-border/60` is for "rows nested inside cards (subordinate to card border)." But choice buttons aren't subordinate rows — they're the **primary interactive elements** on the page. They need stronger visual identity than a muted data row.

---

## Baseline Remediation Plan (Historical)

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
| V3 | `text-muted-foreground` fails for `text-sm`/`text-xs` | 3.59:1–4.20:1 vs 4.5:1 required | Medium — labels, timestamps, secondary text, inactive nav links, segmented controls, dashboard metadata. Compounded by `text-muted-foreground/60` in `session-breakdown-list.tsx` (~2.2:1) |
| V4 | Card border barely visible on page | `border` = 1.32:1 | Low — cards identified by content, not border |
| V5 | Semantic borders too faint | `border-success/20` = 1.36:1 | Low — hue provides chromatic cue |
| V6 | Hover state imperceptible | `bg-muted/20` → `bg-muted/40` = 1.02:1 | Medium — hover feedback matters for interactivity |
| V7 | Wrong-unselected badge letters fail due parent `opacity-50` | 4.37:1 vs 4.5:1 required | Medium — A/C/D badge glyphs are active review cues |
| V8 | Outline button border too faint on dark surfaces | `border-input` = 1.28:1–1.32:1 | Low — button still has strong text contrast but weak boundary |
| V9 | Warning banner text token fails severely in dark mode | `text-warning-foreground` on `bg-warning/10` = ~1.03:1 | High — banner copy and CTA context become low-legibility |

### 3. Possible Approaches (Not Decided)

**For V1/V2 (choice buttons):**
- Increase border opacity: `border-border` (full) instead of `border-border/60` — gives 1.24:1 (still fails 3:1, but more visible)
- Use a dedicated choice-button border token at higher lightness
- Add `shadow-md` or stronger shadow for depth-based separation instead of border-based
- Increase `bg-muted` opacity for more fill contrast

**For V3 (muted-foreground on text-sm):**
- Bump `--muted-foreground` lightness from 45% to ~51% to hit 4.5:1 across sampled dark surfaces (threshold is ~49.2% on `bg-muted/20` over `bg-card`, but ~50.6% on `bg-success/5` over `bg-card`)
- Or only use `text-muted-foreground` at `text-base` or larger sizes

**For V4/V5 (card and semantic borders):**
- These may be acceptable as-is — cards are identified by content and elevation, not just borders
- Semantic borders add chromatic contrast (color hue), which aids perception even at low luminance contrast

**For V7 (wrong-unselected opacity side effect):**
- Avoid applying `opacity-50` to the entire label when we still need the badge glyph to read as a UI cue
- Prefer dimming text/background tokens directly instead of inherited parent opacity that degrades all descendants

**For V8 (outline action button boundary):**
- Consider a stronger dark-mode outline border token for bottom action bars (`border-border` or a dedicated outline-on-background token)
- Keep text contrast unchanged; this is a boundary/perimeter contrast issue, not a text-legibility issue

**For V9 (warning foreground on warning tint):**
- Use a high-luminance warning text token for dark-mode warning surfaces, or reduce tint usage and render warning content with `text-foreground`
- Keep warning hue signaling in border/background, but do not encode primary copy in near-black text on near-black tinted surfaces

**Important constraint:** DEBT-273 just shipped (March 4, one day ago). Any changes to choice button contrast must be justified by WCAG compliance, not just aesthetic preference, to avoid the oscillation of "too much contrast → not enough contrast → too much again."

---

## Post-Fix Measurements (DEBT-279 Pass 1 + Current Drift)

### Implemented in code

- Dark text token raised: `--muted-foreground` `45%` -> `51.5%` (`app/globals.css`)
- Dark warning text token raised: `--warning-foreground` `25 96% 10%` -> `38 92% 40%` (`app/globals.css`)
- Removed inherited dimming on wrong-unselected choices: `opacity-50` removed; wrong-unselected content now keeps `text-foreground` for AA legibility (`components/question/choice-button.tsx`)
- Choice boundaries moved to explicit dark-mode boundary tokens (`dark:border-foreground/40`, `dark:hover:border-foreground/70`) (`components/question/choice-button.tsx`), but the current fill hierarchy is still regressed because base and selected both use `dark:bg-foreground/40` and hover has no distinct dark fill delta.
- Feedback/callout work landed only partially: success/destructive cards and the clinical pearl accent were strengthened, but neutral wrong-answer cards and the reference separator still lack dark-mode boundary overrides (`components/question/feedback.tsx`, `components/markdown/Markdown.tsx`).
- Row/divider boundary parity applied to dashboard/history/bookmarks/session breakdown (`app/(app)/app/dashboard/page.tsx`, `app/(app)/app/history/components/history-sessions-tab.tsx`, `app/(app)/app/bookmarks/page.tsx`, `app/(app)/app/shared/components/session-breakdown-list.tsx`)
- Shared primitive boundary updates applied (`components/ui/button.tsx`, `components/ui/input.tsx`, `components/ui/filter-chip.tsx`, `components/ui/tab-switch-styles.ts`, `components/error-card.tsx`, `components/ui/notification-provider.tsx`)
- Practice starter filter row boundaries updated (`app/(app)/app/practice/components/practice-session-starter.tsx`)

### Recomputed contrast checkpoints

All values below are recomputed from current token/class math after the DEBT-279 implementation pass:

| Checkpoint | Post-fix ratio | WCAG target | Status |
|------------|----------------|-------------|--------|
| `text-muted-foreground` on darkest sampled surfaces (minimum across card/bg-muted/row/page/success/warning contexts) | **4.51:1** | >= 4.5:1 (SC 1.4.3) | PASS |
| `text-warning-foreground` on `bg-warning/10` | **5.28:1** | >= 4.5:1 (SC 1.4.3) | PASS |
| `text-warning-foreground` on `bg-warning/15` | **4.78:1** | >= 4.5:1 (SC 1.4.3) | PASS |
| `dark:border-foreground/40` vs card bg | **3.45:1** | >= 3.0:1 (SC 1.4.11) | PASS |
| `dark:border-foreground/40` vs page bg | **3.38:1** | >= 3.0:1 (SC 1.4.11) | PASS |
| `border-success/60` vs card bg | **3.24:1** | >= 3.0:1 (SC 1.4.11) | PASS |
| `border-destructive` vs card bg | **3.91:1** | >= 3.0:1 (SC 1.4.11) | PASS |
| Clinical pearl accent (`border-foreground/40`) vs success card fill | **3.44:1** | >= 3.0:1 (SC 1.4.11) | PASS |
| Session-breakdown divider (`dark:divide-foreground/40`) vs row fill | **3.42:1** | >= 3.0:1 (SC 1.4.11) | PASS |

These checkpoints validate the token-level fixes that actually landed. They do **not** prove the question-flow interaction hierarchy is healthy: the current choice-button implementation still flattens base/hover/selected states into an overly similar medium-gray treatment in dark mode.

### Violation status after this pass

| ID | Baseline problem | Post-fix status |
|----|------------------|-----------------|
| V1 | Choice border too faint | **Resolved** |
| V2 | Choice base boundary too faint | **Partially resolved** — the dark border now passes 3:1, but the fill treatment is still wrong for hierarchy (`dark:bg-foreground/40` on both base and selected) |
| V3 | `text-muted-foreground` below 4.5 | **Resolved** via token update to 51.5% |
| V4 | Card border vs page too faint | **Partially unresolved** (not fully remediated in this pass) |
| V5 | Semantic/callout borders too faint | **Partially unresolved** — success/destructive cards and clinical pearl accent improved, but neutral feedback cards/reference separator remain under-remediated |
| V6 | Hover affordance imperceptible | **Partially unresolved** — remediated rows/buttons gained stronger dark borders, but choice buttons still lack a distinct dark hover fill |
| V7 | Wrong-unselected badge/text degraded by parent opacity | **Resolved** |
| V8 | Outline/button/input borders too faint | **Resolved** for remediated outline/input/filter/tab/error/toast surfaces |
| V9 | Warning foreground token severe fail | **Resolved** |

Residual note: baseline card-edge hierarchy (`border` vs page) remains intentionally conservative, but the immediate product-level issue in the question flow is now state hierarchy drift rather than raw token contrast: choice buttons and feedback cards need a follow-up pass to align with the updated DEBT-279 findings and the Pattern Registry.

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

1. ~~**Should we target WCAG AA or AAA?**~~ **Resolved:** AA. Codified in `docs/frontend/contrast-policy.md`.
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
| Contrast Policy (`docs/frontend/contrast-policy.md`) | Canonical normative doc — canonified from this brainstorming doc's findings |
