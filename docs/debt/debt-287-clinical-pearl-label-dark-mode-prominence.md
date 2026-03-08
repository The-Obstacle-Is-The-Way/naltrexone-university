# DEBT-287: Clinical Pearl Label Dark Mode Prominence

**Priority:** P3
**Created:** 2026-03-07
**Status:** Open
**Triggered by:** Visual review of feedback cards after DEBT-285 explanation promotions — the clinical pearl label is now one of the most conspicuously dim labels inside primary learning content
**Scope:** Improve clinical pearl label readability on feedback cards, via the shared Markdown clinical-pearl renderer, without disrupting the UI chrome hierarchy
**Related:** [DEBT-285](../_archive/debt/debt-285-feedback-explanation-dark-mode-readability.md) (explanation/reference promotion, merged), [Typography Policy](../frontend/typography-policy.md), [Pattern Registry F-7](../frontend/pattern-registry.md), [Contrast Policy](../frontend/contrast-policy.md)

---

## The Problem

DEBT-285 promoted feedback explanation text from `text-sm text-muted-foreground` to `text-base text-foreground` and bumped the reference body from `text-xs` to `text-sm`. This was correct — explanations are the primary learning content post-answer.

But the clinical pearl label was explicitly excluded from those changes because the label itself is Pipeline 1 UI chrome embedded inside a Pipeline 2 content surface. After the promotions, a "lift one boat, others look lower" effect occurs: the pearl label at `text-xs text-muted-foreground` is now tied with the `REFERENCE` label as the dimmest label on the feedback card, but unlike the reference it sits inside the middle of the primary learning flow.

### Before DEBT-285

Explanation text was also dim (`text-sm text-muted-foreground`), so the pearl label blended in with its surroundings. The relative contrast between explanation text and pearl label was small.

### After DEBT-285

Explanation text is bright white at 16px. The pearl label immediately below/within that content is 12px gray. The contrast gap between the content and its identifying label jumped from subtle to jarring.

### Contrast math (dark mode)

