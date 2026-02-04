# DEBT-097: V0 Premium Landing Page Components Deleted Instead of Integrated

**Status:** Resolved
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
| **Testimonials Column** | `components/ui/testimonials-column.tsx` | Infinite-scroll vertical testimonial column with motion animation |
| **CTA Section** | `components/sections/cta-section.tsx` | Bottom-of-page call-to-action banner |
| **Features Section** | `components/sections/features-section.tsx` | Feature grid with icons, animated bar charts, and motion effects |
| **Footer Section** | `components/sections/footer-section.tsx` | Multi-column footer |

### Design System Elements (CSS + Fonts)

| Element | File | What it provides |
|---------|------|-----------------|
| **Global CSS** | `app/globals.css` | Pure black (`oklch(0.09 0 0)`) background, custom font families (Cal Sans, Instrument Sans), scrollbar hiding |
| **Theme Provider** | `components/theme-provider.tsx` | Dark-mode-first theme configuration |
| **Lenis Provider** | `components/providers/lenis-provider.tsx` | Smooth scroll behavior |

### Key Visual Differences (Current vs. V0 Template)

| Aspect | Current App | V0 Template (desired) |
|--------|------------|----------------------|
| **Background** | Dark navy/slate (`hsl(222.2, 84%, 4.9%)`) | Near-black (`oklch(0.09 0 0)`) |
| **Primary accent** | Orange (`bg-orange-600`) | White/neutral with metallic gradients |
| **CTA buttons** | Solid orange rounded pill | Metallic gradient border with dark fill + arrow icon |
| **Typography** | Standard `font-semibold`/`font-bold` on Manrope | Ultra-bold display weights using Cal Sans + Instrument Sans |
| **Card borders** | Solid `border-border` (subtle gray) | Animated gradient borders with metallic sheen |
| **Headings** | `text-4xl font-bold` (~36px) | `text-5xl md:text-7xl font-bold` (~48-72px) with gradient text |
| **Overall feel** | Functional dark mode | Ultra-premium, Apple-like minimalism |

## Impact

- Landing page looks "good enough" but not premium — first impressions matter for a $29/mo SaaS
- The metallic gradient border effect (`liquid-metal-border.tsx`) was the single most visually distinctive element
- The bold display typography gave the template its authority/premium feel
- Losing these components means re-implementing them from scratch unless recovered from git history

---

## UI/UX Redesign Specification

### Design Direction: "Clinical Precision Meets Premium Dark"

**Concept:** The app targets addiction medicine professionals preparing for board exams — a high-stakes, expert audience. The design should convey authority, trustworthiness, and premium quality. Think: a medical instrument rendered in obsidian and chrome. Not playful, not corporate — *precise*.

**Tone:** Refined luxury minimalism. Dark, controlled, confident. Every element earns its space.

**Differentiation:** The liquid metal border effect is the signature. It appears on the primary CTA, the featured pricing card, and active state indicators throughout the app. It's the visual thread that says "this is not a template."

### Color System Overhaul

#### Current (to be replaced)

```css
/* Dark mode — dark navy, too warm, too blue */
--background: 222.2 84% 4.9%;    /* hsl → #0a0f1e (navy) */
--card: 222.2 84% 4.9%;
--primary: 210 40% 98%;
--border: 217.2 32.6% 17.5%;
--muted: 217.2 32.6% 17.5%;
```

#### New: "Obsidian" Dark Mode

```css
/* Marketing pages — true black */
--background: 0 0% 3.5%;          /* #090909 — near-pure black */
--foreground: 0 0% 93%;           /* #ededed — crisp white text */
--card: 0 0% 7%;                  /* #121212 — elevated surface */
--card-foreground: 0 0% 93%;
--popover: 0 0% 7%;
--popover-foreground: 0 0% 93%;
--primary: 0 0% 93%;              /* white — primary actions */
--primary-foreground: 0 0% 3.5%;  /* black text on white buttons */
--secondary: 0 0% 11%;            /* #1c1c1c — secondary surface */
--secondary-foreground: 0 0% 93%;
--muted: 0 0% 11%;
--muted-foreground: 0 0% 45%;     /* #737373 — subdued text */
--accent: 0 0% 11%;
--accent-foreground: 0 0% 93%;
--destructive: 0 72% 51%;         /* #dc2626 — red, unchanged */
--destructive-foreground: 0 0% 93%;
--border: 0 0% 15%;               /* #262626 — subtle, achromatic */
--input: 0 0% 15%;
--ring: 0 0% 40%;                 /* #666666 — focus ring */

/* Charts — achromatic with one accent */
--chart-1: 0 0% 60%;              /* zinc-400 — primary data */
--chart-2: 0 0% 45%;              /* zinc-500 — secondary data */
--chart-3: 0 0% 30%;              /* zinc-700 — tertiary data */
--chart-4: 0 0% 20%;              /* zinc-800 — quaternary */
--chart-5: 160 60% 45%;           /* emerald accent — keep for "correct" in charts */

/* Sidebar — achromatic, matching main palette */
--sidebar-background: 0 0% 5%;    /* slightly elevated from background */
--sidebar-foreground: 0 0% 93%;
--sidebar-primary: 0 0% 93%;      /* white — active state */
--sidebar-primary-foreground: 0 0% 3.5%;
--sidebar-accent: 0 0% 11%;       /* hover/active bg */
--sidebar-accent-foreground: 0 0% 93%;
--sidebar-border: 0 0% 15%;       /* matches --border */
--sidebar-ring: 0 0% 40%;         /* matches --ring */
```

