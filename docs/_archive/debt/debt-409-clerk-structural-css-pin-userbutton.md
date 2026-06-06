# DEBT-409: Tailwind Docs-Source Pollution Emits Clerk Structural CSS

**Priority:** P3 (console-warning hygiene + forward-compatibility; no current user harm)
**Created:** 2026-06-05
**Source:** Discovered during the DEBT-408 audit, then settled by PR #404 build/browser experiments.
**Related:** [Debt Index](../../debt/index.md), [DEBT-408](./debt-408-clerk-ui-solana-react-native-subtree.md) (accepted - keep `@clerk/ui`), [DEBT-250 archived snippet](./debt-250-frontend-visual-divergence-compliance-plan.md), [Clerk component versioning](https://clerk.com/docs/reference/components/versioning), [Tailwind source detection](https://tailwindcss.com/docs/detecting-classes-in-source-files)

**Status:** Resolved 2026-06-05. Shipped in PR #404 (squash `fc3d3a44`) by excluding `docs/` from Tailwind v4 automatic source detection with `app/globals.css` `@source not "../docs";`. Close-out PR #405 added a fast unit guard in `app/globals.test.ts` that fails if the docs-source exclusion is removed.

---

## Resolution

Root cause: Tailwind v4 automatic source detection scanned repository Markdown under `docs/`, so historical debt-doc snippets containing valid arbitrary Tailwind selectors were emitted into production CSS.

Fix: `app/globals.css` keeps Tailwind's automatic source detection for the app while excluding documentation with `@source not "../docs";`.

Proof: clean production builds with the exclusion contain no `cl-userButton` selectors; scratch-removing the exclusion and rebuilding brings the exact `.cl-userButtonBox` / `.cl-userButtonTrigger` CSS rule back. Browser console verification on `/pricing` went from `structural_css_pin_clerk_ui` count `1` before the fix to `0` after the fix in both dark and light. The remaining Clerk selector tokens in archived docs are now inert because Tailwind no longer scans `docs/`.

Close-out hardening in PR #405: the vestigial `tailwind.config.js` was removed after a production-build experiment proved generated CSS is byte-identical with that file present versus absent. Keeping the legacy config would falsely imply its `content` array constrains Tailwind v4 source detection.

## Problem

Clerk emitted `structural_css_pin_clerk_ui` because the built app CSS contained Tailwind-generated selectors that target Clerk's internal UserButton DOM:

```text
.\[\&_\.cl-userButtonBox\]\:size-11 .cl-userButtonBox
.\[\&_\.cl-userButtonTrigger\]\:size-11 .cl-userButtonTrigger
```

The original DEBT-409 draft blamed the live `components/auth-nav.tsx:60` `appearance.elements.userButtonTrigger: 'min-h-[44px] min-w-[44px]'` override. That was falsified by experiment:

- The clean production build shipped the two selectors above in `.next/static/chunks/0t7v_hkha8-w~.css`.
- Source search found the exact arbitrary-selector tokens only in Markdown docs: this DEBT-409 doc and the archived DEBT-250 snippet.
- A scratch experiment that neutralized only the archived DEBT-250 token still emitted the selectors, because this DEBT-409 doc itself also contained extractable tokens.
- A Tailwind v4 source exclusion for `docs/` removed the selectors from built CSS and removed the browser warning on the public app route.

The real bug is not one Clerk prop and not one archived snippet. The bug is that Tailwind v4 automatic source detection was allowed to scan documentation Markdown, so valid Tailwind tokens inside historical debt docs could enter the production CSS bundle.

## Mechanism

`app/globals.css` previously imported Tailwind with:

```css
@import "tailwindcss";
```

There was no `@config` or `@source` directive. The legacy `tailwind.config.js` `content` array lists only `components`, `app`, and `src`, but Tailwind v4's CSS-first automatic detection does not honor that legacy content array unless the project wires the config into the CSS pipeline. The build proved the empirical behavior: Markdown under `docs/` was scanned.

Tailwind's current documentation says:

- source detection scans project files as plain text and generates utilities for tokens it recognizes;
- `@source not` excludes specific paths relative to the stylesheet;
- `source(none)` disables automatic detection if all sources are registered explicitly.

The minimal convergent fix is to keep automatic detection for the rest of the repo and exclude docs:

```css
@import "tailwindcss";
/* DEBT-409: Tailwind v4 auto-detects sources; docs snippets must not ship CSS. */
@source not "../docs";
```

This is narrower than `source(none)` plus explicit source registration. The `source(none)` spike also removed many non-doc selectors from generated CSS, so it was rejected as too broad for this debt.

## Evidence

All commands were run on branch `chore/debt-408-clerk-ui-solana-subtree` under Node 24.

### Built CSS before the fix

```text
$ rm -rf .next && pnpm build
✓ Compiled successfully

$ find .next -name '*.css' | sort
.next/static/chunks/0s5ypjqy-j~80.css
.next/static/chunks/0t7v_hkha8-w~.css

$ grep generated CSS for cl-userButton
.\[\&_\.cl-userButtonBox\]\:size-11 .cl-userButtonBox,.\[\&_\.cl-userButtonTrigger\]\:size-11 .cl-userButtonTrigger{width:calc(var(--spacing) * 11);height:calc(var(--spacing) * 11)}
```

### Source tokens before the fix

```text
$ rg -n "\[&_\.cl-userButton" --glob '!node_modules' .
docs/debt/debt-409-clerk-structural-css-pin-userbutton.md:28:<div className="[&_.cl-userButtonTrigger]:size-11 [&_.cl-userButtonBox]:size-11">
docs/debt/debt-409-clerk-structural-css-pin-userbutton.md:130:- replace the concrete `className="[&_.cl-userButtonTrigger]:size-11 [&_.cl-userButtonBox]:size-11"` sample...
docs/_archive/debt/debt-250-frontend-visual-divergence-compliance-plan.md:700:<div className="[&_.cl-userButtonTrigger]:size-11 [&_.cl-userButtonBox]:size-11">
```

No production `app/`, `components/`, `src/`, or `lib/` file contained the arbitrary selector tokens.

### Non-convergence experiment

Scratch-editing only the DEBT-250 archived snippet, then rebuilding, still emitted the same `cl-userButton` CSS rule. That proves per-doc snippet cleanup is not a durable fix: any debt doc can reintroduce a valid Tailwind token and ship it unless docs are excluded from Tailwind source detection.

### Built CSS after the fix

```text
$ rm -rf .next && pnpm build
✓ Compiled successfully

$ grep generated CSS for cl-userButton
(none)
```

The selector diff from baseline to fixed build:

```text
before selector count: 851
after selector count: 686
removed selector entries: 165
added selector entries: 0
```

The removed selector set is docs-derived pollution. It includes the Clerk structural selector plus many unrelated example/design-debt tokens such as `bg-foreground/[0.10]`, `dark:hover:bg-[#1F1F23]`, `border-l-success`, `h-[46px]`, and base `animate-in`/`animate-out` examples. This confirms the scope is broader than Clerk: docs Markdown was polluting the production CSS bundle.

### Browser console

Authenticated dashboard verification could not be completed because the saved Clerk profile redirected to hosted sign-in and the dev server reported a Clerk session refresh loop. The app-level warning was instead verified on the public `/pricing` route, which loads the same global stylesheet and Clerk provider.

Before the fix, `/pricing` in both dark and light emitted:

```text
STRUCTURAL_WARNING_COUNT=1
Found:
  - CSS ".\[\&_\.cl-userButtonBox\]\:size-11 .cl-userButtonBox"
  - CSS ".\[\&_\.cl-userButtonTrigger\]\:size-11 .cl-userButtonTrigger"
(code=structural_css_pin_clerk_ui)
```

After the fix, `/pricing` in both dark and light emitted:

```text
STRUCTURAL_WARNING_COUNT=0
```

## Clerk `ui` Prop

Clerk's `ui` prop remains a valid supported component-version pinning mechanism. Clerk's documentation recommends installing `@clerk/ui`, importing `ui`, and passing it to `<ClerkProvider>` for advanced customization that depends on component DOM structure.

That is not the right first-line fix here. Passing `ui` would suppress/pin the warning while leaving docs-derived structural CSS in the app bundle. Keep it as a fallback only if future live app CSS intentionally targets Clerk internals.

## Acceptance Criteria

- [x] Built CSS no longer contains `.cl-userButtonBox` / `.cl-userButtonTrigger` structural selectors.
- [x] Browser console on a public app route no longer emits `structural_css_pin_clerk_ui` in dark or light.
- [x] Source-token sweep confirms no production `app/`, `components/`, `src/`, or `lib/` file contains the Clerk arbitrary selector tokens.
- [x] Tailwind docs-source pollution is addressed at the source-detection layer, not by editing one snippet.
- [x] Generated selector diff is quantified and contains only removals from docs-source pollution.
- [x] Full local gate green before push: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build`. Evidence from the final-tree run under Node 24: lint completed with 0 errors / 19 known warnings, unit tests `331 passed (331)` / `2637 passed (2637)`, Browser Mode `56 passed (56)` / `295 passed (295)`, integration `19 passed (19)` / `108 passed (108)`, and `next build` completed successfully. Authenticated E2E also ran because the local billing E2E prerequisites were present: `35 passed (4.8m)`.
- [x] Fresh CodeRabbit review was clean on the latest PR #404 head before merge.
- [x] Regression guard added in `app/globals.test.ts`; scratch-removing the docs-source exclusion makes the guard fail, restoring it makes the guard pass.
- [x] Vestigial `tailwind.config.js` removed after a present-vs-absent build comparison proved generated CSS was byte-identical.

## Rollback

Rollback is a one-line config revert in `app/globals.css`: remove `@source not "../docs";`. This restores Tailwind's previous automatic source detection behavior and would also restore docs-derived CSS pollution.
