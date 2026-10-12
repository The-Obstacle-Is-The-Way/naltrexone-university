# Agent Skills

Vendored skills that Claude Code and Codex load: `.claude/skills/*` and `.codex/skills/*` are committed symlinks to the folders here. They are tooling, not documentation, and they do not override `AGENTS.md`: where a skill's advice contradicts the repository's rules, the rules win.

## Refreshing a Skill

`skills.manifest.json` is the source of truth: each skill's upstream, pinned commit, licence and `refreshCommand`.

1. Start from a clean skills tree, with no staged, unstaged or untracked change: `test -z "$(git status --short --untracked-files=all -- .agents/skills .claude/skills .codex/skills)"`.
2. Refresh one skill at a time with its `refreshCommand`, and read `git --no-pager diff -- .agents/skills/<skill>`.
3. Commit it with the upstream's short SHA. Never write to, delete or recreate the symlinks while refreshing.
4. Afterwards, check that every `.claude` and `.codex` symlink still resolves, and that the number of `SKILL.md` files matches the manifest and its schema's count.

**Special case:** `agent-browser` is a first-party fork. Merge it by hand, keeping its Clerk sign-in guidance, its notes on React click failures, and its link to `docs/guides/testing/browser-automation.md`.

## Removing a Skill

Removing a skill needs the owner's agreement. Then delete its folder, both symlinks and its manifest entry, lower the count in `skills.manifest.schema.json`, and list it below, all in one change.

### Removed

On 2026-10-12 the owner agreed to remove three generic recipes from `andrelandgraf/fullstackrecipes` (MIT, upstream commit `4449331ed5ae`, vendored 2026-06-12). Their direct database imports, driver choices and billing assumptions contradict this repository's injected database and billing patterns, and an agent loads a skill by its description whatever a label says. Their upstream remains the source if one is ever wanted again.

| Skill | Upstream | Vendored at |
|---|---|---|
| `neon-drizzle-setup` | live recipe `fullstackrecipes.com/api/recipes/neon-drizzle-setup` | `8829326e3b38` |
| `stripe-subscriptions` | live cookbook `fullstackrecipes.com/api/recipes/stripe-subscriptions` | `8829326e3b38` |
| `using-drizzle-queries` | `skills/drizzle-queries`, renamed locally | `c70f5bb1087f` |
