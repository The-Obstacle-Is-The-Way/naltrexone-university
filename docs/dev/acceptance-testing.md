# Acceptance Testing (Gherkin)

**Last Updated:** 2026-08-13

Executable specifications of user-visible business rules, written in Gherkin (`Given / When / Then`), bound to the **application layer** through the existing fakes — never through the UI. Proposed by `docs/adr/adr-019-test-quality-practices.md`; tracked as DEBT-465 Part 3.

**Why this layer exists.** Unit tests protect logic. UI QA protects the rendered surface. Acceptance tests protect the *seam between them*: they state each business rule in business language and prove it holds at the use-case boundary, which (a) keeps business rules out of components — an agent cannot quietly reimplement a rule in a React hook when the rule's specification runs against the use case and fails, and (b) gives every rule a UI-independent, human-readable contract that survives refactors of either side. This is the outer loop of TDD: the acceptance scenario goes red first, unit-level TDD makes it green from the inside out.

---

## 1. Gherkin in sixty seconds

```gherkin
Feature: Starting a practice session
  As a subscribed user I start filtered practice sessions in tutor or exam mode.

  Scenario: An unfinished session blocks a new one
    Given a user with an unfinished tutor session
    When the user starts a new practice session
    Then the request is rejected because an incomplete session exists
    And the user is offered the existing session to resume or abandon
```

- **Feature** — one capability; a short narrative line under the title is convention.
- **Scenario** — one rule instance, named as a specification sentence.
- **Given** (arrange) / **When** (act) / **Then** (assert), with **And/But** continuing the previous keyword.
- **Background** — Givens shared by every scenario in the feature (use sparingly; hidden setup breeds misreads).
- **Scenario Outline + Examples** — one parameterized scenario over a table of cases (boundary tables: entitled statuses, count clamps).
- **Tags** (`@billing`, `@exam`) — filtering and grouping.

**House style — declarative, UI-free, domain-voiced:**

1. No UI vocabulary in feature files. Never "clicks the Submit button" — write "submits an answer". The same feature must remain true if the UI is rebuilt (that is the point).
2. Use this codebase's ubiquitous language, exactly as the domain layer spells it: *practice session, tutor mode, exam mode, draft answer, finalize, omitted question, attempt, entitled, trial, past due, cancel at period end, bookmark, mark for review*. If a feature file needs a word the domain doesn't have, that is a naming finding, not a synonym opportunity.
3. One behavior per scenario; no incidental data (only the details that drive the outcome).
4. Scenarios assert **outcomes** ("the answer is graded", "access is denied with reason `subscription_required`"), never mechanism ("the repository upserts…").

## 2. Tooling: `@amiceli/vitest-cucumber`