**Key change:** Completely achromatic. Zero chroma. No blue tint, no navy. Pure grayscale with all life coming from the metallic gradient effects. This includes the sidebar and chart variables — the current `.dark` block has blue-tinted sidebar vars (`hue 240`) and a mixed-hue chart palette that would break the achromatic feel.

#### Accent Color Strategy

- **Remove all `bg-orange-600`** — every instance across the app
- **Primary actions:** White text on dark fill with metallic gradient border (marketing) or solid white button (app pages)
- **Correct answer:** `emerald-500` (keep — green is universally "correct")
- **Incorrect answer:** `red-500` (keep — red is universally "wrong")
- **Active/selected state:** Metallic gradient border instead of `border-orange-500`
- **Savings badge:** `emerald-400` text (keep — communicates value)

### Typography System

#### Font Stack

```css
/* Current — single font for everything */
font-family: "Manrope", Arial, Helvetica, sans-serif;

/* New — three-tier hierarchy */
--font-display: "Cal Sans", "Manrope", system-ui, sans-serif;   /* Hero headings only */
--font-heading: "Instrument Sans", "Manrope", system-ui, sans-serif; /* Section headings, card titles */
--font-body: "Manrope", system-ui, sans-serif;                  /* Body text, UI elements */
```

**Note:** Cal Sans and Instrument Sans were both in the V0 template's CSS. They need to be loaded via `next/font/google` (Instrument Sans) and a self-hosted woff2 (Cal Sans — it's a free open-source font from Cal.com). If Cal Sans is too complex to self-host, substitute with `"Plus Jakarta Sans"` at `font-weight: 800` as the display font.

#### Typography Scale

| Element | Current | New |
|---------|---------|-----|
| Hero headline | `text-4xl font-bold sm:text-5xl` (36-48px) | `text-5xl md:text-7xl font-bold tracking-tight` (48-72px), `font-display` |
| Hero subheadline | `text-lg text-muted-foreground` | `text-lg md:text-xl text-zinc-500 leading-relaxed text-balance` |
| Section heading | `text-2xl font-bold sm:text-3xl` | `text-3xl md:text-4xl font-bold tracking-tight`, `font-heading` |
| Page heading (app) | `text-2xl font-semibold` | `text-2xl font-bold tracking-tight`, `font-heading` |
| Card title | `font-semibold` | `font-heading font-semibold` |
| Body/UI text | `text-sm` | `text-sm` (unchanged) |
| Stat value | `text-2xl font-semibold` | `text-3xl md:text-4xl font-bold font-display` |

#### Gradient Text Effect (Hero only)

```tsx
<h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight">
  <span className="text-zinc-100 block">Master Your</span>
  <span className="bg-gradient-to-r from-zinc-500 via-zinc-300 to-zinc-500 bg-clip-text text-transparent">
    Board Exams.
  </span>
</h1>
```

### Component-by-Component Spec

---

#### 1. Liquid Metal Border (`components/ui/liquid-metal-border.tsx`)

**Source:** Recovered from `ceefb46~1`

**Dependency:** `@paper-design/shaders-react` (must be added to `package.json`)

**What it does:** WebGL shader that renders an animated liquid chrome/mercury border around any element. Uses `IntersectionObserver` to only render when visible (performance-safe). Falls back to a CSS gradient when offscreen.

**Where it will be used:**
- Marketing: Hero CTA button, featured pricing card, impact stat cards on hover
- App: Active question choice (replace `border-orange-500`), dashboard stat cards on hover

**Changes needed from V0 version:**
- Import path is already `@/components/ui/liquid-metal-border` — no change needed
- Keep as-is — the component is already clean and well-structured

