# Question Feedback Analytics

Question feedback is exported through a human-operated, read-only script:

```bash
TEST_DATABASE_URL="$(pnpm exec tsx scripts/resolve-local-test-target.ts database-url)"
DATABASE_URL="$TEST_DATABASE_URL" pnpm --silent export:feedback > question-feedback.csv
DATABASE_URL="$TEST_DATABASE_URL" pnpm --silent export:feedback -- --format json > question-feedback.json
```

The command does not load `.env.local` or `.env`: `DATABASE_URL` must be supplied explicitly.
Local targets need no acknowledgement. A remote target is refused until `DB_TARGET_ACK` exactly
matches the value-free JSON named by the first refusal; use the same workflow documented in
[Deployment Procedure](./deployment-procedure.md). The redacted `Database target:` receipt and
privacy warnings go to stderr, while CSV or JSON remains on stdout.

Default exports redact `user_id` and exclude free-text comments. Raw user identifiers and comment
bodies require explicit opt-in flags and should only be used for local editorial analysis:

```bash
TEST_DATABASE_URL="$(pnpm exec tsx scripts/resolve-local-test-target.ts database-url)"
DATABASE_URL="$TEST_DATABASE_URL" pnpm --silent export:feedback -- --include-user-id > question-feedback-raw-users.csv
DATABASE_URL="$TEST_DATABASE_URL" pnpm --silent export:feedback -- --include-comments > question-feedback-comments.csv
```

Never run the export against a production database unless the output location and retention policy
are approved for possible PII/PHI.

## Current Helpful Rate Per Question

Latest rating per user/question wins. A null latest rating is a retraction and is excluded from the
helpful/not-helpful denominator.

```sql
WITH latest AS (
  SELECT DISTINCT ON (user_id, question_id)
         user_id, question_id, rating
  FROM question_feedback
  WHERE kind = 'rating'
  ORDER BY user_id, question_id, created_at DESC, id DESC
)
SELECT q.slug,
       COUNT(*) FILTER (WHERE latest.rating = 'helpful')     AS helpful,
       COUNT(*) FILTER (WHERE latest.rating = 'not_helpful') AS not_helpful,
       COUNT(*)                                             AS total_ratings,
       ROUND(
         COUNT(*) FILTER (WHERE latest.rating = 'helpful')::numeric
         / NULLIF(COUNT(*), 0),
         4
       ) AS helpful_rate
FROM latest
JOIN questions q ON q.id = latest.question_id
WHERE latest.rating IS NOT NULL
GROUP BY q.slug
ORDER BY not_helpful DESC, total_ratings DESC, q.slug;
```

## Top Reported Questions

```sql
SELECT q.slug,
       COUNT(*)                 AS report_count,
       MAX(qf.created_at)       AS most_recent_report_at
FROM question_feedback qf
JOIN questions q ON q.id = qf.question_id
WHERE qf.kind = 'report'
GROUP BY q.slug
ORDER BY report_count DESC, most_recent_report_at DESC, q.slug;
```

## Counts By Report Category

```sql
SELECT qf.category,
       COUNT(*) AS report_count
FROM question_feedback qf
WHERE qf.kind = 'report'
GROUP BY qf.category
ORDER BY report_count DESC, qf.category;
```

## Recent Comments

Comments are free text and may contain PII/PHI. Use this query only in approved local analysis
contexts; do not paste the result into logs, issue trackers, or PR comments.

```sql
SELECT qf.created_at,
       q.slug,
       qf.category,
       qf.comment
FROM question_feedback qf
JOIN questions q ON q.id = qf.question_id
WHERE qf.kind = 'report'
  AND qf.comment IS NOT NULL
  AND char_length(trim(qf.comment)) > 0
ORDER BY qf.created_at DESC, qf.id DESC
LIMIT 100;
```
