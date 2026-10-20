import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'tinyglobby';
import {
  parseCLI,
  type Reporter,
  type TestModule,
  type TestRunEndReason,
  type Vitest,
} from 'vitest/node';
import {
  auditExecutedRuleProofs,
  type ExecutedProof,
  type ProofLane,
} from './rule-proof-contract.mts';
import {
  findRuleRegisterProblems,
  parseRuleRegister,
  RULE_REGISTER_PATH,
  type RuleProof,
} from './rule-to-test-register-source-scan.mts';

declare module 'vitest' {
  interface TaskMeta {
    ruleProof?: RuleProof;
  }
}

export class RuleProofReporter implements Reporter {
  private root = process.cwd();
  private focused = false;
  private configuredFilter = false;
  constructor(
    private readonly lane: ProofLane,
    private readonly registerPath = RULE_REGISTER_PATH,
  ) {}

  onInit(ctx: Vitest) {
    this.root = ctx.config.root;
    // parseCLI mutates its input; never hand it process.argv itself.
    const { filter, options } = parseCLI(['vitest', ...process.argv.slice(2)]);
    const hasFilter = (value: unknown) =>
      Array.isArray(value) ? value.length > 0 : Boolean(value);
    // These are configuration booleans, not Vitest's test.only API.
    const { only: configOnlyTypes } = ctx.config.typecheck;
    const { only: cliOnlyTypes } = options.typecheck ?? {};
    this.focused = [
      filter,
      options.watch,
      options.testNamePattern,
      options.shard,
      options.changed,
      options.related,
      options.project,
      options.tagsFilter,
      options.exclude,
      cliOnlyTypes,
      ctx.config.watch && !options.run,
    ].some(hasFilter);
    this.configuredFilter = [
      ctx.config.testNamePattern,
      ctx.config.shard,
      ctx.config.changed,
      ctx.config.related,
      ctx.config.project,
      ctx.config.tagsFilter,
      ctx.config.cliExclude,
      configOnlyTypes,
    ].some(hasFilter);
  }

  onTestRunEnd(
    modules: ReadonlyArray<TestModule>,
    errors: ReadonlyArray<unknown>,
    reason: TestRunEndReason,
  ) {
    if (this.focused) {
      console.warn(
        `Rule proofs: ${this.lane} SKIPPED (focused/watch/sharded run; not a full-lane receipt)`,
      );
      return;
    }
    if (this.configuredFilter)
      throw new Error(
        'Rule proof audit failed: configuration filters a required unfiltered run',
      );
    const { rules, problems } = parseRuleRegister(
      readFileSync(path.resolve(this.root, this.registerPath), 'utf8'),
    );
    const readSource = (file: string) =>
      readFileSync(path.resolve(this.root, file), 'utf8');
    problems.push(...findRuleRegisterProblems(rules, readSource));
    if (reason !== 'passed' || errors.length > 0)
      problems.push('Test run did not complete successfully');
    const results: ExecutedProof[] = modules.flatMap((module) =>
      [...module.children.allTests()].map((test) => ({
        file: path
          .relative(this.root, module.moduleId)
          .split(path.sep)
          .join('/'),
        title: test.name,
        state: test.result().state,
        location: test.location,
        proof: test.meta().ruleProof,
      })),
    );
    // An imported helper may register tests in a consumer module. Validate
    // literal identities in all repository JS/TS, not just registered files.
    const annotatedSources = new Map<string, string>();
    for (const file of globSync('**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}', {
      cwd: this.root,
      dot: true,
      ignore: [
        'node_modules/**',
        '.git/**',
        '.next/**',
        '.vercel/**',
        '.agents/**',
        'coverage/**',
        'test-results/**',
        'playwright-report/**',
      ],
    })) {
      const source = readSource(file);
      if (source.includes('ruleProof')) annotatedSources.set(file, source);
    }
    problems.push(
      ...auditExecutedRuleProofs(
        rules,
        this.lane,
        results,
        readSource,
        annotatedSources,
      ),
    );
    if (problems.length > 0)
      throw new Error(`Rule proof audit failed:\n${problems.join('\n')}`);
    console.log(`Rule proofs: ${this.lane} passed`);
  }
}
