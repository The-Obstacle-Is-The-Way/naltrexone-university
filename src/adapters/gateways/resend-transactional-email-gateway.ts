import { type ErrorResponse, Resend } from 'resend';
import { ApplicationError } from '@/src/application/errors';
import type {
  TransactionalEmailGateway,
  TransactionalEmailSendInput,
  TransactionalEmailSendResult,
} from '@/src/application/ports/transactional-email-gateway';

const TRANSIENT_RESEND_ERRORS = new Set<ErrorResponse['name']>([
  'application_error',
  'daily_quota_exceeded',
  'internal_server_error',
  'monthly_quota_exceeded',
  'rate_limit_exceeded',
]);
const TERMINAL_RESEND_ERRORS = new Set<ErrorResponse['name']>([
  'invalid_idempotency_key',
  'validation_error',
  'missing_api_key',
  'restricted_api_key',
  'invalid_api_key',
  'not_found',
  'method_not_allowed',
  'invalid_idempotent_request',
  'invalid_attachment',
  'invalid_from_address',
  'invalid_access',
  'invalid_parameter',
  'invalid_region',
  'missing_required_field',
  'security_error',
]);
export const RESEND_PROVIDER_TIMEOUT_MS = 10_000;

class ResendProviderTimeoutError extends Error {
  readonly code = 'provider_timeout';
}

function getThrownFailureCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }
  return 'provider_exception';
}

export class ResendTransactionalEmailGateway
  implements TransactionalEmailGateway
{
  private readonly client: Resend | null;
  private readonly timeoutMs: number;

  constructor(input: { apiKey: string | undefined; timeoutMs?: number }) {
    this.client = input.apiKey ? new Resend(input.apiKey) : null;
    this.timeoutMs = input.timeoutMs ?? RESEND_PROVIDER_TIMEOUT_MS;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async send(
    input: TransactionalEmailSendInput,
  ): Promise<TransactionalEmailSendResult> {
    if (!this.client) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Transactional email gateway is not configured',
      );
    }

    try {
      const providerCall = this.client.emails.send(input.payload, {
        idempotencyKey: input.idempotencyKey,
      });
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const timeoutResult = new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new ResendProviderTimeoutError()),
          this.timeoutMs,
        );
      });
      const { data, error } = await Promise.race([
        providerCall,
        timeoutResult,
      ]).finally(() => {
        if (timeout) clearTimeout(timeout);
      });

      if (error) {
        if (error.name === 'concurrent_idempotent_requests') {
          return {
            status: 'outcome_unknown',
            failureCode: error.name,
          };
        }
        if (TRANSIENT_RESEND_ERRORS.has(error.name)) {
          return {
            status: 'transient_failure',
            failureCode: error.name,
          };
        }
        if (TERMINAL_RESEND_ERRORS.has(error.name)) {
          return {
            status: 'terminal_failure',
            failureCode: error.name,
          };
        }
        // An explicit provider error proves non-acceptance. Unknown future
        // names are safe to retry; they are not an ambiguous send outcome.
        return {
          status: 'transient_failure',
          failureCode: error.name,
        };
      }
      if (data && typeof data.id === 'string' && data.id.length > 0) {
        return { status: 'delivered', providerEventId: data.id };
      }
      return {
        status: 'outcome_unknown',
        failureCode: 'invalid_provider_response',
      };
    } catch (error) {
      return {
        status: 'outcome_unknown',
        failureCode: getThrownFailureCode(error),
      };
    }
  }
}
