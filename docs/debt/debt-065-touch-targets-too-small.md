# DEBT-065: Touch Targets Too Small

## Category: Accessibility / Mobile UX

## Summary
Several interactive elements have touch targets smaller than the recommended 44x44px minimum (WCAG 2.5.5 Target Size).

## Locations

### Dropdown Menu Items
- `components/ui/dropdown-menu.tsx:77`
- Padding: `px-2 py-1.5` = 8px × 6px
- Estimated height: ~24-28px (fails 44px minimum)

### Pricing Page Buttons
- `app/pricing/page.tsx:130-135, 156-161`
- Padding: `py-3` = 12px vertical
- Estimated height: ~38-40px (close but below 44px)

## Impact
- **Mobile usability:** Difficult to tap accurately on small screens
- **WCAG 2.5.5:** Target Size (Enhanced) Level AAA recommends 44x44px
- **WCAG 2.5.8:** Target Size (Minimum) Level AA requires 24x24px (passes but barely)
- **User frustration:** Mis-taps on mobile

## Effort: Low

## Recommended Fix

### Dropdown Menu
```typescript
// Increase padding
<DropdownMenuItem
  className="py-3 px-4"  // Minimum 44px height
>
```

### Pricing Buttons
```typescript
// Increase vertical padding
<button
  className="w-full rounded-lg bg-orange-600 py-4 font-semibold text-white"
>
  Subscribe Monthly
</button>
```

### General Pattern
Create a utility class or component that enforces minimum touch size:
```css
.touch-target {
  min-height: 44px;
  min-width: 44px;
}
```

## Related
- WCAG 2.5.5 Target Size (Enhanced)
- WCAG 2.5.8 Target Size (Minimum)
- BUG-036: No mobile navigation menu
