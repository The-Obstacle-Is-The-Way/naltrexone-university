import { describe, expect, inject, it } from 'vitest';
import {
  collectHandRolledPortDoubleOccurrences,
  collectMaintainedFakePortNames,
  collectOwnCodeModuleMockOccurrences,
  collectRatchetGrowthIssues,
  collectUnknownDoubleCastOccurrences,
  readRepositoryCompilerOptions,
  type TestDoubleOccurrence,
  type TestSourceFile,
} from './test-double-fidelity-source-scan';

function source(filePath: string, contents: string): TestSourceFile {
  return { filePath, contents: contents.trimStart() };
}

describe('test-double fidelity source scan', () => {
  it('detects an own-code factory-form vi.mock call', () => {
    const factoryCall = [
      'vi',
      ".mock('@/lib/example', () => ({ example: vi.fn() }));",
    ].join('');
    const occurrences = collectOwnCodeModuleMockOccurrences([
      source(
        'app/example.test.ts',
        `
          import { vi } from 'vitest';

          ${factoryCall}
        `,
      ),
    ]);

    expect(occurrences).toEqual([
      {
        filePath: 'app/example.test.ts',
        lineNumber: 3,
        detail:
          "own-code module '@/lib/example' must not use a factory-form vi.mock",
      },
    ]);
  });

  it('detects an unknown double cast outside the explicit allowlist', () => {
    const cast = ['{} as unknown', 'as PaymentGateway'].join(' ');
    const occurrences = collectUnknownDoubleCastOccurrences([
      source(
        'src/application/example.test.ts',
        `
          const dependency = ${cast};
        `,
      ),
    ]);

    expect(occurrences).toEqual([
      {
        filePath: 'src/application/example.test.ts',
        lineNumber: 1,
        detail: `'${cast.slice(3)}' is outside the documented shape-only allowlist`,
      },
    ]);
  });

  it('accepts a multiline browser-mode spy while still parsing factory calls across lines', () => {
    const browserOccurrences = collectOwnCodeModuleMockOccurrences([
      source(
        'app/use-example.browser.spec.tsx',
        `
          vi.mock('@/src/adapters/controllers/example-controller', {
            spy: true,
          });
        `,
      ),
    ]);
    const factoryOccurrences = collectOwnCodeModuleMockOccurrences([
      source(
        'app/use-example.test.ts',
        `
          vi.mock(
            '@/lib/example',
            () => ({ example: vi.fn() }),
          );
        `,
      ),
    ]);

    expect(browserOccurrences).toEqual([]);
    expect(factoryOccurrences).toEqual([
      {
        filePath: 'app/use-example.test.ts',
        lineNumber: 1,
        detail:
          "own-code module '@/lib/example' must not use a factory-form vi.mock",
      },
    ]);
  });

  it('ignores an own-code automock call without a factory argument', () => {
    const occurrences = collectOwnCodeModuleMockOccurrences([
      source('app/example.test.ts', `vi.mock('@/lib/example');`),
    ]);

    expect(occurrences).toEqual([]);
  });

  it('ignores an own-code spy configuration because it is not a factory', () => {
    const occurrences = collectOwnCodeModuleMockOccurrences([
      source('app/example.test.ts', `vi.mock('@/lib/example', { spy: true });`),
    ]);

    expect(occurrences).toEqual([]);
  });

  it('detects an own-code factory-form vi.doMock call', () => {
    const factoryCall = [
      'vi',
      ".doMock('@/lib/example', () => ({ example: vi.fn() }));",
    ].join('');
    const occurrences = collectOwnCodeModuleMockOccurrences([
      source('app/example.test.ts', factoryCall),
    ]);

    expect(occurrences).toEqual([
      {
        filePath: 'app/example.test.ts',
        lineNumber: 1,
        detail:
          "own-code module '@/lib/example' must not use a factory-form vi.doMock",
      },
    ]);
  });

  it('ignores external package factories', () => {
    const occurrences = collectOwnCodeModuleMockOccurrences([
      source(
        'app/example.test.ts',
        `
          vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));
        `,
      ),
    ]);

    expect(occurrences).toEqual([]);
  });

  it('fails closed when a scanned test source cannot be parsed', () => {
    expect(() =>
      collectOwnCodeModuleMockOccurrences([
        source('app/broken.test.ts', "vi.mock('@/lib/example', ("),
      ]),
    ).toThrow(/Could not parse app\/broken\.test\.ts/);
  });

  it('excludes every documented shape-only and intentional-invalid cast category', () => {
    const unknownCast = 'as unknown';
    const sources = [
      source(
        'tests/e2e/helpers/example.test.ts',
        `const env = {} ${unknownCast} as NodeJS.ProcessEnv;`,
      ),
      source(
        'app/timer.test.ts',
        `const handle = 1 ${unknownCast} as ReturnType<typeof setTimeout>;`,
      ),
      source(
        'app/focus.test.ts',
        `const element = { focus() {} } ${unknownCast} as HTMLElement;`,
      ),
      source(
        'lib/container.test.ts',
        `const logger = {} ${unknownCast} as typeof import('./logger').logger;`,
      ),
      source(
        'app/exhaustive.test.ts',
        `const impossible = 'unknown' ${unknownCast} as never;`,
      ),
      source(
        'src/adapters/repositories/drizzle-question-repository.test.ts',
        `const status = 'unknown' ${unknownCast} as QuestionProgressStatus;`,
      ),
    ];

    expect(collectUnknownDoubleCastOccurrences(sources)).toEqual([]);
  });

  it('keeps intentional-invalid patterns narrow to their recorded file and expression', () => {
    const cast = ['{} as unknown', 'as QuestionProgressStatus'].join(' ');
    const occurrences = collectUnknownDoubleCastOccurrences([
      source(
        'src/adapters/repositories/other.test.ts',
        `const value = ${cast};`,
      ),
    ]);

    expect(occurrences).toHaveLength(1);
  });

  it('detects an object-literal double for a port that has a fake', () => {
    const occurrences = collectHandRolledPortDoubleOccurrences(
      [
        source(
          'src/application/example.test.ts',
          `
            interface PaymentGateway {
              charge(): Promise<void>;
            }

            const gateway: PaymentGateway = {
              charge: async () => undefined,
            };
          `,
        ),
      ],
      new Set(['PaymentGateway']),
    );

    expect(occurrences).toEqual([
      {
        filePath: 'src/application/example.test.ts',
        lineNumber: 5,
        detail:
          "object literal implements 'PaymentGateway', which already has a maintained fake",
      },
    ]);
  });

  it('detects object-literal doubles typed through a Pick of a maintained port', () => {
    const occurrences = collectHandRolledPortDoubleOccurrences(
      [
        source(
          'src/application/example.test.ts',
          `
            interface PaymentGateway {
              charge(): Promise<void>;
              refund(): Promise<void>;
            }

            const gateway: Pick<PaymentGateway, 'charge'> = {
              charge: async () => undefined,
            };
          `,
        ),
      ],
      new Set(['PaymentGateway']),
    );

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]?.detail).toContain("'PaymentGateway'");
  });

  it('traces an inferred helper object back from a maintained-port argument', () => {
    const occurrences = collectHandRolledPortDoubleOccurrences(
      [
        source(
          'src/application/example.test.ts',
          `
            interface PaymentGateway {
              charge(): Promise<void>;
            }

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

    expect(occurrences).toEqual([
      {
        filePath: 'src/application/example.test.ts',
        lineNumber: 6,
        detail:
          "object literal implements 'PaymentGateway', which already has a maintained fake",
      },
    ]);
  });

  it('traces an inferred object variable from a maintained-port argument', () => {
    const occurrences = collectHandRolledPortDoubleOccurrences(
      [
        source(
          'src/application/example.test.ts',
          `
            interface PaymentGateway {
              charge(): Promise<void>;
            }

            const gateway = { charge: async () => undefined };
            function exercise(_gateway: PaymentGateway) {}
            exercise(gateway);
          `,
        ),
      ],
      new Set(['PaymentGateway']),
    );

    expect(occurrences).toEqual([
      {
        filePath: 'src/application/example.test.ts',
        lineNumber: 5,
        detail:
          "object literal implements 'PaymentGateway', which already has a maintained fake",
      },
    ]);
  });

  it('derives maintained port names from barrel fake exports and the adapter-owned Stripe fake', () => {
    const portNames = collectMaintainedFakePortNames({
      barrelSource: source(
        'src/application/test-helpers/fakes/index.ts',
        `
          export { FakePaymentGateway } from './fake-gateways';
          export { FakeQuestionRepository } from './fake-question-repository';
        `,
      ),
      fakeSources: [
        source(
          'src/application/test-helpers/fakes/fake-gateways.ts',
          'export class FakePaymentGateway implements PaymentGateway {}',
        ),
        source(
          'src/application/test-helpers/fakes/fake-question-repository.ts',
          'export class FakeQuestionRepository implements QuestionRepository {}',
        ),
        source(
          'src/adapters/gateways/stripe/test-helpers/fake-stripe-checkout-client.ts',
          'export class FakeStripeCheckoutClient implements StripeClient {}',
        ),
      ],
      additionalFakeClassNames: ['FakeStripeCheckoutClient'],
    });

    expect([...portNames].sort()).toEqual([
      'PaymentGateway',
      'QuestionRepository',
      'StripeClient',
    ]);
  });

  it('locates an adapter-owned additional fake by its exact class declaration', () => {
    const portNames = collectMaintainedFakePortNames({
      barrelSource: source(
        'src/application/test-helpers/fakes/index.ts',
        "export { FakePaymentGateway } from './fake-gateways';",
      ),
      fakeSources: [
        source(
          'src/application/test-helpers/fakes/fake-gateways.ts',
          'export class FakePaymentGateway implements PaymentGateway {}',
        ),
        source(
          'src/adapters/gateways/stripe/test-helpers/legacy-client.ts',
          'export class FakeStripeCheckoutClientLegacy implements LegacyClient {}',
        ),
        source(
          'src/adapters/gateways/stripe/test-helpers/fake-stripe-checkout-client.ts',
          'export class FakeStripeCheckoutClient implements StripeClient {}',
        ),
      ],
      additionalFakeClassNames: ['FakeStripeCheckoutClient'],
    });

    expect(portNames).toEqual(new Set(['PaymentGateway', 'StripeClient']));
  });

  it('loads the repository compiler options needed to resolve aliased port types', () => {
    const options = readRepositoryCompilerOptions();

    expect(options.paths?.['@/*']).toEqual(['./*']);
    expect(options.strict).toBe(true);
  });

  it('detects growth above a per-file ratchet floor', () => {
    const occurrences: TestDoubleOccurrence[] = [
      {
        filePath: 'app/example.test.ts',
        lineNumber: 1,
        detail: 'first existing site',
      },
      {
        filePath: 'app/example.test.ts',
        lineNumber: 2,
        detail: 'new site',
      },
    ];

    expect(
      collectRatchetGrowthIssues(
        'own-code module mock',
        occurrences,
        new Map([['app/example.test.ts', 1]]),
      ),
    ).toEqual([
      'app/example.test.ts has 2 own-code module mock site(s), above its ratchet floor of 1 (new site at line 2).',
    ]);
  });
});

describe('live test-double fidelity ratchets', () => {
  it('blocks growth in own-code module mocks', () => {
    expect(inject('testDoubleRatchetIssues').ownCodeModuleMocks).toEqual([]);
  });

  it('blocks growth in unknown double casts outside the allowlist', () => {
    expect(inject('testDoubleRatchetIssues').unknownDoubleCasts).toEqual([]);
  });

  it('blocks growth in object-literal doubles for maintained fake ports', () => {
    expect(inject('testDoubleRatchetIssues').handRolledPortDoubles).toEqual([]);
  });
});
