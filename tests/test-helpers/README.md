# tests/test-helpers

Generic test primitives reused across test layers.

Scope:
- Async orchestration utilities (for example `createDeferred`)
- Generic result/test helpers (for example `ok`)

Rules:
- Keep helpers framework-agnostic where possible.
- Do not add E2E flow helpers here; those belong in `tests/e2e/helpers`.
