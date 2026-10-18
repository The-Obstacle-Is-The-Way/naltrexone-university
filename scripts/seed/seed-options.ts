export type SeedOptions = { includePlaceholders: boolean };

const INCLUDE_PLACEHOLDERS_FLAG = '--include-placeholders';
const RETIRED_PLACEHOLDER_VARIABLE = 'SEED_INCLUDE_PLACEHOLDERS';
const PLAN_FLAG = '--plan';

// pnpm 11 passes a `pnpm <script> -- <args>` separator through to the script.
function withoutSeparator(args: readonly string[]): readonly string[] {
  return args[0] === '--' ? args.slice(1) : args;
}

// The placeholder fixtures are test data, so only a command line that names
// them can include them. The seed once read SEED_INCLUDE_PLACEHOLDERS, which
// every launcher passed on, so an exported value reached the production seed
// (BUG-353). A set value is refused rather than ignored, so a stale shell or
// instruction fails loudly instead of seeding something the caller did not
// expect.
export function parseSeedOptions(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): SeedOptions {
  if (env[RETIRED_PLACEHOLDER_VARIABLE] !== undefined) {
    throw new Error(
      `${RETIRED_PLACEHOLDER_VARIABLE} is set, but the seed no longer reads it. Unset it, and pass ${INCLUDE_PLACEHOLDERS_FLAG} where a test database needs the placeholder fixtures.`,
    );
  }
  const options = withoutSeparator(args);
  const unknown = options.find((arg) => arg !== INCLUDE_PLACEHOLDERS_FLAG);
  if (unknown !== undefined) {
    throw new Error(
      `Unknown seed argument: ${unknown}. The only option is ${INCLUDE_PLACEHOLDERS_FLAG}.`,
    );
  }
  return { includePlaceholders: options.includes(INCLUDE_PLACEHOLDERS_FLAG) };
}

// The environment seeds (db:seed:prod, db:seed:all) take only --plan.
export function parseSeedPlanOnly(
  args: readonly string[],
  usage: string,
): boolean {
  const options = withoutSeparator(args);
  if (options.length === 0) return false;
  if (options.length === 1 && options[0] === PLAN_FLAG) return true;
  throw new Error(usage);
}
