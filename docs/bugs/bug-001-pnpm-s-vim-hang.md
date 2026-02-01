# BUG-001: `pnpm -s …` Can Launch Vim and Hang Non-Interactive Sessions

**Status:** Resolved
**Date:** 2026-02-01

## Summary

Some agents attempted to run commands like `pnpm -s view next version` to query package versions. In pnpm, `-s` is not a valid “silent” flag, and this invocation can end up executing the OS `view` binary (Vim), which hard-hangs in non-interactive shells (CI/agent runs).

## Impact

- AI agent sessions can freeze waiting for Vim input.
- CI/devx time sinks and confusion (“commands stuck”).

## Repro

1. Run in a non-interactive shell (no TTY).
2. Execute: `pnpm -s view next version`
3. Observe Vim “Output is not to a terminal / Input is not from a terminal” and a hang.

## Fix

- Documented “no pagers / no Vim” safety rules in `AGENTS.md` and `CLAUDE.md`.
- Explicitly forbid `pnpm -s …` and recommend non-interactive alternatives.

## Prevention

- Prefer `pnpm view <pkg> version` (no `-s`).
- For quiet output, use `pnpm --loglevel silent …` (or no flags).
- Prefer `git --no-pager …` when inspecting history/diffs in agent contexts.

