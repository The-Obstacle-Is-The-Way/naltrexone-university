# DEBT-277: Clinical Pearl Styled Callout

**Priority:** P3
**Created:** 2026-03-04
**Source:** [DEBT-275 F1](./debt-275-bs033-residual-open-items.md), [BS-041 §Deferred](../_archive/brainstorming/bs-041-feedback-display-content-vs-code-separation.md)
**Scope:** Detect `**Clinical pearl:**` pattern in the `<Markdown>` component and render as a visually distinct callout with the label separated from content.

---

## Problem

Currently, `**Clinical pearl:** The FAAH inhibitor approach represents...` renders as a single paragraph with "Clinical pearl:" in bold inline with the content:

```
Clinical pearl: The FAAH inhibitor approach represents a distinct
pharmacological strategy from direct agonist replacement...
```

The label and content are visually merged. The clinical pearl is the key teaching takeaway — it deserves visual distinction from the surrounding explanation text.

### Why This Is a Code Fix, Not a Content Fix

Changing `**Clinical pearl:** content` to a two-line format in markdown doesn't achieve the desired result:

- `**Clinical pearl:**\ncontent` → still one paragraph (markdown ignores single newlines)
- `**Clinical pearl:**\n\ncontent` → two paragraphs, but "Clinical pearl:" as a standalone bold paragraph looks orphaned
- `**Clinical pearl:**\n- content` → bullet list works but changes semantic structure across 848 clinical-pearl paragraphs (found in 948 draft questions) for a display concern

One code change in `<Markdown>` handles all existing and future questions with zero content churn.

---

## Desired Behavior

The `<Markdown>` component detects paragraphs starting with `**Clinical pearl:**` and renders them as a styled callout:

```
┌ border-l-2 accent ──────────────────────────────┐
│                                                   │
│  CLINICAL PEARL          ← small uppercase label  │
│                                                   │
│  The FAAH inhibitor approach represents a         │
│  distinct pharmacological strategy from direct    │
│  agonist replacement (THC preparations)...        │
│                                                   │
└───────────────────────────────────────────────────┘
```

**Key properties:**
1. "Clinical Pearl" rendered as a small uppercase label (separate from content)
2. Content rendered below the label on its own line
3. Left-border accent for visual distinction
4. The original `<strong>Clinical pearl:</strong>` bold text is consumed — not rendered inline

---

## Implementation

### Detection Logic

Pipeline order in this repo (`react-markdown@10.1.0`):

1. markdown string
2. `remark-parse`
3. `remark-gfm`
4. `remark-rehype`
5. `rehype-sanitize`
6. `components` mapping (custom `p` renderer)

For authored markdown `**Clinical pearl:** This is the pearl.`, the `p` renderer receives children equivalent to:

```
[
  <strong>Clinical pearl:</strong>,
  ' This is the pearl.'
]
```

So `Children.toArray(children)[0]` is a `<strong>` element with `props.children === 'Clinical pearl:'`.

`rehype-sanitize` does **not** remove markdown-generated `<strong>` nodes (the default schema allows `strong`). It runs before `components`, so detection can safely happen in the custom `p` renderer.

The custom `p` component should check:
1. First child is a `<strong>` React element
2. `String(firstChild.props.children)` matches `/^clinical\s+pearl:\s*$/i`

If both conditions are true, render as callout. Otherwise render a normal `<p>`.

### Rendering

Replace the default `<p>` with:

```tsx
<div className="mt-3 border-l-2 border-foreground/20 pl-3">
  {/* <div> not <p> — avoids wrapper's [&_p+p]:mt-3 cascade into the content <p> */}
  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
    Clinical Pearl
  </div>
  <p>{remainingContent}</p>
</div>
```

Where `remainingContent` is everything after the `<strong>Clinical pearl:</strong>` element, with leading whitespace trimmed.

### Styling Rationale

| Property | Value | Why |
|----------|-------|-----|
| Left border | `border-l-2 border-foreground/20` | Subtle callout accent, works in both light/dark themes. Neutral color because `<Markdown>` is a generic component — doesn't know if it's inside a success-themed or neutral context. |
| Label | `text-xs font-medium uppercase tracking-wide text-muted-foreground` | Small, de-emphasized label that identifies the section without competing with the content. Uppercase + tracking echoes the "REFERENCE" label style in `feedback.tsx`. |
| Label element | `<div>` not `<p>` | The `<Markdown>` wrapper has `[&_p+p]:mt-3` for paragraph spacing. If the label were a `<p>`, the content `<p>` below it would match `p+p` and inherit `mt-3` (12px) — overriding the intended `mb-1` (4px) tight gap via margin collapse. Using `<div>` breaks the `p+p` chain. |
| Spacing | `mt-3` on container, `mb-1` on label | `mt-3` matches the existing `[&_p+p]:mt-3` paragraph spacing. `mb-1` gives a tight gap between label and content. |
| No background | — | The clinical pearl lives inside the correct-answer card (`bg-success/5`). Adding another background would create nested tinting. The left border alone is sufficient visual distinction. |

