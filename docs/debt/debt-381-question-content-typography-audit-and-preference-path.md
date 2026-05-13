# DEBT-381: Question Content Typography Audit And Optional Preference Path

**Priority:** P3
**Created:** 2026-05-08
**Source:** User-reported concern that question fonts may have been oversized during earlier question-content/frontmatter work; live visual audit of Practice starter, Tutor, Exam, and Quick Practice on 2026-05-08; computed browser typography metrics saved with screenshots.
**Related:** [Typography Policy](../frontend/typography-policy.md), [Frontend Standards](../frontend/standards.md), [Pattern Registry](../frontend/pattern-registry.md), [Practice Page Docs](../frontend/pages/practice.md), [DEBT-378](../_archive/debt/debt-378-tutor-drop-submit-button-choice-click-commits.md), [DEBT-380](../_archive/debt/debt-380-exam-footer-cluster-previous-and-primary-cta-mirror-tutor.md)

**Status:** Active

---

## Verdict

Do **not** globally shrink question text.

The current production UI is already unified across Quick Practice, active Tutor sessions, and active Exam sessions:

- question stems compute to `16px / 24px`
- answer choices compute to `16px / 24px`
- feedback explanations compute to `16px / 24px`
- page titles compute to `24px / 32px`
- page subtitles compute to `16px / 24px`
- operational starter controls compute to `14px / 20px`

That matches the existing Typography Policy's two-pipeline model: hardcoded operational UI text is mostly dense `text-sm`, while question content is primary Markdown reading material at `text-base`.

The right future path, if the font still feels large to some users, is a **user-selectable content size preference** for the Markdown/content pipeline only. The default should remain the current Medium setting.

---

## Visual Evidence

Screenshots and computed CSS metrics were captured through the real Playwright E2E auth/setup path at `1920x1080`, dark theme.

The original capture bundle was generated outside the repository as `practice-typography-audit-screenshots-2026-05-08T15-19-42-495Z`. If this evidence needs to become portable, save a sanitized copy under `docs/debt/artifacts/debt-381/`.

Files:

- `practice-starter-01-tutor-mode-count-3.png`
- `practice-starter-02-exam-mode-count-3.png`
- `tutor-01-unanswered-question.png`
- `tutor-02-answered-feedback.png`
- `exam-01-unanswered-question.png`
- `exam-02-selected-no-feedback.png`
- `quick-01-unanswered-question.png`
- `quick-02-answered-feedback.png`
- `typography-metrics.json`

Representative computed metrics from that run:

| Surface | Element | Computed size | Weight | Family |
|---------|---------|---------------|--------|--------|
| Practice starter | Page h1 | `24px / 32px` | 700 | Instrument Sans |
| Practice starter | Page subtitle | `16px / 24px` | 400 | Manrope |
| Practice starter | Card title | `16px / 24px` | 600 | Manrope |
| Practice starter | Mode label/button/input | `14px / 20px` | 500 | Manrope |
| Tutor | Page h1 | `24px / 32px` | 700 | Instrument Sans |
| Tutor | Subtitle | `16px / 24px` | 400 | Manrope |
| Tutor | Question stem | `16px / 24px` | 400 | Manrope |
| Tutor | Choice text | `16px / 24px` | 400 | Manrope |
| Tutor | Feedback explanation | `16px / 24px` | 400 | Manrope |
| Exam | Page h1 | `24px / 32px` | 700 | Instrument Sans |
| Exam | Subtitle | `16px / 24px` | 400 | Manrope |
| Exam | Question stem | `16px / 24px` | 400 | Manrope |
| Exam | Choice text | `16px / 24px` | 400 | Manrope |
| Quick Practice | Page h1 | `24px / 32px` | 700 | Instrument Sans |
| Quick Practice | Subtitle | `16px / 24px` | 400 | Manrope |
| Quick Practice | Question stem | `16px / 24px` | 400 | Manrope |
| Quick Practice | Choice text | `16px / 24px` | 400 | Manrope |
| Quick Practice | Feedback explanation | `16px / 24px` | 400 | Manrope |

---

## Mechanical Code Audit

### Practice starter uses the dense UI-text pipeline

`PracticeSessionStarter` is already sized like operational chrome:

- card title: `text-base font-semibold text-foreground` at `app/(app)/app/practice/components/practice-session-starter.tsx:108`
- mode/exam explanation: `text-sm text-muted-foreground` at `practice-session-starter.tsx:111`
- field labels: `text-sm font-medium text-foreground` at `practice-session-starter.tsx:122`, `:141`, `:166`, `:187`
- questions input override: `text-sm font-medium` at `practice-session-starter.tsx:151`
- availability copy and errors: `text-sm` at `practice-session-starter.tsx:277`, `:296`