**Fallback strategy:** If `@paper-design/shaders-react` is problematic (bundle size, WebGL support), replace the `<LiquidMetal>` shader with a pure CSS animated gradient:

```css
@keyframes metallic-shift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

.metallic-border {
  background: linear-gradient(135deg, #71717a, #a1a1aa, #52525b, #a1a1aa, #71717a);
  background-size: 300% 300%;
  animation: metallic-shift 4s ease infinite;
}
```

This CSS fallback gives 90% of the visual impact with zero JS overhead.

---

#### 2. Liquid CTA Button (`components/ui/liquid-cta-button.tsx`)

**Source:** Recovered from `ceefb46~1`

**Where it will be used:**
- Marketing hero: "Start Free Trial" / "Get Started"
- Marketing CTA section: "Start Free Trial"
- Pricing page: Featured plan subscribe button

**Content adaptation:**
- "Start Free Trial" → "Get Started" (no free trial in our model)
- Arrow icon (`lucide-react` ArrowRight) — keep, it's already a dependency

**Changes from current orange buttons:**

```tsx
/* CURRENT — solid orange pill */
<button className="rounded-full bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">
  Get Started
</button>

/* NEW — liquid metal CTA */
<LiquidCtaButton>Get Started</LiquidCtaButton>
```

**For non-marketing contexts** (app pages), use a simpler white-on-dark button:

```tsx
<button className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors">
  Submit
</button>
```

---

#### 3. Landing Page (`components/marketing/marketing-home.tsx`)

**Current:** 235 lines. Single-section hero + features + pricing snippet + footer. Functional but flat. Note: this file does **not** contain any `bg-orange-600` directly — the orange CTAs come from child components `<GetStartedCta>` and `<AuthNav>` which are injected via props. The changes here are structural/layout, not color swaps.

**New structure:** Full premium landing page with the following sections:

##### 3a. Header/Nav

```text
Current: Frosted glass header with "Addiction Boards" + Features/Pricing links + auth nav
Change: Keep structure, update to pure black bg, remove backdrop-blur (not needed on black)
```

##### 3b. Hero Section

| Aspect | Current | New |
|--------|---------|-----|
| **Badge** | `"Board prep, built for outcomes"` in muted pill | Same text, but styled with `border-zinc-800 bg-zinc-900/80` |
| **Headline** | `"Addiction Boards Question Bank"` 4xl/5xl | `"Master Your Board Exams."` with gradient text, 5xl/7xl, font-display |
| **Subheadline** | `"High-yield questions..."` | Same content, `text-lg md:text-xl text-zinc-500 text-balance` |
| **CTA** | Orange button + outline button | `<LiquidCtaButton>Get Started</LiquidCtaButton>` + ghost link |
| **Stats cards** | 3 cards (Tutor+Exam, Bookmarks, Analytics) | Keep, but restyle with `bg-zinc-900/50 border-zinc-800/50` hover effect |
| **Right column** | "What you get" card | Remove. The hero is stronger as a centered, single-column layout |
| **Background** | Orange radial gradient | Remove. Pure black with no gradient. Let the metallic effects provide visual interest |

##### 3c. Impact Section (NEW — from V0 template)

**Adapted metrics for Addiction Boards:**

| V0 Placeholder | Addiction Boards Value |
|---|---|
| 99.99% Uptime SLA | **500+** Board-Style Questions |
| 10M+ API Requests/Day | **2** Study Modes (Tutor + Exam) |
| <50ms Avg Response | **Instant** Explanations |
| 150+ Countries | **100%** Mobile Responsive |

Styled as 4-column grid with `bg-zinc-900/50 border-zinc-800/50` cards, `font-display text-3xl md:text-4xl font-bold` for the values.

##### 3d. Features Section

| Current | New |
|---------|-----|
| 3 plain cards (explanations, smart review, progress) | Asymmetric bento grid (3-col + 2-col layout from V0) with icons |

**Adapted feature cards:**

| Card | Icon | Title | Description | Size |
|------|------|-------|-------------|------|
| 1 | `BookOpen` | High-Yield Explanations | Learn the "why" behind every answer with detailed rationales and references | 3-col (wide) |
| 2 | `Zap` | Tutor + Exam Modes | Tutor shows feedback immediately. Exam mode simulates real test conditions | 2-col |
| 3 | `Bookmark` | Smart Bookmarking | Flag questions for review. Build a personalized study list from your weak areas | 2-col |
| 4 | `BarChart3` | Progress Dashboard | Track accuracy, streaks, and trends. See where you need to focus | 3-col (wide) |

