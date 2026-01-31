# Ralph Wiggum Protocol

> "Ralph is a Bash loop" - Geoffrey Huntley

---

## What is the Ralph Wiggum Technique?

The Ralph Wiggum technique is an iterative AI development methodology where the **same prompt is run repeatedly** until objective completion criteria are met. Each iteration sees its **previous work in files and git history**, enabling self-correction and incremental progress.

Named after Ralph Wiggum from The Simpsons, it embodies the philosophy: **persistent iteration beats one-shot perfection**.

### Core Principle

```bash
while true; do
  <ai-agent> -p "$(cat PROMPT.md)"
  sleep 2
done
```

That's it. A bash loop that feeds an AI agent the same prompt repeatedly. The agent reads state files, picks up where it left off, completes one task, commits, and exits. The loop restarts with fresh context.

### Why It Works

- **Same prompt, repeated** = Iteration beats one-shot perfection
- **State tracked in files** = Progress persists across iterations (PROGRESS.md)
- **Atomic commits** = Easy to audit, revert, or cherry-pick
- **Sandboxed branch** = Safe experimentation
- **Fresh context each iteration** = Reduces context drift and hallucination

### Key Quote

> "Deterministically bad in an undeterministic world" - failures are predictable, enabling systematic improvement through prompt tuning.

---

## Supported Agents (Model-Agnostic)

This protocol works with any AI coding agent that supports headless mode:

| Agent | Headless Command | Notes |
|-------|------------------|-------|
| **Claude Code** | `claude -p "..." --dangerously-skip-permissions` | Default. Add `--output-format stream-json` for CI |
| **Codex CLI** | `codex exec --full-auto "..."` | Uses `exec` subcommand for non-interactive |
| **OpenCode** | `opencode --auto-approve -p "..."` | Community alternative |

### Claude Code (Default)

```bash
# Basic headless execution
claude -p "$(cat PROMPT.md)" --dangerously-skip-permissions

# With JSON output for CI/CD
claude -p "$(cat PROMPT.md)" --dangerously-skip-permissions --output-format stream-json

# With budget limit
claude -p "$(cat PROMPT.md)" --dangerously-skip-permissions --max-budget-usd 5.00
```

### Codex CLI (OpenAI)

```bash
# Headless authentication (run once)
codex login --device-auth

# Non-interactive execution with full-auto approval
codex exec --full-auto "$(cat PROMPT.md)"

# With suggest mode (safer, requires approval)
codex exec --suggest "$(cat PROMPT.md)"
```

The loop script (`scripts/ralph-loop.sh`) defaults to Claude Code but can be configured via environment variable:

```bash
# Use Codex CLI instead
RALPH_AGENT="codex" ./scripts/ralph-loop.sh start

# Use OpenCode
RALPH_AGENT="opencode" ./scripts/ralph-loop.sh start
```

---

## Prerequisites

### Tools Required

```bash
# Claude Code CLI (default) - Anthropic's official CLI
npm install -g @anthropic-ai/claude-code

# OR Codex CLI (OpenAI) - As of Jan 2026, uses gpt-5.2-codex model
npm install -g @openai/codex@latest
codex login --device-auth  # Headless-compatible auth

# tmux (for persistent sessions)
brew install tmux  # macOS
apt install tmux   # Linux

# jq (JSON parsing for advanced scripts)
brew install jq    # macOS
apt install jq     # Linux
```

### Project Requirements

1. **State file** (`PROGRESS.md`) - Tracks what's done/pending
2. **Prompt file** (`PROMPT.md`) - Instructions for each iteration
3. **Spec docs** (`docs/specs/`) - Detailed requirements for each task
4. **Git repo** - For atomic commits and history

---

## Setup Protocol

### Step 1: Create Branch Structure

**CRITICAL:** Always sandbox Ralph work in a dedicated branch.

```bash
# Start from main
git checkout main
git pull origin main

# Create Ralph branch (all autonomous work happens here)
git checkout -b naltrexone-ralph

# Push to remote for backup
git push -u origin naltrexone-ralph
```

**Branch hierarchy:**
```text
main (protected, production)
  └── naltrexone-ralph (autonomous work, merge via PR)
```

### Step 2: Create State File (PROGRESS.md)

This is the **brain** of the loop. Each iteration reads this to find the next task.

```bash
# Create in project root
touch PROGRESS.md
```

**Template:**

```markdown
# Naltrexone University - Progress Tracker

**Last Updated:** YYYY-MM-DD
**Current Slice:** SLICE-X
**Purpose:** State file for Ralph Wiggum loop

---

## Current Phase: [Phase Name]

- [ ] **TASK-001**: Description → See `docs/specs/master_spec.md` Section X
- [ ] **TASK-002**: Description → See `docs/specs/master_spec.md` Section Y
- [ ] **TASK-003**: Description → See `docs/specs/master_spec.md` Section Z

---

## Work Log

- YYYY-MM-DD: Entry (what changed)

---

## Completion Criteria

When ALL boxes are checked AND quality gates pass, the phase is complete.
```

