# Agent Skills

Vendored skills that Claude Code and Codex load: `.claude/skills/*` and `.codex/skills/*` are committed symlinks to the folders here. They are tooling, not documentation, and they do not override `AGENTS.md`: where a skill's advice contradicts the repository's rules, the rules win.

## Refreshing a Skill

`skills.manifest.json` is the source of truth: each skill's upstream, pinned commit, licence and `refreshCommand`.

1. Start from a clean skills tree: `git diff --quiet -- .agents/skills .claude/skills .codex/skills`.
2. Refresh one skill at a time with its `refreshCommand`, and read `git --no-pager diff -- .agents/skills/<skill>`.
3. Commit it with the upstream's short SHA. Never write to, delete or recreate the symlinks while refreshing.
4. Afterwards, check that every `.claude` and `.codex` symlink still resolves, and that the number of `SKILL.md` files matches the manifest and its schema's count.

**Special case:** `agent-browser` is a first-party fork. Merge it by hand, keeping its Clerk sign-in guidance, its notes on React click failures, and its link to `docs/guides/testing/browser-automation.md`.

## Removing a Skill

Delete its folder, both symlinks and its manifest entry, and lower the count in `skills.manifest.schema.json`, all in one change. A skill that contradicts the repository goes. For example, `using-drizzle-queries` imported the database directly, `neon-drizzle-setup` targeted a driver this repository does not use, and `stripe-subscriptions` chained recipes for a dependency it does not have.