No `framer-motion` (not in our dependencies). Use CSS `@keyframes` + `animation-delay` for staggered entrance instead.

##### 3e. Pricing Section

| Current | New |
|---------|-----|
| Side-by-side text + card, just shows $29 and $199 | 2-column card layout (Monthly + Annual) matching `pricing-view.tsx` structure |

**Annual card gets the metallic border:**

```tsx
<LiquidMetalBorder borderRadius={16} borderWidth={2} theme="dark" opacity={0.6} speed={0.8}>
  <div className="rounded-2xl bg-zinc-900 p-8">
    <h3>Pro Annual</h3>
    <p className="text-4xl font-bold font-display">$199<span className="text-lg text-zinc-500">/yr</span></p>
    <p className="text-emerald-400 text-sm">Save $149 per year</p>
    ...
  </div>
</LiquidMetalBorder>
```

Monthly card: Standard `border-zinc-800` card, no metallic effect.

##### 3f. CTA Section (NEW)

Bottom-of-page call to action. Centered text with `LiquidCtaButton`.

```text
"Ready to start studying?"
"Join physicians and psychiatrists preparing for addiction boards. Full access, cancel anytime."
[Get Started →]  [View Pricing]
```

##### 3g. Footer

| Current | New |
|---------|-----|
| Simple single-row with links | Multi-column: Brand + Product links + Legal links + social icons (optional) |

Replace "Acme" branding with "Addiction Boards".

---

#### 4. Pricing Page (`app/pricing/pricing-view.tsx`)

**Changes:**

| Element | Current | New |
|---------|---------|-----|
| Background | `bg-muted` | `bg-background` (pure black) |
| Page title | `text-4xl font-bold` | `font-display text-4xl md:text-5xl font-bold` |
| Monthly card | `border-border` | `border-zinc-800 bg-zinc-900/50` |
| Annual card | `border-2 border-orange-500` | `<LiquidMetalBorder>` wrapper |
| Subscribe buttons | `bg-orange-600 text-white` | Featured: `bg-zinc-100 text-zinc-900` / Standard: `bg-zinc-800 text-zinc-100` |
| "Go to Dashboard" | `bg-orange-600` | `bg-zinc-100 text-zinc-900` |
| Banner | Keep structure | Update border colors to achromatic |

---

#### 5. App Shell (`components/app-shell/app-shell.tsx`)

**Changes:**

| Element | Current | New |
|---------|---------|-----|
| Sidebar bg | `bg-background` (navy) | `bg-background` (will be near-black via CSS vars) |
| Main area bg | `bg-muted` (dark navy-gray) | `bg-muted` (will be `#1c1c1c` via CSS vars) |
| Nav links hover | `hover:bg-muted` | `hover:bg-zinc-800` (explicit, not reliant on theme var) |
| Header | `bg-background` | Same — inherits new black |
| Active nav indicator | None currently | Add `bg-zinc-800 text-foreground` for active route |

**Note:** The app shell itself is structurally sound. The sidebar + main layout works. The visual upgrade comes primarily from the CSS variable changes, not structural changes.

---

#### 6. Dashboard (`app/(app)/app/dashboard/page.tsx`)

**Changes:**

| Element | Current | New |
|---------|---------|-----|
| Stat cards | `border-border bg-card` | `border-zinc-800/50 bg-zinc-900/50` with hover: `hover:border-zinc-700/50 hover:bg-zinc-900/80 transition-all` |
| Stat values | `text-2xl font-semibold` | `text-3xl font-bold font-display` |
| "Go to Practice" button | `bg-orange-600 text-white` | `bg-zinc-100 text-zinc-900 hover:bg-white` |
| Page heading | `text-2xl font-semibold` | `text-2xl font-bold font-heading tracking-tight` |
| Streak card | Standard card | Consider metallic border on streak > 7 days (reward feel) |

---

#### 7. Practice Page (`app/(app)/app/practice/page.tsx`)

**Changes:**

| Element | Current | New |
|---------|---------|-----|
| "Start session" button | `bg-orange-600` | `bg-zinc-100 text-zinc-900 hover:bg-white` |
| "Submit" button | `bg-orange-600` | `bg-zinc-100 text-zinc-900 hover:bg-white` |
| "End session" / "Next Question" | `border-border bg-background` (outline) | `border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800` |
| "Bookmark" / "Bookmarked" | Same outline style | Same new outline style. "Bookmarked" state: `bg-zinc-800 text-zinc-100` (filled) |
| Form selects/inputs | `border-border bg-background` | `border-zinc-800 bg-zinc-950` |
| Session progress text | `text-xs text-muted-foreground` | Same — this is fine |

