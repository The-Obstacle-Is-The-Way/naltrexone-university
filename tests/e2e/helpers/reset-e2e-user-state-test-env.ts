// Environment builder shared by the E2E reset helper's suites.
export type RequiredEnvKey =
  | 'DATABASE_URL'
  | 'CLERK_SECRET_KEY'
  | 'E2E_CLERK_USER_USERNAME';

export function createEnv(
  overrides: Partial<Record<RequiredEnvKey, string | undefined>> = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    DATABASE_URL:
      'postgresql://postgres:postgres@localhost:5432/addiction_boards_test',
    CLERK_SECRET_KEY: 'sk_test_clerk',
    E2E_CLERK_USER_USERNAME: 'e2e-test@example.com',
    ...overrides,
  } as NodeJS.ProcessEnv;
}
