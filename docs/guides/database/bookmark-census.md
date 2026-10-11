# Monthly Bookmark Cardinality Census

**Last Updated:** 2026-07-22

This read-only monthly census supplies the cardinality limb of the parked
[DEBT-450 Part 3b](../_archive/debt/debt-450-hot-path-query-efficiency.md)
bookmark-pagination trigger. It reports aggregate counts only and must never
emit user or bookmark identifiers.

## Safety boundary

- Verify the intended Neon environment by its human-readable project/branch
  label before connecting. Do not print or record the connection URL.
- Prefer a read-only database role. The SQL also opens an explicit read-only
  transaction and applies a local statement timeout.
- Run only the query below. Do not add user, email, question, or bookmark IDs
  to its projection.
- Record only the UTC observation date, the environment label, and the three
  aggregate result columns. Never commit a raw terminal transcript containing
  credentials or identifiers.

## Monthly query

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

SHOW transaction_read_only;

WITH bookmark_counts AS (
  SELECT
    user_id,
    COUNT(*)::bigint AS bookmark_count
  FROM bookmarks
  GROUP BY user_id
)
SELECT
  COUNT(*)::bigint AS users_with_bookmarks,
  COALESCE(MAX(bookmark_count), 0)::bigint AS max_bookmarks_for_one_user,
  COUNT(*) FILTER (WHERE bookmark_count >= 500)::bigint
    AS users_at_or_above_500
FROM bookmark_counts;

ROLLBACK;
```

Require `transaction_read_only` to be `on`. The parked pagination trigger fires
when `users_at_or_above_500` is greater than zero. A zero result does not alter
the separate sampled-latency limb: after the shipped width fix, seven
consecutive days with `action.getBookmarks` p95 at or above 300 ms also revives
Part 3b.

## Evidence record

Append a dated observation to DEBT-450 with this shape:

```text
YYYY-MM-DD UTC — <environment label>; transaction_read_only=on;
users_with_bookmarks=<count>; max_bookmarks_for_one_user=<count>;
users_at_or_above_500=<count>; trigger=<fired|not fired>.
```