### Step 3: Create Prompt File (PROMPT.md)

This is fed to the AI each iteration.

```bash
# Create in project root
touch PROMPT.md
```

**Template for Naltrexone University:**

```markdown
# Naltrexone University - Ralph Wiggum Loop Prompt

You are building Naltrexone University, a subscription-based SaaS question bank for Addiction Psychiatry and Addiction Medicine board exam preparation.

This prompt runs headless via:

\`\`\`bash
while true; do
  claude --dangerously-skip-permissions -p "$(cat PROMPT.md)"
  sleep 2
done
\`\`\`

## First Action: Read State

**IMMEDIATELY** read state files:
\`\`\`bash
cat PROGRESS.md
cat docs/specs/master_spec.md
\`\`\`

## Your Task This Iteration

1. Find the **FIRST** unchecked `[ ]` item in PROGRESS.md
2. Complete that ONE item fully
3. Check off the item: `[ ]` → `[x]`
4. **RUN QUALITY GATES** (all must pass)
5. **ATOMIC COMMIT** (see format below)
6. **VERIFY** no unstaged changes remain
7. Exit

**DO NOT** attempt multiple tasks. One task per iteration.
**DO NOT** exit without committing.
**DO NOT** exit with unstaged changes.

## Before Exit Checklist (MANDATORY)

\`\`\`bash
# 1. Run ALL quality gates
pnpm biome check .          # Lint and format (fix: pnpm biome check . --write)
pnpm tsc --noEmit           # Type check
pnpm test                   # All tests pass (when tests exist)

# 2. Stage ALL changes
git add -A

# 3. Verify nothing unstaged
git status  # Should show all staged or clean

# 4. Commit
git commit -m "[TASK-ID] Brief description"
\`\`\`

**If ANY step fails:** Fix it before exiting. Never exit with failing gates or unstaged changes.

## Atomic Commit Format

\`\`\`bash
git add -A && git commit -m "[TASK-ID] Type: description

- What was done
- Tests added/updated
- Quality gates passed"
\`\`\`

## Quality Gates (MUST PASS)

\`\`\`bash
pnpm biome check .          # Lint + Format
pnpm tsc --noEmit           # TypeScript
pnpm test                   # Tests (when they exist)
\`\`\`

## Guardrails

1. ONE task per iteration
2. Tests first (TDD) when applicable
3. Quality gates must pass
4. Read PROGRESS.md first
5. Mark task complete before exit
6. Commit before exit
7. Follow master_spec.md exactly

## Reference

- Master Spec: `docs/specs/master_spec.md`
- Tech Stack: Next.js 16+, Clerk, Stripe, Drizzle/Neon, Tailwind v4, shadcn/ui
- Package Manager: pnpm
- Linter/Formatter: Biome

## Completion

When ALL items in PROGRESS.md are checked AND quality gates pass, exit cleanly.

**CRITICAL:** Do not claim completion prematurely. The loop operator verifies
via PROGRESS.md state, not by parsing your output for magic phrases.
```

### Step 4: Create Loop Script

```bash
mkdir -p scripts
touch scripts/ralph-loop.sh
chmod +x scripts/ralph-loop.sh
```

**Script content:** (see `scripts/ralph-loop.sh`)

### Step 5: Start tmux Session

```bash
# Create named session
tmux new-session -s naltrexone-ralph

# Or attach to existing
tmux attach -t naltrexone-ralph

# Detach without killing: Ctrl+B, then D
# Kill session: tmux kill-session -t naltrexone-ralph
```

### Step 6: Run the Loop

Inside tmux:

#### Option A: Simple YOLO Loop (Recommended)

```bash
cd /Users/ray/Desktop/github/naltrexone-university
git checkout naltrexone-ralph

# THE CLASSIC RALPH LOOP
while true; do
  claude --dangerously-skip-permissions -p "$(cat PROMPT.md)"
  sleep 2
done
```

#### Option B: With Iteration Limit and State-Based Completion

```bash
MAX=50
for i in $(seq 1 $MAX); do
  echo "=== Iteration $i/$MAX ==="
  claude --dangerously-skip-permissions -p "$(cat PROMPT.md)"
  # Check state file (prevents reward hacking)
  if ! grep -q "^\- \[ \]" PROGRESS.md; then
    echo "All tasks complete!"
    break
  fi
  sleep 2
done
```

#### Option C: Using the Convenience Script

```bash
# Start (creates/attaches tmux session)
./scripts/ralph-loop.sh start

# Check status
./scripts/ralph-loop.sh status

# Stop
./scripts/ralph-loop.sh stop
```

#### Option D: Codex CLI (OpenAI Alternative)

```bash
# First-time setup: authenticate for headless use
codex login --device-auth

# The loop
MAX=50
for i in $(seq 1 $MAX); do
  echo "=== Iteration $i/$MAX ==="
  codex exec --full-auto "$(cat PROMPT.md)"
  if ! grep -q "^\- \[ \]" PROGRESS.md; then
    echo "All tasks complete!"
    break
  fi
  sleep 2
done
```

