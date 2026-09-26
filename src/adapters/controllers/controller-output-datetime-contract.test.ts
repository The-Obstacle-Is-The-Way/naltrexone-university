import { describe, expect, it } from 'vitest';
import {
  collectOutputSchemaSourceIssues,
  collectPassThroughDatetimeFields,
  collectSchemaLessActions,
  EXPECTED_SCHEMALESS_ACTIONS,
  getZodContractIssues,
  isZodSchema,
  parseSourceText,
  readControllerSources,
} from '@/tests/controller-output-datetime-source-scan';
import * as practiceSchemas from './practice-schemas';

describe('controller output datetime contract', () => {
  it('keeps exported controller output schemas on ISO datetime strings', () => {
    const schemaIssues = Object.entries(practiceSchemas)
      .filter(
        ([name, schema]) =>
          name.endsWith('OutputSchema') && isZodSchema(schema),
      )
      .flatMap(([name, schema]) => getZodContractIssues(schema, name));

    expect(schemaIssues).toEqual([]);
  });

  it('blocks z.date(), date-like z.number(), and unvalidated datetime strings in controller output schemas', () => {
    const schemaIssues = collectOutputSchemaSourceIssues(
      readControllerSources(),
    );

    expect(schemaIssues).toEqual([]);
  });

  it('reports date-like union output schema branches that drift away from ISO strings', () => {
    const sourceFile = parseSourceText(
      'src/adapters/controllers/example-controller.ts',
      `
import { z } from 'zod';

const ExampleOutputSchema = z
  .object({
    answeredAt: z.union([z.string().datetime(), z.number()]),
    expiresAt: z.string().datetime().or(z.date()),
    updatedAt: z.union([z.string().datetime(), z.null()]),
  })
  .strict();
`,
    );

    const schemaIssues = collectOutputSchemaSourceIssues([sourceFile]);

    expect(schemaIssues).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'ExampleOutputSchema.answeredAt uses date-like z.number()',
        ),
        expect.stringContaining(
          'ExampleOutputSchema.answeredAt is date-like but is not z.string().datetime()',
        ),
        expect.stringContaining('ExampleOutputSchema.expiresAt uses z.date()'),
        expect.stringContaining(
          'ExampleOutputSchema.expiresAt is date-like but is not z.string().datetime()',
        ),
      ]),
    );
    expect(
      schemaIssues.some((issue) =>
        issue.includes('ExampleOutputSchema.updatedAt'),
      ),
    ).toBe(false);
  });

  it('keeps pass-through controller datetime outputs explicit and ISO-shaped', () => {
    const schemaLessActions = collectSchemaLessActions(readControllerSources());
    const expectedSchemaLessActions = EXPECTED_SCHEMALESS_ACTIONS.map(
      ({ action, filePath }) => ({ action, filePath }),
    ).sort((a, b) =>
      `${a.filePath}:${a.action}`.localeCompare(`${b.filePath}:${b.action}`),
    );

    expect(schemaLessActions).toEqual(expectedSchemaLessActions);

    const { fields, issues } = collectPassThroughDatetimeFields();
    const expectedFields = EXPECTED_SCHEMALESS_ACTIONS.flatMap((action) =>
      action.datetimeFields.map((field) => `${action.action}:${field}`),
    ).sort();

    expect(issues).toEqual([]);
    expect(fields).toEqual(expectedFields);
  });
});
