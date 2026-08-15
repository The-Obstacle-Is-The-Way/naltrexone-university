# UI QA Procedure Register

**Project:** Naltrexone University
**Last Updated:** 2026-08-14

**2026-08-13 update:** Register created (ADR-019 / DEBT-465 Part 4). QA-001 and QA-002 filed as the first two procedures. Once Active, QA-001 absorbs Core Flow Verification Flows A–C from `docs/dev/stabilization-checklist.md` (Flow D remains), and QA-002 can give the operator checklist's "auth and payment flows smoke-tested" item an executable form when DEBT-465 Part 4 links it. Next QA ID is QA-003.

---

## What are QA Procedures?

Numbered, versioned scripts that test the system **at the UI** — by a human, an agent (Chrome MCP or `agent-browser`), or a Playwright-assisted run. They cover judgment-bearing and not-yet-automated surface verification; deterministic regression belongs in `tests/e2e/`. Method, execution modes, environments, and promotion rules: **`docs/dev/qa-procedures.md`** (the runbook is canonical; this index is state).

## Procedure Index

| ID | Title | Status | Surfaces | Modes | Promotion gate | Promoted to |
|----|-------|--------|----------|-------|----------------|-------------|
| [QA-001](./qa-001-practice-core-flows.md) | Practice core flows: tutor, exam, quick practice | Draft | `/app/practice`, `/app/practice/quick`, `/app/practice/[sessionId]` | Human; PW-assisted behavior; agent-partial | yes | — |
| [QA-002](./qa-002-billing-entitlement.md) | Billing & entitlement: pricing states, trial, portal, gate redirects | Draft | `/pricing`, `/checkout/success`, `/app/billing`, `/app/*` gate | Human; agent/PW-assisted by section | yes | — |

**Next QA ID:** QA-003

## Statuses

- **Draft** — written, not yet executed end-to-end twice
- **Active** — validated by runs; part of the per-PR / pre-promotion / smoke rotation
- **Superseded** — promoted to a Playwright spec (see `Promoted to`) or retired

## Proposed procedures (backlog — no ID until filed)

Derived from the 2026-08-13 UI-coverage audit; file by creating the doc and bumping the allocator.

| Candidate | Why | Suggested mode |
|---|---|---|
| Sign-up & first-run | E2E proves the pricing CTA handoff to `/sign-up`, but the live Clerk form and a new user's first practice session are uncovered | Human (Clerk form) |
| Error/404/loading states | Error boundaries, `not-found.tsx`, and loading files have unit-render coverage except the quick-practice error and loading files; forced route-level boundary states are uncovered | Agent |
| History filters & pagination | Browser-component coverage clicks the Source filter and session disclosure; route-level tab, `result`/`difficulty`/`tag`/`sort`, and Previous/Next interactions remain uncovered | PW-assisted (chips are toggles) |
| Mobile/responsive sweep | One 375×667 practice E2E and one browser-component case exist; a 390×844 app-shell + practice sweep remains uncovered | Agent screenshots + human review |
| Accessibility & focus-ring sweep | Canonical focus ring, keyboard nav, contrast per `docs/frontend/contrast-policy.md` | Human/agent hybrid |
| Feedback & report dialog | The UI controls have browser-component coverage, but no route-level end-to-end rating/report interaction | Agent (dialog buttons work) |
| Account deletion cascade | Clerk `<UserButton>` → delete → `user.deleted` webhook consequences; **disposable account required** | Human |
| Rendered legal/marketing pages | `/privacy` and `/terms` have rich unit-render tests plus E2E HTTP checks, but no real-browser route-render pass over typography, anchors, and footer links | Agent screenshots + human review |
| Exam-timer expiry at the UI | Browser hook/page-model and integration tests cover expiry and auto-finalize; the route-level UI journey remains unobserved | PW-assisted |

## Template

```markdown
# QA-NNN: Title

**Status:** Draft | Active | Superseded
**Created:** YYYY-MM-DD
**Surfaces:** routes
**Preconditions:** environment, auth, seed state (executable, not aspirational)
**Execution modes:** which modes run it fully; which steps are ⚠ human/PW
**Estimated time:** N min
**Promotion gate:** yes | no
**Promoted to:** tests/e2e/<spec>.spec.ts | —

---

## Steps

| # | Action | Expected |
|---|--------|----------|

## Visual checks

- [ ] check — governing doc (docs/frontend/…)

## Evidence

Which steps get screenshots; store representative WebP/PNG in docs/qa/assets/qa-NNN/.

## On failure

File BUG-NNN (behavior) or flag against the design docs (visual drift); link the finding here.
```