---

#### 8. Question Card (`components/question/QuestionCard.tsx`)

**Changes:**

| Element | Current | New |
|---------|---------|-----|
| Card container | `border-border bg-card` | `border-zinc-800 bg-zinc-900/50` |
| Overall | Structurally good | Minimal changes — the question content should be the focus |

---

#### 9. Choice Button (`components/question/ChoiceButton.tsx`)

**Changes:**

| Element | Current | New |
|---------|---------|-----|
| Default state | `border-border bg-background` | `border-zinc-800 bg-zinc-950` |
| Hover | `hover:bg-muted` | `hover:bg-zinc-900 hover:border-zinc-700` |
| Selected (no answer yet) | `border-orange-500` | Metallic gradient border via CSS class `.metallic-border-active` or `border-zinc-400` (simple version) |
| Correct | `border-emerald-500 bg-emerald-950/20` | Keep — green is correct, universal |
| Incorrect | `border-red-500 bg-red-950/20` | Keep — red is incorrect, universal |
| Label circle | `border-orange-500` on selected | `border-zinc-400` on selected, `border-emerald-500`/`border-red-500` on correct/incorrect (keep) |

---

#### 10. Feedback (`components/question/Feedback.tsx`)

**No changes.** The green/red coloring for correct/incorrect is already appropriate. The component is clean and purpose-driven.

---

#### 11. Review Page (`app/(app)/app/review/page.tsx`)

**Changes:**

| Element | Current | New |
|---------|---------|-----|
| "Reattempt" button | `border-border bg-background` | `border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800` |
| "Go to Practice" fallback | `bg-orange-600` | `bg-zinc-100 text-zinc-900` |
| Question list cards | `border-border bg-card` | `border-zinc-800 bg-zinc-900/50` |

---

#### 12. Bookmarks Page (`app/(app)/app/bookmarks/page.tsx`)

Same changes as Review page. Replace orange buttons, update card borders.

---

#### 13. Auth Pages (`app/sign-in/`, `app/sign-up/`)

These use Clerk's `<SignIn>` and `<SignUp>` components, dynamically imported with `next/dynamic` (SSR disabled). Currently rendered bare with no `appearance` prop.

**Current page background:** `bg-muted` (which under the new palette = `#1c1c1c`).

The Clerk widget background must match the page, so use `colorBackground: '#1c1c1c'` (matching `--muted`), not `#090909`:

```tsx
<SignIn appearance={{
  baseTheme: dark,
  variables: {
    colorBackground: '#1c1c1c',
    colorPrimary: '#e4e4e7',
    colorText: '#ededed',
    colorTextSecondary: '#737373',
    borderRadius: '0.75rem',
  }
}} />
```

**Alternative:** Change the page background from `bg-muted` to `bg-background` and use `colorBackground: '#090909'`. Either works — the key is they must match.

---

#### 14. Auth Nav (`components/auth-nav.tsx`)

**Current:** Hardcoded `bg-orange-600 hover:bg-orange-700` on "Sign In" links (lines 51, 73 — two code paths: skipClerk fallback + unauthenticated). When authenticated, shows `<UserButton />` from Clerk instead.

**Changes:**

| Element | Current | New |
|---------|---------|-----|
| "Pricing" text link | `text-muted-foreground hover:text-foreground` | Same — no change needed |
| "Sign In" button (2 instances) | `bg-orange-600 px-4 py-2 text-sm text-white hover:bg-orange-700` | `bg-zinc-100 text-zinc-900 hover:bg-white rounded-full` |

---

#### 15. Get Started CTA (`components/get-started-cta.tsx`)

**Current:** Async server component with 3 code paths, each containing hardcoded `bg-orange-600`:
1. **skipClerk fallback** (line 34) — `<Link href="/pricing">Get Started</Link>`
2. **Unauthenticated** (line 47) — `<Link href="/pricing">Get Started</Link>`
3. **Authenticated** (line 64) — `<Link href={href}>{label}</Link>` (label = "Get Started" or "Go to Dashboard")

**RSC boundary note:** This is an async Server Component. `LiquidCtaButton` (which uses WebGL/client hooks) cannot be used directly here. Options:
- **Option A:** Use a static metallic-styled CSS class (`rounded-full bg-zinc-100 text-zinc-900 hover:bg-white`) — simplest, no boundary issues
- **Option B:** Wrap in a thin client component that renders `LiquidCtaButton` — adds complexity
- **Recommendation:** Option A for the nav CTA. The `LiquidCtaButton` is reserved for the hero section and CTA section in `marketing-home.tsx` where client components are expected.

