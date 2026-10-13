# Sanitized EXPLAIN Capture

**Last Updated:** 2026-07-22

Use this procedure only after a parked DEBT-450 latency/share trigger calls for
query-plan evidence. It captures `EXPLAIN (ANALYZE, BUFFERS)` for an exact
read-only query shape without putting identifiers, bound values, credentials,
or user data into the durable evidence.

## Safety boundary

- Verify the intended production-like Neon environment by its human-readable
  project/branch label. Never print or record the connection URL.
- Prefer a read-only role. Also require an explicit read-only transaction,
  short local lock/statement bounds, and a `SELECT`-only prepared statement.
- Never run `EXPLAIN ANALYZE` on `INSERT`, `UPDATE`, `DELETE`, `MERGE`, DDL, a
  data-modifying CTE, or a function with writes. `ROLLBACK` is not permission to
  execute a mutating plan.
- Keep the representative user/filter values private. Do not paste them into a
  debt doc, PR, issue, Sentry attribute, command-line argument, or committed
  artifact.
- Save the raw plan only to a local temporary path. Commit only a reviewed,
  sanitized summary or plan whose denylist checks are clean.

## Capture

Translate the current Drizzle statement into an equivalent parameterized
`SELECT`; do not simplify joins, predicates, ordering, limits, or window
functions. Use PostgreSQL parameters for every representative value. In `psql`,
capture with this template. Create the output path securely first, pass it into
`psql`, and keep the cleanup trap active until the reviewed sanitized artifact
has been produced:

```bash
DEBT462_EXPLAIN_RAW="$(mktemp -t debt-462-explain-raw.XXXXXX)"
chmod 600 "$DEBT462_EXPLAIN_RAW"
trap 'rm -f -- "$DEBT462_EXPLAIN_RAW"' EXIT

psql --set=debt462_explain_raw="$DEBT462_EXPLAIN_RAW"
```

```sql
\set ECHO none
\pset format unaligned
\pset tuples_only on
\prompt 'Representative user UUID (kept local): ' debt462_user_id

BEGIN TRANSACTION READ ONLY;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL plan_cache_mode = force_generic_plan;

SHOW transaction_read_only;

PREPARE debt_462_probe(uuid) AS
  SELECT
    /* exact current read projection */
  FROM /* exact current read-only relations */
  WHERE user_id = $1
  /* exact current joins, filters, ranking, ordering, limit, and offset */;

\o :debt462_explain_raw
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
EXECUTE debt_462_probe(:'debt462_user_id');
\o

DEALLOCATE debt_462_probe;
ROLLBACK;
```

`plan_cache_mode = force_generic_plan` keeps the durable plan parameterized as
`$1` rather than embedding the representative identifier. Confirm
`transaction_read_only` is `on`. If the statement hits either timeout, stop and
record the timeout as evidence; do not raise the bounds casually on a live
target.

## Sanitize and record

Review a copy of the raw local file before sharing it. The durable evidence must
contain none of the following:

- UUIDs, provider/customer/session/question/attempt IDs, emails, IP addresses,
  or other PII;
- bound parameter values or query-string values;
- database connection URLs, hosts, credentials, tokens, DSNs, or environment
  variable values;
- row payloads, raw application errors, stack/cause text, or PostgreSQL
  detail/hint fields.

The reviewed record may retain the parameterized query shape, relation/index
names, node types, actual/planned row counts, loop counts, execution time,
shared/local/temp buffer counts, sort method/memory, and the UTC observation
date plus human-readable environment label.

For DEBT-450 Part 5, capture separate sanitized plans for
`listAttemptedQuestionsByUserId` and `countAttemptedQuestionsByUserId`, then
state for each whether the duplicate latest-attempt window ranking/sort nodes
dominate execution time or buffer work. Both plans are required even if the
Sentry/Neon threshold already fired. For Part 4, no index is authorized unless
this procedure shows that the measured query shape and plan justify it.

After the sanitized artifact passes the denylist checks, remove the raw plan
and clear the trap without leaving the current shell:

```bash
rm -f -- "$DEBT462_EXPLAIN_RAW"
trap - EXIT
```
