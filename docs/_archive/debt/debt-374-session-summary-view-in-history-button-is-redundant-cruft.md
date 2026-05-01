# DEBT-374: Session Summary "View in History" Button Is Redundant With Top-Nav History And Should Be Removed

**Priority:** P3
**Created:** 2026-05-01
**Status:** Resolved 2026-05-01 ([PR #302](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/302)).
**Source:** Manual UX walkthrough of post-exam Session Summary surface, 2026-05-01 (paired observation alongside [DEBT-372](./debt-372-post-exam-review-summary-button-label-divergence.md) and [DEBT-373](./debt-373-post-exam-review-score-banner-uses-app-h1-pattern-instead-of-stat-number-pattern.md), filed during the same review pass)
**Related:** [DEBT-359 Session Summary CTA labels (archived)](./debt-359-session-summary-cta-labels.md), [DEBT-372 Post-exam review summary button label divergence (archived)](./debt-372-post-exam-review-summary-button-label-divergence.md), [Frontend Standards](../../frontend/standards.md), [Pattern Registry](../../frontend/pattern-registry.md)

**Audit verified:** 2026-05-01 against `fa8c130e`.

---

## Resolution

Shipped Option A in PR #302 (merge commit `0a465b44`, 2026-05-01). The Session Summary action bar now renders only the two primary post-session actions: `Review Answers` and `New Session`. The redundant ghost-variant `View in History` Button block was deleted from `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`; `Review Answers`, `New Session`, the action-bar wrapper (`flex flex-col gap-3 sm:flex-row`), `ROUTES.APP_HISTORY`, the History page, and the persistent top-nav `History` link were unchanged.

Test cleanup removed stale `View in History` assertions from the four affected files: `session-summary-view.test.tsx`, `session-summary-view.browser.spec.tsx`, `page.test.tsx`, and `tests/e2e/practice.spec.ts`. The paired filter/list expectations stayed internally consistent, the deleted ghost-link class-token assertion was removed, and one browser test title was updated because the tutor summary now has only the surviving `New Session` action. No snapshot rewrites, new mocks, new tests, or shared action-bar abstractions were introduced.

Verification and review state:

- `rg -n "View in History" app/ components/ src/ lib/ tests/` returned zero hits after the change.
- `components/app-nav-items.ts:12` remained unchanged and still exposes `{ href: ROUTES.APP_HISTORY, label: 'History' }`.
- Production-server visual check on a 3-question exam flow confirmed the Session Summary action bar has exactly two children (`Review Answers`, `New Session`) in the unchanged wrapper and that top-nav `History` still links to `/app/history`.
- Local full gate green: DB up/migrate/seed, `pnpm typecheck`, `pnpm lint` (19 expected warn-only `nursery/noExcessiveLinesPerFile` warnings on legacy oversized tests), `pnpm test --run` 302/302 files / 2,397 tests, `pnpm test:browser` 47/47 files / 241 tests, `pnpm test:integration` 16/16 files / 97 tests, `pnpm build`, and `pnpm test:e2e` 34/34.
- CI green on PR #302: test, Vercel, CodeRabbit, and Codecov patch all passed; merge state was `CLEAN`.
- CodeRabbit latest-head review on `246c0725` approved. Its only suggestion was an optional negative `View in History` assertion; this was rejected because DEBT-374's SSOT required zero `View in History` hits in production/test scope, and reintroducing the literal in a test would violate that contract.

---

## Context

The Session Summary surface (`app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx`) renders the post-session terminal recap — the screen a student lands on after finishing a practice session. The bottom action bar exposes three CTAs in decreasing visual emphasis:

1. **Review Answers** — filled primary `Button` (lines 130-149).
2. **New Session** — outline or default-variant `Button` (lines 151-157).
3. **View in History** — ghost-variant `Button` at lines 158-160:

   ```tsx
   <Button asChild variant="ghost" className="rounded-full">
     <Link href={ROUTES.APP_HISTORY}>View in History</Link>
   </Button>
   ```

`ghost` is the `Button` component's most-recessed variant (text-only, no border, no fill). The visual hierarchy already encodes "this is the lowest-priority action on the surface."

The persistent app nav already exposes `History` as a first-class navigation item one click away from every authenticated screen via `components/app-nav-items.ts:12`, consumed by the desktop and mobile nav surfaces. Removing the bottom-of-Session-Summary `View in History` button does not hide the History page; it removes a redundant access path.

## Why This Is Debt

- **Redundant access path on a terminal recap screen.** History is in the persistent top nav; it is not a destination the user can lose. The third CTA is a second route to the same place. Redundancy on a terminal screen is cognitive overhead, not affordance.
- **Hick's Law / decision cost.** Three CTAs > two CTAs in cognitive cost with diminishing return. The two CTAs that survive after removal — `Review Answers` and `New Session` — have crisp, orthogonal intent: "look back at what just happened" vs. "start fresh." The third option splits attention without clarifying intent.
- **Visual weight already deprioritizes it.** The ghost-variant styling is the most recessed Button variant in the design system. The designer's own emphasis grading already says "this is the least important action on this surface." When the lowest-priority action on a terminal screen is also a redundant path, the action is signal of cruft accumulation, not a feature.
- **Information value at this moment is low.** The Session Summary surface itself shows the recap a user wants right after a session: stat cards (Answered / Correct / Accuracy / Duration) plus the per-question breakdown panel. Routing the user from this rich recap to History — which is currently a list view with limited longitudinal affordances — adds little marginal information. The user is already where the data is.
- **Trust erosion when the destination underdelivers.** A CTA placed on a high-attention moment that routes to a low-value destination sets up an expectation the destination cannot fulfill. That is worse for product trust than no CTA. (User feedback during the 2026-05-01 walkthrough framed History as "generally worthless" today — that framing was the surface signal that triggered this ticket. A separate audit of the History page's value proposition is its own concern, out of scope here.)
- **No prior ticket covers this specific affordance.** DEBT-359 (resolved 2026-04-11) renamed Session Summary CTAs ("Back to Practice" → "New Session", "Review your answers" → "Review Answers") on this same surface but did not adjudicate the third (`View in History`) button. DEBT-372 unified the post-exam *review* surface's summary-navigation labels but did not touch the Session Summary action bar.

## Options

### Option A (recommended): Remove the button outright

Delete the `<Button asChild variant="ghost" className="rounded-full">...</Button>` block at `session-summary-view.tsx:158-160`. The bottom action bar collapses from three CTAs to two (Review Answers, New Session). History remains accessible via the top-nav `History` link.

- **Pro:** Smallest defensible change. Reduces cognitive cost on a terminal recap screen. Aligns visual emphasis with semantic priority — the ghost-variant button was already signaling "lowest priority"; removing it admits the priority is "not on this surface."
- **Pro:** Top-nav `History` link is preserved unchanged; users who want History from the Session Summary still have a one-click path via the persistent nav.
- **Con:** If the History page subsequently earns its keep (longitudinal trends, comparison views, streak tracking, filterable past sessions, exportable reports) the bottom-CTA path becomes useful again, and re-adding it later requires re-litigating UI placement. Not a blocker — re-adding a button is cheaper than carrying cruft today.

### Option B: Keep the button, redesign the History page

Leave the button in place; treat the underlying complaint ("History is generally worthless") as the real problem and audit the History page's value proposition.

- **Pro:** Solves the deeper UX problem — a low-value destination — rather than just hiding the path to it.
- **Con:** Massive scope creep relative to a single-button removal. History page audit is its own multi-week concern (data model, trend computation, comparison surfaces, export). Conflating it with Session Summary cruft removal blocks both. **This option should be filed as a future ticket independently if pursued, but it is NOT the right resolution for DEBT-374.**

### Option C: Replace the button with a smarter affordance

Swap `View in History` for something contextual to this specific session — e.g., "Compare to previous session," "Add to streak," "Export this session." The button slot stays; the label and destination get more useful.

- **Pro:** Preserves the slot for a higher-value action.
- **Con:** Requires net-new product work (define the comparison view, build the export flow, design the streak surface) before any UI change can land. Cannot ship without those foundations.
- **Con:** Same scope-creep concern as Option B.

## Recommendation

Ship **Option A**. The two buttons that survive (`Review Answers`, `New Session`) cover the user's actual post-session intents on this terminal recap screen. History remains accessible via the top nav for the rare user who wants it. If/when the History page earns a contextual back-link from Session Summary (Option C territory), file a follow-up ticket then.

## Constraints

- **Single button removal.** Delete only the `<Button asChild variant="ghost" className="rounded-full"><Link href={ROUTES.APP_HISTORY}>View in History</Link></Button>` block at `session-summary-view.tsx:158-160`. Do NOT touch `Review Answers` or `New Session`.
- **Do NOT modify the top nav** (the persistent `History` link in the app shell stays exactly as-is; it is the surviving path).
- **Do NOT modify the History page itself.** Any History-page-value-proposition rework is out of scope (see Options B / C).
- **Do NOT modify `ROUTES.APP_HISTORY`.** The route constant continues to exist; only the Session Summary call site is removed.
- **Do NOT bundle the DEBT-374 implementation with DEBT-373.** DEBT-373 is the post-exam review entry banner typography pass on `post-exam-review-view.tsx`. DEBT-374 is the Session Summary action bar on `session-summary-view.tsx`. Different files, different concerns. The DEBT-374 code change should ship in its own focused PR with its own CR thread.
- **Do NOT remove the `Button asChild variant="ghost"` styling pattern from anywhere else in the codebase.** Other call sites of the ghost variant are governed by their own design context and remain valid.
- **Test cleanup is in scope.** Existing assertions on `View in History` in:
  - `app/(app)/app/practice/[sessionId]/components/session-summary-view.test.tsx` (5 occurrences across 2 tests)
  - `app/(app)/app/practice/[sessionId]/components/session-summary-view.browser.spec.tsx` (2 occurrences)
  - `app/(app)/app/practice/[sessionId]/page.test.tsx` (3 occurrences)
  - `tests/e2e/practice.spec.ts` (1 occurrence at line 142)

  …must be deleted (not weakened, not commented out). If a test's only purpose was asserting the `View in History` link rendered, delete the test entirely; if a test asserted on a list of action-bar labels including `View in History`, edit the list to drop it.

## Why P3

The surface ships, the button works, the route is correct. The cost is one moment of "do I need to click this, or is it the same as the nav link?" cognitive friction per Session Summary view, plus the trust-erosion risk of a CTA pointing at a currently low-value destination. Same severity class as DEBT-359 / DEBT-361 / DEBT-362 / DEBT-372 — all P3 surface-polish tickets. Not blocking; pay it down opportunistically as part of the post-exam UX cleanup pass that is already producing DEBT-372 / DEBT-373.

## Verification

- After the change: `rg -nE "View in History" app/ components/ src/ tests/` returns zero hits.
- `pnpm test --run` and `pnpm test:browser` pass with hand-edited assertion lists (no snapshot rewrites).
- `pnpm test:e2e` passes with the `tests/e2e/practice.spec.ts:142` assertion deleted (or its surrounding test rewritten if `View in History` was the only thing it asserted).
- Manual visual check on a 3-question session: Session Summary action bar shows exactly two buttons (`Review Answers`, `New Session`); top-nav `History` link still works; `/app/history` route is reachable directly.
- No regression in mobile responsive layout — the action-bar wrapper at `session-summary-view.tsx:128` should still render two buttons cleanly without spacing artifacts from the deleted slot.
- `ROUTES.APP_HISTORY` is still imported and referenced by the top nav; do NOT remove the constant.

## Future Concern (Out Of Scope)

The user feedback that triggered this ticket — "history is generally worthless" — is a signal the History page may need its own value-proposition audit (longitudinal stats, comparison views, filterable session list, streak tracking, export). That is a feature-level UX/PM ticket, not debt. If pursued, file as a separate non-DEBT ticket (BUG-/audit/spec-class). Removing the Session Summary `View in History` button now does not preclude a future contextual back-link from Session Summary if the History page later earns one — but that would be Option C territory and a separate follow-up.
