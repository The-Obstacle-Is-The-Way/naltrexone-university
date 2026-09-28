// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  FakeAuthGateway,
  FakeSubscriptionRepository,
  FakeTrialPaymentMethodSetupOperationRepository,
} from '@/src/application/test-helpers/fakes';
import { seedTrialSetupOperation } from '@/src/application/test-helpers/trial-payment-method-setup-operations';
import { CheckTrialSavedCardUseCase } from '@/src/application/use-cases';
import { createSubscription, createUser } from '@/src/domain/test-helpers';
import { parseHtml } from '@/tests/shared/dom-helpers';

let BillingPage: typeof import('./page').default;
let BillingContent: typeof import('./page').BillingContent;

beforeAll(async () => {
  ({ default: BillingPage, BillingContent } = await import('./page'));
});

// BUG-308: Billing names the plan and status, says whether a trial renews on
// a saved card, and acknowledges the learner's return from the add-card flow.
describe('Billing for a trial learner', () => {
  const user = createUser({ id: crypto.randomUUID() });

  async function renderBillingPage(input: {
    cardSaved: boolean;
    trialPaymentMethod?: string;
  }) {
    const subscriptions = new FakeSubscriptionRepository([
      {
        subscription: createSubscription({
          userId: user.id,
          status: 'inTrial',
        }),
        externalSubscriptionId: 'sub_trial',
      },
    ]);
    const operations = new FakeTrialPaymentMethodSetupOperationRepository();
    if (input.cardSaved) {
      await seedTrialSetupOperation(operations, {
        userId: user.id,
        stripeSubscriptionId: 'sub_trial',
        stage: 'completed',
      });
    }
    const element = await BillingPage({
      deps: {
        authGateway: new FakeAuthGateway(user),
        subscriptionRepository: subscriptions,
        checkTrialSavedCardUseCase: new CheckTrialSavedCardUseCase(
          subscriptions,
          operations,
        ),
      },
      searchParams: Promise.resolve(
        input.trialPaymentMethod
          ? { trial_payment_method: input.trialPaymentMethod }
          : {},
      ),
    });
    return parseHtml(renderToStaticMarkup(element));
  }

  it('names the plan and status instead of raw values', () => {
    const doc = parseHtml(
      renderToStaticMarkup(
        <BillingContent
          subscription={createSubscription({
            plan: 'monthly',
            status: 'active',
          })}
          manageBillingAction={async () => undefined}
        />,
      ),
    );

    expect(doc.body.textContent).toContain('Pro Monthly · Active');
    expect(doc.body.textContent).not.toContain('monthly · active');
  });

  it('states the renewal on a saved card for a trial', async () => {
    const doc = await renderBillingPage({ cardSaved: true });

    expect(doc.body.textContent).toContain('Pro Monthly · Free trial');
    expect(doc.body.textContent).toContain(
      'Renews at $29 per month on your saved card when your trial ends, until you cancel.',
    );
  });

  it('states that a trial without a card ends without a charge', async () => {
    const doc = await renderBillingPage({ cardSaved: false });

    expect(doc.body.textContent).toContain(
      'No card on file. Your trial ends without a charge unless you add a card from the trial banner.',
    );
  });

  it.each([
    ['success', true, 'Your card is saved.'],
    [
      'success',
      false,
      'Stripe is confirming your card. Refresh this page in a moment.',
    ],
    ['cancel', false, 'No card was added. Your trial continues.'],
  ] as const)(
    'acknowledges trial_payment_method=%s with a saved card=%s',
    async (trialPaymentMethod, cardSaved, message) => {
      const doc = await renderBillingPage({ cardSaved, trialPaymentMethod });

      expect(doc.querySelector('[role="status"]')?.textContent).toBe(message);
    },
  );

  it('shows no return notice without the add-card return parameter', async () => {
    const doc = await renderBillingPage({ cardSaved: true });

    expect(doc.querySelector('[role="status"]')).toBeNull();
  });
});