**Changes (all 3 code paths):**

| Element | Current | New |
|---------|---------|-----|
| CTA link (3 instances) | `bg-orange-600 px-8 py-3 text-base text-white hover:bg-orange-700` | `bg-zinc-100 px-8 py-3 text-base font-medium text-zinc-900 hover:bg-white rounded-full transition-colors` |

---

#### 16. Question Reattempt Page (`app/(app)/app/questions/[slug]/question-page-client.tsx`)

**Current:** Client component for individual question reattempts (from the Review page). Has its own "Submit" button with `bg-orange-600` (line 107) and an outline "Reattempt" button.

**Changes:**

| Element | Current | New |
|---------|---------|-----|
| "Submit" button | `bg-orange-600 text-white hover:bg-orange-700` | `bg-zinc-100 text-zinc-900 hover:bg-white` |
| "Reattempt" button | `border-border bg-background text-foreground hover:bg-muted` | `border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800` |
| Error card | `border-border bg-card` | `border-zinc-800 bg-zinc-900/50` |
| Loading/empty cards | `border-border bg-card` | `border-zinc-800 bg-zinc-900/50` |

---

#### 17. Practice Session Summary (`app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx`)

**Current:** Client component that shows after completing a practice session. Contains `SessionSummaryView` with 4 stat cards (Answered, Correct, Accuracy, Duration) and a "Back to Dashboard" link with `bg-orange-600` (line 89).

**Changes:**

| Element | Current | New |
|---------|---------|-----|
| "Back to Dashboard" link | `bg-orange-600 text-white hover:bg-orange-700` | `bg-zinc-100 text-zinc-900 hover:bg-white` |
| "Start another session" link | `border-border bg-background` | `border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800` |
| Stat cards (4) | `border-border bg-card` | `border-zinc-800/50 bg-zinc-900/50` with hover transitions |
| Stat values | `text-2xl font-semibold` | `text-3xl font-bold font-display` |

---

#### 18. Pricing Subscribe Button (`app/pricing/pricing-client.tsx`)

**Current:** Client component with `useFormStatus()` for pending state. The `SubscribeButton` has `bg-orange-600` (line 17). This is the **actual interactive button** used on the pricing page — `pricing-view.tsx`'s `DefaultButton` is only the server fallback.

**Changes:**

| Element | Current | New |
|---------|---------|-----|
| Subscribe button | `bg-orange-600 text-white hover:bg-orange-700` | `bg-zinc-100 text-zinc-900 hover:bg-white` |
| Disabled state | `disabled:cursor-not-allowed disabled:opacity-60` | Same — keep |

---

#### 19. Billing Client (`app/(app)/app/billing/billing-client.tsx`)

**Current:** Client component with `useFormStatus()`. "Manage in Stripe" button has `bg-orange-600` (line 11).

**Changes:**

| Element | Current | New |
|---------|---------|-----|
| "Manage in Stripe" button | `bg-orange-600 text-white hover:bg-orange-700` | `bg-zinc-100 text-zinc-900 hover:bg-white` |

---

#### 20. 404 Page (`app/not-found.tsx`)

**Current:** Uses `text-orange-500` on a `CircleIcon` (line 9). The only non-`bg-orange-600` orange usage in the codebase.

**Changes:**

| Element | Current | New |
|---------|---------|-----|
| Icon color | `text-orange-500` | `text-zinc-500` |

---

### New Dependencies

| Package | Purpose | Size Impact |
|---------|---------|-------------|
| `@paper-design/shaders-react` | WebGL liquid metal shader for `LiquidMetalBorder` | ~15KB gzipped (tree-shakeable). **Optional — CSS fallback available.** |
| `motion` (formerly framer-motion) | Used by V0 features section + testimonials. | ~30KB gzipped. **Optional — can use CSS animations instead.** |

**Recommendation:** Start with CSS-only approach (no new deps). Add `@paper-design/shaders-react` only if the CSS metallic gradient doesn't feel premium enough. Skip `motion` entirely — use CSS `@keyframes` with `animation-delay` for stagger effects.

### CSS Changes (`app/globals.css`)

#### Add to existing file:

