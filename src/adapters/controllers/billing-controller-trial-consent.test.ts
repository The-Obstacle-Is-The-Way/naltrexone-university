// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createTrialPaymentMethodSetupSession } from './billing-controller';
import { createBillingControllerDeps } from './test-helpers/billing-controller-deps';

// DEBT-414 F03b: the trial add-card offer carries the same separate renewal
// opt-in as checkout, and the disclosure version the learner was shown.
describe('createTrialPaymentMethodSetupSession consent', () => {
  const displayed = { expectedDisclosureVersion: '2026-09-28.2' };

  it.each([
    ['omitted', {}],
    ['not affirmative', { renewalOptIn: false }],
  ])(
    'returns VALIDATION_ERROR without a setup session when the renewal opt-in is %s',
    async (_case, optIn) => {
      const deps = createBillingControllerDeps();

      const result = await createTrialPaymentMethodSetupSession(
        { ...displayed, ...optIn },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: { renewalOptIn: expect.any(Array) },
        },
      });
      expect(deps.createTrialPaymentMethodSetupSessionUseCase.inputs).toEqual(
        [],
      );
    },
  );

  it.each([
    ['omitted', {}],
    ['malformed', { expectedDisclosureVersion: 'latest' }],
  ])(
    'returns VALIDATION_ERROR without a setup session when the displayed version is %s',
    async (_case, version) => {
      const deps = createBillingControllerDeps();

      const result = await createTrialPaymentMethodSetupSession(
        { renewalOptIn: true, ...version },
        deps,
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: { expectedDisclosureVersion: expect.any(Array) },
        },
      });
      expect(deps.createTrialPaymentMethodSetupSessionUseCase.inputs).toEqual(
        [],
      );
    },
  );

  // #1183 review: as checkout does, a replayed key is scoped to the displayed
  // version, so a different version cannot reuse a Session made for other
  // terms and must pass the use case's current-terms check.
  it('does not replay a Session for a reused key with a different displayed version', async () => {
    const deps = createBillingControllerDeps();
    const idempotencyKey = crypto.randomUUID();

    await createTrialPaymentMethodSetupSession(
      { idempotencyKey, renewalOptIn: true, ...displayed },
      deps,
    );
    await createTrialPaymentMethodSetupSession(
      {
        idempotencyKey,
        renewalOptIn: true,
        expectedDisclosureVersion: '2026-09-29',
      },
      deps,
    );

    expect(
      deps.createTrialPaymentMethodSetupSessionUseCase.inputs.map(
        (input) => input.expectedDisclosureVersion,
      ),
    ).toEqual(['2026-09-28.2', '2026-09-29']);
  });

  it('passes the displayed version to the use case, which compares it with the current terms', async () => {
    const deps = createBillingControllerDeps();

    const result = await createTrialPaymentMethodSetupSession(
      { ...displayed, renewalOptIn: true },
      deps,
    );

    expect(result).toMatchObject({ ok: true });
    expect(
      deps.createTrialPaymentMethodSetupSessionUseCase.inputs,
    ).toMatchObject([{ expectedDisclosureVersion: '2026-09-28.2' }]);
  });
});
