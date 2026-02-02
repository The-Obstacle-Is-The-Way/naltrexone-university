# DEBT-063: Missing ARIA Labels on Choice Buttons

## Category: Accessibility

## Summary
The question choice buttons lack `aria-label` or `aria-describedby` attributes. Screen reader users cannot clearly identify which choice (A, B, C, D) is associated with each button.

## Location
- `components/question/ChoiceButton.tsx:24-51`

## Current Code
```typescript
<button
  type="button"
  onClick={() => onSelect(choice.id)}
  disabled={disabled || isPending}
  className={/* ... */}
>
  <div className={/* label styles */}>
    {choice.label}  {/* A, B, C, D */}
  </div>
  <div className="flex-1">
    <Markdown content={choice.textMd} />
  </div>
</button>
```

Screen readers see:
- A button with text content
- No semantic label connecting the letter to the choice
- No indication of selection state for accessibility

## Impact
- **WCAG 2.1 violation:** SC 1.3.1 Info and Relationships (Level A)
- **Screen reader confusion:** Users can't navigate choices effectively
- **Keyboard navigation:** No clear indication of focused choice

## Effort: Low

## Recommended Fix
```typescript
<button
  type="button"
  onClick={() => onSelect(choice.id)}
  disabled={disabled || isPending}
  aria-label={`Choice ${choice.label}`}
  aria-pressed={isSelected}
  role="option"
  aria-selected={isSelected}
  className={/* ... */}
>
  {/* ... */}
</button>
```

Or use a radio group pattern:
```typescript
<div role="radiogroup" aria-label="Answer choices">
  {choices.map(choice => (
    <button
      role="radio"
      aria-checked={isSelected}
      aria-label={`Choice ${choice.label}: ${getPlainText(choice.textMd)}`}
    >
      {/* ... */}
    </button>
  ))}
</div>
```

## Related
- WCAG 2.1 SC 1.3.1
- DEBT-065: Missing focus indicators
