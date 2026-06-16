# DEBT-421: Light Mode Is Unfinished — Force Dark (kill switch) vs. Default Dark (soft default)

**Priority:** P2 (ships a known-incomplete UI surface to users; quality/perception risk, low functional risk)
**Created:** 2026-06-15
**Status:** **Resolved — Option B shipped + merged (#449), archived 2026-06-15.** The kill switch is live on `dev` + `main`: `app/layout.tsx` ships `forcedTheme="dark"` + `defaultTheme="dark"` with a static `dark` / `color-scheme: dark` root `<html>`, `ThemeToggle` is unmounted from both shells (with regression tests), `providers.tsx` keys Clerk appearance off `forcedTheme ?? resolvedTheme`, and `global-error` ships dark. All four acceptance criteria below are met (`[x]`). **Scope complete — not a living doc.** The unchecked **Exit criteria** are a *future, separate* effort (finishing light mode and re-enabling it via Option A, incl. the non-trivial T-4 anti-FOUC work); pursue that by filing a fresh debt that references this archived record, not by reopening DEBT-421.
**Related:** [DEBT-262](./debt-262-light-mode-opacity.md) (light-mode opacity-scale asymmetry, accepted + documented), [DEBT-263](./debt-263-text-contrast.md) (light-mode success/destructive contrast fix), [DEBT-250](./debt-250-frontend-visual-divergence-compliance-plan.md) (LIGHT-1/2/3 audit items), `docs/frontend/pattern-registry.md` § 1.2 (opacity scale + light-mode caveat)

---

## Problem

The app supports both light and dark themes, but **only dark mode has received real design investment**. Light mode renders, but it is not design-complete: the owner has not yet worked the light-mode color scheme, and the design system already documents systemic light-mode weaknesses (the opacity-scale asymmetry in `pattern-registry.md` § 1.2 — `--muted` at 96.1% lightness is only 3.9% from white, so the whole `/20`–`/60` hover scale is near-invisible on white surfaces). DEBT-262 and DEBT-263 patched specific contrast bugs, but no holistic light-mode pass has happened.

Today, **a first-time visitor whose operating system is set to light mode lands directly in the unfinished light theme** — the worst first impression for a paid product. That is the core defect this doc resolves.

### Current wiring (verified against `main`)

| Location | Current behavior |
|---|---|
| `app/layout.tsx:34-38` | `<ThemeProvider attribute="class" defaultTheme="system" enableSystem nonce={nonce}>` — **no stored preference ⇒ follow the OS.** A light-OS visitor sees light mode on first paint. |
| `components/theme-toggle.tsx` | A nav button toggling `resolvedTheme === 'dark' ? 'light' : 'dark'`. Lets any user switch *into* the broken light mode at will. |
| `components/providers.tsx:50-56` | Clerk `appearance` already derives from `resolvedTheme` (`CLERK_APPEARANCE_DARK` / `_LIGHT`), so Clerk surfaces follow whatever theme is active. |
| `app/globals.css` | Full `:root` (light) **and** `.dark` token sets are defined. Light tokens are real and rendered; they are simply not design-finished. |

So there are **two independent ways a user reaches broken light mode**: (1) OS default on first visit, and (2) the toggle. Any real fix must address both, not just the default.

---

## Relevant `next-themes` semantics (load-bearing for the options)

These three props behave differently and the distinction is the whole decision:

- **`defaultTheme`** — used **only when there is no stored preference**. It does *not* override a value already in `localStorage` (key `theme`), and it does not override the OS when `enableSystem` resolves `"system"`.
- **`enableSystem`** — when on, `"system"` is a selectable/resolved theme that tracks `prefers-color-scheme`.
- **`forcedTheme`** — **hard lock.** Overrides the stored preference *and* the OS *and* makes the toggle's `setTheme` a no-op for the applied theme. This is the only prop that guarantees *nobody* — including returning users who already have `theme: light` persisted from an earlier visit — can render light mode.

Consequence: **only `forcedTheme` actually guarantees no user ever sees the unfinished light theme.** Changing the default alone leaves two leaks (the toggle, and already-persisted `theme: light` in early users' browsers).

---

## Option A — Soft default: default to dark, keep the toggle

Make dark the default while leaving light reachable.

```tsx
// app/layout.tsx
<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} nonce={nonce}>
```

- New visitors get dark regardless of OS.
- The `ThemeToggle` stays; users can still switch to light.

**Pros**
- Smallest diff; nothing is removed or hidden.
- Respects user autonomy — someone who *wants* light can have it.
- This is the natural **end state** once light mode is finished.

**Cons (the disqualifiers for *now*)**
- **Still ships the broken feature.** The toggle is a one-click path into a UI the owner considers unfinished. A control that drops users into a known-bad state is a UX defect, not a feature.
- **Does not guarantee** no one sees light: any early user with `theme: light` already in `localStorage` keeps seeing light (default doesn't override stored values), and anyone can toggle in.
- Hiding an unfinished surface behind a default is concealment, not resolution — it reads "done" while leaving a live broken path.

---

## Option B — Kill switch (recommended): force dark, hide the toggle, preserve everything for re-enable

Lock the app to dark until light mode is finished, the standard "disable an unfinished feature cleanly" move.

```tsx
// app/layout.tsx
<ThemeProvider attribute="class" forcedTheme="dark" nonce={nonce}>
```

…plus stop mounting `ThemeToggle` in the nav (the button would otherwise be a dead no-op). **Do not delete** the light-mode tokens in `globals.css` or the `theme-provider` / `theme-toggle` / Clerk-light-appearance code — they stay in the tree, dormant, so re-enabling is a near-one-line revert.

**Pros**
- **Guarantees** every user, new or returning, OS-light or OS-dark, sees only the finished dark theme. Closes both leaks (OS default *and* toggle *and* stale `localStorage`).
- **Honest UI** — no control that promises a working alternate theme that isn't ready.
- **Fully reversible / non-destructive** — `forcedTheme` is a single prop; the toggle is re-mounted in one place; zero CSS or component deletion. This is the feature-flag / kill-switch pattern: gate the incomplete capability off, keep the code, flip it on when it's ready.
- Clerk gets explicit compensation: next-themes keeps `resolvedTheme` on the stored/system value under `forcedTheme`, so `providers.tsx` keys Clerk appearance off `forcedTheme ?? resolvedTheme`.

**Cons**
- Removes user choice in the interim (acceptable: the only choice removed is "render the broken theme").
- The `theme-toggle` tests (`theme-toggle.browser.spec.tsx`) and any nav test asserting the toggle's presence must be updated when the toggle is unmounted.

**Accessibility trade-off:** Forcing dark removes an accessibility preference, not just a cosmetic choice. Some users read better in light mode due to low vision, astigmatism/halation, migraine or photophobia-adjacent sensitivity, or high ambient light. This is accepted only as a temporary kill switch because the current light mode has known contrast/legibility defects; restore user choice once light mode passes contrast and owner review.

---

## Recommendation

**Ship Option B now; treat Option A as the documented exit state.**

Software-engineering rationale:

1. **Don't ship broken features.** Light mode is unfinished by the owner's own assessment. A toggle into it is shipping the unfinished feature with a label that says "ready." Option A keeps that path live; Option B removes it.
2. **Correctness of the guarantee.** The stated goal is "no one should land in the broken theme." Only `forcedTheme` delivers that guarantee; a default change provably does not (toggle + persisted `localStorage` leaks). Pick the mechanism that actually satisfies the requirement.
3. **Reversibility.** Option B is non-destructive and trivially revertible — it is a flag, not a teardown. When light mode is finished, removing `forcedTheme`, re-mounting the toggle, and (optionally) moving to `defaultTheme="dark"` *is* Option A. The two options are not rivals; B is the safe interim and A is the destination.
4. **Honesty over concealment.** Hiding a broken surface behind a default still leaves it one click away and signals "complete." Disabling it states the truth: light mode is not ready yet.

Option A is the right call the moment light mode passes its own design bar (contrast policy AA, opacity-scale legibility, owner sign-off) — at which point this becomes the last step, not a workaround.

---

## Implementation (as shipped on this branch)

1. **`app/layout.tsx`** — `defaultTheme="system" enableSystem` → `forcedTheme="dark" defaultTheme="dark"` (dropped `enableSystem`; `forcedTheme` makes OS detection moot). `defaultTheme="dark"` only sets dark for fresh users with no stored preference and keeps the Option-A exit clean; the guarantee for returning users with a stale `theme:light` comes solely from `forcedTheme` winning the DOM plus the `providers.tsx` fallback, not from `defaultTheme`. The root `<html>` statically ships `dark` and `color-scheme: dark` before body content because the nonce-bound next-themes script streams after some PPR body content. The exported `viewport` sets `themeColor: '#090909'` so mobile browser chrome matches the forced dark page background.
2. **`components/providers.tsx`** — **the non-obvious fix.** Verified against the installed `next-themes@0.4.6` source: under `forcedTheme`, the provider applies `forcedTheme ?? theme` to the DOM class, but `resolvedTheme` is still computed as `theme === "system" ? systemTheme : theme` — i.e. it tracks the **stored/system** value, *not* the forced one. So a returning user with a stale `theme: light` in `localStorage` would render a dark page while `resolvedTheme === 'light'` selected Clerk's **light** appearance — a real mismatch. Fix: destructure `forcedTheme` from `useTheme()` and key the Clerk appearance off `forcedTheme ?? resolvedTheme`. This is reversible: once `forcedTheme` is removed for Option A, it falls back to `resolvedTheme` (current behavior).
3. **Unmounted `<ThemeToggle />`** in both shells — `app/(app)/app/layout.tsx` (authenticated app) and `components/marketing/marketing-layout.tsx` (public marketing). Replaced each with a `DEBT-421` breadcrumb comment. The component file is kept.
4. **`app/global-error.tsx`** — Next renders `global-error` as its own replacement document, outside the root layout. Its standalone `<html>` now also ships `class="dark"` and `color-scheme: dark`, preserving the forced-dark invariant on the catastrophic error surface.
5. **Deleted nothing dormant** — `globals.css` `:root` light tokens, `theme-provider.tsx`, `theme-toggle.tsx`, `theme-toggle.browser.spec.tsx`, and `CLERK_APPEARANCE_LIGHT` are all kept and ready to re-enable. The only CSS removal is the duplicate `@variant dark (&:is(.dark *));` line, deleted after a build proved byte-identical emitted CSS with the canonical `@custom-variant dark` registration.
6. **Tests** — `app/layout.test.tsx` asserts the static opening `<html>` contract, `forcedTheme="dark"` + `defaultTheme="dark"`, and `viewport.themeColor`; `app/global-error.test.tsx` asserts the standalone error document is dark; `components/theme-provider.test.tsx` proves the wrapper forwards `forcedTheme`; `components/providers.test.tsx` guards forced-dark + stored-light selecting Clerk's dark appearance; `app/(app)/app/layout-shell.test.tsx` and `components/marketing/marketing-layout.test.tsx` assert the toggle is **not** mounted with live sentinels; `tests/e2e/theme-preference.spec.ts` and `tests/e2e/dark-mode.spec.ts` are forced-dark guards. `theme-toggle.browser.spec.tsx` is unchanged (component still works in isolation).
7. **Gate** — final local gate green on Node 24: `pnpm typecheck` exit 0; `pnpm lint` exit 0 (19 pre-existing oversized-file warnings); `pnpm test --run` 348 files / 2838 tests passed; `pnpm test:browser` 57 files / 297 tests passed; `pnpm test:integration` 19 files passed / 1 skipped, 111 tests passed / 2 skipped; `pnpm build` exit 0; `pnpm test:e2e` 36 passed.

## Acceptance criteria (for the eventual implementation PR)

- [x] No code path renders light mode in production: fresh visit (OS light *and* OS dark), returning visit with a stale `theme: light` in `localStorage`, and the (now absent) toggle all resolve to dark.
- [x] `ThemeToggle` is no longer mounted/visible; its component file, the light CSS tokens, and the Clerk light appearance remain in the tree for a future re-enable.
- [x] Clerk surfaces (`/sign-in`, `/sign-up`, `/app/*` `UserButton`) render the dark appearance.
- [x] Toggle/nav tests updated; full quality gate green on the runtime in `.nvmrc` / `package.json` `engines.node`.

## Exit criteria — when to move to Option A (re-enable light mode)

- [ ] Light mode meets `docs/frontend/contrast-policy.md` AA targets across all audited surfaces.
- [ ] The opacity-scale legibility gap (`pattern-registry.md` § 1.2 light-mode caveat) is resolved or has an owner-accepted, documented design answer for every interactive surface.
- [ ] The temporary accessibility trade-off is closed by restoring user choice after contrast and owner review pass.
- [ ] Owner sign-off that light mode is design-complete.
- [ ] Then: remove `forcedTheme`, re-mount `ThemeToggle`, set `defaultTheme="dark"` (keep dark as the soft default), and decide whether to re-introduce `enableSystem`.
- [ ] **Re-enable is NOT just "drop `forcedTheme`."** The static `class="dark"` + `style="color-scheme: dark"` on the root `<html>` (FIX-1) is only correct while the theme is *statically* dark. Once the theme is user-selectable again, that static value would ship dark to a light-preferring user and flash dark→light when the (Suspense-/nonce-deferred) next-themes script resolves. Option A must therefore ALSO remove the static `<html>` theme attributes and restore a real anti-FOUC mechanism — a blocking, nonce-carrying head script that reads the stored preference before first paint — which is non-trivial under this app's PPR + CSP-nonce-deferred-provider architecture (see the audit appendix, finding T-4). Treat anti-FOUC for a dynamic theme as a first-class line item of the Option-A work, not an afterthought.

---

## Appendix — codebase-wide theme architecture audit (first-principles, all surfaces)

This appendix answers a follow-up question: now that every theme surface is known, is the system cleanly coded top-to-bottom, or did forcing dark uncover unnecessary complexity worth simplifying? **Method:** read every theme-touching file (`app/layout.tsx`, `app/global-error.tsx`, `components/theme-provider.tsx`, `components/theme-toggle.tsx`, `components/providers.tsx`, `app/globals.css`, the 13 production `app/` + `components/` files carrying governed `dark:` overrides, the PostCSS config, and the theme E2E specs); cross-checked `next-themes@0.4.6` behavior against its installed source; and **empirically** verified the CSS-variant claim with a build diff.

### Verdict

**Architecturally clean and correct for the forced-dark interim.** The chain — root `<html>` / standalone `global-error` `<html>` → `ThemeProvider` (`forcedTheme`) → `.dark` token set → semantic Tailwind utilities → Clerk appearance — is internally consistent and function-preserving. The implementation is **not** carrying meaningful unnecessary complexity that should be torn out now. The apparent redundancies are each *justified by the deliberately preserved Option-A optionality*, and removing them would be the **wrong** kind of simplification — it would delete the re-enable path the whole decision exists to protect (see "Justified complexity" below). The audit surfaced stale E2E coverage, one verified dead CSS line, the standalone `global-error` document gap, the strict-optional wrapper rationale, and missing dark browser-chrome metadata; the actionable items are fixed in this PR. The remaining drift risk (Clerk hex palette) and forward-looking Option-A FOUC caveat are documented below.

### Surfaces reviewed

| Surface | Role | Assessment |
|---|---|---|
| `app/layout.tsx` (`<html>` + `ThemeProvider`) | SSR theme authority + provider config | Correct. Static `dark`/`color-scheme` is the right FOUC fix *given forced dark* + the deferred provider. |
| `app/global-error.tsx` | Standalone replacement document outside the root layout | Correct after adding its own static `class="dark"` + `color-scheme: dark`. |
| `components/theme-provider.tsx` | Thin wrapper over `next-themes` | **Load-bearing, not gratuitous** (T-5). |
| `components/providers.tsx` | Clerk appearance switch | Correct after the `forcedTheme ?? resolvedTheme` fix. Carries a palette drift risk (T-3). |
| `components/theme-toggle.tsx` | Dormant toggle | Correctly preserved and unmounted from both shells. |
| `app/globals.css` | Token sets + dark variant registration | Correct. The duplicate `@variant dark` line was removed after byte-identical build proof; `:root` and `.dark` token sets are preserved. |
| 13 production `dark:`-bearing files | Governed per-component overrides | Correct; light branches are dead-at-runtime-but-intentional (preserved for re-enable). |
| `tests/e2e/theme-preference.spec.ts` / `tests/e2e/dark-mode.spec.ts` | E2E theme guards | Correct after rewriting to assert forced-dark behavior instead of system-theme behavior. |
| `postcss.config` / Tailwind v4 CSS-first | Build config | Clean (no `tailwind.config`, per DEBT-409). |

### Findings & final disposition

- **T-1 — Stale E2E tests, "passing for the wrong reason" / false dynamic-theme assertion (Fixed).** `tests/e2e/theme-preference.spec.ts` previously set OS `colorScheme: 'light'` + `localStorage.theme = 'dark'` and asserted `<html>` was `dark`, proving nothing under `forcedTheme`. `tests/e2e/dark-mode.spec.ts` also still expected `.dark` to turn off when emulating OS light, which is false under forced dark. Both specs now assert the real invariant: OS-light/OS-dark and stale `localStorage.theme = 'light'` still resolve to `<html class="dark">` with computed `color-scheme: dark`. `tests/e2e/marketing-contrast.spec.ts` was retitled from "light mode" to "OS light is forced dark" and now asserts the same dark invariant before checking contrast. Targeted wrapper run for the two direct theme specs passed: setup + 3 Chromium checks, `4 passed`.
- **T-2 — Dead CSS line, empirically verified and removed (Fixed).** The deleted `app/globals.css` line `@variant dark (&:is(.dark *));` was a no-op duplicate of the canonical registration `@custom-variant dark (&:is(.dark *));`. Proof before deletion and after deletion: emitted CSS stayed `3286jft8b6wb0.css`, 79,534 bytes, 119 `.dark` occurrences, SHA-256 `619fb64263e21e4c139274c812cf961a0929419546fe06b95d614a99efa03231`.
- **T-3 — Clerk appearance is a second source of truth for the dark palette (Low; follow-up).** `CLERK_APPEARANCE_DARK`/`_LIGHT` in `components/providers.tsx` hand-code hex (`#121212`, `#ededed`, …) that approximate — but do **not** mirror — the `globals.css` tokens (e.g. Clerk's `colorBackground: #121212` tracks the `--card` ≈ 7% surface, not `--background` ≈ 3.5%). This is an allowed third-party seam, but the values can silently drift from the design tokens. **Recommendation (follow-up):** extract a single TS palette constant consumed by both, or at minimum add a comment documenting the intentional approximations and their token anchors so future token edits prompt a Clerk re-check.
- **T-4 — Option A re-enable reintroduces FOUC (Medium; forward-looking, captured in Exit Criteria).** The static `<html>` dark attributes are correct only while the theme is static. Re-enabling a user-selectable theme requires removing them and restoring a real before-paint anti-FOUC script under the PPR + CSP-nonce-deferred-provider constraints. Documented as a first-class Option-A line item above; flagged here so it is not lost.
- **T-5 — `theme-provider.tsx` wrapper is load-bearing — do NOT "simplify" it away (Fixed/documented).** It exists to conditionally spread `nonce` (`{...(nonce !== undefined ? { nonce } : {})}`). Under `exactOptionalPropertyTypes` (enabled by DEBT-418), passing `nonce={undefined}` directly to `next-themes`' `nonce?: string` is a type error, so the wrapper is required for the strict-types build. The wrapper now carries a one-line comment documenting that reason.
- **T-6 — `theme-color` meta for a now-dark-only app (Fixed).** `app/layout.tsx` exports `viewport.themeColor = '#090909'`, matching the dark `--background` token (`0 0% 3.5%`, rounded to RGB `#090909`) so mobile browser chrome matches the forced dark page. Revisit when light mode returns; it would then need to be theme-aware or removed.
- **T-7 — Standalone `global-error` document outside root layout (Fixed).** `app/global-error.tsx` renders its own `<html>` and therefore does not inherit `RootLayout`'s static `dark` class, color scheme, or `ThemeProvider`. It now ships `class="dark"` and `color-scheme: dark` on that standalone document, with `app/global-error.test.tsx` asserting the contract.

### Justified complexity (intentional — do not "simplify")

- **`next-themes` is still mounted under a hardcoded theme.** It looks redundant beside the static `<html class="dark">`, but it powers the dormant toggle's `useTheme`, supplies `forcedTheme` to `providers.tsx`, and keeps Option-A a near-one-line change. Removing it while forced would force a destructive rewire of the toggle and Clerk — the opposite of the optionality this decision preserves.
- **The light branches in `providers.tsx` and the per-component `dark:` overrides** are dead at runtime while forced, but are the same preserved-for-re-enable asset as the toggle and the `:root` light tokens. Keeping them is the point, not an oversight.
- **The redundant theme assertion (static `<html>` + next-themes both saying "dark")** is intentional belt-and-suspenders: the static attributes guarantee SSR/first-paint correctness, and next-themes owns the client runtime for the eventual dynamic case.
