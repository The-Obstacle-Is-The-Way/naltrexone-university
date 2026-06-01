# DEBT-397: Datetime Boundary Type Normalization

**Priority:** P2 (controller-boundary contract drift — `src/adapters/controllers/practice-schemas.ts` uses ISO strings for some action-output datetimes (`endedAt`, `startedAt`) and Date objects for others (`latestAnsweredAt`, `draftSavedAt`). This has not produced a visible incident yet, but downstream code now has to remember per-action datetime shapes instead of relying on one controller-boundary rule.)
**Created:** 2026-05-26
**Source:** Deep schema/boundary audit conducted alongside DEBT-394 archival. The audit traced every Zod datetime validator in `src/adapters/controllers/` and discovered that controller output schemas mix two datetime representations across adjacent action outputs, with no documented rationale and no test enforcing the chosen contract.
**Related:** [src/adapters/controllers/practice-schemas.ts](../../src/adapters/controllers/practice-schemas.ts), [src/adapters/repositories/practice-session-params.ts](../../src/adapters/repositories/practice-session-params.ts), [DEBT-394 (archived)](../_archive/debt/debt-394-supply-chain-hardening.md)

**Status:** Active

---

## Problem

A controller-boundary output surface should have a single, consistent representation for any given primitive type unless the exception is explicit and documented. Datetimes are the easiest place to violate this rule because Zod accepts both `z.date()` (instance of Date) and `z.string().datetime()` (ISO 8601 string) as valid validators, and conversions in either direction are silent until a consumer assumes the wrong shape.

The practice controller output surface currently violates this rule across action outputs in `src/adapters/controllers/practice-schemas.ts`.

---

## Findings

### A. Practice controller output schemas use two datetime representations

Verified at `src/adapters/controllers/practice-schemas.ts`:

| Line | Schema | Field | Type | Representation |
|---|---|---|---|---|
| 121 | `EndPracticeSessionOutputSchema` / aliases | `endedAt` | `z.string().datetime()` | ISO string |
| 162 | `SaveExamDraftAnswerOutputSchema` | `latestAnsweredAt` | `z.date().nullable()` | Date object |
| 164 | `SaveExamDraftAnswerOutputSchema` | `draftSavedAt` | `z.date().nullable()` | Date object |
| 182 | `GetIncompletePracticeSessionOutputSchema` | `startedAt` | `z.string().datetime()` | ISO string |

There is **not** a single response object containing all four fields today; the inconsistency is across adjacent controller action outputs. The current surface returns:
- `startedAt` / `endedAt` as ISO strings (e.g., `"2026-05-26T14:00:00.000Z"`)
- `latestAnsweredAt` / `draftSavedAt` as Date instances

Downstream code that does `response.latestAnsweredAt?.toISOString()` works for the draft-save action but the same assumption on `response.startedAt` or `response.endedAt` fails because those fields are already strings. Conversely, code that expects JSON-native strings must special-case the draft-save action. There's nothing in the type or in the schema name that explains the inconsistency.

### B. Conversion logic is scattered, no canonical serializer

`src/adapters/repositories/practice-session-params.ts:25, 32` defines persisted JSONB schemas using `z.string().datetime()` and stores ISO strings. Lines 82-86 and 99-103 do ad-hoc conversion:

```typescript
// Lines 82-86: read path
latestAnsweredAt ? new Date(state.latestAnsweredAt) : null
draftSavedAt ? new Date(state.draftSavedAt) : null

// Lines 99-103: write path
latestAnsweredAt ? state.latestAnsweredAt.toISOString() : null
draftSavedAt ? state.draftSavedAt.toISOString() : null
```

The conversion direction depends on which side of the boundary you're on. There is no single helper. Every new datetime field added to the schema requires the author to remember the conversion direction and pattern; getting it wrong fails silently for nullable fields and crashes for non-nullable ones.

### C. No regression test enforces the canonical shape

A grep of the test suite for `SaveExamDraftAnswerOutputSchema` and `GetIncompletePracticeSessionOutputSchema` does not surface a schema-shape test that asserts the chosen representation across all datetime fields. If a future PR adds a new datetime field as `z.date()` (matching `latestAnsweredAt`) or `z.string().datetime()` (matching `startedAt`), nothing in CI will flag the choice as inconsistent with siblings.

