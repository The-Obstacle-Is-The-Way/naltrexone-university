# BUG-250: Feedback Comment CSV Export Allows Spreadsheet Formula Injection

**Status:** Open
**Priority:** P3
**Date:** 2026-06-17
**Confirmed:** 2026-06-17
**Component:** Question Feedback / Ops Export / Output Encoding
**Resolution State:** Fixed on `dev` in commit `b98306a6`; pending PR #460 promotion to `main`, post-merge verification, and archival.

---

## Description

Subscriber-controlled question report comments can be exported into a CSV cell that begins with a spreadsheet formula prefix on branches that do not include the `b98306a6` fix. CSV quoting protects delimiters, but it does not neutralize formulas after a spreadsheet parses the cell. An editorial operator who follows the documented `--include-comments` CSV workflow can therefore open an exported comment as an executable spreadsheet formula.

This is not a web XSS bug and does not affect the default export. It requires an operator to opt into comment export and open the resulting CSV in spreadsheet software, so the severity is P3.

## Trigger / Repro

1. As any subscribed user with access to question feedback, submit a question report with a comment such as:

   ```text
   =HYPERLINK("https://example.invalid","click")
   ```

2. An operator follows the documented comment-export workflow:

   ```bash
   DATABASE_URL="$TEST_DATABASE_URL" pnpm --silent export:feedback -- --include-comments > question-feedback-comments.csv
   ```

3. The generated CSV contains the formula as the first character of the `comment` cell:

   ```csv
   feedback_id,question_id,question_slug,attempt_id,practice_session_id,kind,rating,category,created_at,user_id,has_comment,comment
   11111111-1111-4111-8111-111111111111,33333333-3333-4333-8333-333333333333,safe-question,,,report,,other,2026-06-17T00:00:00.000Z,[redacted],true,"=HYPERLINK(""https://example.invalid"",""click"")"
   ```

## Proof

The export script makes comment export an explicit supported mode:

- [`package.json`](../../package.json#L28): `"export:feedback": "tsx scripts/export-question-feedback.ts"`
- [`docs/dev/question-feedback-analytics.md`](../dev/question-feedback-analytics.md#L17): `pnpm --silent export:feedback -- --include-comments > question-feedback-comments.csv`

The script copies the persisted subscriber comment into the record when `--include-comments` is set:

```ts
if (options.includeComments) {
  record.comment = row.comment;
}
```

Location: [`scripts/export-question-feedback.ts`](../../scripts/export-question-feedback.ts#L235)

Before the `b98306a6` fix, the CSV writer only escaped CSV delimiters, not spreadsheet formula prefixes:

```ts
function csvCell(value: string | null): string {
  if (value === null) return '';
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}
```

The current `dev` implementation fixes the same [`csvCell` boundary](../../scripts/export-question-feedback.ts#L297) by neutralizing before delimiter quoting.

In the vulnerable version, because the payload contained double quotes, `csvCell` wrapped and doubled quotes. After CSV parsing, the cell value still began with `=`, so spreadsheet software treated it as a formula rather than inert text.

The vector did not even require the quoting path: `csvCell`'s guard only matched `/[",\n\r]/`, so a quote/comma/newline-free payload such as `=1+1` (or one led by `+`, `-`, `@`, tab, CR, or LF) was emitted **verbatim and unquoted** and was still parsed as a formula. Every column is serialized through `csvCell` (`values.map(csvCell)`), so the neutralization fix below must apply to all cells, not only `comment` — though `comment` is the only subscriber-controlled free-text column today (the others are UUIDs, enums, ISO dates, or the admin-authored `question_slug`).

The comment input is bounded but intentionally free text:

- Client textarea: [`components/question/question-report-dialog.tsx`](../../components/question/question-report-dialog.tsx#L145) sets `maxLength={MAX_QUESTION_FEEDBACK_COMMENT_LENGTH}`.
- Server action: [`src/adapters/controllers/question-feedback-controller.ts`](../../src/adapters/controllers/question-feedback-controller.ts#L40) trims and caps comments with `.max(MAX_QUESTION_FEEDBACK_COMMENT_LENGTH)`.
- Database: [`db/schema.ts`](../../db/schema.ts#L603) enforces `char_length(comment) <= 2000`.

Those bounds prevent storage DoS, but they do not neutralize formula-capable text at input or storage time.

## Impact

A malicious subscriber can plant a formula in a feedback report. If an editorial/admin operator exports comments as CSV and opens the file in a spreadsheet, the comment cell can execute as a spreadsheet formula. Depending on the spreadsheet product and operator interaction, formulas can create deceptive links or make outbound requests that expose adjacent exported data.

Blast radius is limited to opted-in local editorial analysis exports; the default export excludes comments, JSON output is not a spreadsheet formula sink, and the first-party web UI does not render stored report comments.

## Expected Fix

Neutralize spreadsheet formulas before CSV serialization for every string cell, with coverage for comments specifically.

Minimal fix:

1. Add a helper before `csvCell` that prefixes an apostrophe to values whose raw first character is tab/CR/LF or whose first non-space/tab/CR/LF character is a spreadsheet formula prefix (`=`, `+`, `-`, `@`).
2. Apply that helper before delimiter quoting, so a comment like `=HYPERLINK(...)` exports as a literal text cell.
3. Add unit coverage in `scripts/export-question-feedback.test.ts` for `--include-comments` with formula-prefixed comments, quoted formulas, leading-whitespace bypass forms, and at least one non-formula value to preserve normal CSV output.

Do not remove `--include-comments`; the workflow is legitimate. The bug is output encoding for the CSV format.

## Implementation State

Implemented on `dev` in commit `b98306a6` (`Fix BUG-250: neutralize CSV formula injection in feedback export`).

`csvCell` now neutralizes spreadsheet-formula-capable values before CSV delimiter quoting, and the existing `values.map(csvCell)` serialization path applies that protection to every CSV column. The JSON export branch remains unchanged and continues to emit raw comment text.

## Verification

- [x] Code-level tracer bullet verified on 2026-06-17.
- [x] Formatter probe confirmed a formula-prefixed comment survives as the first character of the CSV cell.
- [x] Existing focused audit suite passed: `pnpm test --run components/markdown/markdown.test.tsx src/adapters/controllers/question-feedback-controller.test.ts src/adapters/controllers/question-controller.test.ts src/adapters/controllers/question-view-controller.test.ts src/adapters/controllers/review-controller.test.ts proxy.test.ts app/(marketing)/checkout/success/page.test.ts app/(marketing)/checkout/success/checkout-success-assertions.test.ts app/pricing/subscribe-actions.test.ts app/pricing/manage-billing-action.test.ts app/(app)/app/billing/manage-billing-action.test.ts` (168 tests).
- [x] Implemented fix in `scripts/export-question-feedback.ts`: CSV cells are neutralized before delimiter quoting; JSON exports are untouched.
- [x] Added unit coverage in `scripts/export-question-feedback.test.ts` for bare formulas, quoted formulas, leading-whitespace/control bypasses, preservation/idempotency cases, all-column CSV coverage, JSON untouched behavior, and the BUG-250 `=HYPERLINK(...)` repro.
- [x] `pnpm test --run scripts/export-question-feedback.test.ts` passed (19 tests).
- [x] `pnpm typecheck` passed.
- [x] `pnpm lint` passed.
- [x] `pnpm test --run` passed (350 files, 2859 tests).
- [x] `pnpm build` passed.
- [ ] PR #460 promoted the fix to `main`.
- [ ] Post-merge verification completed.
- [ ] Archived to `docs/_archive/bugs/` after verification.

## Related Clean Surfaces

- Markdown rendering remains clean: [`components/markdown/markdown.tsx`](../../components/markdown/markdown.tsx#L71) uses `ReactMarkdown` with `rehypeSanitize` and `skipHtml`.
- Stored report comments are not rendered in the first-party web UI; they are submitted, stored, and exported for editorial analysis.
