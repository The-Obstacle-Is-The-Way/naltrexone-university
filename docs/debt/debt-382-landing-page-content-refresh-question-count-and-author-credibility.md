# DEBT-382: Landing Page Content Refresh — Question Count And Author Credibility

**Priority:** P3
**Created:** 2026-05-12
**Source:** User-reported gap on the marketing landing page: the headline question count (`500+`) understates the actual content library, the `2 Study Modes` stat omits Quick Practice as a distinct practice surface, and there is no mention anywhere on the public marketing surface of the product being authored by a practicing, double board-certified psychiatrist. The 948-question count came from the local authoring workspace's imported-content corpus under `content/questions/imported/`; those files are not currently tracked in git, so DEBT-382 implementation must make the count evidence portable before changing the public numeric claim.
**Related:** [Frontend Standards](../frontend/standards.md), [DEBT-378](../_archive/debt/debt-378-tutor-drop-submit-button-choice-click-commits.md), [DEBT-379](../_archive/debt/debt-379-exam-action-bar-promote-primary-cta-to-right-slot.md), [DEBT-380](../_archive/debt/debt-380-exam-footer-cluster-previous-and-primary-cta-mirror-tutor.md), [DEBT-381](./debt-381-question-content-typography-audit-and-preference-path.md)

**Status:** Active — decisions locked; paused behind DEBT-383 and requires portable content-count evidence before implementation

---

## Decisions (locked by user on 2026-05-12)

| Question | Decision |
|----------|----------|
| Number to publish | `900+`, contingent on preserving portable evidence for the 948 local imported-content count before implementation |
| Study modes stat | Update `impactStats[1].value` from `2` to `3`; keep label `Study Modes` |
| Placement of credibility line | **Option A** — directly under the hero badge, between `marketing-home.tsx:75-77` (badge) and `marketing-home.tsx:78-83` (h1) |
| Phrasing | **Option A1 (unnamed)** — `Authored by a practicing psychiatrist — double board-certified in Addiction Psychiatry and General Psychiatry. Grounded in primary literature with citations.` |
| Board nomenclature | `General Psychiatry` (formal ABPN, not "General Adult Psychiatry") |
| Author name on hero | **Not included.** A public name line requires a separate privacy and naming decision. The unnamed phrasing keeps the core credibility lift (practicing, double-board-certified, exact subspecialty) without committing repo-tracked copy to a specific public identity. Upgrade path to a named variant later is a small text edit. |
| Optional AJA 2023 publication line | **Not included** in this debt item. |

No copy decisions remain open. Implementation is blocked until DEBT-383 lands and the 948-count evidence is made reproducible in the repo or replaced with a newly verified tracked source count. `3 Study Modes` is in scope for this debt item.

---

## Verdict

Three concrete edits to the public marketing landing page (`/`):

1. **Replace the stale "500+ Board-Style Questions" stat** with an honest, conservative number that reflects the current library size. Locked copy: **`900+`**. This direction was backed by a local authoring-workspace count of 948 `.mdx` source question files in `content/questions/imported/`; because that imported corpus is not tracked in git, the implementation PR must first preserve a repo-portable count artifact or re-verify the count against a tracked source of truth. Rounding down to `900+` avoids drift between marketing copy and the live published count and gives headroom before the next required refresh.
2. **Replace the stale `2 Study Modes` stat** with **`3`** while keeping the `Study Modes` label. The product exposes three distinct surfaces: Tutor mode, Exam mode, and Quick Practice mode (`app/(app)/app/practice/quick/quick-practice-client.tsx`).
3. **Add a single, restrained, _unnamed_ author-credibility line** that surfaces the differentiator without theatrics. Locked public copy:
   > _Authored by a practicing psychiatrist — double board-certified in Addiction Psychiatry and General Psychiatry. Grounded in primary literature with citations._
   No headshot. No testimonial-style bordered card. No name. No MD/DO/credential alphabet soup. Two sentences, one location.

The literature/citations sentence is intentionally explicit. The seven source-directory names from the local imported-content corpus (`50-studies-every-psychiatrist-should-know`, `article-based-pathway`, `asam-guidelines`, `cochrane`, `personal-papers`, `prescribers-guide`, `therapy`) evidence the primary-literature backbone, and the existing Features copy already implicitly claims "detailed rationales and references" at `components/marketing/marketing-home.tsx:30`. The new line makes that claim visible and load-bearing. The user considered and rejected softer phrases like "clinical nuance" and "clinically oriented" because they are subjective or already implied.