| Element | Token | Hex (approx) | vs Card bg (#121212) | WCAG AA |
|---------|-------|--------------|---------------------|---------|
| Section headers ("Your answer", etc.) | `text-foreground` | #EDEDED | ~16.4:1 | Pass |
| Explanation text (post-DEBT-285) | `text-foreground` | #EDEDED | ~16.4:1 | Pass |
| **Clinical pearl label** | `text-muted-foreground` | #838383 | **~4.9:1** | Pass (4.5:1 threshold) |
| Proposed label | `text-foreground/60` | ~#959595 | ~6.3:1 | Pass |
| Clinical pearl border | `border-foreground/40` | ~#6A6A6A | ~3.5:1 | Pass (3.0:1 non-text) |

The label technically passes WCAG AA at ~4.9:1. This is not a compliance failure — it's a readability and pedagogical design issue. Clinical pearls are high-yield learning content. The label that identifies them should not be as recessed as footer metadata when it sits inline with the core explanation payload.

### Why it matters

Clinical pearls are specifically designed to distill high-yield clinical takeaways. When a user scans the feedback card, the "CLINICAL PEARL" label tells them "this is the most important practical insight." If the label is dim enough that users glance past it without registering the callout type, the pearl just looks like more explanation text — its pedagogical purpose is undermined.

---

## Current State

**File:** `components/markdown/Markdown.tsx` (lines 50-58)

```tsx
<div className="mt-3 border-l-2 border-foreground/40 pl-3">
  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
    Clinical Pearl
  </div>
  <p>{pearlContent}</p>
</div>
```

The label uses `text-xs font-medium uppercase tracking-wide text-muted-foreground` — 12px, medium weight, gray.

The content `<p>` inherits color from the parent Markdown wrapper, which in the feedback context is `text-foreground` (white). So the pearl content is readable; only the label is dim.

Because this renderer lives in `Markdown.tsx`, any future clinical pearl callout rendered through `<Markdown>` would inherit the same label token. In the current audited UI, the prominent visible usage is the feedback surface.

**Pattern Registry:** F-7 documents this pattern.

---

## What Already Carries Hierarchy

The clinical pearl callout has structural hierarchy that doesn't depend on the label being dim:

1. **Left border** — `border-l-2 border-foreground/40` provides a clear visual indicator
2. **Indentation** — `pl-3` sets the callout apart from surrounding text
3. **Uppercase treatment** — `uppercase tracking-wide` signals "label, not content"
4. **Spatial separation** — `mt-3` gap from preceding paragraph
5. **Content inheritance** — pearl content text is the same bright white as the explanation

With these cues in place, the label doesn't need to be maximally muted to stay subordinate.

---

## Proposed Fix

### Promote label color, keep label size

Change the clinical pearl label from `text-muted-foreground` to `text-foreground/60`:

| Property | From | To |
|----------|------|-----|
| Color | `text-muted-foreground` (~#838383, ~4.9:1 on `#121212`) | `text-foreground/60` (~#959595, ~6.3:1 on `#121212`) |
| Size | `text-xs` (12px) | `text-xs` (12px) — unchanged |
| Weight | `font-medium` | `font-medium` — unchanged |

**Rationale:** The label stays at 12px to remain clearly subordinate to the 16px content. The color improvement alone makes it materially easier to register without competing with the content text. The uppercase + tracking-wide treatment already signals "UI chrome label" regardless of color.

### Light-mode impact

Because `Markdown.tsx` is shared, this token change also affects light mode. On a white/light card surface, `text-foreground/60` composes to roughly `#6D6D6D` and still clears normal-text AA at roughly `5.2:1`. So the proposed token improves dark-mode readability without introducing a light-mode contrast regression.

### Explicitly out of scope for this debt

Do **not** brighten the left border in this ticket. `border-foreground/40` already passes the non-text 3:1 threshold and is not the element causing the readability complaint in the screenshots. If the callout still feels too quiet after the label-color change, file a separate follow-up debt item for border emphasis.

---

## What NOT to Change

- **Pearl content text** — inherits `text-foreground` from the explanation Markdown wrapper; already bright and readable
- **REFERENCE label** — also `text-xs text-muted-foreground`, but it sits below a `border-t` separator at the card footer, a natural position for subordinate metadata. Less of a readability concern than the pearl label embedded in the middle of primary content.
- **Section headers** — already `text-sm font-medium text-foreground`; they are visually prominent enough and are not the outlier called out by the screenshots
- **Badge text** — already appropriate for its role

---

## Affected Files

| File | Change |
|------|--------|
| `components/markdown/Markdown.tsx` (line 53) | Label className: `text-muted-foreground` to `text-foreground/60` |
| `components/markdown/Markdown.test.tsx` | Update assertions for label class tokens |
| `docs/frontend/pattern-registry.md` (F-7) | Update label pattern |

---

## Validation

1. **Label carries `text-foreground/60`** (not `text-muted-foreground`) — assert in Markdown.test.tsx
2. **Pearl content text unchanged** — still inherits from parent; no explicit color on the `<p>`
3. **Visual check in dark mode** — label should be comfortably readable without competing with content
4. **Shared-renderer impact is understood** — the Markdown component is the single source for clinical pearl rendering, so any clinical pearl callout rendered through `<Markdown>` will intentionally inherit the label-token change

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-07 | Document as P3 — observable but not urgent | Passes WCAG AA. Multiple structural cues exist. The issue is pedagogical (pearl label should be clearly identifiable) rather than accessibility-critical. |
| 2026-03-07 | Scope to label color only, not size | 12px label is appropriate for UI chrome. The readability gap is color, not size. |
| 2026-03-07 | Exclude REFERENCE label from this fix | REFERENCE label is in a footer position with border-t separation — less readability concern than pearl label embedded in primary content. |