---

## Stop Conditions

The loop should stop when:

1. **Iteration limit reached** - Always set `MAX` in your loop
2. **All tasks complete** - Check `PROGRESS.md` for all `[x]` markers
3. **Manual intervention** - Ctrl+C when needed

**IMPORTANT: Do NOT use magic completion phrases.**

Avoid instructing the model to output phrases like "PROJECT COMPLETE". This creates reward hacking risk. Instead, verify completion via state file:

```bash
# Check if all tasks are marked complete
if ! grep -q "^\- \[ \]" PROGRESS.md; then
  echo "All tasks complete"
  break
fi
```

---

## Monitoring

### Watch Progress

```bash
# In another terminal/tmux pane
watch -n 5 'head -50 PROGRESS.md'

# Or check git activity
watch -n 5 'git log --oneline -10'
```

Note: `watch` is not installed by default on macOS. Use `brew install watch`.

### Check Loop Status

```bash
# See recent commits
git log --oneline -20

# See what changed
git diff HEAD~1

# Check test status (when tests exist)
pnpm test
```

---

## Post-Loop Audit

### Review All Changes

```bash
# See all commits from Ralph
git log main..naltrexone-ralph --oneline

# See full diff
git diff main..naltrexone-ralph

# Review specific commit
git show <commit-hash>
```

### Run Quality Gates

```bash
pnpm biome check .
pnpm tsc --noEmit
pnpm test
```

### Merge if Good

```bash
# Open PR for review (recommended)
gh pr create --base main --head naltrexone-ralph

# Or merge directly after review
git checkout main
git merge naltrexone-ralph
git push origin main
```

### Revert if Bad

```bash
# Nuclear option - delete branch entirely
git checkout main
git branch -D naltrexone-ralph

# Or revert specific commits
git revert <bad-commit-hash>
```

---

## Safety Philosophy

**Your real safety net is the sandboxed branch:**

- All work happens on `naltrexone-ralph`
- Main branch is untouched
- You can always `git checkout main && git branch -D naltrexone-ralph`
- Audit commits before merging

**Tool restrictions are optional paranoia.** If you're in a sandboxed branch:
- `--dangerously-skip-permissions` is fine
- The worst case is you delete the branch and start over

---

## Best Practices

### DO

- Always sandbox in dedicated branch
- Use detailed specs for each task
- Require atomic commits
- Set clear completion criteria
- Set iteration limits (`MAX=50`)
- Keep the prompt focused and stable
- Monitor periodically
- Audit before merging

### DON'T

- Run on main branch
- Skip the state file (PROGRESS.md is the brain)
- Allow multi-task iterations (one task = one iteration)
- Trust without auditing
- Use vague task descriptions
- Run without iteration limits

---

## Troubleshooting

### Loop Stops Unexpectedly

```bash
# Check if agent is running
ps aux | grep claude

# Check tmux session
tmux list-sessions

# Restart loop
tmux attach -t naltrexone-ralph
```

### Agent Gets Stuck

1. Check PROGRESS.md for unclear tasks
2. Add more detail to the spec
3. Kill current iteration (Ctrl+C)
4. Loop will restart with fresh context

### Quality Gates Failing

- Loop should auto-fix on next iteration
- If persistent, check the spec for issues
- May need manual intervention

---

## References

- [Geoffrey Huntley - Ralph Wiggum](https://ghuntley.com/ralph/)
- [Open Ralph Wiggum (multi-agent)](https://github.com/Th0rgal/open-ralph-wiggum)
- [Ralph Claude Code (community)](https://github.com/frankbria/ralph-claude-code)
- [Dev Genius - Ralph Wiggum Explained](https://blog.devgenius.io/ralph-wiggum-explained-the-claude-code-loop-that-keeps-going-3250dcc30809)
- [Awesome Claude - Ralph Wiggum](https://awesomeclaude.ai/ralph-wiggum)
- [Claude Code Documentation](https://docs.anthropic.com/claude-code)

---

## Quick Start Checklist

```bash
# 1. Create sandbox branch
git checkout main && git pull
git checkout -b naltrexone-ralph

# 2. Create state files
touch PROGRESS.md PROMPT.md

# 3. Populate PROGRESS.md with tasks from master_spec.md

# 4. Populate PROMPT.md with loop instructions

# 5. Start tmux session
tmux new-session -s naltrexone-ralph

# 6. Run the loop
MAX=50
for i in $(seq 1 $MAX); do
  echo "=== Iteration $i/$MAX ==="
  claude --dangerously-skip-permissions -p "$(cat PROMPT.md)"
  if ! grep -q "^\- \[ \]" PROGRESS.md; then
    echo "All tasks complete!"
    break
  fi
  sleep 2
done

# 7. Monitor in another pane
watch -n 5 'git log --oneline -10'

# 8. Audit when done
git log main..naltrexone-ralph --oneline

# 9. Merge via PR
gh pr create --base main --head naltrexone-ralph
```
