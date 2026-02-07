# Git Workflow Rules

## Commits

- Imperative style: `Add ...`, `Fix ...`, `Refactor ...`, `Enhance ...`
- Optional tags: `[BASELINE]` when applicable

## Pull Requests

- Include short problem/solution summary
- Link spec/ADR updates in `docs/`
- Add screenshots/GIFs for UI changes

**Before opening a PR:**
```bash
pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:integration && pnpm build
```

## CodeRabbit Review (MANDATORY)

NEVER merge a PR without CodeRabbit review. No exceptions.

1. Create PR via `gh pr create`
2. WAIT for `coderabbitai[bot]` comment (1-2 minutes)
3. Read ALL feedback — do not skim
4. Address every issue before merging
5. Only merge after CodeRabbit has reviewed AND feedback is addressed

## Never Delete Uncommitted Work

- See files you didn't create? Leave them alone or commit them.
- See edits you didn't make? Ask before reverting.
- When in doubt: `git stash -m "Preserving work from another session"`

## Non-Interactive Safety

- Always `git --no-pager log`, `git --no-pager diff`
- Always `git commit -m "..."` (never open an editor)
- Never `pnpm -s <cmd>` (triggers Vim)
