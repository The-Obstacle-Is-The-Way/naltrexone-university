import { z } from 'zod';
import { ApplicationError } from '@/src/application/errors';
import type { Logger } from '@/src/application/ports/logger';
import type {
  RecordRenewalNoticeProviderOutcomeResult,
  RenewalNoticeProviderOutcome,
} from '@/src/application/ports/repositories';

// The stored failure code's column length.
const FAILURE_CODE_MAX_LENGTH = 128;

export type ResendWebhookDeps = {
  recordProviderOutcome: {
    execute(input: {
      providerEventId: string;
      outcome: RenewalNoticeProviderOutcome;
      observedAt: Date;
    }): Promise<RecordRenewalNoticeProviderOutcomeResult>;
  };
  logger: Pick<Logger, 'debug'>;
};

const eventTypeSchema = z.object({ type: z.string().min(1) });

const emailEventSchema = z.object({
  created_at: z.iso.datetime({ offset: true }),
  data: z.object({
    email_id: z.string().min(1),
    bounce: z.object({ type: z.string() }).optional(),
    suppressed: z.object({ type: z.string() }).optional(),
  }),
});

type EmailEvent = z.infer<typeof emailEventSchema>;

function failureCode(value: string | undefined, fallback: string): string {
  return (value || fallback).slice(0, FAILURE_CODE_MAX_LENGTH);
}

// DEBT-414 F07: what each Resend report means for a renewal notice. A bounce,
// a failure to send and a suppressed address each mean the notice did not
// reach its reader. Only Resend's short type values are stored as the failure
// code, never its free-text reasons, which can name the recipient.
const OUTCOMES: Record<
  string,
  ((event: EmailEvent) => RenewalNoticeProviderOutcome) | undefined
> = {
  'email.delivered': () => ({ kind: 'delivered' }),
  'email.bounced': (event) => ({
    kind: 'failed',
    failureClass: 'provider_bounced',
    failureCode: failureCode(event.data.bounce?.type, 'bounced'),
  }),
  'email.failed': () => ({
    kind: 'failed',
    failureClass: 'provider_send_failed',
    failureCode: 'failed',
  }),
  'email.suppressed': (event) => ({
    kind: 'failed',
    failureClass: 'provider_suppressed',
    failureCode: failureCode(event.data.suppressed?.type, 'suppressed'),
  }),
};

function invalidPayload(): ApplicationError {
  return new ApplicationError(
    'INVALID_WEBHOOK_PAYLOAD',
    'Resend webhook payload is invalid',
  );
}

// Takes a payload whose signature has already been verified.
export async function processResendWebhook(
  deps: ResendWebhookDeps,
  payload: unknown,
): Promise<void> {
  const typed = eventTypeSchema.safeParse(payload);
  if (!typed.success) throw invalidPayload();
  const toOutcome = OUTCOMES[typed.data.type];
  if (!toOutcome) {
    deps.logger.debug(
      { type: typed.data.type },
      'Resend webhook event ignored',
    );
    return;
  }
  const event = emailEventSchema.safeParse(payload);
  if (!event.success) throw invalidPayload();

  await deps.recordProviderOutcome.execute({
    providerEventId: event.data.data.email_id,
    outcome: toOutcome(event.data),
    observedAt: new Date(event.data.created_at),
  });
}
