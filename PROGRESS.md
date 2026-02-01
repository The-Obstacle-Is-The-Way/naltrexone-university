# Naltrexone University - Progress Tracker

**Last Updated:** _Not active_
**Current Slice:** _None_
**Purpose:** State file for Ralph Wiggum loop (see `docs/_ralphwiggum/protocol.md`)

> **Note:** This file is only used when running the Ralph Wiggum autonomous loop.
> When active, the loop reads this file to find the next unchecked task.

---

## Active Queue

_No active tasks. Populate this section when starting a Ralph Wiggum loop._

Example format:
```markdown
- [ ] **TASK-01**: Description → See `docs/specs/master_spec.md` Section X
- [ ] **TASK-02**: Description → See `docs/specs/master_spec.md` Section Y
```

---

## Work Log

_Entries added automatically by the loop as tasks complete._

---

## Completion Criteria

_Define what "done" looks like for the current phase._

Example:
- All items are `[x]`
- Quality gates pass: `pnpm biome check .`, `pnpm tsc --noEmit`, `pnpm test`
- Feature works end-to-end
