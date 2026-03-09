# BS-046: Filter Chip Fill Depth + Summary Hover Removal

**Date:** 2026-03-09
**Triggered by:** Visual review of DEBT-290/291/292 shipped state — chips look flat/invisible against container, summary hover looks bad
**Scope:** Two issues: (1) unselected filter chips need a subtle fill to differentiate from container; (2) summary hover effect is redundant with chevron and visually distracting
**Related:** [DEBT-290](../../debt/debt-290-practice-filter-tonal-fill-elevation.md), [DEBT-291](../../debt/debt-291-filter-chip-light-mode-border-contrast.md), [DEBT-292](../../debt/debt-292-filter-section-disclosure-indicator.md), [BS-044](../../brainstorming/bs-044-dark-mode-border-weight-tiering.md)

---

## Problem 1: Chips Have No Fill Depth

### What's wrong

Unselected filter chips use `bg-transparent`, inheriting the parent container's `bg-foreground/5` tonal fill. The chips are visually indistinguishable from the container surface — they look like text with outlines floating on a flat plane, not like interactive controls with their own surface.

The border alone (`border-foreground/45` / `dark:border-foreground/40`) defines the chip boundary, but without any fill differentiation the chips lack the "tangible object" feel that makes them scannable and inviting to click.

### How we got here

DEBT-290 changed chips from `bg-background` (which "punched through" the tonal container, creating a jarring white hole in dark mode) to `bg-transparent`. This fixed the punch-out problem but created the opposite extreme — chips now have zero depth against their parent. The fix was correct for the punch-out bug, but it overcorrected.

---

## Design System Evidence

Three major design systems converge on the same answer: interactive controls sitting on tonal surfaces need a subtle fill at ~7-10% white-equivalent opacity.

### Material Design 3

