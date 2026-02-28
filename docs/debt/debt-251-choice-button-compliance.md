# DEBT-251: Choice Button Compliance

**Status:** Not started
**Parent:** [DEBT-250](debt-250-frontend-visual-divergence-compliance-plan.md)
**Items:** D-3, D-6, A11Y-2, LIGHT-3
**File:** `components/question/choice-button.tsx`

---

## Items

### D-3: Choice Button Hover Opacity

**Pattern:** I-3 (Choice Button) — direct-action targets use `/60`, not `/80`

**Current** (`choice-button.tsx:30`):
```
cursor-pointer hover:border-muted-foreground/30 hover:bg-muted/80
```

**Target:**
```
cursor-pointer hover:border-muted-foreground/30 hover:bg-muted/60
```

### D-6: Choice Wrong-Unselected Opacity

**Pattern:** X-1 (Disabled — `opacity-50` universal)

**Current** (`choice-button.tsx:33`):
```tsx
correctness === 'wrong-unselected' && 'opacity-60',
```

**Target:**
```tsx
correctness === 'wrong-unselected' && 'opacity-50',
```

### A11Y-2: Radio Inputs Missing `value` Attribute

**Current** (`choice-button.tsx:41-47`):
```tsx
<input type="radio" name={name} checked={selected}
  onChange={() => onClick()} disabled={disabled} className="sr-only" />
```

**Target:**
```tsx
<input type="radio" name={name} value={label} checked={selected}
  onChange={() => onClick()} disabled={disabled} className="sr-only" />
```

**Note:** The component has no `choiceId` prop. Use `label` (which holds "A", "B", "C", "D") as the `value` — it's unique per radio group and semantically meaningful. This is a non-functional improvement for DevTools/a11y tooling debuggability.

### LIGHT-3: Correct-Answer Label Uses Wrong Text Token

**Severity:** High — white text invisible on light green tint in light mode

**Current** (`choice-button.tsx:35-36`):
```tsx
correctness === 'correct' &&
  'border-success bg-success/10 text-success-foreground',
```

**Target:**
```tsx
correctness === 'correct' &&
  'border-success bg-success/10 text-success',
```

**Why:** `text-success-foreground` = white. On `bg-success/10` (near-white in light mode), white text is invisible. The Pattern Registry already documents the correct token as `text-success`. The badge (line 55) and feedback pill already use `text-success` — only this label is wrong.

---

## TDD Approach

1. **LIGHT-3 test** (most impactful): Render `ChoiceButton` with `correctness="correct"`. Assert the label element contains `text-success` (not `text-success-foreground`).
2. **D-6 test:** Render with `correctness="wrong-unselected"`. Assert `opacity-50` class present (not `opacity-60`).
3. **D-3 test:** Render with `disabled={false}` and no correctness. Assert `hover:bg-muted/60` class present (not `hover:bg-muted/80`).
4. **A11Y-2 test:** Render with `label="B"`. Assert the radio input has `value="B"`.

**Test file:** `components/question/choice-button.test.tsx` (colocated, `renderToStaticMarkup` + jsdom)

---

## Verification

```bash
# D-3: No /80 hover on choice button
rg -n 'hover:bg-muted/80' components/question/choice-button.tsx
# Expected: 0 matches

# D-6: No opacity-60 in production code
rg -n --glob '!**/*.test.*' --glob '!**/*.spec.*' 'opacity-60' components/question
# Expected: 0 matches

# A11Y-2: Radio input has value attribute
rg -n 'value=' components/question/choice-button.tsx
# Expected: 1 match on the radio input

# LIGHT-3: No text-success-foreground on tinted background
rg -n 'text-success-foreground' components/question/choice-button.tsx
# Expected: 0 matches
```

---

## Visual QA

1. **Light mode:** Submit a practice question → correct answer label text should be green (not invisible white)
2. **Dark mode:** Hover an unselected choice → background shift should be noticeable but not aggressive (`/60`)
3. **Dark mode:** Submit → wrong-unselected choices should dim to `opacity-50`