This is consistent with Frontend Standards and Pattern Registry dense-control roles. The starter is not the source of question-content font drift.

### PracticeView page chrome is shared across Quick Practice, Tutor, and Exam

`PracticeView` owns the session/quick page title and description:

- title: `text-2xl font-bold font-heading tracking-tight text-foreground` at `app/(app)/app/practice/components/practice-view.tsx:360`
- description: `text-base text-muted-foreground` at `practice-view.tsx:366`

Quick Practice passes `title="Quick Practice"` and `description="Answer one question at a time."` into that shared view at `app/(app)/app/practice/quick/quick-practice-client.tsx:73-75`.

Tutor and Exam session pages use the same shared view, so there is no per-mode page-chrome typography fork to fix.

### Question content is one shared Markdown pipeline

Question stems:

- `QuestionCard` renders the stem as `<Markdown content={stemMd} className="text-base text-foreground" />` at `components/question/question-card.tsx:35`

Answer choices:

- `ChoiceButton` defines `choiceTextClassName = 'text-base text-foreground'` at `components/question/choice-button.tsx:25`
- it passes that to `<Markdown content={textMd} ... />` at `choice-button.tsx:74`

Feedback:

- correct-answer text uses `text-base text-foreground` at `components/question/feedback.tsx:98-100`
- feedback explanation helper returns `text-base text-foreground` / `mt-2 text-base text-foreground` at `feedback.tsx:50-53`
- wrong-answer text uses `text-base text-foreground` at `feedback.tsx:132-134`
- wrong-answer explanations use `mt-2 text-base text-foreground` at `feedback.tsx:137-139` and `:223-225`
- feedback reference body uses `mt-1 text-sm` at `feedback.tsx:249`, which is the documented feedback-context readability exception

The shared `Markdown` component itself intentionally provides no default size; callers must pass the content tier class. That rule is documented in `docs/frontend/typography-policy.md:113-151` and implemented at `components/markdown/Markdown.tsx:62-80`.

### Frontend docs already encode this design

Typography Policy says:

- hardcoded UI text and Markdown content are separate pipelines (`docs/frontend/typography-policy.md:14-55`)
- primary content is `text-base text-foreground` for question stems, answer choice text, and feedback answer text (`typography-policy.md:63-67`)
- feedback explanations are promoted to Primary in feedback context (`typography-policy.md:69-81`)
- primary content is intentionally `text-base`, not `text-sm` (`typography-policy.md:83-91`)
- a future user-selectable content-size feature should affect Pipeline 2 only (`typography-policy.md:93-109`)
- current Pipeline 2 drift is documented as none (`typography-policy.md:174-192`)

Pattern Registry repeats the same font-family and text-role contract:

- body default is Manrope; headings use `font-heading`; display numbers use `font-display` (`docs/frontend/pattern-registry.md:1019-1031`)
- standard app h1 is `text-2xl font-bold font-heading tracking-tight text-foreground` (`pattern-registry.md:1033-1039`)
- question stem is `text-base text-foreground` (`pattern-registry.md:1069-1083`)

---

## Design Assessment

### The user's concern is valid to audit

The concern is plausible because earlier work touched question content and the app has accumulated many typography debts around `text-base`, `text-sm`, feedback cards, and choice buttons. It was worth checking the screenshots and computed styles before making a call.

### The current implementation is not mechanically inconsistent

Quick Practice, Tutor, and Exam do not independently choose question font sizes. They converge through shared `PracticeView`, `QuestionCard`, `ChoiceButton`, and `Feedback` components. The screenshot metrics confirm that convergence in the browser.

### The starter form should not set the question-content baseline

The practice starter is an operational configuration surface. Its labels, segmented controls, and question-count input are dense controls. They correctly sit at `14px / 20px`.

Question stems and answers are sustained reading material. They correctly sit one tier above dense controls at `16px / 24px`. Matching question content down to starter-control sizing would erase the content/chrome hierarchy.

### The earlier "large font" decision should not be reversed globally

Shrinking all question content to `text-sm` would contradict the current Typography Policy and would be a broad behavioral/design regression:

- dense clinical stems and answer choices become harder to read
- feedback explanations, which are the main learning payload after submission, become less legible
- the same content would lose its deliberate one-tier separation from navigation, filters, buttons, and metadata

If the user wants a smaller reading density, it should be explicit and reversible as a preference, not a default global shrink.

---

## Recommended Direction

### Option A - Recommended now: no production typography change

Do not open an implementation PR that simply changes:

- `QuestionCard` stem from `text-base` to `text-sm`
- `ChoiceButton` text from `text-base` to `text-sm`
- `Feedback` explanations from `text-base` to `text-sm`
- `PracticeView` subtitles from `text-base` to `text-sm`

That would be a visual preference reversal without enough evidence of user harm and would violate the current SSOT.

