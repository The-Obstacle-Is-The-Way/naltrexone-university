# DEBT-222: Bookmark Retry/Idempotency State Should Use `useRef` Instead of `useState`

**Priority:** P4
**Status:** Open
**Found:** 2026-02-16
**Component:** Frontend — Practice Session Bookmarks Hook

---

## Summary

`bookmarkRetryCount` and `bookmarkIdempotencyKey` are stored as `useState` but they only drive internal logic (retry count, idempotency key for server calls). They never appear in rendered output, so updating them causes unnecessary re-renders.

## Affected File

- `app/(app)/app/practice/hooks/use-practice-question-bookmarks.ts:41-44`

```typescript
const [bookmarkRetryCount, setBookmarkRetryCount] = useState(0);
const [bookmarkIdempotencyKey, setBookmarkIdempotencyKey] = useState<
  string | null
>(null);
```

## Suggested Fix

Replace with `useRef`:

```typescript
const bookmarkRetryCountRef = useRef(0);
const bookmarkIdempotencyKeyRef = useRef<string | null>(null);
```

Update all consumers to use `.current` instead of setter functions.

## Acceptance Criteria

- [ ] Both values stored as refs instead of state
- [ ] No unnecessary re-renders triggered by retry/idempotency updates
- [ ] Existing bookmark behavior unchanged
- [ ] Tests continue to pass

---

## Related

- `bookmark-message-timeout.ts` — related bookmark timing logic
