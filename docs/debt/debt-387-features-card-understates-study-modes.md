# DEBT-387: Features Card Understates Study Modes — "Tutor + Exam Modes" Contradicts the "3 Study Modes" Stat

**Priority:** P3
**Created:** 2026-05-21
**Source:** Spun out of [DEBT-382](../_archive/debt/debt-382-landing-page-content-refresh-question-count-and-author-credibility.md) / PR #313. That ticket updated the impact-stat row from `2` to `3 Study Modes` (Tutor, Exam, and Quick Practice are three real, separately-routed surfaces) but explicitly held the Features array out of scope to keep the diff text-only. The result is a self-contradiction now live on `/`: the stat row claims **3** study modes, while the Features section card a few sections down still names exactly **two** (`Tutor + Exam Modes`).
**Related:** [DEBT-382](../_archive/debt/debt-382-landing-page-content-refresh-question-count-and-author-credibility.md) (parent), [Frontend Standards](../frontend/standards.md)

**Status:** Active — requires a copy decision (see Open Questions); copy-only change once the wording is chosen.

---

## Why This Is Debt

This is concrete, user-visible inconsistency on the public marketing page, not a speculative "could be better." A prospective buyer who reads the hero stat row (`3 Study Modes`) and then the Features section sees the product contradict itself about how many study modes exist. The Features card names only Tutor and Exam, omitting Quick Practice — the exact omission DEBT-382 raised the stat to fix. Either surface alone is fine; together they undercut credibility.

The harm is observable today (post-PR #313), which satisfies the `feedback_no_speculative_debt` rule: a real defect introduced as a deliberate, documented side effect of shipping DEBT-382's stat change, deferred rather than absorbed.

---

## Current State (verified 2026-05-21 against `main` @ `c12533c8`)

| File | Line | Element | Current copy |
|------|------|---------|--------------|
| `components/marketing/marketing-home.tsx` | 20 | `impactStats[1]` | `{ value: '3', label: 'Study Modes' }` |
| `components/marketing/marketing-home.tsx` | 35 | Features card title | `Tutor + Exam Modes` |
| `components/marketing/marketing-home.tsx` | 37 | Features card description | `Tutor shows feedback immediately. Exam mode simulates real test conditions.` |
| `app/(app)/app/practice/quick/quick-practice-client.tsx` | 74-75 | Quick Practice surface | `title="Quick Practice"` / `description="Answer one question at a time."` |

The stat value is correct and stays. The inconsistency is entirely in the Features card copy.

---

## Proposed Change (one card, copy-only)

Bring the Features card into agreement with the `3 Study Modes` stat. Two candidate directions — the exact wording is a user copy decision, not locked here:

- **Option A — name all three:** title `Tutor, Exam & Quick Practice`; extend the description with a Quick Practice clause, e.g. `Tutor shows feedback immediately, Exam mode simulates real test conditions, and Quick Practice serves one question at a time.`
- **Option B — count, don't enumerate:** title `Three study modes`; description names the three surfaces in one sentence.

Either way the change is confined to the single Features array entry at `marketing-home.tsx:35-38`. The card's icon (`Zap`) and `wide` flag are unchanged.

---

## What This Debt Item Does NOT Touch

- The `impactStats` row (already correct at `3 Study Modes`).
- Any other Features card (`High-Yield Explanations`, `Smart Bookmarking`, `Progress Dashboard`).
- Hero copy, pricing, layout, typography tokens, footer.
- The Quick Practice route or any product behavior — this is marketing copy only.

---

## Open Questions For The User

1. Option A (enumerate the three modes) or Option B (state "three study modes")?
2. If Option A, confirm the exact title and description wording.

---

## Acceptance Criteria

When the implementation PR ships:

- [ ] The Features card and the `3 Study Modes` stat agree — the card names or counts three modes including Quick Practice.
- [ ] Change is confined to the single Features array entry; no other copy or layout changes.
- [ ] `components/marketing/marketing-home.test.tsx` updated to assert the new card copy (raw `expect(html).toContain(...)` pattern) and to confirm the old `Tutor + Exam Modes`-only string no longer matches.
- [ ] `pnpm test --run` and `pnpm build` pass.
- [ ] Visual verification on `localhost:3000/` in light and dark themes, no layout shift.

---

## Implementation Constraints

Per repo memory rules:

- `feedback_docs_before_code`: pick the wording (Open Questions) before any code change.
- `feedback_full_gate_before_push`: run the full quality gate before push.
- `feedback_verify_doc_citations_mechanically`: citations above were verified against `main` @ `c12533c8` on 2026-05-21; re-verify if the implementation PR opens more than a few commits later.
