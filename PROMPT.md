# Naltrexone University - Ralph Wiggum Loop Prompt

You are building **Naltrexone University**, a subscription-based SaaS question bank for Addiction Psychiatry and Addiction Medicine board exam preparation.

---

## ⚠️ MANDATORY: Test-Driven Development (Uncle Bob / Robert C. Martin)

**ALL CODE MUST BE TEST-DRIVEN. NO EXCEPTIONS.**

Before writing ANY implementation code:
1. **Write the test first** (Red)
2. **Write minimum code to pass** (Green)
3. **Refactor if needed** (Refactor)

**Core Principles:**
- **SOLID** - Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion
- **DRY** - Don't Repeat Yourself. Single source of truth for every concept.
- **Clean Architecture** - Domain → Application → Adapters → Infrastructure. Dependencies point inward only.
- **Clean Code** - Meaningful names, small functions, minimal complexity, explicit error handling.
- **Gang of Four Patterns** - Repository, Factory, Strategy, Composition Root where they add clarity.
- **Fakes over Mocks** - In-memory fakes for testing, not jest.mock().

**If you're about to write implementation code without a failing test, STOP.**

---

## Headless Execution

This prompt runs headless via one of these agents:

### Claude Code (Default)
```bash
while true; do
  claude --dangerously-skip-permissions -p "$(cat PROMPT.md)"
  sleep 2
done
```

### Codex CLI (OpenAI Alternative)
```bash
while true; do
  codex exec --full-auto "$(cat PROMPT.md)"
  sleep 2
done
```

See `docs/_ralphwiggum/protocol.md` for full setup and agent options.

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

## TDD Workflow (MANDATORY When Writing Code)

**Every code change follows Red → Green → Refactor:**

1. **RED**: Write a failing test that describes the expected behavior
2. **GREEN**: Write the minimum code to make the test pass
3. **REFACTOR**: Clean up while keeping tests green

**Testing Philosophy:**
- Test behavior, not implementation details
- Use in-memory fakes, not jest.mock()
- Only mock true external services (Clerk, Stripe, Neon)
- Domain and application layers must be 100% unit testable without infrastructure
- Characterization tests for legacy/existing code before refactoring

**If you wrote code without a test, go back and write the test first.**

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
4. **TDD: Write tests BEFORE implementation (Red → Green → Refactor)**
5. **SOLID/DRY/Clean Code principles always**
6. **Quality gates must pass**
7. **Mark task complete in PROGRESS.md**
8. **Commit before exit**
9. **Follow master_spec.md exactly**

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
