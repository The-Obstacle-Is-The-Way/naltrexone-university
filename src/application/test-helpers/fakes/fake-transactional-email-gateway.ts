import { ApplicationError } from '@/src/application/errors';
import type {
  TransactionalEmailGateway,
  TransactionalEmailSendInput,
  TransactionalEmailSendResult,
} from '@/src/application/ports/transactional-email-gateway';

export class FakeTransactionalEmailGateway
  implements TransactionalEmailGateway
{
  readonly sendInputs: TransactionalEmailSendInput[] = [];
  private readonly configured: boolean;
  private readonly results: TransactionalEmailSendResult[];
  private readonly onSend:
    | ((input: TransactionalEmailSendInput) => void | Promise<void>)
    | undefined;

  constructor(input: {
    configured: boolean;
    results?: readonly TransactionalEmailSendResult[];
    onSend?: (input: TransactionalEmailSendInput) => void | Promise<void>;
  }) {
    this.configured = input.configured;
    this.results = [...(input.results ?? [])];
    this.onSend = input.onSend;
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async send(
    input: TransactionalEmailSendInput,
  ): Promise<TransactionalEmailSendResult> {
    if (!this.configured) {
      throw new ApplicationError(
        'INTERNAL_ERROR',
        'Transactional email gateway is not configured',
      );
    }

    this.sendInputs.push(structuredClone(input));
    await this.onSend?.(input);
    return (
      this.results.shift() ?? {
        status: 'delivered',
        providerEventId: 'fake-email-event',
      }
    );
  }
}