This is intentionally a minimum-viable copy refresh, not a redesign. Visual layout, hero composition, pricing card structure, and section ordering are out of scope. Only `<span>` / `<p>` text and the `impactStats` array values change.

**Author identification (private context only, not for the landing page).** The product is authored and maintained by the project clinician; the full profile belongs in a private artifact. The public landing-page copy in this debt item deliberately uses unnamed phrasing — see the Decisions table for rationale. A future debt item can promote the unnamed line to a named variant only after a separate privacy and naming decision.

**Nomenclature note.** The user described the credential verbally as "general psychiatrist adult." The formal public-copy phrase is **General Psychiatry** — adult is the default scope of that board (child & adolescent is a separate subspecialty).

---

## Why This Is Debt

### Stale headline claim

`components/marketing/marketing-home.tsx:18-23` declares:

```typescript
const impactStats = [
  { value: '500+', label: 'Board-Style Questions' },
  { value: '2', label: 'Study Modes' },
  { value: 'Instant', label: 'Explanations' },
  { value: '100%', label: 'Mobile Responsive' },
];
```

The `500+` value is the only one of the four stats that is a hard, falsifiable, content-volume claim. The local authoring workspace's imported-content corpus counted **948 `.mdx` question files** under `content/questions/imported/` across:

- `50-studies-every-psychiatrist-should-know/` — 48
- `article-based-pathway/` — 480
- `asam-guidelines/` — 108
- `cochrane/` — 24
- `personal-papers/` — 132
- `prescribers-guide/` — 144
- `therapy/` — 12

This is concrete user harm: a prospective buyer landing on the public homepage today is being told the library is roughly half its actual size. That is both unfair to the product and a credibility risk if a buyer later notices the discrepancy in-app.

> **Portability caveat.** `content/questions/imported/` is not currently tracked in git, so a fresh GitHub/CI checkout cannot mechanically reproduce the 948 count. Before implementing the `900+` public stat, add a repo-relative count artifact or re-run the count against a tracked source of truth and update this doc if the verified number changes.

### Stale study-mode claim

`components/marketing/marketing-home.tsx:20` currently declares `{ value: '2', label: 'Study Modes' }`. That undercounts the actual product surface: the app exposes Tutor mode, Exam mode, and a separate Quick Practice mode at `app/(app)/app/practice/quick/quick-practice-client.tsx`. The honest public stat is therefore `3 Study Modes`.

### No author credibility surface

`components/marketing/marketing-home.tsx:74-91` (hero), `components/marketing/marketing-home.tsx:135-180` (features), `components/marketing/marketing-home.tsx:253-280` (final CTA), and `components/marketing/marketing-layout.tsx:79-119` (footer) collectively contain **zero references** to the author/creator. The product reads as institutionally anonymous.

For a single-author specialty board prep product, anonymity is a real differentiation cost relative to:

- Larger generic question-bank vendors (UWorld, BoardVitals, Beat the Boards), where users assume content is authored by a stable of contractors of unknown clinical activity status.
- AI-generated "study tools" flooding the space in 2025–2026.

A single, low-key author-attribution line says, in effect: *this content was written by someone who currently practices in the field, holds both relevant board certifications, and grounds the material in cited primary sources.* That is not a marketing flourish — it is a verifiable, concrete claim that prospective buyers cannot derive elsewhere on the site.

This is consistent with the existing memory rule `feedback_no_speculative_debt`: the harm is observable (no credibility surface today, missed positioning) rather than speculative ("could be better someday").

---

## Current State (verified)

| File | Lines | Element | Current copy |
|------|-------|---------|--------------|
| `components/marketing/marketing-home.tsx` | 19 | `impactStats[0].value` | `500+` |
| `components/marketing/marketing-home.tsx` | 19 | `impactStats[0].label` | `Board-Style Questions` |
| `components/marketing/marketing-home.tsx` | 20 | `impactStats[1].value` | `2` |
| `components/marketing/marketing-home.tsx` | 20 | `impactStats[1].label` | `Study Modes` |
| `app/(app)/app/practice/quick/quick-practice-client.tsx` | 73-75 | Quick Practice surface | `title="Quick Practice"` / `description="Answer one question at a time."` |
| `components/marketing/marketing-home.tsx` | 75-77 | Hero badge | `Board prep, built for outcomes` |
| `components/marketing/marketing-home.tsx` | 78-83 | Hero h1 | `Master Your Board Exams.` |
| `components/marketing/marketing-home.tsx` | 84-88 | Hero subtitle | `High-yield questions with detailed explanations for Addiction Psychiatry and Addiction Medicine. Practice with confidence and track your progress.` |
| `components/marketing/marketing-home.tsx` | 263-265 | Final-CTA subtitle | `Join physicians and psychiatrists preparing for addiction boards. Full access, cancel anytime.` |
| `components/marketing/marketing-layout.tsx` | 87-89 | Footer tagline | `Board exam preparation for addiction medicine professionals.` |

