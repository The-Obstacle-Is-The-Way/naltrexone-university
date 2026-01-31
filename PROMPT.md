# Naltrexone University - Ralph Wiggum Loop Prompt

You are building **Naltrexone University**, a subscription-based SaaS question bank for Addiction Psychiatry and Addiction Medicine board exam preparation.

This prompt runs headless via:

```bash
while true; do
  claude --dangerously-skip-permissions -p "$(cat PROMPT.md)"
  sleep 2
done
```

If `PROGRESS.md` has no unchecked items, exit cleanly without making changes.

---

## First Action: Read State

**IMMEDIATELY** read state files:

```bash
cat PROGRESS.md
cat docs/specs/master_spec.md
```

---

## Your Task This Iteration

1. Find the **FIRST** unchecked `[ ]` item in PROGRESS.md
   - If there are no unchecked items, exit cleanly (do not invent new tasks)
2. Read the corresponding section in `docs/specs/master_spec.md`
3. Complete that ONE item fully
4. Check off the item in PROGRESS.md: `[ ]` → `[x]`
5. Append a short entry to PROGRESS.md "Work Log" (what changed)
6. **RUN QUALITY GATES** (all must pass)
7. **ATOMIC COMMIT** (see format below)
8. **VERIFY** no unstaged changes remain
9. Exit

**DO NOT** attempt multiple tasks. One task per iteration.
**DO NOT** exit without committing.
**DO NOT** exit with unstaged changes.

---

## Tech Stack Reference

- **Framework:** Next.js 16+ with App Router
- **Language:** TypeScript (strict mode)
- **Auth:** Clerk
- **Payments:** Stripe
- **Database:** Drizzle ORM + Neon Postgres
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Package Manager:** pnpm
- **Linter/Formatter:** Biome
- **Testing:** Vitest + Playwright

---

## Quality Gates (MUST PASS)

Before marking ANY task complete:

```bash
pnpm biome check .          # Lint + Format (fix: pnpm biome check . --write)
pnpm tsc --noEmit           # TypeScript type check
pnpm test                   # Tests (when they exist)
```

If ANY check fails, fix it before proceeding.

---

## TDD Workflow (When Writing Code)

1. **RED**: Write test first (expect it to fail)
2. **GREEN**: Write minimal code to pass
3. **REFACTOR**: Clean up, keep tests green

**Prefer testing behavior over implementation.**
**Minimal mocks** - only mock external services (Clerk, Stripe, Neon).

---

## Atomic Commit Format

```bash
git add -A && git commit -m "$(cat <<'EOF'
[TASK-ID] Brief description

- What was implemented
- Tests added (if any)
- Quality gates passed
EOF
)"
```

**Examples:**
- `[SLICE-0-01] Initialize Next.js 16+ with TypeScript strict`
- `[SLICE-0-06] Configure Clerk authentication`
- `[SLICE-1-03] Add Question CRUD API routes`

---

## Before Exit Checklist (MANDATORY)

```bash
# 1. Run ALL quality gates
pnpm biome check .
pnpm tsc --noEmit
pnpm test                   # Skip if no tests yet

# 2. Stage ALL changes
git add -A

# 3. Verify nothing unstaged
git status                  # Should show all staged or clean

# 4. Commit
git commit -m "[TASK-ID] Brief description"
```

**CRITICAL - Do NOT exit if:**
- `git status` shows unstaged changes
- Any quality gate failed
- You haven't committed

If you made no changes (no active tasks), exit without committing.

---

## Guardrails

1. **ONE task per iteration**
2. **Read PROGRESS.md first**
3. **Read master_spec.md for task details**
4. **Quality gates must pass**
5. **Mark task complete in PROGRESS.md**
6. **Commit before exit**
7. **Follow master_spec.md exactly**

---

## File Locations

- Master Spec: `docs/specs/master_spec.md`
- Progress: `PROGRESS.md` (root)
- Source: `app/`, `lib/`, `components/`
- Tests: `__tests__/`, `*.test.ts`
- Config: `biome.json`, `drizzle.config.ts`, `tailwind.config.ts`

---

## Completion

When ALL items in PROGRESS.md are checked AND all quality gates pass, exit cleanly.

The loop operator verifies via PROGRESS.md state (checking for `[ ]`), not by parsing output.

**Do NOT claim completion prematurely.**
