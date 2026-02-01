# SPEC-012: Core Question Loop

**Status:** Ready
**Slice:** SLICE-2 (Core Question Loop)
**Depends On:** SLICE-1 (Paywall)
**Implements:** ADR-001, ADR-003, ADR-011

---

## Objective

Deliver the core learning loop for subscribed users:

- Fetch next question (ad-hoc or session-backed)
- Render stem + choices (safe markdown)
- Submit answer → record attempt → return grading + explanation (when allowed)

**SSOT:** `docs/specs/master_spec.md` (SLICE-2 + Sections 4.5.3–4.5.4).

---

## Source of Truth

- `docs/specs/master_spec.md`:
  - Sections 4.5.3–4.5.4 (exact server action behavior)
  - SLICE-2 (acceptance criteria + implementation checklist)
- Contracts and boundaries:
  - `docs/specs/spec-003-domain-services.md` (`gradeAnswer`, session explanation rules)
  - `docs/specs/spec-005-core-use-cases.md` (use-case responsibilities)
  - `docs/specs/spec-010-server-actions.md` (`ActionResult<T>`)

---

## Acceptance Criteria

- Given I am subscribed, when I open `/app/practice` and start, then I see a question stem and choices rendered as sanitized markdown.
- When I select an answer and submit, then I see correct/incorrect feedback and explanation (tutor mode).
- When I submit, then an `attempts` row is created.

---

## Test Cases

- `src/domain/services/grading.test.ts`: gradeAnswer() pure function tests (colocated).
- `src/application/use-cases/submit-answer.test.ts`: use case tests with fakes (colocated).
- `tests/integration/controllers.integration.test.ts`: submitAnswer inserts attempts and grades correctly.
- `tests/e2e/practice.spec.ts`: UI flow for answering one question.

---

## Implementation Checklist (Ordered)

1. Create `components/markdown/Markdown.tsx` with `react-markdown` + `remark-gfm` + `rehype-sanitize`.
2. Add seed script + content:
   - `scripts/seed.ts`
   - at least 10 placeholder MDX questions under `content/questions/**`
3. Build domain services:
   - `src/domain/services/grading.ts` — `gradeAnswer(question, choiceId)`
4. Build use cases:
   - `src/application/use-cases/submit-answer.ts`
   - `src/application/use-cases/get-next-question.ts`
5. Build repositories:
   - `src/adapters/repositories/drizzle-question-repository.ts`
   - `src/adapters/repositories/drizzle-attempt-repository.ts`
6. Build controllers:
   - `src/adapters/controllers/question-controller.ts`
7. Build `/app/practice` UI for single-question flow (no sessions yet):
   - fetch next question via controller
   - select choice
   - submit and show explanation (tutor mode)
8. Add bookmark toggle button on question view (calls toggleBookmark controller).

---

## Files to Create/Modify

- `scripts/seed.ts`
- `content/questions/**` (at least 10 placeholder `.mdx` files)
- `components/markdown/Markdown.tsx`
- `components/question/*`
- `src/domain/entities/question.ts`, `src/domain/entities/choice.ts`, `src/domain/entities/attempt.ts`
- `src/domain/services/grading.ts`
- `src/application/ports/repositories.ts` (QuestionRepository, AttemptRepository)
- `src/application/use-cases/submit-answer.ts`, `get-next-question.ts`, `toggle-bookmark.ts`
- `src/adapters/repositories/drizzle-question-repository.ts`, `drizzle-attempt-repository.ts`
- `src/adapters/controllers/question-controller.ts`, `bookmark-controller.ts`
- `lib/container.ts` (add new factories)
- `app/(app)/app/practice/page.tsx`

---

## Non-Negotiable Requirements

- **Every submit creates an attempt:** submitting an answer MUST insert an `attempts` row.
- **No correctness leakage:** never send `Choice.isCorrect` to the client before answering.
- **Markdown is sanitized:** render markdown with a locked-down sanitize schema (no raw HTML injection).
- **Explanation visibility:** in exam sessions, return `explanationMd = null` until the session ends.

---

## Demo (Manual)

Once implemented:

1. Ensure you have an entitled user (complete SLICE-1 in Stripe test mode).
2. `pnpm db:seed` and `pnpm dev`.
3. Visit `/app/practice` → answer one question.
4. Verify:
   - feedback shows correct/incorrect
   - explanation is visible in tutor mode
   - an `attempts` row exists for the submission

---

## Definition of Done

- Behavior matches SLICE-2 in `docs/specs/master_spec.md`.
- Seeded content can be inserted idempotently (`scripts/seed.ts`) and drives the UI.
- Integration tests prove attempts insert correctly; E2E smoke covers the happy path.