The hero subtitle (`marketing-home.tsx:84-88`) is the only place on the page that already mentions both Addiction Psychiatry and Addiction Medicine specifically — it is correct and stays.

---

## Proposed Changes

### Change 1 — Update `impactStats[0]` (question count)

**File:** `components/marketing/marketing-home.tsx:19`

**From:**

```typescript
{ value: '500+', label: 'Board-Style Questions' },
```

**To (locked):**

```typescript
{ value: '900+', label: 'Board-Style Questions' },
```

Rationale for `900+` over `948` or `1000`:

- `948` exposes a precise integer that will be wrong the moment a single question is added or retired. `900+` is honest, conservative, and ages well.
- `1000` rounds up past the verified source-file count. Avoid.
- `900+` is the user's pre-audit instinct and is supported by the local imported-content count once that evidence is made portable.

### Change 2 — Update `impactStats[1]` (study modes)

**File:** `components/marketing/marketing-home.tsx:20`

**From:**

```typescript
{ value: '2', label: 'Study Modes' },
```

**To (locked):**

```typescript
{ value: '3', label: 'Study Modes' },
```

Rationale:

- Tutor mode and Exam mode are first-class study modes.
- Quick Practice is also a distinct surface, verified at `app/(app)/app/practice/quick/quick-practice-client.tsx`.
- The public stat should count the real product surface rather than preserve a stale two-mode framing.

### Change 3 — Add author-credibility line

Placement and copy are locked. Alternatives remain documented only to preserve the decision trail.

#### Option A (LOCKED) — quiet line directly under the hero badge

Insert a new short line between the hero badge (`marketing-home.tsx:75-77`) and the h1 (`marketing-home.tsx:78-83`). Two sentences, muted color, no card or border.

Variants considered (the user locked **A1** — the other variants are not selected and are documented for transparency only):

**Unnamed:**

- **A1 (LOCKED):** `Authored by a practicing psychiatrist — double board-certified in Addiction Psychiatry and General Psychiatry. Grounded in primary literature with citations.`
- **A2 (not selected):** `Built by a working, double board-certified addiction and general adult psychiatrist.`

**Named (not selected — deferred):**

- **A3 (not selected):** `Authored by [named clinician], MD — a working psychiatrist, double board-certified in Addiction Psychiatry and General Psychiatry.`
- **A4 (not selected):** `Authored by [named clinician], MD — a working psychiatrist, board-certified in Addiction Psychiatry and General Psychiatry, fellowship-trained at a recognized addiction psychiatry program.`

**Why A1 over A3/A4.** A public name line requires a separate privacy and naming decision. A1 captures most of the credibility lift available from naming (working, double board-certified, exact subspecialty) without committing repo-tracked copy to a specific public identity. The upgrade path from A1 to a named variant is a small text change when the user is ready.

#### Option B (considered, not selected) — small "About the author" section between features and pricing

A new short section card would avoid touching the hero and would be more discoverable, but it creates new section/layout surface area. The user selected the quieter hero-adjacent line instead.

#### Option C (considered, not selected) — footer tagline replacement

Replace `marketing-layout.tsx:88` (`Board exam preparation for addiction medicine professionals.`) with: `Board exam preparation, authored by a working double board-certified addiction psychiatrist.`

Option C was rejected because it is the easiest to miss and does not put the credibility claim near the first decision point.

---

## What This Debt Item Does NOT Touch

- Hero h1 (`Master Your Board Exams.`) — generic but functional; redesign is out of scope.
- Pricing card structure, layout, or copy at `marketing-home.tsx:182-251`.
- `MetallicCtaButton` exception (`marketing-home.tsx:267-271`, `@debt-exception D-15`).
- Features array contents (`marketing-home.tsx:25-54`).
- Visual layout, spacing, typography tokens, dark/light theme.
- Headshot, bio page, separate `/about` route, testimonial section.
- A/B testing scaffolding.
- SEO meta description / OpenGraph copy.
- Marketing footer tagline.
- `lib/pricing-data.ts` contents.

