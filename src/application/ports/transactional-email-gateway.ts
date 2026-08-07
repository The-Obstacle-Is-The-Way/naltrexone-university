export type TransactionalEmailPayload = {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
};

export type TransactionalEmailSendInput = {
  idempotencyKey: string;
  payload: TransactionalEmailPayload;
};

export type TransactionalEmailSendResult =
  | { status: 'delivered'; providerEventId: string }
  | { status: 'transient_failure'; failureCode: string }
  | { status: 'terminal_failure'; failureCode: string }
  | { status: 'outcome_unknown'; failureCode: string };

export interface TransactionalEmailGateway {
  isConfigured(): boolean;
  send(
    input: TransactionalEmailSendInput,
  ): Promise<TransactionalEmailSendResult>;
}
