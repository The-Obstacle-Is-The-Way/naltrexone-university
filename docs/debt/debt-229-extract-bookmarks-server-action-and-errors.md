# DEBT-229: Extract Server Action and Error Handling From bookmarks/page.tsx

**Status:** Open
**Priority:** P3
**Date:** 2026-02-18
**Last Verified:** 2026-02-18
**Parent:** [DEBT-224](debt-224-file-size-audit-production-and-test.md)
**Component:** `app/(app)/app/bookmarks/page.tsx`

---

## Description

`bookmarks/page.tsx` is **322 lines** and currently mixes three concerns:

1. **Server action** (`removeBookmarkAction`) — async mutation logic
2. **Error handling** (`parseRemoveBookmarkErrorCode`, `getRemoveBookmarkErrorMessage`) — error code parsing and user-facing messages
3. **View components** (`BookmarksView`, `renderBookmarks`, `createBookmarksPage`) — rendering logic

Server actions and error-code-to-message maps are reusable patterns that should not live inside page components.

**Disposition:** B - Multiple responsibilities should be split.

## Impact

- Server action is not reusable from other pages
- Error handling code is boilerplate mixed with rendering
- File slightly exceeds 300-line production guideline

## Why This Is Worth Fixing

- **Robustness gain:** action/error logic becomes reusable and independently testable.
- **Complexity risk to avoid:** avoid over-fragmentation; keep only three focused modules.

## Resolution

Extract into focused modules:

```
app/(app)/app/bookmarks/
  page.tsx                    (~150 lines — view + createBookmarksPage factory)
  bookmarks-actions.ts        (~50 lines — removeBookmarkAction server action)
  bookmarks-errors.ts         (~40 lines — error code parsing + messages)
```

Keep the `createBookmarksPage` factory pattern in `page.tsx` as the main export.

Guardrail: do not introduce a new abstraction layer beyond the two extracted modules (`bookmarks-actions.ts`, `bookmarks-errors.ts`).

## Verification

- [ ] `removeBookmarkAction` extracted to `bookmarks-actions.ts`
- [ ] Error parsing extracted to `bookmarks-errors.ts`
- [ ] `page.tsx` under 300 lines
- [ ] Bookmark removal still works end-to-end
- [ ] `pnpm test --run` passes
- [ ] `pnpm typecheck` passes

## Related

- [DEBT-224](debt-224-file-size-audit-production-and-test.md) - Parent file-size audit