```css
/* Metallic gradient animation — CSS fallback for liquid metal border */
@keyframes metallic-shift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

.metallic-border {
  background: linear-gradient(
    135deg,
    #3f3f46, #71717a, #a1a1aa, #71717a, #52525b, #71717a, #a1a1aa, #71717a, #3f3f46
  );
  background-size: 400% 400%;
  animation: metallic-shift 6s ease infinite;
}

/* Staggered entrance animation */
@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fade-in-up 0.6s ease-out both;
}

/* Font utility classes */
.font-display {
  font-family: "Cal Sans", var(--font-manrope), system-ui, sans-serif;
}

.font-heading {
  font-family: "Instrument Sans", var(--font-manrope), system-ui, sans-serif;
}

/* Hide scrollbar (from V0 template) */
.scrollbar-hidden::-webkit-scrollbar,
html::-webkit-scrollbar {
  display: none;
}
.scrollbar-hidden,
html {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
```

#### Replace `.dark` CSS variables:

Replace the **entire** `.dark` block — including the `sidebar-*` and `chart-*` variables — with the new achromatic palette (see "New: Obsidian Dark Mode" above). The current sidebar vars use blue hue 240 and the chart vars have mixed hues including orange (`--chart-3: 30 80% 55%`) which would break the achromatic design.

### Files to Modify (Exhaustive List)

#### Design System (modify existing)

| File | Changes |
|------|---------|
| `app/globals.css` | Replace `.dark` color vars with achromatic palette. Add metallic gradient keyframes, font utility classes, scrollbar hiding |
| `app/layout.tsx` | Add Instrument Sans to `next/font/google` import. Load Cal Sans or Plus Jakarta Sans as display font |
| `components/ui/button.tsx` | No structural changes — variants will inherit new CSS vars |

#### New Components (recover + adapt)

| File | Source | Changes |
|------|--------|---------|
| `components/ui/liquid-metal-border.tsx` | Recover from `ceefb46~1` | Update import path. If skipping WebGL: replace with CSS `.metallic-border` wrapper |
| `components/ui/liquid-cta-button.tsx` | Recover from `ceefb46~1` | Move from `components/buttons/` to `components/ui/`. Update LiquidMetalBorder import |

#### Marketing Pages (modify existing)

| File | Changes |
|------|---------|
| `components/marketing/marketing-home.tsx` | Major rewrite: new hero layout (centered, larger type, gradient text, LiquidCtaButton), add impact section, bento feature grid, CTA section, multi-column footer. Remove orange gradient background. Remove right-column card from hero. (No `bg-orange-600` in this file — orange comes from child components) |
| `app/pricing/pricing-view.tsx` | Replace `bg-muted` with `bg-background`. Replace `DefaultButton`'s `bg-orange-600`. Wrap annual card in `LiquidMetalBorder`. Replace `border-orange-500` with metallic border |
| `app/pricing/pricing-client.tsx` | Replace `SubscribeButton`'s `bg-orange-600` (the actual interactive submit button used on the pricing page) |
| `components/auth-nav.tsx` | Replace `bg-orange-600` on "Sign In" links (2 code paths: skipClerk + unauthenticated) |
| `components/get-started-cta.tsx` | Replace `bg-orange-600` on CTA links (3 code paths: skipClerk, unauth, auth). Use CSS-only styling (not LiquidCtaButton — RSC boundary) |

#### App Pages (modify existing)

| File | Changes |
|------|---------|
| `components/app-shell/app-shell.tsx` | Minimal — colors come from CSS vars. Add active nav indicator |
| `app/(app)/app/dashboard/page.tsx` | Replace `bg-orange-600` buttons → `bg-zinc-100 text-zinc-900`. Add `font-display` to stat values. Add hover effects to stat cards |
| `app/(app)/app/practice/page.tsx` | Replace all `bg-orange-600` → `bg-zinc-100 text-zinc-900`. Update form inputs to `border-zinc-800 bg-zinc-950`. Update outline buttons |
| `app/(app)/app/review/page.tsx` | Replace `bg-orange-600` fallback button. Update card borders |
| `app/(app)/app/bookmarks/page.tsx` | Replace `bg-orange-600` fallback button. Update card borders |
| `app/(app)/app/billing/billing-client.tsx` | Replace `bg-orange-600` on "Manage in Stripe" button (the orange is in the client component, not `page.tsx`) |
| `app/(app)/app/questions/[slug]/question-page-client.tsx` | Replace `bg-orange-600` on "Submit" button (line 107). Update card borders |
| `app/(app)/app/practice/[sessionId]/practice-session-page-client.tsx` | Replace `bg-orange-600` on "Back to Dashboard" link (line 89). Add `font-display` to session summary stat values |
| `app/not-found.tsx` | Replace `text-orange-500` on `CircleIcon` with `text-zinc-500` |
| `components/question/QuestionCard.tsx` | Update card border from `border-border` to `border-zinc-800` |
| `components/question/ChoiceButton.tsx` | Replace `border-orange-500` selected state with `border-zinc-400`. Update default border/bg |
| `components/question/Feedback.tsx` | No changes |
| `components/mobile-nav.tsx` | No direct orange usage — uses semantic tokens (`text-muted-foreground`, `border-border`, etc.) that will auto-update via CSS vars. Only needs changes if explicit zinc colors are desired over semantic tokens |

