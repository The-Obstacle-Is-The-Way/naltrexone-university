// pnpm 11 forwards a single leading separator. Internal or repeated `--`
// remains an argument for the caller to reject; never silently drop flags.
export function stripPnpmSeparator(argv: readonly string[]): string[] {
  return argv.slice(argv[0] === '--' ? 1 : 0);
}
