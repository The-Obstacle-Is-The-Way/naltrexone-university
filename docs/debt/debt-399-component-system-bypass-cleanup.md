# DEBT-399: Component-System Bypass Cleanup

**Priority:** P2 (concrete violations of the documented "all interactive click targets MUST use `<Button>`" rule from `docs/frontend/standards.md` § 2. Two known production-code raw `<button>` sites still hand-roll Button-equivalent layout, hover, disabled, and focus behavior even after PR 2 migrated them to the shared `.ring-focus` utility, and one history disclosure button is not covered by the current Pattern Registry I-6 app-shell exception unless it migrates to `<Button>`. The 26 exact focus-ring copies across 19 files were correct-values-but-copy-paste before PR 2 extracted them, which meant any future change to the canonical pattern required editing 19+ files. This is the visible symptom of the meta-debt described in DEBT-398.)
**Created:** 2026-05-26
**Source:** Deep design-system audit conducted alongside DEBT-394 archival. Verified against the documented rules in `docs/frontend/standards.md` and `docs/frontend/pattern-registry.md`. The audit found three production raw `<button>` sites: two clear Button bypasses with Button-equivalent styling now partially reduced to `.ring-focus`, plus one history disclosure toggle that has the required `aria-label` / `aria-expanded` / `aria-controls` attributes but is not an app-shell I-6 exception today. It also found 26 instances of the exact canonical focus-ring string across 19 files with no shared extraction, or 33 broader instances when counting the Button/Input/Select primitives, alternate ordering with `focus-visible:border-ring`, extra review/practice focus-ring consumers, and the `focus-within` variant.
**Related:** [docs/frontend/standards.md](../frontend/standards.md) (§ 2 Button mandate, § 3 focus-ring single canonical pattern), [docs/frontend/pattern-registry.md](../frontend/pattern-registry.md) (I-6 disclosure toggle pattern), [components/ui/button.tsx](../../components/ui/button.tsx), [DEBT-398](./debt-398-design-system-enforcement-gap.md) (the root meta-debt that allowed these violations to accumulate)

**Status:** Active

---

## Problem

`docs/frontend/standards.md` § 2 mandates: "All interactive click targets MUST use the `<Button>` component." § 3 mandates: "ONE canonical focus ring pattern: `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`." Pattern Registry I-6 carves out a narrow exception for app-shell disclosure toggles.

The codebase carried this debt in two distinct ways; PR 1 / PR 2 resolved the focus-ring duplication, and PR 3 / PR 4 clean up the remaining raw-button and opacity violations:

1. **Three production raw `<button>` sites need cleanup decisions.** Two are clear Button bypasses with hand-rolled className strings that duplicate Button behavior even after PR 2 reduced the focus-ring copy-paste to `.ring-focus`. The history-session disclosure toggle has correct ARIA wiring, but it is not an app-shell control and does not match I-6's exact hover/focus treatment, so it must migrate to `<Button>` rather than relying on the app-shell exception.

2. **The exact canonical focus-ring string previously appeared 26 times across 19 files** in component code (33 broader instances if you also counted related Button/Input/Select primitive classes, alternate ordering with `focus-visible:border-ring`, extra review/practice focus-ring consumers, and the `focus-within` variant in `choice-button.tsx`). PR 1 shipped the shared `.ring-focus` / `.ring-focus-within` utilities and PR 2 migrated the exact copies, leaving one canonical CSS source in `app/globals.css`. This historical duplication matters because PR 3 must now preserve the shared utility behavior while removing the remaining raw-button bypasses.

The remaining raw-button and opacity exemptions mean the design system still has known carve-outs even though DEBT-398 now enforces new drift. DEBT-399 removes those carve-outs in scoped PRs.

---

## Findings

### A. Raw `<button>` cleanup decisions (3 production sites)

**Site 1 (HIGH severity): `app/(app)/app/shared/components/session-breakdown-list.tsx:39-49`**

Raw `<button type="button">` with className bundle:

```tsx
className="-mx-2 flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left font-medium text-foreground transition-colors hover:bg-muted/20 ring-focus disabled:pointer-events-none disabled:opacity-50"
```

This duplicates:
- Button's focus-ring behavior (now via the shared `.ring-focus` utility, documented canonical source: `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]`)
- Button's disabled state (documented canonical: `disabled:pointer-events-none disabled:opacity-50`)
- Button's hover transition (`transition-colors`)
- A custom hover bg (`hover:bg-muted/20` — note: this opacity is LIGHTER than `pattern-registry.md` § 1.2 § I-2 guidance, which says `/40` for in-card and `/50` for on-page; see Finding C)

The component should use `<Button variant="secondary">` with explicit visual-preservation classes. `ghost` is semantically tempting, but it injects `dark:hover:bg-accent/50`, which would alter the current dark hover and drag PR 4 opacity work into PR 3. `secondary` gives the Button primitive behavior while allowing the existing transparent rest state and `hover:bg-muted/20` to remain pinned until PR 4 resolves the opacity divergence.

**Site 2 (MEDIUM): `app/(app)/app/history/components/history-sessions-tab.tsx:226-235`**

Raw `<button>` for disclosure toggle. The current implementation includes the required accessible disclosure wiring (`aria-label`, `aria-expanded`, and `aria-controls`), but Pattern Registry I-6 only permits raw `<button>` for app-shell disclosure controls when the exact I-6 focus/hover treatment is present. This history-row disclosure is not app shell and does not use I-6's hover treatment, so it is not registry-acceptable solely by I-6. Migrate it to `<Button variant="ghost" size="icon">` with size/padding overrides that preserve the current compact 24px-ish hit area; do not add a dedicated Pattern Registry entry for a one-off row disclosure.

**Site 3 (MEDIUM): `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:214`**

Raw `<button>` with `.ring-focus`, `focus-visible:border-ring`, card surface, hover, and transition behavior applied directly. Same cleanup category as Site 1: use `<Button variant="secondary">` with explicit card-surface preservation classes so Button owns the interactive primitive behavior without changing the row's card-like rest state.

### B. Focus-ring duplication resolved by PR 1 / PR 2 (historical finding)

The original audit verified the pre-remediation count with:

```sh
rg -c "focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-\[3px\]" app/ components/
```

The 19 files (with occurrence counts) per the original audit:
- `components/mobile-nav.tsx` (3)
- `components/marketing/marketing-layout.tsx` (2)
- `app/pricing/pricing-view.tsx` (2)
- `app/(app)/app/dashboard/page.tsx` (2)
- `app/(app)/app/shared/components/session-breakdown-list.tsx` (2)
- `app/(app)/app/history/components/history-sessions-tab.tsx` (2)
- `app/layout.tsx` (1, skip-link)
- `components/app-desktop-nav.tsx` (1, extracted as `focusVisibleRing` const at lines 10-11 but used only within this file)
- `app/pricing/pricing-view-skeleton.tsx` (1)
- `components/ui/filter-chip.tsx` (1)
- `app/(app)/app/questions/[slug]/question-page-client.tsx` (1)
- `components/ui/tab-switch-styles.ts` (1)
- `app/(app)/app/layout.tsx` (1)
- `components/auth-nav.tsx` (1)
- `app/(app)/app/bookmarks/page.tsx` (1)
- `app/(app)/app/history/components/history-questions-tab.tsx` (1)
- `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` (1)
- `app/(app)/app/practice/components/practice-view.tsx` (1)
- `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx` (1)

The broader 33-instance family additionally includes the Button/Input/Select primitives, two extra review/practice focus-ring consumers, one alternate `focus-visible:border-ring` ordering in `exam-review-view.tsx`, and one `focus-within` variant in `components/question/choice-button.tsx`.

Each original occurrence was CORRECT (matched the documented pattern), but each was copy-paste. PR 1 and PR 2 resolved this part of the debt: a `.tsx` / `.ts` grep now returns zero exact canonical focus-ring copies, and `app/globals.css` is the single canonical source for the `@apply` string. The remaining PR 3 work is the raw-button cleanup described in Finding A.

