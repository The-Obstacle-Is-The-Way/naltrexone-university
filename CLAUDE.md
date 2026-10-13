# CLAUDE.md

@AGENTS.md

`AGENTS.md`, imported above, holds the rules for every agent; this file adds only what is specific to Claude Code.

- **Path-scoped rules** in `.claude/rules/` load by themselves when you read or edit matching files; `AGENTS.md` lists which file covers what.
- **Browser checks with Chrome MCP:** the user's browser is usually signed in already. Call `tabs_context_mcp` first and open a new tab, rather than reusing one.
- **Browser checks with `agent-browser`:** use `--profile /tmp/clerk-profile`. If a daemon is already running, run `agent-browser close` first, because later profile flags are ignored. Never skip a visual check because of a sign-in redirect: sign in first. Details: `docs/guides/testing/browser-automation.md`.
