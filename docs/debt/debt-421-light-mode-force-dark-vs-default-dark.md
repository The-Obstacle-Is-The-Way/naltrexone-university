# DEBT-421: Light Mode Is Unfinished — Force Dark (kill switch) vs. Default Dark (soft default)

**Priority:** P2 (ships a known-incomplete UI surface to users; quality/perception risk, low functional risk)
**Created:** 2026-06-15
**Status:** Decided — **Option B implemented** on branch `debt/421-light-mode-force-dark-vs-default-dark` (full quality gate green on Node 24). Pending CodeRabbit review + merge. This doc records the decision and the as-shipped implementation.
**Related:** [DEBT-262](../_archive/debt/debt-262-light-mode-opacity.md) (light-mode opacity-scale asymmetry, accepted + documented), [DEBT-263](../_archive/debt/debt-263-text-contrast.md) (light-mode success/destructive contrast fix), [DEBT-250](../_archive/debt/debt-250-frontend-visual-divergence-compliance-plan.md) (LIGHT-1/2/3 audit items), `docs/frontend/pattern-registry.md` § 1.2 (opacity scale + light-mode caveat)

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

1. **`app/layout.tsx`** — `defaultTheme="system" enableSystem` → `forcedTheme="dark" defaultTheme="dark"` (dropped `enableSystem`; `forcedTheme` makes OS detection moot). `defaultTheme="dark"` only sets dark for fresh users with no stored preference and keeps the Option-A exit clean; the guarantee for returning users with a stale `theme:light` comes solely from `forcedTheme` winning the DOM plus the `providers.tsx` fallback, not from `defaultTheme`. The root `<html>` also statically ships `dark` and `color-scheme: dark` before body content because the nonce-bound next-themes script streams after some PPR body content.
2. **`components/providers.tsx`** — **the non-obvious fix.** Verified against the installed `next-themes@0.4.6` source: under `forcedTheme`, the provider applies `forcedTheme ?? theme` to the DOM class, but `resolvedTheme` is still computed as `theme === "system" ? systemTheme : theme` — i.e. it tracks the **stored/system** value, *not* the forced one. So a returning user with a stale `theme: light` in `localStorage` would render a dark page while `resolvedTheme === 'light'` selected Clerk's **light** appearance — a real mismatch. Fix: destructure `forcedTheme` from `useTheme()` and key the Clerk appearance off `forcedTheme ?? resolvedTheme`. This is reversible: once `forcedTheme` is removed for Option A, it falls back to `resolvedTheme` (current behavior).
3. **Unmounted `<ThemeToggle />`** in both shells — `app/(app)/app/layout.tsx` (authenticated app) and `components/marketing/marketing-layout.tsx` (public marketing). Replaced each with a `DEBT-421` breadcrumb comment. The component file is kept.
4. **Deleted nothing dormant** — `globals.css` `:root` light tokens, `theme-provider.tsx`, `theme-toggle.tsx`, `theme-toggle.browser.spec.tsx`, and `CLERK_APPEARANCE_LIGHT` are all untouched and ready to re-enable.
5. **Tests** — `app/layout.test.tsx` now asserts `forcedTheme="dark"` + `defaultTheme="dark"` (locks in the decision); `components/theme-provider.test.tsx` proves the wrapper forwards `forcedTheme`; `components/providers.test.tsx` adds a regression guard that forced-dark + stored-light yields the dark Clerk appearance; `marketing-layout.test.tsx` flips to assert the toggle is **not** mounted (its existing mock now serves as a re-mount sentinel). `theme-toggle.browser.spec.tsx` is unchanged (component still works in isolation).
6. **Gate** — `pnpm typecheck`, `pnpm lint`, `pnpm test --run` (2837 passed), and `pnpm build` (exit 0) all green on Node 24.

## Acceptance criteria (for the eventual implementation PR)

- [ ] No code path renders light mode in production: fresh visit (OS light *and* OS dark), returning visit with a stale `theme: light` in `localStorage`, and the (now absent) toggle all resolve to dark.
- [ ] `ThemeToggle` is no longer mounted/visible; its component file, the light CSS tokens, and the Clerk light appearance remain in the tree for a future re-enable.
- [ ] Clerk surfaces (`/sign-in`, `/sign-up`, `/app/*` `UserButton`) render the dark appearance.
- [ ] Toggle/nav tests updated; full quality gate green on the runtime in `.nvmrc` / `package.json` `engines.node`.

## Exit criteria — when to move to Option A (re-enable light mode)

- [ ] Light mode meets `docs/frontend/contrast-policy.md` AA targets across all audited surfaces.
- [ ] The opacity-scale legibility gap (`pattern-registry.md` § 1.2 light-mode caveat) is resolved or has an owner-accepted, documented design answer for every interactive surface.
- [ ] The temporary accessibility trade-off is closed by restoring user choice after contrast and owner review pass.
- [ ] Owner sign-off that light mode is design-complete.
- [ ] Then: remove `forcedTheme`, re-mount `ThemeToggle`, set `defaultTheme="dark"` (keep dark as the soft default), and decide whether to re-introduce `enableSystem`.
