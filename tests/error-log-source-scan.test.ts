import { readFileSync } from 'node:fs';
import { globSync } from 'tinyglobby';
import { describe, expect, it } from 'vitest';
import { collectRawErrorLogIssues } from './error-log-source-scan';

describe('raw error log source scan', () => {
  it.each([
    'logger.error({ reason: error.message }, "failed")',
    'try { work(); } catch (failure) { logger.error({ cause: failure }); }',
    'function report(error: unknown) { console.error(error); }',
    'try { work(); } catch (failure) { logger.error({ text: String(failure) }); }',
    'function format(error) { return error.message; } const alias = format; logger.warn({ detail: alias(error) });',
    'logger.warn({ detail: error["message"] }, "failed")',
    'const text = error.message; const alias = text; logger.info({ detail: alias })',
    'const { message: text } = error; logger.error({ text })',
    'function format(error) { return error instanceof Error ? error.message : String(error); } logger.warn({ detail: format(error) })',
    'const format = (error) => String(error); logger.error({ detail: format(error) })',
    'const context = { detail: error.stack }; logger.error(context)',
    'const log = logger.error.bind(logger); log({ detail: error.message })',
    'const { warn: log } = logger; log({ detail: error.message })',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: source text for the scanner
    'logger.error(`failed: ${error.message}`)',
    'function warnStopped(logger, context): void { logger.warn(context); } warnStopped(logger, { error: error.message })',
    'function warnStopped(logger, context) { logger.warn(context); } warnStopped(logger, { error: error.message })',
    'function projectSafeErrorDiagnostics(error) { return error.message; } logger.error({ detail: projectSafeErrorDiagnostics(error) })',
    'logger.error({ detail: JSON.stringify(error.message) })',
    'const warnStopped = (context) => { logger.warn(context); }; warnStopped({ detail: error.message })',
    'const warnStopped = function (context) { logger.warn(context); }; warnStopped({ detail: error.message })',
    'const warnStopped = (context) => logger.warn(context); warnStopped({ detail: error.message })',
    'try { work(); } catch (failure) { logger.error({ detail: failure.toString() }); }',
    'logger.error({ detail: error.message.trim() })',
    'logger.error({ detail: [error.message].join(", ") })',
  ])('rejects demonstrated raw text flow: %s', (contents) => {
    expect(
      collectRawErrorLogIssues([{ filePath: 'sample.ts', contents }]),
    ).toHaveLength(1);
  });
  it('accepts projections, static messages and nonlogging uses of public messages', () => {
    expect(
      collectRawErrorLogIssues([
        {
          filePath: 'sample.ts',
          contents: `
      import { projectSafeErrorDiagnostics } from '@/src/adapters/shared/safe-error-diagnostics';
      const text = error.message;
      returnToClient(text);
      logger.error({ err: projectSafeErrorDiagnostics(error) }, 'Failure');
      logger.error({ err: JSON.stringify(projectSafeErrorDiagnostics(error)) });
      logger.warn({ errorCode: error.code });
      function format(error) { logger.debug({ errorCode: error.code }); return 'failed'; }
      format(error.message);
      const describe = (error) => { logger.debug({ errorCode: error.code }); return 'failed'; };
      describe(error.message);
      function label(error): string { logger.debug({ errorCode: error.code }); return 'failed'; }
      label(error.message);
      logger.warn({ errorCode: error.code.toUpperCase(), safe: projectSafeErrorDiagnostics(error).name?.trim() });
    `,
        },
      ]),
    ).toEqual([]);
  });
  it('keeps application log boundaries free of raw error text', () => {
    const files = globSync(
      [
        'app/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}',
        'src/**/*.{ts,tsx}',
        'proxy.ts',
      ],
      {
        expandDirectories: false,
        ignore: [
          '**/*.test.*',
          '**/*.spec.*',
          '**/*.fixtures.*',
          '**/*.probes.*',
          '**/*test-helpers*',
          '**/test-helpers/**',
        ],
      },
    );
    expect(
      collectRawErrorLogIssues(
        files.map((filePath) => ({
          filePath,
          contents: readFileSync(filePath, 'utf8'),
        })),
      ),
    ).toEqual([]);
  });
});
