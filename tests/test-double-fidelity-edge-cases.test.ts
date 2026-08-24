import { describe, expect, it } from 'vitest';
import {
  collectHandRolledPortDoubleOccurrences,
  collectMaintainedFakePortNames,
  collectOwnCodeModuleMockOccurrences,
  collectRatchetGrowthIssues,
  collectUnknownDoubleCastOccurrences,
  readMaintainedFakePortNames,
  readTestSources,
  type TestDoubleOccurrence,
  type TestSourceFile,
} from './test-double-fidelity-source-scan';

function source(filePath: string, contents: string): TestSourceFile {
  return { filePath, contents: contents.trimStart() };
}

describe('test-double fidelity scan edge cases', () => {
  it('reads the repository test estate and maintained fake ports', () => {
    const sources = readTestSources();
    const portNames = readMaintainedFakePortNames();

    expect(
      sources.some(
        ({ filePath }) =>
          filePath === 'tests/test-double-fidelity-edge-cases.test.ts',
      ),
    ).toBe(true);
    expect(portNames).toContain('PaymentGateway');
    expect(portNames).toContain('StripeClient');
  });

  it('fails closed when a barrel fake module cannot be resolved', () => {
    expect(() =>
      collectMaintainedFakePortNames({
        barrelSource: source(
          'src/application/test-helpers/fakes/index.ts',
          "export { FakeMissing } from './fake-missing';",
        ),
        fakeSources: [],
      }),
    ).toThrow(/Could not resolve .*fake-missing.*FakeMissing/);
  });

  it('counts a never cast whose expression is not an impossible literal', () => {
    const occurrences = collectUnknownDoubleCastOccurrences([
      source(
        'src/adapters/repositories/probe.test.ts',
        `
const db = {
  query: { users: { findFirst: async () => null } },
} as unknown as never;
`,
      ),
    ]);

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]?.detail).toMatch(/outside the documented/);
  });

  it('still allowlists an impossible literal reaching an exhaustive guard', () => {
    const occurrences = collectUnknownDoubleCastOccurrences([
      source(
        'app/probe.test.ts',
        "const mode = 'unknown' as unknown as never;\n",
      ),
    ]);

    expect(occurrences).toHaveLength(0);
  });

  it('fails closed on a barrel export form the parser does not understand', () => {
    expect(() =>
      collectMaintainedFakePortNames({
        barrelSource: source(
          'src/application/test-helpers/fakes/index.ts',
          "export * from './fake-clock';",
        ),
        fakeSources: [],
      }),
    ).toThrow(/unsupported export/i);
  });

  it('fails when an additional fake declaration is absent', () => {
    expect(() =>
      collectMaintainedFakePortNames({
        barrelSource: source(
          'src/application/test-helpers/fakes/index.ts',
          'export {};',
        ),
        fakeSources: [],
        additionalFakeClassNames: ['FakeStripeCheckoutClient'],
      }),
    ).toThrow(
      /Expected exactly one source for FakeStripeCheckoutClient, found 0/,
    );
  });

  it('does not accept a longer class-name prefix as an additional fake', () => {
    expect(() =>
      collectMaintainedFakePortNames({
        barrelSource: source(
          'src/application/test-helpers/fakes/index.ts',
          'export {};',
        ),
        fakeSources: [
          source(
            'src/adapters/example.ts',
            'export class FakeStripeCheckoutClientLegacy {}',
          ),
        ],
        additionalFakeClassNames: ['FakeStripeCheckoutClient'],
      }),
    ).toThrow(
      /Expected exactly one source for FakeStripeCheckoutClient, found 0/,
    );
  });

  it('fails closed when a barrel module omits its exported fake class', () => {
    expect(() =>
      collectMaintainedFakePortNames({
        barrelSource: source(
          'src/application/test-helpers/fakes/index.ts',
          "export { FakePaymentGateway } from './fake-gateways';",
        ),
        fakeSources: [
          source(
            'src/application/test-helpers/fakes/fake-gateways.ts',
            'export class DifferentFake implements PaymentGateway {}',
          ),
        ],
      }),
    ).toThrow(/Could not find FakePaymentGateway/);
  });

  it('ignores non-fake barrel statements and reads implements after extends', () => {
    const portNames = collectMaintainedFakePortNames({
      barrelSource: source(
        'src/application/test-helpers/fakes/index.ts',
        `
          const ignored = true;
          export { NotFake } from './fake-gateways';
          export { FakePaymentGateway } from './fake-gateways';
        `,
      ),
      fakeSources: [
        source(
          'src/application/test-helpers/fakes/fake-gateways.ts',
          `
            class Base {}
            export class FakePaymentGateway extends Base implements PaymentGateway {}
          `,
        ),
      ],
    });

    expect(portNames).toEqual(new Set(['PaymentGateway']));
  });

  it('detects a function-expression module factory', () => {
    const occurrences = collectOwnCodeModuleMockOccurrences([
      source(
        'app/example.test.ts',
        "vi.mock('./example', function factory() { return {}; });",
      ),
    ]);

    expect(occurrences).toHaveLength(1);
  });

  it('unwraps parentheses around an unknown double cast', () => {
    const occurrences = collectUnknownDoubleCastOccurrences([
      source(
        'app/example.test.ts',
        'const gateway = (({} as unknown)) as PaymentGateway;',
      ),
    ]);

    expect(occurrences).toHaveLength(1);
  });

  it('sorts growth issues while omitting files at their floor', () => {
    const occurrences: TestDoubleOccurrence[] = [
      { filePath: 'z.test.ts', lineNumber: 1, detail: 'existing' },
      { filePath: 'a.test.ts', lineNumber: 2, detail: 'new' },
    ];

    expect(
      collectRatchetGrowthIssues(
        'module factory',
        occurrences,
        new Map([
          ['a.test.ts', 0],
          ['z.test.ts', 1],
        ]),
      ),
    ).toEqual([
      'a.test.ts has 1 module factory site(s), above its ratchet floor of 0 (new at line 2).',
    ]);
  });

  it('traces a concise-arrow helper result into a typed variable', () => {
    const occurrences = collectHandRolledPortDoubleOccurrences(
      [
        source(
          'src/application/example.test.ts',
          `
            interface PaymentGateway { charge(): Promise<void> }
            const createGateway = () => ({ charge: async () => undefined });
            const gateway: PaymentGateway = createGateway();
          `,
        ),
      ],
      new Set(['PaymentGateway']),
    );

    expect(occurrences).toHaveLength(1);
  });

  it('traces a concise-arrow helper passed to a typed parameter', () => {
    const occurrences = collectHandRolledPortDoubleOccurrences(
      [
        source(
          'src/application/example.test.ts',
          `
            interface PaymentGateway { charge(): Promise<void> }
            const createGateway = () => ({ charge: async () => undefined });
            function exercise(_gateway: PaymentGateway) {}
            exercise(createGateway());
          `,
        ),
      ],
      new Set(['PaymentGateway']),
    );

    expect(occurrences).toHaveLength(1);
  });

  it('traces an object returned by a block-bodied helper', () => {
    const occurrences = collectHandRolledPortDoubleOccurrences(
      [
        source(
          'src/application/example.test.ts',
          `
            interface PaymentGateway { charge(): Promise<void> }
            function createGateway() {
              return { charge: async () => undefined };
            }
            function exercise(_gateway: PaymentGateway) {}
            exercise(createGateway());
          `,
        ),
      ],
      new Set(['PaymentGateway']),
    );

    expect(occurrences).toHaveLength(1);
  });

  it('does not treat a nested helper return as the outer helper result', () => {
    const occurrences = collectHandRolledPortDoubleOccurrences(
      [
        source(
          'src/application/example.test.ts',
          `
            interface PaymentGateway { charge(): Promise<void> }
            function createGateway() {
              function nested() { return { charge: async () => undefined }; }
              nested();
              return undefined;
            }
            function exercise(_gateway: PaymentGateway) {}
            exercise(createGateway());
          `,
        ),
      ],
      new Set(['PaymentGateway']),
    );

    expect(occurrences).toEqual([]);
  });

  it('terminates cyclic origins and ignores unsupported property origins', () => {
    const occurrences = collectHandRolledPortDoubleOccurrences(
      [
        source(
          'src/application/example.test.ts',
          `
            interface PaymentGateway { charge(): Promise<void> }
            let first = second;
            let second = first;
            const holder = { gateway: { charge: async () => undefined } };
            const gateway = holder.gateway;
            function exercise(_gateway: PaymentGateway) {}
            exercise(first);
            exercise(gateway);
          `,
        ),
      ],
      new Set(['PaymentGateway']),
    );

    expect(occurrences).toEqual([]);
  });

  it('unwraps typed expressions and sorts two occurrences in one file', () => {
    const occurrences = collectHandRolledPortDoubleOccurrences(
      [
        source(
          'src/application/example.test.ts',
          `
            interface PaymentGateway { charge(): Promise<void> }
            const first: PaymentGateway = { charge: async () => undefined };
            const second = (({ charge: async () => undefined } satisfies PaymentGateway) as PaymentGateway)!;
            function exercise(_gateway: PaymentGateway) {}
            exercise(second);
          `,
        ),
      ],
      new Set(['PaymentGateway']),
    );

    expect(occurrences).toHaveLength(2);
    expect(occurrences.map(({ lineNumber }) => lineNumber)).toEqual([2, 3]);
  });
});