### Option B - Recommended if this still bothers users: build content-size preference

Implement the future path already sketched in Typography Policy:

| Setting | Primary content | Secondary content | Tertiary content | Hardcoded UI text |
|---------|-----------------|-------------------|------------------|-------------------|
| Small | `text-sm` | `text-xs` | `text-xs` | unchanged |
| Medium | `text-base` | `text-sm` | `text-xs` | unchanged |
| Large | `text-lg` | `text-base` | `text-sm` | unchanged |

Default remains Medium, preserving today's UI.

The preference must apply only to Markdown/content surfaces:

- question stems
- answer choices
- feedback answer text
- feedback explanations
- references
- clinical pearl content

It must not resize:

- page headings
- page subtitles
- session starter controls
- segmented controls
- buttons
- badges/pills
- question navigator pills
- app nav

---

## Implementation Plan If Option B Is Authorized

1. Add a small content typography abstraction.
   - Own the mapping from `{ size: small | medium | large, tier: primary | secondary | tertiary, context?: feedback }` to Tailwind classes.
   - Keep the mapping in one file, likely under `components/markdown/` or `components/question/`, not scattered through view components.
   - Do not put mode logic (`quick`, `tutor`, `exam`) into the mapping. The typography contract is content-role based, not mode based.

2. Add a content-size provider.
   - Read from localStorage first unless a persisted user setting already exists.
   - Default to Medium.
   - Scope the provider to practice/question surfaces; do not affect dashboard/history/billing.

3. Replace hard-coded content classes at the Markdown call sites.
   - `components/question/question-card.tsx`
   - `components/question/choice-button.tsx`
   - `components/question/feedback.tsx`
   - any direct question-review page Markdown call sites found by grep

4. Add a user-facing control only if product wants it visible now.
   - Candidate location: account/settings if a settings surface exists.
   - If no settings surface exists, defer UI and ship only the internal abstraction when another feature needs it.
   - Do not add the toggle to the Practice starter unless the page is explicitly redesigned for preferences; the starter is already a configuration surface for session content, not display settings.

5. Test behavior and boundaries.
   - Unit tests for the class mapping.
   - Render tests showing `QuestionCard`, `ChoiceButton`, and `Feedback` consume tier classes from the mapping.
   - Browser tests for Small/Medium/Large on one question surface.
   - Regression tests that page headings, starter controls, buttons, and app nav stay unchanged when the content preference changes.

6. Visual QA.
   - Capture desktop dark screenshots for Quick Practice, Tutor, and Exam at Medium and Small.
   - Capture at least one mobile viewport before deciding whether Small should be exposed.
   - Verify long stems, long choices, clinical pearls, wrong-answer explanations, and reference sections.

---

## Test Diff Plan

No production implementation is authorized by this doc alone. If Option B is implemented, add or update:

- `components/markdown/*content-typography*.test.ts` - mapping contract for Small/Medium/Large and Primary/Secondary/Tertiary tiers
- `components/question/QuestionCard.test.tsx` - stem uses Primary content tier, not mode-specific classes
- `components/question/choice-button.test.tsx` - choice text uses Primary content tier and remains `text-foreground`
- `components/question/Feedback.test.tsx` - feedback explanation uses feedback-context Primary; reference uses feedback-context Secondary
- Browser spec covering computed font sizes for one question in Medium and Small
- Optional E2E smoke only if the preference control is exposed through a user-facing route

Do not add brittle screenshot pixel assertions. Use computed style checks plus manual screenshots for design review.

---

## Acceptance Criteria

### If no implementation follows

- This debt remains as the audit record.
- No production classes are changed just to shrink question text.
- The current screenshots and metrics remain attached as external evidence.

### If Option B is implemented

- Default Medium exactly preserves today's computed sizes:
  - question stems: `16px / 24px`
  - answer choices: `16px / 24px`
  - feedback explanations: `16px / 24px`
  - feedback references: `14px / 20px`
- Small affects only Markdown/content surfaces, not hardcoded UI chrome.
- Quick Practice, Tutor, and Exam all use the same content tier mapping.
- Exam mode answer secrecy is unchanged.
- No mode-specific font-size branches are introduced.
- `Markdown` still does not own a global default size unless the new abstraction explicitly supplies a tier through context.
- Frontend docs are updated:
  - `docs/frontend/typography-policy.md`
  - `docs/frontend/pattern-registry.md`
  - `docs/frontend/pages/practice.md`
- Visual evidence is captured for the default Medium state and any newly exposed Small/Large state.

---

## Out Of Scope

- Rewriting MDX/YAML question content.
- Changing question card chrome, answer choice borders, or feedback card surfaces.
- Changing action bar placement, footer buttons, or click-to-commit semantics.
- Changing app-wide body font family.
- Making mobile-specific type changes without separate mobile visual evidence.
