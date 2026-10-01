import { describe, expect, it } from 'vitest';
import { parseTransactionalEmailPayloadSnapshot } from '@/src/application/shared/transactional-email-payload';
import {
  FakeLogger,
  FakeRenewalNoticeDeliveryRepository,
  FakeSha256Hasher,
  FakeTransactionalEmailGateway,
} from '@/src/application/test-helpers/fakes';
import { createMatchingRenewalNoticeTargets } from '@/src/application/test-helpers/renewal-notice-targets';
import { DispatchRenewalNoticeDeliveryUseCase } from './dispatch-renewal-notice-delivery';
import {
  type ScheduledRenewalNotice,
  SendDueRenewalNoticesUseCase,
} from './send-due-renewal-notices';

// What each scheduled renewal notice says. The notice is the subscriber's
// statutory notice of renewal or change, so its content is the behavior.
const now = new Date('2026-08-07T12:00:00.000Z');
const renewalAt = new Date('2026-09-06T12:00:00.000Z');

function scheduledNotice(
  overrides: Partial<ScheduledRenewalNotice> = {},
): ScheduledRenewalNotice {
  return {
    noticeKind: 'renewal_notice',
    externalSubscriptionId: 'sub_annual_123',
    applicableAt: renewalAt,
    disclosureVersion: '2026-08-05',
    destination: 'subscriber@example.com',
    planName: 'Pro Annual',
    amountCents: 19900,
    currency: 'usd',
    frequency: 'year',
    // As production states it (lib/pricing-data.ts).
    cancellationMethod:
      'Billing page in the app or support@addictionboards.com',
    changeDescription: null,
    ...overrides,
  };
}

// Queues the notices with no email provider configured, so nothing is sent,
// and returns each queued payload in order.
async function queuedPayloads(notices: readonly ScheduledRenewalNotice[]) {
  const hasher = new FakeSha256Hasher();
  const repository = new FakeRenewalNoticeDeliveryRepository(() => now, hasher);
  const dispatch = new DispatchRenewalNoticeDeliveryUseCase(
    repository,
    new FakeTransactionalEmailGateway({ configured: false }),
    await createMatchingRenewalNoticeTargets({
      externalSubscriptionIds: notices.map(
        (notice) => notice.externalSubscriptionId,
      ),
      renewalAt,
      destination: 'subscriber@example.com',
    }),
    hasher,
    new FakeLogger(),
    () => now,
    () => 'attempt-1',
  );
  let sequence = 0;
  await new SendDueRenewalNoticesUseCase(
    repository,
    hasher,
    dispatch,
    new FakeLogger(),
    'https://addictionboards.com',
    () => now,
    () => `11111111-1111-4111-8111-${String(++sequence).padStart(12, '0')}`,
  ).execute({ notices, limit: 100 });
  return repository.records.map((row) =>
    parseTransactionalEmailPayloadSnapshot(
      {
        snapshot: row.payloadSnapshot,
        hash: row.payloadHash,
        destination: row.destination,
      },
      hasher,
    ),
  );
}

