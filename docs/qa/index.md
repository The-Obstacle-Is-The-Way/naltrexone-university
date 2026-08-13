# UI QA Procedure Register

**Project:** Naltrexone University
**Last Updated:** 2026-08-13

**2026-08-13 update:** Register created (ADR-019 / DEBT-465 Part 4). QA-001 and QA-002 filed as the first two procedures, absorbing the Core Flow Verification scripts from `docs/dev/stabilization-checklist.md` and giving the operator checklist's "auth and payment flows smoke-tested" item an executable form. Next QA ID is QA-003.

---

## What are QA Procedures?

Numbered, versioned scripts that test the system **at the UI** — by a human, an agent (Chrome MCP or `agent-browser`), or a Playwright-assisted run. They cover judgment-bearing and not-yet-automated surface verification; deterministic regression belongs in `tests/e2e/`. Method, execution modes, environments, and promotion rules: **`docs/dev/qa-procedures.md`** (the runbook is canonical; this index is state).

## Procedure Index

| ID | Title | Status | Surfaces | Modes | Promotion gate | Promoted to |
|----|-------|--------|----------|-------|----------------|-------------|
| [QA-001](./qa-001-practice-core-flows.md) | Practice core flows: tutor, exam, quick practice | Draft | `/app/practice`, `/app/practice/quick`, `/app/practice/[sessionId]` | Human, PW-assisted (exam entry); agent-partial | yes | — |
| [QA-002](./qa-002-billing-entitlement.md) | Billing & entitlement: pricing states, trial, portal, gate redirects | Draft | `/pricing`, `/checkout/success`, `/app/billing`, `/app/*` gate | Human, agent (except card entry) | yes | — |

**Next QA ID:** QA-003

## Statuses

- **Draft** — written, not yet executed end-to-end twice
- **Active** — validated by runs; part of the per-PR / pre-promotion / smoke rotation
- **Superseded** — promoted to a Playwright spec (see `Promoted to`) or retired

## Proposed procedures (backlog — no ID until filed)

Derived from the 2026-08-13 UI-coverage audit; file by creating the doc and bumping the allocator.

| Candidate | Why | Suggested mode |
|---|---|---|
| Sign-up & first-run | `/sign-up` UI is never exercised (E2E asserts the CTA href only); new-user first session is uncovered | Human (Clerk form) |
| Error/404/loading states | 11 `error.tsx` boundaries (root + per-route) + `not-found.tsx` + skeletons have zero coverage | Agent |
| History filters & pagination | Tab bar, `result`/`difficulty`/`tag`/`source`/`sort` chips, Previous/Next never clicked by automation | PW-assisted (chips are toggles) |
| Mobile/responsive sweep | No mobile-viewport automation exists at all; 390×844 across the app shell + practice | Agent screenshots + human review |
| Accessibility & focus-ring sweep | Canonical focus ring, keyboard nav, contrast per `docs/frontend/contrast-policy.md` | Human/agent hybrid |
| Feedback & report dialog | Thumbs + report dialog covered only by browser-mode component specs | Agent (dialog buttons work) |
| Account deletion cascade | Clerk `<UserButton>` → delete → `user.deleted` webhook consequences; **disposable account required** | Human |
| Rendered legal/marketing pages | `/privacy`, `/terms` typography pipeline + anchors/footer links; DEBT-463 surface | Agent screenshots + human review |
| Exam-timer expiry at the UI | Covered at integration level only; UI auto-finalize behavior unobserved | PW-assisted |

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
