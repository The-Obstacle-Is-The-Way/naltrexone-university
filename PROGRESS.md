# Naltrexone University - Progress Tracker

**Last Updated:** 2026-01-31
**Current Slice:** SLICE-0 (Foundation)
**Purpose:** State file for Ralph Wiggum loop (see `docs/_ralphwiggum/protocol.md`)

---

## Active Queue

### Phase 1: SLICE-0 Foundation Setup

- [ ] **SLICE-0-01**: Initialize Next.js 16+ with TypeScript strict mode → `docs/specs/master_spec.md` Section 3
- [ ] **SLICE-0-02**: Configure pnpm as package manager → `docs/specs/master_spec.md` Section 3
- [ ] **SLICE-0-03**: Install and configure Biome for linting/formatting → `docs/specs/master_spec.md` Section 3
- [ ] **SLICE-0-04**: Install Tailwind CSS v4 with PostCSS → `docs/specs/master_spec.md` Section 3
- [ ] **SLICE-0-05**: Install shadcn/ui base components → `docs/specs/master_spec.md` Section 3
- [ ] **SLICE-0-06**: Configure Clerk authentication → `docs/specs/master_spec.md` Section 3
- [ ] **SLICE-0-07**: Set up Drizzle ORM with Neon Postgres schema → `docs/specs/master_spec.md` Section 3
- [ ] **SLICE-0-08**: Create landing page with auth buttons → `docs/specs/master_spec.md` Section 3
- [ ] **SLICE-0-09**: Implement protected dashboard route → `docs/specs/master_spec.md` Section 3
- [ ] **SLICE-0-10**: Configure Vitest for unit testing → `docs/specs/master_spec.md` Section 3
- [ ] **SLICE-0-11**: Set up CI pipeline (GitHub Actions) → `docs/specs/master_spec.md` Section 3

### Phase 2: SLICE-1 Stripe + Question CRUD (Future)

_Tasks will be added when SLICE-0 is complete_

---

## Work Log

- 2026-01-31: **[START]** Initialized PROGRESS.md for Ralph Wiggum loop. SLICE-0 tasks derived from master_spec.md.

---

## Completion Criteria

**SLICE-0 is complete when:**
- All Phase 1 items are `[x]`
- Quality gates pass: `pnpm biome check .`, `pnpm tsc --noEmit`, `pnpm test`
- Clean git working tree
- App runs locally with Clerk auth working
