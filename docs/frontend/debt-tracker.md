# Frontend Debt Tracker

**Last Updated:** 2026-02-08

All frontend-specific tech debt lives here. For backend/infra debt, see `docs/debt/index.md`.

Items are referenced as `FE-XXX` and defined in `docs/frontend/standards.md` Section 17 (Known Violations).

---

## Open Items

### P1 — Must fix before UI/UX refactor

| ID | Summary | Files | Status |
|----|---------|-------|--------|
| FE-002 | God hook: `usePracticeSessionReviewStage` (304 lines, 3 LoadState trackers) | `[sessionId]/hooks/use-practice-session-review-stage.ts` | Open |

### P2 — Fix during UI/UX refactor

| ID | Summary | Files | Status |
|----|---------|-------|--------|
| FE-007 | Raw `<button>` in pricing (1 instance) | `pricing-client.tsx` | Open |
| FE-008 | Raw styled `<Link>` as buttons (11+ instances) | `get-started-cta.tsx`, `auth-nav.tsx`, `marketing-home.tsx`, `not-found.tsx`, `pricing-view.tsx` | Open |
| FE-009 | Card-like divs in marketing (10 instances) | `marketing-home.tsx` | Open |
| FE-010 | Card-like divs + PascalCase filenames in question components | `QuestionCard.tsx`, `ChoiceButton.tsx`, `Feedback.tsx` | Open |
| FE-011 | Two competing focus ring patterns across codebase | 20+ files | Open |
| FE-012 | Missing focus-visible rings on text links | 8+ files | Open |
| FE-013 | Disabled opacity-60 instead of opacity-50 | `pricing-client.tsx`, `ChoiceButton.tsx` | Open |
| FE-015 | 9 copy-pasted error boundary files | All `error.tsx` files | Open |
| FE-016 | Card component defaults never used | `card.tsx` | Open |
| FE-017 | Loading skeleton radius mismatch | `page-loading.tsx` | Open |
| FE-018 | Missing `cn()` usage | `metallic-border.tsx`, `notification-provider.tsx` | Open |
| FE-019 | External link missing `target="_blank"` | `metallic-cta-button.tsx` | Open |
| FE-020 | Missing `error.tsx` for practice session route | `practice/[sessionId]/` | Open |
| FE-021 | No per-page metadata (all tabs show same title) | All page.tsx files | Open |
| FE-022 | Inconsistent stat card hover treatments | Dashboard vs session-summary | Open |
| FE-023 | Hover without transition-colors | `not-found.tsx`, `pricing-view.tsx`, `layout.tsx` | Open |
| FE-024 | Missing `font-heading`/`font-display` on pricing page | `pricing-view.tsx` | Open |
| FE-025 | Icon sizing `h-X w-X` instead of `size-X` | `metallic-cta-button.tsx`, `marketing-home.tsx`, `theme-toggle.tsx` | Open |

### P3 — Fix as encountered

| ID | Summary | Files | Status |
|----|---------|-------|--------|
| FE-026 | Repeated button labels missing `aria-label` context | `bookmarks/page.tsx`, `review/page.tsx`, `history-panel`, `exam-review` | Open |
| FE-027 | Feedback component missing `role="alert"` | `Feedback.tsx` | Open |
| FE-028 | No confirmation dialogs for destructive actions | App-wide | Open |
| FE-029 | Toast system underused (1 consumer) | App-wide | Open |
| FE-030 | Bookmark removal has no success feedback | `bookmarks/page.tsx` | Open |
| FE-031 | Inline hook logic in QuestionPageClient (240 lines) | `question-page-client.tsx` | Open |
| FE-032 | Clerk theme hardcoded to dark mode | `providers.tsx` | Open |
| FE-033 | No shared marketing layout | `/pricing` vs `/` | Open |
| FE-034 | Empty states lack helpful CTAs | Bookmarks, review, practice history | Open |
| FE-035 | Checkout success inline Stripe logic (405 lines) | `checkout/success/checkout-success-sync.tsx` | Open |
| FE-036 | 4 dead shadcn/ui components (0 consumers) | `avatar.tsx`, `dropdown-menu.tsx`, `radio-group.tsx`, `label.tsx` + test files | Open |
| FE-037 | `theme-toggle.tsx` uses raw `<button>` not `<Button>` | `theme-toggle.tsx` | Open |
| FE-038 | Card sub-components never imported by any consumer | `card.tsx` (CardHeader, CardTitle, etc.) | Open |

---

## Resolved Items

| ID | Summary | Resolution |
|----|---------|------------|
| FE-001 | God hook: `usePracticeSessionPageController` (was 306 lines, 14 state vars) | Refactored to 102 lines; logic extracted to `usePracticeSessionQuestionFlow`, `usePracticeQuestionBookmarks`, `usePracticeSessionMarkForReview` sub-hooks |
| FE-003 | God hook: `usePracticeSessionControls` (was 288 lines, 26 return props) | Refactored to 79 lines; logic extracted to `usePracticeSessionStart`, `usePracticeSessionTags`, `usePracticeIncompleteSession`, `usePracticeSessionHistory` sub-hooks. Still has 23 return props (composition hub). |
| FE-004 | God hook: `usePracticeQuestionFlow` (was 246 lines) | Refactored to 55 lines; logic extracted to `usePracticeQuestionAnswerFlow` and `usePracticeQuestionBookmarks` sub-hooks |
| FE-005 | Duplicated logic: 3 copies of loadNextQuestion, submitAnswer | Core logic extracted to shared `question-flow-actions.ts`; practice and practice-session logic files are now thin wrappers |
| FE-006 | Two competing `LoadState` type definitions | Unified via shared `load-state.ts` — `AsyncLoadState` and `AsyncLoadStateWithIdle` |
| FE-014 | Heading hierarchy skip (h1 to h3) in pricing | Fixed — now h1 > h2 > h3 |

---

## Next IDs

- Next frontend debt ID: **FE-039**
