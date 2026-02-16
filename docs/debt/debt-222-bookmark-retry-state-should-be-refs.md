# DEBT-222: Bookmark Idempotency Key Should Use `useRef` Instead of `useState`

**Priority:** P4
**Status:** Open
**Found:** 2026-02-16
**Component:** Frontend — Practice Session Bookmarks Hook

---

## Summary

`bookmarkIdempotencyKey` is stored as `useState` but it only drives internal logic (idempotency key for server calls). It never appears in rendered output, so updating it causes an unnecessary re-render.

**Note:** `bookmarkRetryCount` was originally included in this ticket but it **cannot** be converted to a ref — it is used as a `useEffect` dependency (line 57) to trigger bookmark re-fetching on retry. Removing it from the dependency array would break the retry mechanism.

## Affected File

- `app/(app)/app/practice/hooks/use-practice-question-bookmarks.ts:42-44`

```typescript
const [bookmarkIdempotencyKey, setBookmarkIdempotencyKey] = useState<
  string | null
>(null);
```

## Why `bookmarkRetryCount` Must Stay as State

`bookmarkRetryCount` is an effect dependency at line 57:

```typescript
useEffect(() => {
  return createBookmarksEffect({
    bookmarkRetryCount,
    // ...
  });
}, [bookmarkRetryCount]); // <-- triggers effect re-run on retry
```

Converting to a ref would silently break retries — `useEffect` does not re-run when refs change.

## Suggested Fix

Replace only `bookmarkIdempotencyKey` with `useRef`:

```typescript
const bookmarkIdempotencyKeyRef = useRef<string | null>(null);
```

Update `onToggleBookmark` callback and `toggleBookmarkForQuestion` call to use `.current` instead of the setter.

## Acceptance Criteria

- [ ] `bookmarkIdempotencyKey` stored as ref instead of state
- [ ] `bookmarkRetryCount` remains as `useState` (effect dependency)
- [ ] No unnecessary re-renders triggered by idempotency key updates
- [ ] Existing bookmark behavior unchanged
- [ ] Tests continue to pass

---

## Related

- `bookmark-message-timeout.ts` — related bookmark timing logic
- `practice-page-logic.ts:203-204` — sets next idempotency key after toggle