### C. Hover-opacity divergence from `pattern-registry.md` § 1.2

`app/(app)/app/shared/components/session-breakdown-list.tsx:12` and `:65` use `hover:bg-muted/20`. The pattern registry says non-card page-context rows should use `hover:bg-muted/50` or, for tonal rows, `hover:bg-foreground/[0.12]`. The same shared component also renders inside the session-summary card, but the history expanded-row use is directly on the page-background tonal row, and the current class is a muted-scale hover with no foreground-ramp rest fill. PR 4 therefore aligns both session-breakdown hover sites to `hover:bg-muted/50`; do not register `/20`.

`app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:41` also uses `hover:bg-muted/20`. That row is inside a `<Card>` (`QuestionNavigator` card at line 58), so PR 4 aligns it to the documented in-card muted-scale hover `hover:bg-muted/40`; do not register `/20`.

### D. Custom dark-mode opacities scattered without registry entry

`app/(app)/app/shared/components/session-breakdown-list.tsx:38` uses `divide-border/20 dark:divide-foreground/20`. `app/(app)/app/history/components/history-sessions-tab.tsx:260` uses `border-border/30 dark:border-foreground/10`. None of `/20`, `/30`, or `/10` is in the nearest documented separator/border contracts: `pattern-registry.md` § 1.3 specifies `border-border`, `border-border/60`, `border-border/40`, and `dark:border-foreground/40`, while M-2 specifies `border-t border-border`, `/60`, or `/40` for content separators.

PR 4 aligns these separators to the documented light separator / required dark boundary tier: `divide-border/40 dark:divide-foreground/40` for the list divider, and `border-border/40 dark:border-foreground/40` for the history breakdown panel. Because the regression scan currently allowlists `border-border/40` but not the equivalent `divide-*` utility form, PR 4 must add `divide-border/40` and `dark:divide-foreground/40` to `DOCUMENTED_OPACITY_TOKENS` when deleting the temporary exemptions. Do not register the old `/20`, `/30`, or `/10` values.

### E. Component file bloat

Two production component files exceed the 200-line "god component" guideline:

- `components/question/feedback.tsx` — 262 lines, handles correct/incorrect rendering, explanation tier system, references.
- `components/marketing/marketing-home.tsx` — 359 lines, composes hero, impact stats, features, CTA, pricing data.

These are component-architecture concerns rather than design-system enforcement concerns. They are out of scope for DEBT-399's component-system bypass cleanup. If their size proves to be an actual maintenance burden (vs. a "deep module" that earns its size per Ousterhout's discipline), file as a separate debt entry rather than bundling here.

---

## Why Existing Docs Were Not Enough

The Button mandate (`standards.md` § 2) exists. The focus-ring canonical pattern (`standards.md` § 3) exists. The opacity scale (`pattern-registry.md` § 1.2) exists. The dark-mode override scale (`pattern-registry.md` § 1.3) exists.

The original gap was enforcement, not documentation. Before DEBT-398 PR 3, an agent or human author could introduce a raw `<button>` with a custom hover opacity and code review (human OR CodeRabbit) was unlikely to flag it because:
- The change "looked fine" — colors were tokens, focus was present, transition was smooth.
- There was no automated rule failing on raw `<button>` outside `components/ui/`.
- There was no automated rule failing on arbitrary opacity values or off-scale opacities.
- The reviewer had to manually compare the className string against `pattern-registry.md` § 1.2 to spot the `/20` divergence.

DEBT-398 closed the forward-looking enforcement gap. DEBT-399 removes the existing `TODO(DEBT-399)` exemptions left behind so the enforcement layer can become strict without preserving known slop.

---

## Required Remediation

Ship in four single-concern PRs. Order matters: extract the shared utility FIRST so the migrations have something to migrate TO.

### PR 1 — Extract the canonical focus-ring as a shared utility

Branch: `feat/debt-399-pr-1-focus-ring-utility`

Use **Option A: Tailwind layer utility**. The pre-execution audit for this PR verified all of:

- `tailwindcss` and `@tailwindcss/postcss` are pinned to `4.3.0`.
- `app/globals.css` already uses the Tailwind v4 CSS-first entrypoint (`@import "tailwindcss";`) and an existing `@layer utilities` block.
- The local Tailwind 4.3 compiler accepts `@apply focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]` inside a custom `.ring-focus` utility.
- `lib/shared-styles.ts` is also a valid constant-export home, but using a CSS utility is the better fit for a visual design-system primitive and keeps PR 2's migration mechanical (`className="... ring-focus ..."`).

Add to `app/globals.css`:

```css
@layer utilities {
  .ring-focus {
    @apply focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px];
  }

  .ring-focus-within {
    @apply focus-within:outline-none focus-within:ring-ring/50 focus-within:ring-[3px];
  }
}
```

Then PR 2 can migrate existing call sites to `className="... ring-focus ..."` mechanically.

This PR ONLY adds the `.ring-focus` and `.ring-focus-within` utilities. It does NOT migrate existing sites and does NOT edit `components/theme-token-regression-source-scan.ts` or `components/theme-token-regression.test.tsx`; the DEBT-398 PR 3 enforcement gate covers raw-button and opacity drift, not focus-ring extraction. Existing-site migrations happen in PR 2.

### PR 2 — Migrate the 26 exact focus-visible occurrences plus the 1 focus-within occurrence to shared utilities

Branch: `feat/debt-399-pr-2-focus-ring-migration`

Mechanical sweep. The pre-execution audit for this PR re-verified the current ledger after PR 1 landed:

- 26 exact `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]` code occurrences across 19 `.tsx` / `.ts` files.
- 1 `focus-within` ring-pair occurrence in `components/question/choice-button.tsx`; it is not the exact `.ring-focus-within` source string because it currently preserves `focus-within:border-ring`.
- 1 local `focusVisibleRing` constant declaration plus 2 local usages in `components/app-desktop-nav.tsx`.

For the 26 focus-visible sites across 19 files (run the grep from Finding B with `--glob "*.tsx" --glob "*.ts"` for the authoritative list):

- Replace the literal `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]` with `ring-focus`.
- In `components/question/choice-button.tsx`, replace only the literal `focus-within:ring-ring/50 focus-within:ring-[3px]` pair with `ring-focus-within` and keep the existing `focus-within:border-ring` token.
- In `components/app-desktop-nav.tsx`, replace the two `${focusVisibleRing}` template interpolations with the literal `ring-focus` class and delete the local `focusVisibleRing` constant declaration.

Suggested mechanical commands after reviewing the diff target list:

```sh
rg -l 'focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-\[3px\]' app/ components/ --glob '*.tsx' --glob '*.ts' |
  while IFS= read -r file; do
    perl -0pi -e 's|focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-\[3px\]|ring-focus|g' "$file"
  done
perl -0pi -e 's|focus-within:ring-ring/50 focus-within:ring-\[3px\]|ring-focus-within|g' components/question/choice-button.tsx
```

Then manually clean up `components/app-desktop-nav.tsx` so the active and inactive `Link` className strings contain `ring-focus` directly and the now-unused `focusVisibleRing` constant is gone.

Do **not** migrate the broader-but-not-exact focus-ring family in this PR. Those sites are intentionally out of scope because they are shadcn primitives, current-selection rings, or alternate focus treatments rather than the exact canonical copy-paste:

- `components/ui/button.tsx`
- `components/ui/input.tsx`
- `components/ui/select.tsx`
- `app/(app)/app/questions/[slug]/components/review-question-navigator.tsx`
- `app/(app)/app/practice/components/practice-session-starter.tsx`
- `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:94`

After the sweep:

```sh
rg -c "focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-\[3px\]" app/ components/ -g "*.tsx" -g "*.ts"
rg -c "focus-within:ring-ring/50 focus-within:ring-\[3px\]" app/ components/ -g "*.tsx" -g "*.ts"
rg -n "focusVisibleRing" app/ components/
```