### D. Other output schemas may have the same problem

The audit sweep found only four datetime validators in `src/adapters/controllers/`, all in `practice-schemas.ts`:

```sh
rg -n 'z\.date\(|z\.string\(\)\.datetime|datetime\(' src/adapters/controllers --glob '*.ts'
```

The remediation should still repeat this sweep at implementation time:
1. List every Zod output schema in `src/adapters/controllers/`.
2. For each, list every datetime field and its declared type.
3. Flag any schema where datetime fields use mixed representations.

---

## Why Existing Docs Were Not Enough

`docs/practice-engine/interaction-contracts.md` and the schemas in `src/adapters/controllers/practice-schemas.ts` are the authoritative places to document this kind of boundary contract. Neither currently states a rule about datetime representation. No `.claude/rules/architecture.md` content addresses output-schema consistency. The choice between `z.date()` and `z.string().datetime()` is treated as a per-field stylistic decision rather than a per-boundary architectural one.

The result is exactly what you'd predict: the choice drifts over time as different authors add fields in different ways, and the inconsistency compounds.

---

## Required Remediation

Ship in three single-concern PRs.

### PR 1 — Decide and document the canonical representation

Branch: `docs/debt-397-datetime-boundary-decision`

**Status:** Complete in DEBT-397 PR 1. `docs/practice-engine/interaction-contracts.md` now states the canonical controller action-output datetime rule: output datetimes are ISO 8601 strings, schema-backed fields use `z.string().datetime()`, pass-through outputs still return ISO strings, domain/use-case layers may keep `Date`, and controllers serialize to ISO at the boundary. PR 2 and PR 3 remain active.

This is the architectural decision PR. No code changes; produces a written decision that the implementation PR will follow.

Three real options, each defensible:

**Option A — All `z.string().datetime()` (ISO strings everywhere)**
- Pro: JSON-native. Trivial to serialize over HTTP. Identical shape on the wire and in client TypeScript. No `new Date()` parsing required at the boundary.
- Con: Loses Date's API ergonomics inside server-side use cases that consume the schema.
- Best for: server-action / API boundaries that are consumed by React clients.

**Option B — All `z.date()` (Date objects everywhere)**
- Pro: Type-rich. `.toISOString()`, `.getTime()`, etc. are available on every datetime field uniformly.
- Con: Doesn't survive JSON serialization. Requires `z.coerce.date()` or a custom serializer on the wire boundary.
- Best for: internal server-to-server boundaries where the schema never crosses an HTTP/JSON wire.

**Option C — Branded `z.string().datetime().brand<'ISO8601'>()` with helpers**
- Pro: Best of both. The wire format is ISO string, but TypeScript distinguishes "ISO datetime" from "arbitrary string." Use helpers `toIso(date)` and `fromIso(iso)` for conversion.
- Con: More ceremony. Adds a brand type and helper module.
- Best for: large surfaces with many datetime fields where the type-level guarantee earns its keep.

**Recommendation: Option A** for this codebase. The practice-engine output schemas cross a server-action boundary (`createAction()` wraps every controller call) and are consumed by React client components that do not need to call Date methods on the values. ISO strings are JSON-native, identical on wire and in client, and match the existing `startedAt` / `endedAt` choice — so the migration direction is "make `latestAnsweredAt` and `draftSavedAt` match `startedAt`," not the reverse.

Output of PR 1: a short ADR-style note at `docs/adr/0NNN-datetime-at-controller-boundary.md` (or a section added to `docs/practice-engine/interaction-contracts.md`, whichever matches existing conventions) stating:

```markdown
## Datetime Representation at Controller Boundaries

All output schemas in `src/adapters/controllers/` use `z.string().datetime()`
for datetime fields. Date objects are converted to ISO strings before
crossing the controller boundary.

Rationale:
- Server-action responses are JSON-serialized over the wire and deserialized
  in React clients that do not need Date method APIs.
- A single representation per primitive type prevents the `latestAnsweredAt`
  / `startedAt` divergence (DEBT-397) where one action output returns a Date
  and an adjacent action output returns an ISO string.

Implementation note: use `.toISOString()` on Date values inside the controller
adapter before returning. Input schemas accepting datetimes from clients
should use `z.string().datetime()` and parse into Date objects inside the
use-case layer if Date APIs are needed.

See DEBT-397 for migration history.
```

