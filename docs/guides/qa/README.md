# UI QA Procedures

Scripts that test the app **at the UI**, run by a person, by an agent (Chrome MCP or `agent-browser`), or with Playwright's help. They cover what needs judgement or is not yet automated; deterministic regressions belong in `tests/e2e/`. The method, execution modes, environments and promotion rules are in [`docs/dev/qa-procedures.md`](../../dev/qa-procedures.md).

## Procedures

| Procedure | Covers | Status | Surfaces | Modes |
|-----------|--------|--------|----------|-------|
| [Practice core flows](./practice-core-flows.md) | Tutor, exam and quick practice | Draft | `/app/practice`, `/app/practice/quick`, `/app/practice/[sessionId]` | Person; Playwright-assisted behaviour; agent in part |
| [Billing and entitlement](./billing-and-entitlement.md) | Pricing states, trial, portal, gate redirects | Draft | `/pricing`, `/checkout/success`, `/app/billing`, the `/app/*` gate | Person; agent or Playwright-assisted by section |

- **Draft:** written, not yet run end to end twice.
- **Active:** validated by runs, and part of a run rotation.
- **Superseded:** replaced by a Playwright spec, or retired. Delete the procedure and say so in the PR.

Each procedure's two evidenced runs are on the [records index](../../records/README.md#waiting) (DEBT-465): the practice procedure before the production content bootstrap, and the billing procedure with the first live purchase.

## Not Yet Covered

From the 2026-08-13 UI-coverage audit. Write a procedure when one is needed.

| Surface | Why | Suggested mode |
|---|---|---|
| Sign-up and first run | E2E proves the pricing CTA hands off to `/sign-up`, but the live Clerk form and a new user's first practice session are uncovered | Person (Clerk form) |
| Error, 404 and loading states | Error boundaries, `not-found.tsx` and loading files have unit-render coverage except the quick-practice loading file; forced route-level boundary states are uncovered | Agent |
| History filters and pagination | Browser-component coverage clicks the Source filter and session disclosure; route-level tabs, `result`/`difficulty`/`tag`/`sort`, and Previous/Next remain uncovered | Playwright-assisted (chips are toggles) |
| Mobile sweep | One 375×667 practice E2E and one browser-component case exist; a 390×844 app-shell and practice sweep remains uncovered | Agent screenshots and a person's review |
| Accessibility and focus rings | The canonical focus ring, keyboard navigation, and contrast per [the contrast policy](../../frontend/contrast-policy.md) | Person and agent |
| Feedback and report dialog | The controls have browser-component coverage, but no route-level rating or report interaction | Agent (dialog buttons work) |
| Account deletion | Clerk `<UserButton>` → delete → the `user.deleted` webhook's consequences; **a disposable account is required** | Person |
| Rendered legal and marketing pages | `/privacy` and `/terms` have unit-render tests and E2E HTTP checks, but no real-browser pass over typography, anchors and footer links | Agent screenshots and a person's review |
| Exam-timer expiry at the UI | Hook, page-model and integration tests cover expiry and auto-finalize; the route-level journey is unobserved | Playwright-assisted |

## Template

```markdown
# Procedure Title

**Status:** Draft | Active
**Surfaces:** routes
**Preconditions:** environment, auth, seed state (executable, not aspirational)
**Execution modes:** which modes run it fully; which steps need a person or Playwright
**Estimated time:** N min

---

## Steps

| # | Action | Expected |
|---|--------|----------|

## Visual checks

- [ ] check — governing doc (docs/frontend/…)

## Evidence

Which steps get screenshots. Attach them to the pull request or the run's report, not the repository.

## On failure

File a bug record (behaviour) or flag the design docs (visual drift).
```
