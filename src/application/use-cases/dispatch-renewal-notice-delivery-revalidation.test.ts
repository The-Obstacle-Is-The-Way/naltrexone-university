import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/src/application/errors';
import {
  createTransactionalEmailPayloadSnapshot,
  getRenewalNoticeProviderIdempotencyKey,
} from '@/src/application/shared/transactional-email-payload';
import {
  FakeLogger,
  FakeRenewalNoticeDeliveryRepository,
  FakeSha256Hasher,
  FakeSubscriptionRepository,
  FakeTransactionalEmailGateway,
  FakeUserRepository,
} from '@/src/application/test-helpers/fakes';
import type {
  NewRenewalNoticeDelivery,
  Subscription,
} from '@/src/domain/entities';
import { DAY_MS } from '@/src/domain/services';
import { createSubscription } from '@/src/domain/test-helpers';
import { DispatchRenewalNoticeDeliveryUseCase } from './dispatch-renewal-notice-delivery';

// DEBT-414 F07: a queued renewal notice is immutable, but the facts it states
// can change before it is sent. Dispatch revalidates the subscription and the
// recipient first, and refuses to send past the statutory minimum.
const now = new Date('2026-08-06T18:00:00.000Z');
const renewal = new Date(now.getTime() + 35 * DAY_MS);
const deliveryId = '11111111-1111-4111-8111-111111111111';
const externalSubscriptionId = 'sub_annual_revalidation';
const email = 'subscriber@example.com';
const hasher = new FakeSha256Hasher();

function renewalNotice(
  overrides: Partial<NewRenewalNoticeDelivery> = {},
): NewRenewalNoticeDelivery {
  const { snapshot, hash } = createTransactionalEmailPayloadSnapshot(
    {
      from: 'Addiction Boards <notices@addictionboards.com>',
      to: email,
      replyTo: 'support@addictionboards.com',
      subject: 'Upcoming annual subscription renewal',
      html: '<p>Renewal notice</p>',
      text: 'Renewal notice',
    },
    hasher,
  );
  return {
    id: deliveryId,
    noticeKind: 'renewal_notice',
    consentRecordId: null,
    externalSubscriptionId,
    applicableAt: renewal,
    disclosureVersion: '2026-08-05',
    destination: email,
    providerIdempotencyKey: getRenewalNoticeProviderIdempotencyKey(deliveryId),
    payloadSnapshot: snapshot,
    payloadHash: hash,
    ...overrides,
  };
}

async function arrange(input: {
  delivery?: NewRenewalNoticeDelivery;
  subscription?: Partial<Subscription> | null;
  accountEmail?: string;
  currentTime?: Date;
  providerConfigured?: boolean;
}) {
  const users = new FakeUserRepository();
  const user = await users.upsertByClerkId(
    'clerk_revalidation',
    input.accountEmail ?? email,
  );
  const subscriptions = new FakeSubscriptionRepository(
    input.subscription === null
      ? []
      : [
          {
            subscription: createSubscription({
              userId: user.id,
              plan: 'annual',
              status: 'active',
              currentPeriodEnd: renewal,
              cancelAtPeriodEnd: false,
              ...input.subscription,
            }),
            externalSubscriptionId,
          },
        ],
  );
  const repository = new FakeRenewalNoticeDeliveryRepository(() => now);
  await repository.saveQueued(input.delivery ?? renewalNotice());
  const gateway = new FakeTransactionalEmailGateway({
    configured: input.providerConfigured ?? true,
  });
  const logger = new FakeLogger();
  const useCase = new DispatchRenewalNoticeDeliveryUseCase(
    repository,
    gateway,
    { subscriptions, users },
    hasher,
    logger,
    () => input.currentTime ?? now,
    () => 'attempt-1',
  );
  return { useCase, gateway, logger, repository };
}

