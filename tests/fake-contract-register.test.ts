import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  collectAdapterOwnedFakeNames,
  collectFakeContractRegisterIssues,
  collectMaintainedBehaviorDoubleNames,
  parseFakeContractRegister,
  readFakeContractRegister,
  readMaintainedBehaviorDoubleNames,
} from './fake-contract-register-source-scan';

describe('fake contract and divergence register', () => {
  it('derives behavior doubles from the barrel while excluding canned use-case stubs', () => {
    const names = collectMaintainedBehaviorDoubleNames(
      `
      export { FakeAttemptRepository, NotAFake } from './fake-attempt-repository';
      export { FakeSubmitAnswerUseCase } from './fake-use-cases';
      export { FakePaymentGateway } from './fake-gateways';
    `,
      ['FakeAdapterOwned'],
    );

    expect(names).toEqual([
      'FakeAdapterOwned',
      'FakeAttemptRepository',
      'FakePaymentGateway',
    ]);
  });

  // DEBT-519: adapter-owned fakes were once a hand list, so a new one could
  // go unrecorded. No rule fixes a fake's file name, so every file counts.
  it('finds an exported adapter-owned fake whatever its file is called', () => {
    expect(
      collectAdapterOwnedFakeNames([
        {
          path: 'src/adapters/gateways/x/test-helpers/portal-doubles.ts',
          contents: `
            class FakeHidden {}
            export class NotAFake {}
            export class FakeX {}
            export type FakeShape = { id: string };
          `,
        },
      ]),
    ).toEqual(['FakeX']);
  });

  it('finds an adapter-owned fake exported as a constant, a function or a named export', () => {
    expect(
      collectAdapterOwnedFakeNames([
        {
          path: 'src/adapters/jobs/test-helpers/doubles.ts',
          contents: `
            export const FakeY = { run: async () => {} };
            export function FakeZ() {}
            class FakeW {}
            export { FakeW };
          `,
        },
      ]),
    ).toEqual(['FakeW', 'FakeY', 'FakeZ']);
  });

  it('finds an adapter-owned fake exported through a destructured constant', () => {
    expect(
      collectAdapterOwnedFakeNames([
        {
          path: 'src/adapters/jobs/test-helpers/doubles.ts',
          contents: `
            const doubles = { FakeA: {}, nested: { FakeB: {} }, list: [{}] };
            export const { FakeA, nested: { FakeB }, list: [FakeC] } = doubles;
          `,
        },
      ]),
    ).toEqual(['FakeA', 'FakeB', 'FakeC']);
  });

  it('skips a locally declared type exported by name', () => {
    expect(
      collectAdapterOwnedFakeNames([
        {
          path: 'src/adapters/jobs/test-helpers/doubles.ts',
          contents: `
            type FakeShape = { id: string };
            interface FakeContract { id: string }
            class FakeReal {}
            export { FakeShape, FakeContract as FakeRenamed, FakeReal };
          `,
        },
      ]),
    ).toEqual(['FakeReal']);
  });

  it('skips a test file beside the adapter-owned fakes', () => {
    expect(
      collectAdapterOwnedFakeNames([
        {
          path: 'src/adapters/gateways/x/test-helpers/fake-x.test.ts',
          contents: 'export class FakeInATest {}',
        },
      ]),
    ).toEqual([]);
  });

  it('reports a missing row and a blank known-divergence note independently', () => {
    const entries = parseFakeContractRegister(`
<!-- fake-contract-register:start -->
| Double | Verification | Known divergences |
| --- | --- | --- |
| \`FakeOne\` | Contract | |
<!-- fake-contract-register:end -->
    `);

    expect(
      collectFakeContractRegisterIssues(['FakeOne', 'FakeTwo'], entries),
    ).toEqual([
      'FakeOne has no known-divergences note.',
      'FakeTwo is missing from the fake contract register.',
    ]);
  });

  it('accepts an explicit no-known-divergence note', () => {
    const entries = parseFakeContractRegister(`
<!-- fake-contract-register:start -->
| Double | Verification | Known divergences |
| --- | --- | --- |
| \`FakeOne\` | Contract | None known after the 2026-08-23 audit. |
<!-- fake-contract-register:end -->
    `);

    expect(collectFakeContractRegisterIssues(['FakeOne'], entries)).toEqual([]);
  });

  it('fails closed when the register markers are absent', () => {
    expect(() => parseFakeContractRegister('| no markers |')).toThrow(
      /ordered start\/end marker pair/,
    );
  });

  it('fails closed when a register marker pair is duplicated', () => {
    expect(() =>
      parseFakeContractRegister(`
<!-- fake-contract-register:start -->
| Double | Verification | Known divergences |
| --- | --- | --- |
<!-- fake-contract-register:end -->
<!-- fake-contract-register:start -->
| Double | Verification | Known divergences |
| --- | --- | --- |
<!-- fake-contract-register:end -->
      `),
    ).toThrow(/exactly once/);
  });

  it('fails closed when a register row has the wrong number of cells', () => {
    expect(() =>
      parseFakeContractRegister(`
<!-- fake-contract-register:start -->
| Double | Verification | Known divergences |
| --- | --- | --- |
| \`FakeOne\` | Contract |
<!-- fake-contract-register:end -->
      `),
    ).toThrow(/exactly three cells/);
  });

  it('reports duplicate rows for one maintained fake', () => {
    const duplicate = {
      name: 'FakeOne',
      verification: 'Contract',
      knownDivergences: 'None known.',
    };

    expect(
      collectFakeContractRegisterIssues(['FakeOne'], [duplicate, duplicate]),
    ).toEqual(['FakeOne appears 2 times in the fake contract register.']);
  });

  it('reports a blank verification independently', () => {
    expect(
      collectFakeContractRegisterIssues(
        ['FakeOne'],
        [
          {
            name: 'FakeOne',
            verification: '',
            knownDivergences: 'None known.',
          },
        ],
      ),
    ).toEqual(['FakeOne has no verification or dated waiver.']);
  });

  it('flags a waiver that declares itself dated but carries no date', () => {
    const entries = [
      {
        name: 'FakeOne',
        verification: 'Dated shared-contract waiver: isolation suite only.',
        knownDivergences: 'Common repository exclusions.',
      },
    ];

    expect(collectFakeContractRegisterIssues(['FakeOne'], entries)).toEqual([
      'FakeOne declares a waiver without an ISO date.',
    ]);
  });

  it.each(['2026-99-99', '2026-02-31', '2026-00-10', '2026-13-01'])(
    'flags a waiver whose date %s is not a real calendar date',
    (value) => {
      const entries = [
        {
          name: 'FakeOne',
          verification: `Dated shared-contract waiver (${value}): isolation suite only.`,
          knownDivergences: 'Common repository exclusions.',
        },
      ];

      expect(collectFakeContractRegisterIssues(['FakeOne'], entries)).toEqual([
        'FakeOne declares a waiver without an ISO date.',
      ]);
    },
  );

  it('accepts a waiver carrying an ISO date', () => {
    const entries = [
      {
        name: 'FakeOne',
        verification:
          'Dated shared-contract waiver (2026-08-23): isolation suite only.',
        knownDivergences: 'Common repository exclusions.',
      },
    ];

    expect(collectFakeContractRegisterIssues(['FakeOne'], entries)).toEqual([]);
  });

  it('reports a row for an unmaintained fake', () => {
    expect(
      collectFakeContractRegisterIssues(
        [],
        [
          {
            name: 'FakeLegacy',
            verification: 'Contract',
            knownDivergences: 'None known.',
          },
        ],
      ),
    ).toEqual(['FakeLegacy is not a maintained behavior double.']);
  });

  it('covers every maintained behavior double exactly once', () => {
    const names = readMaintainedBehaviorDoubleNames();
    const entries = readFakeContractRegister();

    expect(names).toHaveLength(26);
    expect(names).toContain('FakeStripeCheckoutClient');
    expect(names).toContain('FakeStripePortalConfigurations');
    expect(collectFakeContractRegisterIssues(names, entries)).toEqual([]);
  });

  it('is linked from the canonical test-double rule', () => {
    const testingRule = readFileSync(
      path.resolve(process.cwd(), '.claude/rules/testing.md'),
      'utf8',
    );

    expect(testingRule).toContain('docs/guides/testing/fake-contracts.md');
  });
});
