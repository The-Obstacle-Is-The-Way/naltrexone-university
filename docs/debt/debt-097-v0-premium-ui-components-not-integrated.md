# DEBT-097: V0 Premium Landing Page Components Deleted Instead of Integrated

**Status:** Open
**Priority:** P2
**Date:** 2026-02-04

---

## Description

The original V0 "Premium SaaS Landing Page" template was imported in commit `a9f3b3e` with a rich set of UI components featuring an ultra-premium dark aesthetic. During the "Integrate marketing + app shell UI" step (commit `ceefb46`), the entire `components/premium-landing-page/` directory was **deleted** rather than adapted into the app's design system.

The current marketing page (`components/marketing/marketing-home.tsx`) reuses the app's existing dark navy + orange palette, which looks functional but lacks the premium visual polish of the original V0 template.

## What Was Lost

All files lived under `components/premium-landing-page/` and are recoverable from git history at `ceefb46~1`:

### High-Value Components (should be recovered and adapted)

| Component | File | What it does |
|-----------|------|-------------|
| **Liquid CTA Button** | `components/buttons/liquid-cta-button.tsx` | Animated metallic gradient border button with hover glow effect — the "Start Free Trial" button |
| **Liquid Metal Border** | `components/ui/liquid-metal-border.tsx` | Reusable animated gradient border wrapper for any element — the chrome/metallic card outline effect |
| **Hero Section** | `components/sections/hero-section.tsx` | Bold display typography layout ("Build faster. Ship smarter.") with oversized font weights |
| **Impact Section** | `components/sections/impact-section.tsx` | Stats row (99.99%, 10M+, <50ms, 150+) with gradient-bordered cards |
| **Pricing Section** | `components/sections/pricing-section.tsx` | 3-tier pricing layout with gradient-highlighted featured plan |
| **Testimonials Section** | `components/sections/testimonials-section.tsx` | 6-card grid testimonial layout with avatar + role |
| **CTA Section** | `components/sections/cta-section.tsx` | Bottom-of-page call-to-action banner |
| **Features Section** | `components/sections/features-section.tsx` | Feature grid with icons and descriptions |
| **Footer Section** | `components/sections/footer-section.tsx` | Multi-column footer |

### Design System Elements (CSS + Fonts)

| Element | File | What it provides |
|---------|------|-----------------|
| **Global CSS** | `app/globals.css` | 148 lines: pure black (#000) background, gradient keyframe animations, metallic border variables, custom font sizing |
| **Theme Provider** | `components/theme-provider.tsx` | Dark-mode-first theme configuration |
| **Lenis Provider** | `components/providers/lenis-provider.tsx` | Smooth scroll behavior |

### Key Visual Differences (Current vs. V0 Template)

| Aspect | Current App | V0 Template (desired) |
|--------|------------|----------------------|
| **Background** | Dark navy/slate (`hsl(222, ...)`) | Pure black (`#000000`) |
| **Primary accent** | Orange (`bg-orange-600`) | White/neutral with metallic gradients |
| **CTA buttons** | Solid orange rounded pill | Metallic gradient border with dark fill + arrow |
| **Typography** | Standard `font-semibold`/`font-bold` | Ultra-bold display weights, much larger headings |
| **Card borders** | Solid `border-border` (subtle gray) | Animated gradient borders with metallic sheen |
| **Overall feel** | Functional dark mode | Ultra-premium, Apple-like minimalism |

## Impact

- Landing page looks "good enough" but not premium — first impressions matter for a $29/mo SaaS
- The metallic gradient border effect (`liquid-metal-border.tsx`) was the single most visually distinctive element
- The bold display typography gave the template its authority/premium feel
- Losing these components means re-implementing them from scratch unless recovered from git history

## Resolution

### Phase 1: Recover components from git history
```bash
# Extract the premium components from before deletion
git show ceefb46~1:components/premium-landing-page/components/buttons/liquid-cta-button.tsx
git show ceefb46~1:components/premium-landing-page/components/ui/liquid-metal-border.tsx
git show ceefb46~1:components/premium-landing-page/app/globals.css
git show ceefb46~1:components/premium-landing-page/components/sections/hero-section.tsx
# ... etc for each component
```

### Phase 2: Adapt to app's component structure
1. Move recovered components into `components/marketing/` or `components/ui/`
2. Update imports to use the app's existing Tailwind config and shadcn/ui primitives
3. Adapt the color palette: replace generic "Acme" branding with Addiction Boards content
4. Integrate the liquid-metal-border and liquid-cta-button as reusable primitives

### Phase 3: Apply design system changes
1. Update CSS custom properties for the pure black background on marketing pages
2. Add display font weight classes for hero typography
3. Wire the gradient border animations into Tailwind config or global CSS
4. Replace the orange accent with white/neutral + metallic gradient for CTA buttons

### Phase 4: Content adaptation
1. Replace placeholder testimonials with real or domain-appropriate content
2. Replace impact stats (99.99%, 10M+) with relevant question bank metrics
3. Adapt pricing section to match actual plans ($29/mo, $199/yr)

## Verification

- Landing page visually matches the V0 template's premium aesthetic
- Liquid metal CTA button renders with animated gradient border
- Card borders use gradient metallic effect, not solid gray
- Typography uses bold display weights for hero headings
- Background is pure black on marketing pages
- All existing tests continue to pass
- Mobile responsive behavior preserved

## Related

- Commit `a9f3b3e`: Original V0 template import
- Commit `ceefb46`: Integration commit that deleted the components
- `components/marketing/marketing-home.tsx`: Current simplified replacement
- SPEC-018: UI Integration (v0 Templates)
- PR #26: Original UI lint/fix PR (still open)