### PR 2 — Migrate `SaveExamDraftAnswerOutputSchema` to the canonical representation and verify the output-surface sweep

Branch: `fix/debt-397-output-schema-datetime-normalization`

Assuming Option A (the recommendation):

1. Change `practice-schemas.ts:162` `latestAnsweredAt: z.date().nullable()` -> `z.string().datetime().nullable()`.
2. Change `practice-schemas.ts:164` `draftSavedAt: z.date().nullable()` → `z.string().datetime().nullable()`.
3. Update the controller adapter code that builds these responses — call `.toISOString()` (or `null`) on the Date values from the use case before returning.
4. Update any consumer code (React components, hooks) that called Date methods on these fields — they now receive strings, so callers either work with the string directly or parse with `new Date(value)` at the call site.
5. Update or add tests that assert the schema shape: a positive test for the output schema parsing a sample response with ISO strings, and a negative test rejecting a Date instance (to catch regressions).

Sweep: run the audit step from Finding D — list every output schema, every datetime field, and verify all are `z.string().datetime()` (or `z.string().datetime().nullable()`). Fix any other divergent schema in the same PR (because they're all the same architectural decision) OR file as a separate follow-up PR if the surface area is large.

Full local gate. Browser tests must pass — if a React component was depending on Date methods, the gate will catch it.

### PR 3 — Add a regression guard

Branch: `tests/debt-397-output-schema-shape-regression`

Add `tests/integration/output-schema-shape.test.ts` (or extend an existing schema regression test) that:

1. Walks every output schema in `src/adapters/controllers/practice-schemas.ts` (and any other controller schema file).
2. For each schema, introspects the `.shape` and finds fields named with `*At` suffix or with datetime-shaped Zod definitions.
3. Asserts every datetime field is `z.string().datetime()` (or `z.string().datetime().nullable()`), NOT `z.date()` or `z.date().nullable()`.
4. Fails loudly if a new field is added with the wrong representation.

This is the enforcement layer. Without it, future drift is invisible.

---

## Acceptance Criteria

PR 1 done when:

- ADR or interaction-contracts.md update is committed.
- Decision is unambiguous (Option A, B, or C chosen and stated).
- Rationale is recorded.

PR 2 done when:

- `latestAnsweredAt`, `draftSavedAt`, and any other audit-discovered divergent fields are migrated to the canonical representation.
- Controller adapter code performs the conversion at the boundary.
- All consumers compile and tests pass.
- Full local gate green including browser tests.
- The audit sweep from Finding D produces a clean list (every output schema datetime field uses the chosen canonical type).

PR 3 done when:

- The regression test exists, runs in unit/integration, and fails if a future PR adds a divergent datetime field.
- Test execution is part of the default `pnpm test --run` gate.

---

## Risk and Reversibility

- **PR 1 (decision doc)** — zero risk. Doc-only.
- **PR 2 (schema migration)** — medium risk. The change is observable: every consumer of the affected fields now gets a string where it previously got a Date. The full local gate (especially browser tests that render the affected components) catches the actual breakage. Reversion is straightforward (revert the commit). Mitigation: if the audit sweep finds many other affected output schemas, split into per-schema PRs to keep each revertable.
- **PR 3 (regression test)** — zero risk. Test-only.

The biggest hidden risk is that the React client consumes one of the changed fields in a way the tests don't cover. The full local browser-mode test suite + manual smoke on the practice flow (start session → submit answer → resume session) catches this in normal QA.

---

## Done When

All three PRs merged to `dev` and synced to `main`. Every output schema in `src/adapters/controllers/` uses a single canonical datetime representation. The regression test exists and runs in CI. The decision is documented at the ADR or interaction-contracts level. DEBT-397 doc archived to `docs/_archive/debt/` with resolution paragraph naming all three PRs.

A future PR that adds a new datetime field to an output schema with the wrong type fails the regression test immediately, with a clear error pointing at the ADR.
