/**
 * A client can call a server action with any arguments it likes. The optional
 * dependencies and options some actions take exist for tests, so a production
 * build drops them and the action resolves its own. Next.js replaces
 * `process.env.NODE_ENV` with "production" when it builds the server.
 */
export function testSeam<T>(value: T | undefined): T | undefined {
  return process.env.NODE_ENV === 'production' ? undefined : value;
}
