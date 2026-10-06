/**
 * A client can call a server action with any arguments it likes. The optional
 * dependencies and options some actions take exist for tests, so only a known
 * test or development run keeps them; anything else, including an unset
 * NODE_ENV, drops them and the action resolves its own. Next.js replaces
 * `process.env.NODE_ENV` with "production" when it builds the server.
 */
export function testSeam<T>(value: T | undefined): T | undefined {
  const env = process.env.NODE_ENV;
  return env === 'test' || env === 'development' ? value : undefined;
}