Each command should return ZERO. A grep without file-type filters over `app/` and `components/` will still find `app/globals.css`, because PR 1 intentionally made that the canonical `@apply` source.

Full local gate including browser tests. The visual output must be equivalent to pre-PR — this is pure refactor. Confirm with `pnpm build`; if Tailwind emits unexpected CSS differences beyond using the already-defined `.ring-focus` / `.ring-focus-within` utilities, stop and investigate before pushing.

### PR 3 — Refactor the raw `<button>` bypasses and resolve the history disclosure toggle

Branch: `feat/debt-399-pr-3-raw-button-migration`

The pre-execution audit for this PR re-verified the current post-PR2 source state:

- `app/(app)/app/shared/components/session-breakdown-list.tsx:39-49` is still a raw `<button>` with `ring-focus`, `hover:bg-muted/20`, disabled classes, and list-row layout.
- `app/(app)/app/history/components/history-sessions-tab.tsx:226-243` is still a raw disclosure `<button>` with `aria-label`, `aria-expanded`, and `aria-controls`, but it is not app shell and therefore is not covered by Pattern Registry I-6.
- `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:214-224` is still a raw card-like `<button>` with `focus-visible:border-ring ring-focus` and `hover:bg-muted/20`.

For each site:

1. **`session-breakdown-list.tsx:39-49`** — import `Button` from `@/components/ui/button` and replace the raw button branch only. Use:

   ```tsx
   <Button
     type="button"
     variant="secondary"
     className="-mx-2 flex h-auto min-w-0 flex-1 shrink items-center justify-start gap-2 rounded-md bg-transparent px-2 py-0 text-left font-medium text-foreground shadow-none whitespace-normal hover:bg-muted/20 hover:text-foreground"
     disabled={isQuestionActionPending}
     onClick={() => onOpenQuestion(row.questionId)}
   >
   ```

   Preserve the existing child `<span>` structure. Do not migrate the adjacent `Link` branch in this PR; it is not a raw `<button>` and its `hover:bg-muted/20` opacity divergence is PR 4 scope. Drop the explicit `ring-focus`, `disabled:pointer-events-none`, `disabled:opacity-50`, and `transition-colors` from this button branch because `Button` supplies the interactive primitive behavior.

2. **`history-sessions-tab.tsx:226-243` disclosure toggle** — migrate to Button rather than adding a registry exception. Use:

   ```tsx
   <Button
     type="button"
     variant="ghost"
     size="icon"
     className="h-auto w-auto shrink-0 rounded-md p-1 text-foreground/60 hover:bg-transparent hover:text-foreground/60 dark:hover:bg-transparent"
     aria-label={`${isSelected ? 'Hide' : 'View'} breakdown for ${sessionSummary}`}
     aria-expanded={isSelected}
     aria-controls={`breakdown-${row.sessionId}`}
     onClick={() => {
       void historySessions.onOpenSession(row.sessionId);
     }}
   >
   ```

   Keep the `ChevronDown` with `aria-hidden="true"` and `size-4 transition-transform`; the button-level text color now supplies the icon color. This preserves the compact disclosure control while moving focus/keyboard/disabled semantics to the primitive. Delete no Pattern Registry text in this PR.

3. **`exam-review-view.tsx:214-224` raw `<button>`** — migrate the card-like row to Button. Use the existing import and:

   ```tsx
   <Button
     type="button"
     variant="secondary"
     className="block h-auto w-full shrink whitespace-normal rounded-2xl border bg-card p-4 text-left font-normal text-card-foreground shadow-sm hover:bg-muted/20 hover:text-card-foreground"
     onClick={() => onOpenQuestion(row.questionId)}
   >
   ```

   Preserve the existing `<span className="sr-only">Open question </span>` and `rowContent` children. `secondary` is used here for the same reason as Site 1: it avoids importing `ghost`'s dark hover background while still letting the call site pin the card surface, border, shadow, and hover token until PR 4 resolves the opacity divergence.

After migrating all three sites, delete the corresponding raw-button TODO exemptions from `components/theme-token-regression-source-scan.ts`:

```ts
'app/(app)/app/shared/components/session-breakdown-list.tsx'
'app/(app)/app/history/components/history-sessions-tab.tsx'
'app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx'
```

Do not touch the six opacity TODO exemptions in `TEMPORARY_OPACITY_EXEMPTIONS`; those are PR 4 scope.

Run `pnpm test --run components/theme-token-regression.test.tsx` after deleting the raw-button exemptions. Expected result: the test still passes because the only remaining production raw `<button>` outside `components/ui/` is the permanent `components/mobile-nav.tsx` Pattern Registry I-6 app-shell exception.

Visual verification is required because Button base classes can affect sizing, display, whitespace, hover, and focus. Run a local authenticated app session and verify light + dark mode at desktop and mobile widths for:

- History sessions list with a row collapsed and expanded (`history-sessions-tab.tsx` Site 2 plus nested `SessionBreakdownList` Site 1).
- Exam review question list (`exam-review-view.tsx` Site 3).

Capture before/after screenshots or document manual parity notes in the PR body. Full local gate including E2E is required because these are user-interactive surfaces.

### PR 4 — Fix opacity divergences (Findings C / D)

Branch: `feat/debt-399-pr-4-dark-mode-opacity-alignment`

Six temporary opacity exemption entries remain after PR 3 removes the raw-button exemptions:

- `session-breakdown-list.tsx:12` button branch and `:65` adjacent `Link` branch — `hover:bg-muted/20` (expected count 2). ALIGN to `hover:bg-muted/50` per `pattern-registry.md` § 1.2 page-background muted-scale hover guidance.
- `exam-review-view.tsx:41` row button — `hover:bg-muted/20` (expected count 1). ALIGN to `hover:bg-muted/40` per `pattern-registry.md` § 1.2 in-card muted-scale hover guidance.
- `session-breakdown-list.tsx:38` — `divide-border/20` (expected count 1). ALIGN to `divide-border/40`, the `divide-y` utility form of the M-2 Light internal separator (`border-border/40`).
- `session-breakdown-list.tsx:38` — `dark:divide-foreground/20` (expected count 1). ALIGN to `dark:divide-foreground/40`, matching the required dark boundary tier from `pattern-registry.md` § 1.3.
- `history-sessions-tab.tsx:260` — `border-border/30` (expected count 1). ALIGN to `border-border/40`, the M-2 Light internal separator.
- `history-sessions-tab.tsx:260` — `dark:border-foreground/10` (expected count 1). ALIGN to `dark:border-foreground/40`, matching the required dark boundary tier from `pattern-registry.md` § 1.3.

Execution recipe:

1. Apply the six ALIGN replacements above. No Pattern Registry edit is needed because the target values come from existing § 1.2 / § 1.3 / M-2 rules.
2. Update source tests that assert the old tokens:
   - `app/(app)/app/shared/components/session-breakdown-list.test.tsx` currently expects `hover:bg-muted/20`, `divide-border/20`, and `dark:divide-foreground/20`.
   - `app/(app)/app/history/components/history-sessions-tab.test.tsx` currently expects `border-border/30` and `dark:border-foreground/10`.
3. In `components/theme-token-regression-source-scan.ts`, add `divide-border/40` and `dark:divide-foreground/40` to `DOCUMENTED_OPACITY_TOKENS`, then delete all six `TEMPORARY_OPACITY_EXEMPTIONS` entries. `hover:bg-muted/40`, `hover:bg-muted/50`, `border-border/40`, and `dark:border-foreground/40` are already allowlisted.
4. Run `pnpm test --run components/theme-token-regression.test.tsx`; it should remain 16/16 passing with zero `TODO(DEBT-399)` markers.
5. Visually verify light + dark and desktop + mobile for session-breakdown rows, the exam-review question list, and the history-sessions expanded panel border. Expected visual change: slightly stronger hover/divider/border contrast, intentionally matching the registry.

---

## Out of Scope (file separately if pursued)