**Source:** [M3 filter chip specs](https://m3.material.io/components/chips/specs) and Material's elevated filter-chip APIs.

- **Flat unselected chip:** transparent fill + 1px outline/border when the chip sits directly on the base surface.
- **Elevated filter chip:** M3 also exposes an elevated variant and a family of surface-container roles for cases where the chip needs to read above its parent surface.
- **Selected chip:** filled/high-contrast state with the border removed.

Key insight: M3 supports the same qualitative move we need here, but its tonal roles do **not** map 1:1 to Tailwind `bg-foreground/[x]` percentages. The implementation recommendation below is grounded primarily in our local computed values plus the clearer Radix step 3 → 4 precedent.

### Radix UI (shadcn's foundation)

**Source:** [Radix Colors scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)

| Step | Semantic Purpose | Dark alpha (white) | Dark solid |
|------|-----------------|-------------------|-----------|
| 2 | Subtle background | ~3.4% | #191919 |
| **3** | **UI element bg (normal)** | **~7.1%** | **#222222** |
| **4** | **Hovered UI element bg** | **~10.6%** | **#2A2A2A** |
| 5 | Active/selected | ~13.4% | #313131 |

Radix explicitly designates **step 3 (~7% white)** as "UI element background" and **step 4 (~10.6%)** as the hover state. The rest → hover delta is ~3.5 percentage points.

### Apple Human Interface Guidelines

**Source:** [UIColor system fills](https://developer.apple.com/documentation/uikit/uicolor/3255069-secondarysystemfill)

Apple uses mid-gray (`rgb(120,120,128)`) at decreasing opacities:

| Fill Role | Dark Alpha | White-equivalent |
|-----------|-----------|-----------------|
| systemFill | 36% | ~17% |
| secondarySystemFill | 32% | ~15% |
| tertiarySystemFill (large shapes) | 24% | ~11% |
| **quaternarySystemFill (complex content areas)** | **18%** | **~8.5%** |

Apple's `quaternarySystemFill` (~8.5% white-equivalent) is the closest analog to an unselected chip on a tonal surface.

### Convergence

| System | Resting guidance | Hover guidance | Implication for us |
|--------|------------------|----------------|--------------------|
| Radix step 3 → 4 | ~7.1% | ~10.6% | Strongest direct match for our foreground-opacity scale |
| Apple quaternary → tertiary | ~8.5% | ~11% | Confirms the same low-contrast-but-present rest fill band |
| M3 elevated chip + surface containers | subtle elevated fill above parent surface | stronger elevated/hover surface | Confirms the direction, but not a direct % mapping |

All three systems support the same design direction: a **non-zero resting fill** with a **modest hover lift**, not a transparent default.

---

## Three Options

All computed values assume the **current shipped DEBT-290/291/292 stack**:
- page `#090909` (dark) / `#FFFFFF` (light)
- card `#121212` (dark) / `#FFFFFF` (light)
- filter container `bg-foreground/5` ≈ `#1D1D1D` (dark) / `#F2F3F3` (light)

### Option A: Minimal Lift — `bg-foreground/[0.05]`

| Property | Dark | Light |
|----------|------|-------|
| Chip rest fill | ~#272727 | ~#E6E7E8 |
| Delta from container | +10 RGB | −12 RGB |
| Text contrast (foreground/60) | ~5.58:1 ✓ | ~5.01:1 ✓ |
| Border contrast (vs container) | ~3.40:1 ✓ | ~3.15:1 ✓ |
| Hover fill | Keep `/[0.08]` (+3pp) | Same |
| Hover text contrast | ~11.60:1 ✓ (accent-foreground) | ~15.14:1 ✓ |

**Pros:** Most conservative. Barely touches the current look.
**Cons:** May not solve the problem. Only +10 RGB from container — might still look flat. Below every design system's recommended interactive-element threshold.

### Option B: Radix-Aligned — `bg-foreground/[0.07]` *(RECOMMENDED)*

| Property | Dark | Light |
|----------|------|-------|
| Chip rest fill | ~#2C2C2C | ~#E1E3E4 |
| Delta from container | +15 RGB | −17 RGB |
| Text contrast (foreground/60) | ~5.34:1 ✓ | ~4.91:1 ✓ |
| Border contrast (vs container) | ~3.40:1 ✓ | ~3.15:1 ✓ |
| Hover fill | Bump to `/[0.10]` (+3pp) | Same |
| Hover text contrast | ~10.95:1 ✓ (accent-foreground) | ~14.54:1 ✓ |
| Rest → hover delta | +3pp (matches Radix 3→4 step) | Same |

**Pros:**
- Lands exactly on Radix step 3 ("UI element background") — evidence-based, not arbitrary
- +14 RGB from container is perceptible: the chip reads as "a thing on a surface" without looking like a card
- Hover delta of +3pp matches Radix's actual step 3→4 convention (+3.5pp)
- Foreground-opacity scale stays monotonic: container `/5` → chip `/7` → hover `/10` → selected `bg-primary`
- Single token works in both themes (foreground-based opacity adapts automatically)

**Cons:**
- Hover needs to bump from `/[0.08]` to `/[0.10]` (one extra token change)
- Text contrast drops from 5.99:1 (on transparent) to 5.04:1 (on `/[0.07]`) — still well above AA 4.5:1

### Option C: Apple-Aligned — `bg-foreground/10`

| Property | Dark | Light |
|----------|------|-------|
| Chip rest fill | ~#323232 | ~#DADCDD |
| Delta from container | +21 RGB | −24 RGB |
| Text contrast (foreground/60) | ~5.02:1 ✓ | ~4.81:1 ✓ |
| Border contrast (vs container) | ~3.40:1 ✓ | ~3.15:1 ✓ |
| Hover fill | Bump to `/[0.15]` (+5pp) | Same |
| Hover text contrast | ~9.42:1 ✓ (accent-foreground) | ~12.93:1 ✓ |
| Rest → hover delta | +5pp | Same |

**Pros:** Strong visual distinction. Chips unmistakably have their own surface.
**Cons:**
- Text contrast still clears AA after recomputing against the real DEBT-290 parent surface, but it spends more of the available margin than Option B.
- +21 RGB delta starts reading as "mini-card" rather than "chip on surface" — the chip fill competes with the container fill for visual hierarchy
- `/10` is where Radix places step 4 (hover territory), so the resting state already occupies hover-level brightness
- Apple's quaternary fill (~8.5%) was designed for pure-black backgrounds, not for a pre-tinted container; on our `/5` container the effective cumulative lift is higher than intended

---

## Recommendation: Option B (`bg-foreground/[0.07]`)

Option B is the right answer for three reasons:

1. **Evidence convergence.** Three independent design systems (Radix, M3, Apple) converge on 7-10% for interactive element resting fills. `/[0.07]` hits the low end of that range, which is appropriate because our chips *also* have borders — they don't need to rely on fill alone for identification.

2. **Balanced contrast headroom.** Text contrast stays at 5.34:1 in dark mode and 4.91:1 in light mode, leaving comfortable AA margin without pushing the chip into mini-card territory. Option C is no longer numerically unsafe after recomputing the real parent surface, but it still spends more fill contrast than the component needs.

3. **Monotonic scale.** The foreground-opacity ramp stays cleanly stepped:
   ```
   Container:  bg-foreground/5     (surface)
   Chip rest:  bg-foreground/[0.07] (interactive element)
   Chip hover: bg-foreground/[0.10] (hover state)
   Chip selected: bg-primary         (high-contrast active)
   ```
   Each step is perceptually distinct. No collisions, no ambiguity.

### Exact class change (FilterChip unselected)

```diff
- 'border-foreground/45 bg-transparent text-foreground/60 hover:bg-foreground/[0.08] hover:text-accent-foreground dark:border-foreground/40'
+ 'border-foreground/45 bg-foreground/[0.07] text-foreground/60 hover:bg-foreground/[0.10] hover:text-accent-foreground dark:border-foreground/40 cursor-pointer'
```

Three token changes:
1. `bg-transparent` → `bg-foreground/[0.07]` (rest fill)
2. `hover:bg-foreground/[0.08]` → `hover:bg-foreground/[0.10]` (hover fill, +3pp delta matching Radix step 3→4)
3. Add `cursor-pointer` (browsers default `<button>` to `cursor: default` — chips currently lack pointer cursor)

---

## Problem 2: Summary Hover Effect Looks Bad

### What's wrong

DEBT-292 added `hover:bg-foreground/[0.03]` to `<summary>` as part of the disclosure affordance. In practice, the hover effect creates a barely-perceptible tinted rectangle that looks like a rendering glitch rather than intentional interaction feedback.

### Why the chevron alone is sufficient

The chevron (`ChevronDown` with `group-open:rotate-180`) is a universally recognized disclosure indicator. It communicates expandability, expanded state, and clickability. The `cursor-pointer` provides hover feedback. No additional hover fill is needed.

Hover backgrounds work well on list rows and menu items (large rectangular hit targets). On a `<summary>` inside a tonal container, the hover fill competes with the container's own fill and creates visual noise.

### Fix

Remove `hover:bg-foreground/[0.03]` from the `<summary>` className. One token deletion.

```diff
- <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors hover:bg-foreground/[0.03] focus-visible:ring-ring/50 focus-visible:ring-[3px] [&::-webkit-details-marker]:hidden">
+ <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors focus-visible:ring-ring/50 focus-visible:ring-[3px] [&::-webkit-details-marker]:hidden">
```

---

## Scope & Impact

**FilterChip usage:** Practice page tag filters only (`practice-session-starter.tsx` lines 231-236). No other consumers exist in the codebase.

**Files to change:**
1. `components/ui/filter-chip.tsx` — three class token changes (rest fill, hover fill, cursor-pointer)
2. `components/ui/filter-chip.test.tsx` — update assertions for new tokens
3. `app/(app)/app/practice/components/practice-session-starter.tsx` — remove summary hover class
4. `app/(app)/app/practice/components/practice-session-starter.test.tsx` — update summary hover assertion if it exists
5. Docs: `practice.md`, `pattern-registry.md`, `contrast-policy.md` (FilterChip row updates)

**WCAG compliance summary (Option B):**

| Check | Value | Pass |
|-------|-------|------|
| Chip text (foreground/60) vs rest fill (dark) | 5.34:1 | ✓ AA |
| Chip text (foreground/60) vs rest fill (light) | 4.90:1 | ✓ AA |
| Chip border vs container (dark) | 3.40:1 | ✓ SC 1.4.11 |
| Chip border vs container (light) | 3.15:1 | ✓ SC 1.4.11 |
| Hover text (accent-foreground) vs hover fill (dark) | 10.95:1 | ✓ AA |
| Hover text (accent-foreground) vs hover fill (light) | 14.54:1 | ✓ AA |
| Selected text (primary-foreground) vs selected fill | ~17:1 | ✓ AA |

---

## Severity

**Problem 1 (chip fill):** Medium. Chips work functionally but feel flat. The lack of surface differentiation makes filter sections feel like a wall of text rather than interactive pills.

**Problem 2 (summary hover):** Low. Cosmetically annoying, one-line fix.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-09 | Created BS-046 | Visual review found chips too flat and summary hover distracting after DEBT-290/291/292 shipped |
| 2026-03-09 | Chose Option B (`bg-foreground/[0.07]` + hover `/[0.10]`) | Radix step 3/4 alignment, M3 elevated-chip precedent, Apple quaternary fill convergence. Best balance of perceptibility and restraint on the real DEBT-290 parent surface. Monotonic foreground-opacity scale preserved. |
| 2026-03-09 | Revised hover from `/[0.12]` to `/[0.10]` | Chrome visual audit feedback: Radix step 3→4 is actually +3.5pp, not +5pp. `/[0.10]` is the truer Radix match. Creates a tighter 7→10→solid ramp. |
| 2026-03-09 | Added `cursor-pointer` to chip base classes | Chrome visual audit found chips lack pointer cursor — browsers default `<button>` to `cursor: default`. |
| 2026-03-09 | Promoted to [DEBT-294](../../debt/debt-294-filter-chip-fill-depth-and-cursor.md) | Investigation complete, no open questions. BS-046 archived. |
| 2026-03-09 | Bundle summary hover removal with chip fill change | Both are filter-section polish, one PR keeps the diff cohesive |
