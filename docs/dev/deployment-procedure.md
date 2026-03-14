# Deployment Procedure

> **Parent:** [Deployment Environments](./deployment-environments.md)
> **Last Updated:** 2026-03-14

---

## 1. Key Fact: Vercel Does Not Run Migrations or Seeds

Vercel deploys **code only**. It does not automatically:

- Run `pnpm db:migrate` (schema changes)
- Run `pnpm db:seed` (content data)
- Execute any SQL scripts

These are always manual operator steps, run from a local machine with the appropriate `DATABASE_URL`.

---

## 2. Standard Deployment Flow

```text
1. CI (GitHub Actions)
   └─ pnpm typecheck && pnpm lint && pnpm test --run && pnpm build
   └─ Must pass before merge

2. Vercel (automatic on push/merge)
   └─ Builds and deploys the application code
   └─ Preview: any non-main branch
   └─ Production: main branch

3. Operator (manual, post-deploy)
   └─ DATABASE_URL="<target>" pnpm db:migrate   # if schema changed
   └─ DATABASE_URL="<target>" pnpm db:seed      # if content changed
```

---

## 3. Data-Affecting Migration Pattern

When a migration changes enums, renames columns, or otherwise affects data that the seed script populates (e.g., tag taxonomy changes), the migration SQL itself should include the necessary data cleanup. This keeps the procedure to two commands:

```bash
# 1. Apply schema migration (includes any required data cleanup)
DATABASE_URL="<target>" pnpm db:migrate

# 2. Rebuild data from canonical source (MDX files)
DATABASE_URL="<target>" pnpm db:seed

# 3. Verify (optional — recommended for production)
#    SELECT kind, COUNT(*) FROM tags GROUP BY kind;
```

**Design principle:** Migrations that affect seed-managed tables (like `tags`, `question_tags`) should delete the derived rows as part of the migration SQL, so no manual cleanup is needed. The seed script rebuilds them from the canonical MDX source files. See SPEC-033 §14 for a concrete example.

**For additive-only migrations** (new columns, new tables, new enum values), `pnpm db:migrate` alone is sufficient — no reseed needed unless the seed populates the new columns.

---

## 4. Per-Environment Connection

| Environment | How to Connect | DATABASE_URL Source |
|-------------|---------------|---------------------|
| **Local** | Direct (already in `.env.local`) | `.env.local` |
| **Preview** | Neon `dev` branch | `neonctl connection-string dev --project-id summer-math-94727887 --pooled` |
| **Production** | Neon `main` branch | `neonctl connection-string main --project-id summer-math-94727887 --pooled` |

Example for preview/production:

```bash
DATABASE_URL="$(neonctl connection-string dev --project-id summer-math-94727887 --pooled)" pnpm db:migrate
DATABASE_URL="$(neonctl connection-string dev --project-id summer-math-94727887 --pooled)" pnpm db:seed
```

**Caution:** Always double-check which branch you're targeting. Running migrations or seeds against the wrong branch can corrupt data. Production operations should be done deliberately and verified immediately.

---

## 5. Pre-Deployment Checklist

Before merging to `main` (production deploy):

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test --run` passes
- [ ] `pnpm test:integration` passes
- [ ] `pnpm build` passes
- [ ] CodeRabbit review completed and feedback addressed
- [ ] If schema changed: migration tested on local + preview DB first
- [ ] If schema changed: `pnpm db:migrate` run against target Neon branch **immediately after deploy** (forgetting this causes silent write failures — see [Known Gotchas](./deployment-environments.md#missing-database-migration-causes-silent-write-failures))
- [ ] If content changed: seed tested on local + preview DB first

---

## 6. Branch Sync After Merging to Main

After merging a PR to `main`, the `dev` branch falls behind. To keep them in sync:

```bash
git checkout dev
git merge main        # Fast-forward if no divergence
git push origin dev
```

This is especially important when the PR included **migrations** — without syncing, any clone on `dev` will have an incomplete migration journal, which can cause confusion (the DB has the tables, but the local journal doesn't know about them).

**Rule of thumb:** Always sync `dev` with `main` after every PR merge. The merge is always a fast-forward because PRs target `main` and `dev` doesn't diverge.

---

## 7. Seeding from Multiple Clones

The seed script is fully idempotent. See [Content Pipeline §16: Seed Idempotency and Multi-Clone Safety](../practice-engine/content-pipeline.md#16-seed-idempotency-and-multi-clone-safety) for the full explanation.

**Key points:**
- The `slug` field is the stable identity key — same slug = same question across any clone or DB
- SHA256 hashing skips unchanged questions entirely (zero writes)
- Seeding the same content from different clones is a no-op
- The only risk is seeding from a clone with *older* imported MDX, which would downgrade content

---

## Related

- [Deployment Environments](./deployment-environments.md) — Env var scoping, Clerk/Stripe/Neon config
- [Content Pipeline](../practice-engine/content-pipeline.md) — MDX → seed → DB flow
- [SPEC-033 §14](../specs/spec-033-tag-taxonomy-migration.md) — Tag taxonomy DB sync procedure