#### Tests (update after visual changes)

All component tests use `renderToStaticMarkup` and check for text content, not CSS classes. **Most tests should pass without modification** since we're changing styling, not structure or text content.

Tests that may need updates if we change text content:
- `components/marketing/marketing-home.test.tsx` — if hero headline text changes
- `app/pricing/pricing-view.tsx` test — only if button text changes

---

## Implementation Plan

### Phase 1: Design System Foundation (1 PR)

1. Update `app/globals.css` — new `.dark` color vars, keyframes, font utilities
2. Update `app/layout.tsx` — add Instrument Sans font
3. Recover `liquid-metal-border.tsx` and `liquid-cta-button.tsx` (or create CSS-only versions)
4. Write tests for new components
5. Verify all 704+ existing tests still pass

### Phase 2: Marketing Pages (1 PR)

1. Rewrite `marketing-home.tsx` with premium layout
2. Update `pricing-view.tsx` + `pricing-client.tsx` (both server fallback and client SubscribeButton)
3. Update `auth-nav.tsx` (2 orange instances) and `get-started-cta.tsx` (3 orange instances)
4. Update `app/not-found.tsx` — replace `text-orange-500` icon
5. Update/add tests for changed components
6. Visual QA: screenshot comparison

### Phase 3: App Pages — Orange Removal (1 PR)

1. Replace `bg-orange-600` in all app pages (see full file list above)
2. Update `ChoiceButton.tsx` selected state (`border-orange-500` → `border-zinc-400`)
3. Update `QuestionCard.tsx` borders
4. Update dashboard, practice, review, bookmarks, billing, question-reattempt page styling
5. Update practice session summary stat cards (`font-display` treatment)
6. Update `pricing-client.tsx` SubscribeButton
7. Update app-shell active nav indicator
8. Verify all tests pass

### Phase 4: Polish & Content (1 PR)

1. Add impact section with real metrics
2. Adapt testimonials (or remove if no real testimonials available)
3. Final typography pass — ensure font-display and font-heading are applied consistently
4. Mobile responsive QA
5. Lighthouse performance check (ensure metallic effects don't degrade perf)

---

## Verification Checklist

### Color — Orange Eradication
- [ ] Zero `bg-orange-600` instances in codebase (currently 17 across 11 files)
- [ ] Zero `hover:bg-orange-700` instances
- [ ] Zero `border-orange-500` instances (currently 3 across 2 files)
- [ ] Zero `text-orange-500` instances (currently 1 in `not-found.tsx`)
- [ ] `grep -r "orange" --include="*.tsx" --include="*.css"` returns zero results (excluding docs/)

### Color — Achromatic Palette
- [ ] Dark mode background is near-black (`#090909`), not navy
- [ ] All card borders are achromatic (`zinc-800`), not blue-tinted
- [ ] Sidebar CSS vars are achromatic (hue 0, not 240)
- [ ] Chart CSS vars are achromatic (except emerald accent)
- [ ] Correct/incorrect feedback colors (green/red) unchanged

### Typography
- [ ] Hero headline uses display font at 48-72px with gradient text
- [ ] Dashboard stat values use `font-display text-3xl font-bold`
- [ ] Session summary stat values use `font-display text-3xl font-bold`

### Visual Effects
- [ ] Primary CTA on marketing pages uses liquid metal / metallic border effect
- [ ] Annual pricing card has metallic border treatment
- [ ] Selected choice button uses zinc/metallic indicator, not orange

### Auth
- [ ] Clerk sign-in/sign-up widget background matches page background
- [ ] Auth pages (Clerk) match new dark theme

### Quality Gates
- [ ] All 704+ existing tests pass
- [ ] No new `@testing-library/react` imports introduced
- [ ] Mobile responsive on all pages
- [ ] Lighthouse performance score >= 90
- [ ] No layout shift from metallic border animations

## Related

- Commit `a9f3b3e`: Original V0 template import
- Commit `ceefb46`: Integration commit that deleted the components
- `components/marketing/marketing-home.tsx`: Current simplified replacement
- SPEC-018: UI Integration (v0 Templates)
- PR #26: Original UI lint/fix PR (still open)