describe('DispatchRenewalNoticeDeliveryUseCase revalidation', () => {
  it('sends a renewal notice whose subscription and recipient still match', async () => {
    const { useCase, gateway } = await arrange({});

    await expect(useCase.execute({ deliveryId })).resolves.toMatchObject({
      outcome: 'attempted',
      delivery: { status: 'accepted' },
    });
    expect(gateway.sendInputs).toHaveLength(1);
  });

  it.each([
    {
      label: 'the subscription is set to cancel at period end',
      arrangement: { subscription: { cancelAtPeriodEnd: true } },
      failureCode: 'subscription_canceling',
    },
    {
      label: 'the renewal date moved',
      arrangement: {
        subscription: {
          currentPeriodEnd: new Date(renewal.getTime() + DAY_MS),
        },
      },
      failureCode: 'renewal_date_changed',
    },
    {
      label: 'the subscription is no longer active',
      arrangement: { subscription: { status: 'canceled' as const } },
      failureCode: 'subscription_not_active',
    },
    {
      label: 'the subscription no longer exists',
      arrangement: { subscription: null },
      failureCode: 'subscription_missing',
    },
    {
      label: 'the account email changed',
      arrangement: { accountEmail: 'new-address@example.com' },
      failureCode: 'destination_changed',
    },
    {
      label: 'the account no longer exists',
      arrangement: { subscription: { userId: crypto.randomUUID() } },
      failureCode: 'destination_changed',
    },
    // #1156 review: the notice states the annual amount and yearly frequency.
    {
      label: 'the subscription moved off the annual plan',
      arrangement: { subscription: { plan: 'monthly' as const } },
      failureCode: 'subscription_plan_changed',
    },
  ])(
    'supersedes the notice without a provider call when $label',
    async ({ arrangement, failureCode }) => {
      const { useCase, gateway, logger } = await arrange(arrangement);

      await expect(useCase.execute({ deliveryId })).resolves.toMatchObject({
        outcome: 'attempted',
        delivery: {
          status: 'terminal_failure',
          failureClass: 'notice_superseded',
          failureCode,
        },
      });
      expect(gateway.sendInputs).toEqual([]);
      expect(logger.errorCalls).toEqual([]);
    },
  );

  it('refuses and alerts once the send-by cutoff, 30 days before renewal, has passed', async () => {
    const { useCase, gateway, logger } = await arrange({
      currentTime: new Date(renewal.getTime() - 30 * DAY_MS + 1),
    });

    await expect(useCase.execute({ deliveryId })).resolves.toMatchObject({
      outcome: 'attempted',
      delivery: {
        status: 'terminal_failure',
        failureClass: 'notice_deadline_passed',
        failureCode: 'send_by_cutoff_passed',
      },
    });
    expect(gateway.sendInputs).toEqual([]);
    expect(logger.errorCalls).toEqual([
      {
        msg: 'Renewal notice send-by cutoff passed',
        context: { deliveryId, noticeKind: 'renewal_notice' },
      },
    ]);
  });

  // #1156 review: a refusal is a fact about the notice, not the provider, so it
  // is recorded, and a missed cutoff alerts, before the configuration check.
  it('supersedes a stale notice even when no email provider is configured', async () => {
    const { useCase, gateway } = await arrange({
      subscription: { cancelAtPeriodEnd: true },
      providerConfigured: false,
    });

    await expect(useCase.execute({ deliveryId })).resolves.toMatchObject({
      outcome: 'attempted',
      delivery: {
        status: 'terminal_failure',
        failureClass: 'notice_superseded',
        failureCode: 'subscription_canceling',
      },
    });
    expect(gateway.sendInputs).toEqual([]);
  });

  it('refuses and alerts on a missed cutoff even when no email provider is configured', async () => {
    const { useCase, gateway, logger } = await arrange({
      currentTime: new Date(renewal.getTime() - 30 * DAY_MS + 1),
      providerConfigured: false,
    });

    await expect(useCase.execute({ deliveryId })).resolves.toMatchObject({
      outcome: 'attempted',
      delivery: {
        status: 'terminal_failure',
        failureClass: 'notice_deadline_passed',
      },
    });
    expect(gateway.sendInputs).toEqual([]);
    expect(logger.errorCalls).toHaveLength(1);
  });

  it('leaves a still-valid notice queued when no email provider is configured', async () => {
    const { useCase, gateway } = await arrange({ providerConfigured: false });

    await expect(useCase.execute({ deliveryId })).resolves.toMatchObject({
      outcome: 'skipped_unconfigured',
      delivery: { status: 'queued' },
    });
    expect(gateway.sendInputs).toEqual([]);
  });

  it('still sends exactly at the cutoff', async () => {
    const { useCase, gateway } = await arrange({
      currentTime: new Date(renewal.getTime() - 30 * DAY_MS),
    });

    await useCase.execute({ deliveryId });

    expect(gateway.sendInputs).toHaveLength(1);
  });

  it('does not revalidate an acknowledgment, which records consent already given', async () => {
    const { useCase, gateway } = await arrange({
      subscription: null,
      delivery: renewalNotice({
        noticeKind: 'acknowledgment',
        consentRecordId: '22222222-2222-4222-8222-222222222222',
        externalSubscriptionId: null,
        applicableAt: null,
      }),
    });

    await useCase.execute({ deliveryId });

    expect(gateway.sendInputs).toHaveLength(1);
  });

  // DEBT-414 F02: a monthly subscriber's yearly reminder is revalidated
  // against the renewal recomputed from the current service start and anchor.
  describe('anniversary reminder', () => {
    const anchor = new Date(renewal.getTime());
    anchor.setUTCFullYear(anchor.getUTCFullYear() - 1);
    const monthly = {
      plan: 'monthly' as const,
      startedAt: anchor,
      billingCycleAnchor: anchor,
      currentPeriodEnd: new Date(renewal.getTime() - 30 * DAY_MS),
    };
    const anniversaryNotice = () =>
      renewalNotice({ noticeKind: 'anniversary_reminder' });

    it('sends when the recomputed renewal still matches', async () => {
      const { useCase, gateway } = await arrange({
        delivery: anniversaryNotice(),
        subscription: monthly,
      });

      await expect(useCase.execute({ deliveryId })).resolves.toMatchObject({
        delivery: { status: 'accepted' },
      });
      expect(gateway.sendInputs).toHaveLength(1);
    });

    it.each([
      {
        label: 'the subscription moved to the annual plan',
        subscription: { ...monthly, plan: 'annual' as const },
        failureCode: 'subscription_plan_changed',
      },
      {
        label: 'the subscription is set to cancel at period end',
        subscription: { ...monthly, cancelAtPeriodEnd: true },
        failureCode: 'subscription_canceling',
      },
      {
        label: 'the billing anchor moved the renewal',
        subscription: {
          ...monthly,
          billingCycleAnchor: new Date(anchor.getTime() + DAY_MS),
        },
        failureCode: 'renewal_date_changed',
      },
      {
        label: 'the service start is unknown',
        subscription: { ...monthly, startedAt: null },
        failureCode: 'anniversary_unknown',
      },
      {
        label: 'the billing anchor is unknown',
        subscription: { ...monthly, billingCycleAnchor: null },
        failureCode: 'anniversary_unknown',
      },
    ])(
      'supersedes without a provider call when $label',
      async ({ subscription, failureCode }) => {
        const { useCase, gateway } = await arrange({
          delivery: anniversaryNotice(),
          subscription,
        });

        await expect(useCase.execute({ deliveryId })).resolves.toMatchObject({
          delivery: {
            status: 'terminal_failure',
            failureClass: 'notice_superseded',
            failureCode,
          },
        });
        expect(gateway.sendInputs).toEqual([]);
      },
    );

    it('refuses and alerts once the send-by cutoff has passed', async () => {
      const { useCase, gateway, logger } = await arrange({
        delivery: anniversaryNotice(),
        subscription: monthly,
        currentTime: new Date(renewal.getTime() - 30 * DAY_MS + 1),
      });

      await expect(useCase.execute({ deliveryId })).resolves.toMatchObject({
        delivery: {
          status: 'terminal_failure',
          failureClass: 'notice_deadline_passed',
        },
      });
      expect(gateway.sendInputs).toEqual([]);
      expect(logger.errorCalls).toHaveLength(1);
    });
  });

  it('revalidates an annual reminder as it does a renewal notice', async () => {
    const { useCase, gateway } = await arrange({
      delivery: renewalNotice({ noticeKind: 'annual_reminder' }),
      subscription: { plan: 'monthly' },
    });

    await expect(useCase.execute({ deliveryId })).resolves.toMatchObject({
      delivery: {
        status: 'terminal_failure',
        failureClass: 'notice_superseded',
        failureCode: 'subscription_plan_changed',
      },
    });
    expect(gateway.sendInputs).toEqual([]);
  });

  // The send-by cutoff is for reminders of a renewal; a change notice has no
  // such deadline.
  it('sends a fee-change notice past a renewal reminder’s cutoff', async () => {
    const { useCase, gateway } = await arrange({
      delivery: renewalNotice({ noticeKind: 'fee_change' }),
      currentTime: new Date(renewal.getTime() - 30 * DAY_MS + 1),
    });

    await expect(useCase.execute({ deliveryId })).resolves.toMatchObject({
      delivery: { status: 'accepted' },
    });
    expect(gateway.sendInputs).toHaveLength(1);
  });

  it('fails loudly on a scheduled notice without an applicable date', async () => {
    const { useCase, gateway, repository } = await arrange({});
    const [queued] = repository.records;
    if (!queued) throw new Error('Expected a queued notice');
    repository.records[0] = { ...queued, applicableAt: null };

    await expect(useCase.execute({ deliveryId })).rejects.toEqual(
      new ApplicationError(
        'INTERNAL_ERROR',
        'Scheduled renewal notice has no applicable date',
      ),
    );
    expect(gateway.sendInputs).toEqual([]);
  });
});