**Chosen:** [`@amiceli/vitest-cucumber`](https://github.com/amiceli/vitest-cucumber) v7 — Gherkin for Vitest with real `.feature` files.

- Peer-depends on `vitest ^4.0.4`; we run Vitest 4.1.x. **No second test runner enters the repo** — acceptance tests are ordinary Vitest files.
- **Spec synchronization:** it errors when the `.feature` file and the step bindings drift (missing/renamed steps fail loudly). For agent-driven development this is the enforcement teeth: the spec cannot silently rot.
- **Codegen:** `npx @amiceli/vitest-cucumber --feature <path> --spec <path>` scaffolds the binding skeleton from a feature file.

Rejected alternatives, for the record: `@cucumber/cucumber` (canonical, but a second runner with its own TS/ESM loader story — cost without benefit given the above); `playwright-bdd` (binds features to browser E2E — exactly the coupling this layer exists to avoid; revisit only if we later want the *same* feature files executed through a UI driver as well).

```bash
pnpm add -D @amiceli/vitest-cucumber
```

## 3. Architecture: four layers, one driver

```
.feature file          the specification (business-readable, versioned)
  └─ step bindings     *.acceptance.test.ts — thin glue, no logic
       └─ driver       tests/acceptance/support/application-driver.ts — the DSL
            └─ SUT     real use cases + real domain, wired with fakes
```

The **driver** is the only layer that knows how the system is wired. It composes real use cases with the standard fakes (`src/application/test-helpers/fakes/` — 17 repository fakes, gateway fakes, `FakeLogger`, `FakeRateLimiter`) and exposes intention-level verbs: `givenSubscribedUser()`, `startSession({ mode, count })`, `submitAnswer(choice)`, `finalizeExam()`, `expectRejectedWithConflict(reason)`.

Rules that keep the layers honest:

- Step bindings call **only** the driver. They never import fakes, use cases, or factories directly.
- The driver constructs use cases **the same way their colocated unit tests do** — when writing a new driver method, open the use case's own `*.test.ts` and mirror its wiring; that file is the wiring reference and already demonstrates the correct fakes.
- The driver holds scenario state (current user, session, last result) so steps stay declarative.
- No DB, no network, no browser: the whole suite runs at unit speed and stays deterministic (inject fixed clocks where use cases take one).

Because the SUT boundary is the application layer, these tests also double as pressure on the ports: anything a scenario cannot express through a use case is by definition UI-only behavior — which belongs in component tests or QA procedures, not here.

## 4. File organization and runner wiring

```
tests/acceptance/
├── support/
│   └── application-driver.ts
└── features/
    ├── practice-sessions/
    │   ├── starting-a-session.feature
    │   └── starting-a-session.acceptance.test.ts
    ├── scoring/
    ├── entitlement/
    ├── billing-lifecycle/
    ├── account-lifecycle/
    ├── feedback/
    └── bookmarks/
```

- Binding files are named **`*.acceptance.test.ts`**, colocated beside their `.feature` file. This matches the existing unit config include (`**/*.test.ts`) — **zero config changes**: acceptance tests run inside `pnpm test`, the full gate, CI, coverage, and (deliberately) inside the mutation-testing lane, where they add kills for business-rule mutants (`docs/dev/mutation-testing.md`).
- Run just this suite with `pnpm test tests/acceptance`. If the suite ever needs its own lane (reporting, timing), split a dedicated config then — not before.
- When the first feature lands, add the `tests/acceptance/` row to the Test Locations table in `AGENTS.md` (and the `.claude/rules/testing.md` table) in the same PR.

## 5. Worked example

`tests/acceptance/features/practice-sessions/starting-a-session.feature`:

```gherkin
Feature: Starting a practice session
  Subscribed users start filtered practice sessions; unfinished work is protected.

  Scenario: An unfinished session blocks a new one
    Given a subscribed user with an unfinished tutor session
    When the user starts a new 10-question tutor session
    Then the request is rejected because an incomplete session exists

  Scenario: The pool is smaller than the requested count
    Given a subscribed user and 3 published questions matching their filters
    When the user starts a new 10-question tutor session
    Then a session begins with 3 questions
    And the user is told the actual count
```

`starting-a-session.acceptance.test.ts` (binding — thin glue only):

```ts
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { ApplicationDriver } from '../../support/application-driver';

const feature = await loadFeature(
  'tests/acceptance/features/practice-sessions/starting-a-session.feature',
);

describeFeature(feature, ({ Scenario }) => {
  Scenario('An unfinished session blocks a new one', ({ Given, When, Then }) => {
    const app = new ApplicationDriver();
    Given('a subscribed user with an unfinished tutor session', async () => {
      await app.givenSubscribedUser();
      await app.givenUnfinishedSession({ mode: 'tutor' });
    });
    When('the user starts a new 10-question tutor session', async () => {
      await app.startSession({ mode: 'tutor', count: 10 });
    });
    Then('the request is rejected because an incomplete session exists', () => {
      app.expectConflict('IncompleteSessionExists');
    });
  });
  // second Scenario binds the same way via app.expectSessionStarted({ actualCount: 3 })
});
```

The driver's `startSession` wires `StartPracticeSessionUseCase` with `FakePracticeSessionRepository`, `FakeQuestionRepository`, and domain factories (`createQuestion`, `createPracticeSession`) exactly as `start-practice-session.test.ts` already does, and stores the thrown/returned result for the `expect*` verbs. (Path note: the vitest-cucumber docs do not pin down how `loadFeature` resolves relative paths; verify on install and standardize — repo-root-relative, or resolved against `import.meta.url` — in the driver PR.)

## 6. Feature backlog — the rules worth specifying first

Each rule below was read from the implementation (receipts cited); every one is UI-independent and expressible through the driver. Work the numbered order: it front-loads revenue- and integrity-bearing rules.

| # | Rule (as the scenario will state it) | Implementation receipts | Folder |
|---|---|---|---|
| 1 | An unfinished session blocks starting a new one until resumed or abandoned | `src/application/use-cases/start-practice-session.ts` (`IncompleteSessionExists`) | practice-sessions |
| 2 | Without an entitled subscription, practice/bookmarks/stats are denied with a reason | `src/adapters/controllers/require-entitled-user-id.ts` (the per-controller gate), `src/application/use-cases/check-entitlement.ts`, `src/domain/services/entitlement.ts` | entitlement |
| 3 | Access ends the instant `currentPeriodEnd` passes, whatever the status string says | `entitlement.ts` (`currentPeriodEnd <= now`) | entitlement |
| 4 | Tutor mode explains immediately; exam mode reveals nothing until the exam ends | `src/domain/value-objects/practice-mode.ts` (`shouldShowExplanationForMode`), `submit-answer.ts`, `get-next-question.ts` | practice-sessions |
| 5 | Active exams take draft answers only; per-question submit is refused | `submit-answer.ts` ("not available in exam mode"), `save-exam-draft-answer.ts` | practice-sessions |
| 6 | Finalizing an exam records unanswered questions as omitted-incorrect; accuracy divides by total question count | `finalize-exam-answers.ts`, `practice-session-summary.ts` | scoring |
| 7 | A last-second draft still grades within the grace window; later ones are dropped | `finalize-exam-answers.ts` (`FINALIZE_FLUSH_DEADLINE_GRACE_MS`) | scoring |
| 8 | Exams can be discarded; tutor sessions can only be ended (attempts never deleted); discarding a missing session is a silent success | `discard-practice-session.ts` (BUG-251), `end-practice-session.ts` | practice-sessions |
| 9 | Mark-for-review exists only inside an active exam | `set-practice-session-question-mark.ts` | practice-sessions |
| 10 | First-ever checkout carries a 7-day trial; any prior subscription forfeits it; blocking statuses refuse a second checkout | `create-checkout-session.ts` (`FREE_TRIAL_DAYS`, `ALREADY_SUBSCRIBED`) | billing-lifecycle |
| 11 | Scheduled cancellation keeps access until period end and stops renewal notices | webhook controller + `send-due-renewal-notices.ts` (`cancelAtPeriodEnd`) | billing-lifecycle |
| 12 | A duplicate or out-of-order billing event never double-applies or regresses subscription state | `stripe-webhook-controller.ts` claim/lock, `persist-subscription-observation.ts`, `subscription-write-guard.ts` | billing-lifecycle |
| 13 | Deleting the account removes local data, deletes the Stripe customer, and later billing events are acknowledged, not resurrected | `clerk-webhook-controller.ts` tombstone + cascade | account-lifecycle |
| 14 | Feedback attaches only to your own attempt/session, and only when it actually contains the question | `validate-feedback-context.ts` (BUG-260) | feedback |
| 15 | Only published questions can be newly bookmarked; unbookmark is idempotent; existing bookmarks survive unpublishing (listed as unavailable) | `set-bookmark.ts`, `get-bookmarks.ts` | bookmarks |
| 16 | A user always sees the same choice order for a question; another user sees a different one | `shuffled-choice-views.ts`, `shuffle.ts` | practice-sessions |
| 17 | Double-clicking "start session" yields exactly one session | `with-idempotency.ts`, `practice-controller.ts` | practice-sessions |

Known edge worth a scenario while writing #1: the client clamps session count to 1–100 (`SESSION_COUNT_MAX`) while the server accepts 1–200 (`MAX_PRACTICE_SESSION_QUESTIONS`) — specify the intended contract and pin it.

## 7. Boundaries with the other suites

- **Not integration tests.** Fakes here; real Postgres there (`tests/integration/`). A rule involving real SQL semantics (locks, constraint races) stays integration-owned; the acceptance scenario states the user-visible outcome and the integration test proves the storage mechanics.
- **Not a unit-test replacement.** Unit tests keep exhaustive edge/error coverage next to the code; acceptance covers the rule as a user-visible contract. One rule ≈ 2–5 scenarios, not 30.
- **Not E2E.** No browser, no Clerk, no Stripe. The webhook-lifecycle features (#12, #13) drive the controllers directly with the fixture events in `tests/fixtures/stripe/` and `tests/fixtures/clerk/`.
- ADR-003's pyramid stays intact; ADR-019 names this band explicitly. Coverage remains observational policy-wide.

## 8. Adoption sequence (DEBT-465 Part 3)

1. `pnpm add -D @amiceli/vitest-cucumber`; commit the lockfile bump alone.
2. Build `tests/acceptance/support/application-driver.ts` with the verbs needed by feature #1 only (drivers grow verb-by-verb, never speculatively).
3. Land features #1 and #4 (session start conflict + tutor/exam feedback split) using codegen for the skeletons; confirm spec-sync errors fire by renaming a step locally.
4. Land #2/#3 (entitlement) and #10 (trial) — the revenue rules.
5. Update the Test Locations tables (`AGENTS.md`, `.claude/rules/testing.md`) in the PR that lands #1.
6. From then on: **every new business rule ships its feature file first** — the acceptance scenario is the outer red before unit-level TDD begins.
