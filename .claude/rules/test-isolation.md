---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
  - "**/*.spec.tsx"
  - "tests/**"
---

# Test Isolation Rules

## Process.env isolation

`process.env` is global within a Vitest worker. Tests that mutate it must restore it explicitly so later tests do not inherit hidden state.

### Module-scope env defaults

For module-scope `process.env.X = ...` or `process.env.X ??= ...`, capture the snapshot before any env writes, then restore after the suite.

Use `afterAll` only for shared defaults that intentionally stay constant for every test in the file. Use `afterEach` when tests mutate env differently.

```typescript
import { afterAll } from 'vitest';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

const ORIGINAL_ENV = snapshotProcessEnv();

process.env.DATABASE_URL ??=
  'postgresql://user:pass@localhost:5432/addiction_boards_test';

afterAll(() => {
  restoreProcessEnv(ORIGINAL_ENV);
});
```

### vi.stubEnv cleanup

Pair all `vi.stubEnv()` calls with `vi.unstubAllEnvs()`, normally in suite-level `afterEach`.

```typescript
afterEach(() => {
  vi.unstubAllEnvs();
});
```

`restoreProcessEnv()` is not a replacement for `vi.unstubAllEnvs()`. Vitest tracks env stubs separately and `vi.unstubAllEnvs()` clears that registry.

### Direct env mutation inside tests

For direct `process.env.X = ...` or `delete process.env.X` inside tests, use `snapshotProcessEnv()` / `restoreProcessEnv()` in `afterEach`.

```typescript
import { afterEach } from 'vitest';
import {
  restoreProcessEnv,
  snapshotProcessEnv,
} from '@/tests/shared/process-env';

const ORIGINAL_ENV = snapshotProcessEnv();

afterEach(() => {
  restoreProcessEnv(ORIGINAL_ENV);
});
```

Avoid delete-only `finally` cleanup. It destroys pre-existing values instead of restoring them. A per-test `delete process.env.X` is acceptable as an arrange step when the test explicitly needs the variable absent.

### Combined cleanup ordering

When `vi.stubEnv()` and direct env snapshot cleanup appear in the same suite, `vi.unstubAllEnvs()` must run first, then `restoreProcessEnv(ORIGINAL_ENV)`. The snapshot is authoritative and must be the last env writer. `vi.resetModules()` comes after env restoration when modules read env at import time.

```typescript
afterEach(() => {
  vi.unstubAllEnvs();
  restoreProcessEnv(ORIGINAL_ENV);
  vi.resetModules();
  vi.restoreAllMocks();
});
```

### Helper API

The canonical helper lives at `tests/shared/process-env.ts`:

```typescript
export type ProcessEnvSnapshot = Record<string, string | undefined>;
export function snapshotProcessEnv(): ProcessEnvSnapshot;
export function restoreProcessEnv(snapshot: ProcessEnvSnapshot): void;
```

`restoreProcessEnv()` deletes keys added after the snapshot and restores keys that existed before the snapshot. Newly set variables such as `TEST_ENV_LOADED` or `DATABASE_URL` are truly cleaned instead of merely overwritten.

### Canonical examples

- `components/get-started-cta.test.tsx` is the PR #342 direct-env reference pattern.
- `lib/container.test.ts` shows shared module-scope defaults protected by snapshot/restore.
- `proxy.test.ts` shows `vi.stubEnv()` cleanup combined with process-env snapshot restoration.
- `tests/shared/load-dotenv-file.test.ts` shows direct env mutation restored without delete-only cleanup.

### Do not churn clean files

Many existing env-mutation sites are already correctly restored. Apply this rule to new or changed tests; do not rewrite known-clean files only to make style uniform.