describe('SendDueRenewalNoticesUseCase notice content', () => {
  // DEBT-414 F06: the notice says renewal happens unless canceled, gives the
  // exact cutoff with its zone, links the online cancellation route, and
  // states the cancellation policy the Terms publish.
  it('sends the exact annual renewal notice text and HTML', async () => {
    const [payload] = await queuedPayloads([scheduledNotice()]);

    expect(payload).toEqual({
      from: 'Addiction Boards <notices@addictionboards.com>',
      to: 'subscriber@example.com',
      replyTo: 'support@addictionboards.com',
      subject: 'Addiction Boards — Upcoming annual subscription renewal',
      text: [
        'Upcoming annual subscription renewal for Pro Annual.',
        'Your Addiction Boards Pro Annual subscription renews automatically unless you cancel.',
        'Cancel before September 6, 2026 at 12:00 PM UTC (8:00 AM EDT, 5:00 AM PDT) to avoid the renewal charge.',
        'Renewal amount and frequency: $199.00 USD every year.',
        'How to cancel: Billing page in the app or support@addictionboards.com.',
        'Cancel online on the Billing page: https://addictionboards.com/app/billing',
        'Or email support@addictionboards.com from the email address on your account.',
        'Cancellation takes effect at the end of the current trial or paid billing period; you keep access until then. Except where the law requires otherwise, payments are non-refundable.',
        'Business contact: John H. Jung, MD, MS, sole proprietor — support@addictionboards.com.',
        'Terms: https://addictionboards.com/terms',
        'Privacy: https://addictionboards.com/privacy',
      ].join('\n'),
      html: [
        '<p>Upcoming annual subscription renewal for Pro Annual.</p>',
        '<p>Your Addiction Boards Pro Annual subscription renews automatically unless you cancel.</p>',
        '<p>Cancel before September 6, 2026 at 12:00 PM UTC (8:00 AM EDT, 5:00 AM PDT) to avoid the renewal charge.</p>',
        '<p>Renewal amount and frequency: $199.00 USD every year.</p>',
        '<p>How to cancel: Billing page in the app or support@addictionboards.com.</p>',
        '<p>Cancel online on the Billing page: <a href="https://addictionboards.com/app/billing">https://addictionboards.com/app/billing</a></p>',
        '<p>Or email <a href="mailto:support@addictionboards.com">support@addictionboards.com</a> from the email address on your account.</p>',
        '<p>Cancellation takes effect at the end of the current trial or paid billing period; you keep access until then. Except where the law requires otherwise, payments are non-refundable.</p>',
        '<p>Business contact: John H. Jung, MD, MS, sole proprietor — support@addictionboards.com.</p>',
        '<p>Terms: <a href="https://addictionboards.com/terms">https://addictionboards.com/terms</a></p>',
        '<p>Privacy: <a href="https://addictionboards.com/privacy">https://addictionboards.com/privacy</a></p>',
      ].join(''),
    });
  });

  it.each([
    ['annual_reminder', 'Annual subscription reminder'],
    ['renewal_notice', 'Upcoming annual subscription renewal'],
    ['material_change', 'Material subscription change'],
    ['fee_change', 'Subscription fee change'],
    ['anniversary_reminder', 'Yearly reminder about your monthly subscription'],
  ] as const)('heads a %s with “%s”', async (noticeKind, heading) => {
    const [payload] = await queuedPayloads([
      scheduledNotice({ noticeKind, changeDescription: 'A described change.' }),
    ]);

    expect(payload?.subject).toBe(`Addiction Boards — ${heading}`);
    expect(payload?.text.split('\n')[0]).toBe(`${heading} for Pro Annual.`);
  });

  // DEBT-414 F02: a monthly subscriber's yearly reminder names the renewal
  // that carries the subscription into another year, and its cutoff.
  it('reminds a monthly subscriber before the renewal that starts another year', async () => {
    const [payload] = await queuedPayloads([
      scheduledNotice({
        noticeKind: 'anniversary_reminder',
        externalSubscriptionId: 'sub_monthly_123',
        planName: 'Pro Monthly',
        amountCents: 2900,
        frequency: 'month',
      }),
    ]);

    expect(payload?.text.split('\n').slice(1, 5)).toEqual([
      'Your Addiction Boards Pro Monthly subscription renews automatically every month unless you cancel.',
      'This is your yearly reminder: the renewal on September 6, 2026 at 12:00 PM UTC (8:00 AM EDT, 5:00 AM PDT) continues your subscription into another year.',
      'Cancel before that time to avoid the renewal charge.',
      'Renewal amount and frequency: $29.00 USD every month.',
    ]);
  });

  it('states the effective date and the change of a material-change and a fee-change notice', async () => {
    const [material, fee] = await queuedPayloads([
      scheduledNotice({
        noticeKind: 'material_change',
        externalSubscriptionId: 'sub_material',
        changeDescription:
          'The annual renewal terms will change on the date shown.',
      }),
      scheduledNotice({
        noticeKind: 'fee_change',
        externalSubscriptionId: 'sub_fee',
        changeDescription: 'The annual price will change to $219.',
      }),
    ]);

    expect(material?.text.split('\n').slice(1, 3)).toEqual([
      'Material change effective: September 6, 2026.',
      'Change: The annual renewal terms will change on the date shown.',
    ]);
    expect(fee?.text.split('\n').slice(1, 3)).toEqual([
      'Fee change effective: September 6, 2026.',
      'Change: The annual price will change to $219.',
    ]);
  });

  it('escapes notice text before linking it into HTML', async () => {
    const [payload] = await queuedPayloads([
      scheduledNotice({ planName: 'Pro <Annual>' }),
    ]);

    expect(payload?.html).toContain('Pro &lt;Annual&gt;');
    expect(payload?.html).not.toContain('Pro <Annual>');
  });
});