### Token Validation (Checked)

- `border-foreground/20` is valid: `foreground` is defined in both `app/globals.css` (`@theme` `--color-foreground`) and `tailwind.config.js` (`colors.foreground`).
- `text-muted-foreground` is valid: `muted-foreground` is defined in `app/globals.css` (`@theme` `--color-muted-foreground`) and `tailwind.config.js` (`colors.muted.foreground`).
- Light/dark behavior is token-driven: `--foreground` is dark in light mode and light in dark mode, so `border-foreground/20` adapts automatically in both themes.

### Alternative Considered: `border-success/40`

BS-041 sketched `border-l-2 border-success/40 pl-3`. This was rejected because `<Markdown>` is a generic component used in multiple contexts. Hard-coding a success color assumes the callout always appears inside a success-themed section. `border-foreground/20` adapts to any context.

---

## File Changes

| File | Change |
|------|--------|
| `components/markdown/Markdown.tsx` | Add `components` prop to `ReactMarkdown` with custom `p` renderer. Extract `isClinicalPearl()` and `extractPearlContent()` helper functions. |
| `components/markdown/Markdown.test.tsx` | Add tests: (1) clinical pearl renders as styled callout with label separated from content, (2) regular bold paragraphs are unaffected. |

**Not changing:** `feedback.tsx`, any content files, parser logic, database schema.

---

## Test Plan

### Test 1: Clinical pearl renders as styled callout

```typescript
// Input:  "Explanation text.\n\n**Clinical pearl:** This is the pearl."
// Assert: callout container exists with border-l-2 class
// Assert: contains "Clinical Pearl" label text
// Assert: contains "This is the pearl." content text
// Assert: original <strong>Clinical pearl:</strong> is NOT rendered inline
```

### Test 2: Regular bold text is unaffected

```typescript
// Input:  "**Important:** This is not a pearl."
// Assert: no callout container
// Assert: <strong>Important:</strong> renders normally inline
```

### Test 3: Case-insensitive detection

```typescript
// Input:  "**Clinical Pearl:** Capitalized variant."
// Assert: callout container exists (detection is case-insensitive)
```

### Manual verification

After implementation, check the feedback display in the browser for:
- Correct-answer flow: clinical pearl should appear as a callout inside the green-bordered correct-answer card
- Both light and dark themes: left border should be visible but subtle
- Long clinical pearls: content should wrap naturally within the callout

---

## Edge Cases

| Case | Handling |
|------|----------|
| `**Clinical pearl:**` with no content after it | Renders callout with label only, empty content paragraph. Acceptable — this shouldn't occur in practice. |
| `**Clinical Pearl:**` (capitalized) | Detected — regex is case-insensitive. |
| `**CLINICAL PEARL:**` (all caps) | Detected — regex is case-insensitive. |
| Multiple clinical pearls in one markdown block | Each paragraph is handled independently. Multiple callouts would render. This shouldn't occur in practice. |
| `**Clinical pearl: content inside bold**` (content inside the strong tag) | NOT handled — only the standard `**Clinical pearl:** content` pattern is detected. This authoring pattern doesn't exist in the question bank. |
| Content with inline formatting: `**Clinical pearl:** Some **bold** and *italic* text` | Works — remaining children after the strong tag are passed through, preserving inline formatting. |
| Raw HTML marker: `<strong>Clinical pearl:</strong> ...` | NOT detected with current config. `skipHtml` removes raw HTML tags before component rendering, so this becomes plain text. |

---

## Relationship to Other Work

- **DEBT-275 F1:** This doc replaces the one-liner in DEBT-275's future enhancements table. Mark F1 as resolved by DEBT-277 when shipped.
- **DEBT-275 C2 (blank line before clinical pearl):** Still a valid authoring rule. The blank line ensures the clinical pearl is a separate `<p>` element (prerequisite for detection). Current draft corpus audit found 0 violations.
- **BS-041 Part A Fix 2:** Same as C2 above. The blank line is required for the callout detection to work — if the clinical pearl is merged into the preceding paragraph (no blank line), it won't be a separate `<p>` and won't be detected.

### Prerequisite

Questions that lack a blank line before `**Clinical pearl:**` will NOT trigger the callout — the clinical pearl text will be part of the preceding paragraph's `<p>` element.

Audit result (2026-03-05, `content/drafts/questions/**/{recall,vignettes}.md`):
- 948 total draft questions (`qid:` count)
- 848 clinical pearl paragraphs
- 0 missing blank lines before `**Clinical pearl:**`
- 0 questions currently expected to fail callout detection due to C2 formatting