- **`feedback.tsx` / `marketing-home.tsx` line-count concerns (Finding E)** — out of scope for this debt. File as a separate debt entry if the maintenance burden ever justifies action; for now they are not blocking design-system enforcement.

- **`theme-token-regression.test.tsx` expansion** — covered by DEBT-398 PR 3 and now live. DEBT-399 PR 3 deletes the raw-button exemptions; PR 4 deletes the remaining opacity exemptions.

---

## Acceptance Criteria

PR 1 done when:

- Tailwind utilities `.ring-focus` and `.ring-focus-within` exist in `app/globals.css` and apply the exact canonical focus-ring patterns: `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]` and `focus-within:outline-none focus-within:ring-ring/50 focus-within:ring-[3px]`.
- The existing `.claude/rules/frontend.md` focus-ring mandate still names the canonical pattern; no rule-file update is required until PR 2 starts migrating usage to `.ring-focus`.
- The unit / browser tests pass with the utility in place but not yet adopted.

PR 2 done when:

- A `.tsx` / `.ts` grep of `app/` and `components/` for the literal canonical focus-ring string returns ZERO sites; a grep without file-type filters may still find the single canonical source in `app/globals.css`.
- A `.tsx` / `.ts` grep for `focus-within:ring-ring/50 focus-within:ring-[3px]` returns ZERO sites after `components/question/choice-button.tsx` migrates to `focus-within:border-ring ring-focus-within`.
- `rg -n "focusVisibleRing" app/ components/` returns ZERO after the local `components/app-desktop-nav.tsx` constant is deleted.
- The visual output is equivalent to pre-PR (no design regressions).
- Full local gate green including `pnpm test:browser`.

PR 3 done when:

- All three raw `<button>` bypasses are migrated to `<Button>` and the three matching `RAW_BUTTON_EXEMPTIONS` TODO entries are removed from `components/theme-token-regression-source-scan.ts`.
- `pnpm test --run components/theme-token-regression.test.tsx` passes with only the permanent `components/mobile-nav.tsx` raw-button exception remaining.
- Visual parity verified in light + dark, desktop + mobile for the history sessions row controls and the exam review question list.
- Full local gate green including E2E.

PR 4 done when:

- The six temporary opacity exemptions are deleted from `components/theme-token-regression-source-scan.ts`.
- `rg 'TODO\(DEBT-399\)' components/theme-token-regression-source-scan.ts` returns zero matches.
- Each former opacity divergence is aligned to the target value documented in PR 4 above; no `/20`, `/30`, or `/10` opacity exception is registered.
- `DOCUMENTED_OPACITY_TOKENS` includes the `divide-border/40` and `dark:divide-foreground/40` separator utility forms needed by the aligned list divider.
- `pnpm test --run components/theme-token-regression.test.tsx` passes 16/16.
- Full local gate green, with visual verification captured for the three affected surfaces in light + dark and desktop + mobile.

---

## Risk and Reversibility

- **PR 1 (utility extraction)** — zero risk. Additive.
- **PR 2 (focus-ring migration)** — low risk. Pure refactor; visual output identical. Browser-mode tests catch regressions.
- **PR 3 (button migration)** — medium risk. Visual output may shift slightly because Button has its own variant defaults that differ from the raw inline styling. Mitigation: visual verification (light + dark, desktop + mobile) before merge.
- **PR 4 (dark-mode alignment)** — low risk. Visual change is small and bounded.

All four PRs independently revertable.

---

## Done When

All four PRs merged to `dev` and synced to `main`. The grep for `focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-\[3px\]` returns one canonical source in `app/globals.css`, and a `.tsx` / `.ts` grep of `app/` and `components/` returns zero usage sites. Raw `<button>` count outside `components/ui/` and registry-documented exceptions is zero. Dark-mode opacities align with `pattern-registry.md` § 1.3 or are documented as new registry entries. DEBT-399 doc archived to `docs/_archive/debt/` with resolution paragraph naming all four PRs.

Combined with DEBT-398's enforcement layer, the design system is now both documented AND enforced — future drift gets caught at lint / CI time rather than accumulating until the next manual audit.
