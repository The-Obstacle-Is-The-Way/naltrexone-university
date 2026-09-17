import { expect, type Page } from '@playwright/test';
import postgres from 'postgres';
import type Stripe from 'stripe';
import { TERMS_CONTENT_SHA256, TERMS_VERSION } from '@/lib/pricing-data';
import { createStripeTestClient } from './stripe-test-client';

type DisplayedConsent = {
  disclosureSnapshot: string;
  disclosureVersion: string;
};

export async function readDisplayedPlanConsent(
  page: Page,
): Promise<DisplayedConsent> {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const rows = await dialog
    .locator('dl > div')
    .evaluateAll((elements) =>
      elements.map(
        (row) =>
          `${row.querySelector('dt')?.textContent?.trim()} ${row.querySelector('dd')?.textContent?.trim()}`,
      ),
    );
  const sentence = await dialog.locator('form > p').innerText();
  return {
    disclosureSnapshot: [...rows, sentence].join('\n'),
    disclosureVersion: await dialog
      .locator('input[name="disclosureVersion"]')
      .inputValue(),
  };
}

export async function expectE2ECheckoutConsent(
  page: Page,
  expected: DisplayedConsent & { plan: 'monthly' | 'annual' },
): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const email = process.env.E2E_CLERK_USER_USERNAME;
  if (!databaseUrl || !email)
    throw new Error(
      'The isolated E2E database and user must be configured before checking consent.',
    );
  if (!['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname)) {
    throw new Error(
      'Consent evidence requires the isolated local E2E database.',
    );
  }
  const sql = postgres(databaseUrl, { max: 1 });
  let checkoutSessionId: string | undefined;
  try {
    const [subscription] = await sql`
      SELECT subscription.stripe_subscription_id AS id, app_user.id AS "userId"
      FROM users app_user
      JOIN stripe_subscriptions subscription ON subscription.user_id = app_user.id
      WHERE app_user.email = ${email}
    `;
    if (!subscription)
      throw new Error('Checkout did not persist a subscription.');
    checkoutSessionId = await deliverLocalCheckoutEvent(
      page,
      subscription.id,
      subscription.userId,
    );
    await expect
      .poll(
        async () => {
          const rows = await sql`
        SELECT consent.plan,
          consent.disclosure_snapshot AS "disclosureSnapshot",
          consent.disclosure_version AS "disclosureVersion",
          consent.terms_version AS "termsVersion",
          consent.terms_hash AS "termsHash",
          consent.retain_until >= consent.accepted_at + interval '3 years' AS "retainedForThreeYears"
        FROM users app_user
        JOIN stripe_subscriptions subscription ON subscription.user_id = app_user.id
        JOIN renewal_consent_records consent ON consent.user_id = app_user.id
          AND consent.stripe_subscription_id = subscription.stripe_subscription_id
        WHERE app_user.email = ${email} AND consent.checkout_session_id IS NOT NULL
        ORDER BY consent.accepted_at DESC
        LIMIT 1
      `;
          return rows[0] ?? null;
        },
        { timeout: 15_000 },
      )
      .toEqual({
        ...expected,
        termsVersion: TERMS_VERSION,
        termsHash: TERMS_CONTENT_SHA256,
        retainedForThreeYears: true,
      });
  } finally {
    try {
      if (checkoutSessionId) {
        // Keep consent evidence, but remove this run's queued test email so a
        // later integration cron cannot consume an unrelated E2E delivery.
        await sql`
          DELETE FROM renewal_notice_deliveries delivery
          USING renewal_consent_records consent, users app_user
          WHERE delivery.consent_record_id = consent.id
            AND consent.user_id = app_user.id AND app_user.email = ${email}
            AND consent.checkout_session_id = ${checkoutSessionId}
            AND delivery.notice_kind = 'acknowledgment'
        `;
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
}

async function deliverLocalCheckoutEvent(
  page: Page,
  subscriptionId: string,
  userId: string,
) {
  const appUrl = new URL(page.url());
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!['localhost', '127.0.0.1'].includes(appUrl.hostname) || !webhookSecret) {
    throw new Error(
      'Consent evidence replay requires a local app and its webhook secret.',
    );
  }
  if (process.env.RESEND_API_KEY) {
    throw new Error(
      'Disable email delivery before replaying hosted Checkout evidence.',
    );
  }
  const stripe = createStripeTestClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customer = await stripe.customers.retrieve(
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id,
  );
  if (
    subscription.livemode ||
    subscription.metadata.user_id !== userId ||
    customer.deleted ||
    !process.env.E2E_STRIPE_OWNER ||
    customer.metadata.e2e_owner !== process.env.E2E_STRIPE_OWNER
  ) {
    throw new Error(
      'Checkout evidence must belong to this E2E Stripe test owner.',
    );
  }
  const sessions = await stripe.checkout.sessions.list({
    subscription: subscriptionId,
    limit: 1,
  });
  const session = sessions.data[0];
  if (session?.status !== 'complete')
    throw new Error('Expected a completed hosted Checkout session.');
  let event: Stripe.Event | undefined;
  await expect
    .poll(
      async () => {
        const events = await stripe.events.list({
          type: 'checkout.session.completed',
          created: { gte: session.created },
          limit: 100,
        });
        event = events.data.find(
          (candidate) =>
            candidate.type === 'checkout.session.completed' &&
            candidate.data.object.id === session.id,
        );
        return event?.id;
      },
      { timeout: 15_000 },
    )
    .toBeTruthy();
  if (!event || event.livemode)
    throw new Error('Expected a real Stripe test Checkout completion event.');
  // Stripe cannot push to localhost. Replay its actual event through the signed
  // HTTP route; eager success sync grants access but does not write consent.
  const payload = JSON.stringify(event);
  const response = await page.request.post(
    new URL('/api/stripe/webhook', appUrl).href,
    {
      data: payload,
      headers: {
        'content-type': 'application/json',
        'stripe-signature': stripe.webhooks.generateTestHeaderString({
          payload,
          secret: webhookSecret,
        }),
      },
    },
  );
  expect(response.ok()).toBe(true);
  return session.id;
}