Anything beyond the three text edits above is a separate debt item.

---

## Open Questions For The User

None. See the **Decisions** table at the top of this document for the locked answers.

---

## Private Credibility Inventory

The user supplied a private credibility profile. This repo-tracked doc records editorial categories and decisions only; raw profile details belong in a private artifact.

### Included in proposed copy

| Profile element | Why included |
|------------|--------------|
| Practicing psychiatrist status | Supports the verifiable "practicing psychiatrist" claim without naming an employer. |
| General Psychiatry board certification | Core credential, directly relevant to the product audience. |
| Addiction Psychiatry board certification | Core credential, exactly the subspecialty this product targets. |
| Primary-literature source pathway | Supports the "Grounded in primary literature with citations" sentence. |

### Considered and excluded (clutter risk)

| Profile element | Why excluded |
|------------|--------------|
| State license list | Reads as defensive credential-stacking rather than relevant signal. |
| Prior employer list | "Practicing psychiatrist" is the load-bearing claim; listing employers adds line length, not signal. |
| Peer-reviewed publication detail | Strong academic signal, but listing publication details on a marketing landing page risks looking like a textbook ad. |
| Presentation and teaching history | Belongs on a separate `/about` page if one is ever built. |
| Quality-improvement work | Not legible to a buyer in 1 second. |
| Education history | Full pedigree belongs on a bio page, not a hero. |
| Awards and scholarships | Insider awards; weak signal to a buyer skimming the page. |
| Clinical research details | Risks looking inflated relative to the actual contribution. |
| Volunteer work and hobbies | Not on-axis for product credibility. |
| Direct contact and license-control details | Not appropriate for a repo-tracked or public marketing surface. |

### Deferred add-ons (not in this debt item)

If the user later wants a slightly larger credibility footprint without leaving the homepage, the next two highest-signal additions would be:

- **Recognized fellowship line** (Option A4 category).
- **Peer-reviewed publication line** — as a tiny secondary line under Option A. This is the single most decision-relevant profile item not already in Option A3/A4.

Neither of these are in the locked diff. They are listed here so the user can opt in explicitly later.

---

## Implementation Constraints (when this is later picked up)

Per repo memory rules:

- `feedback_docs_before_code`: this spec must be reviewed before any code change.
- `feedback_full_gate_before_push`: implementation PR must run the full quality gate before push: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build`.
- `feedback_verify_doc_citations_mechanically`: every file:line citation in this doc has been opened and verified against `dev` as of `2026-05-12`. If the implementation PR is opened more than a few commits later, citations must be re-verified.

The marketing landing page has cached fragments (`'use cache'` directives at `marketing-home.tsx:71`, `:94`, `:136`, `:183`, `:254`). Any text change must:

- still typecheck and pass `pnpm build` (build catches `'use cache'` violations that `pnpm test` does not).
- update the existing raw HTML-string assertion in `components/marketing/marketing-home.test.tsx` from `expect(html).toContain('500+')` to the new `900+` value, and add assertions for `3` / `Study Modes` plus the locked credibility line using the same raw `expect(html).toContain(...)` pattern already used in that file.

---

## Acceptance Criteria

When the follow-up implementation PR ships:

- [ ] `impactStats[0].value` displays `900+` on `/`.
- [ ] `impactStats[1].value` displays `3` while `impactStats[1].label` remains `Study Modes` on `/`.
- [ ] The locked two-sentence credibility line renders directly under the hero badge: `Authored by a practicing psychiatrist — double board-certified in Addiction Psychiatry and General Psychiatry. Grounded in primary literature with citations.`
- [ ] `pnpm test --run` passes, including the corrected `components/marketing/marketing-home.test.tsx` assertions for `900+`, `3` / `Study Modes`, and the locked credibility line.
- [ ] `pnpm build` passes — no prerender or `'use cache'` regressions.
- [ ] Visual verification on `localhost:3000/` confirms the new copy renders in both light and dark themes without layout shift.
- [ ] No new files are introduced; the change is text-only edits to existing files.

---

## Verification Checklist

Before merging the implementation PR:

- [ ] Mechanical recount from a repo-portable artifact or tracked source re-confirms the source library size still supports the published number.
- [ ] No regressions in `components/marketing/marketing-home.test.tsx` or `components/marketing/marketing-layout.test.tsx`.
- [ ] CodeRabbit review on the implementation PR passes per `feedback_grade_before_merge`.
- [ ] Index updated when this debt item is closed (move to Resolved table, set Resolved date).
