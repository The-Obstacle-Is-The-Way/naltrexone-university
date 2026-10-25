import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema';
import { NobleSha256Hasher } from '../../src/adapters/gateways/noble-sha256-hasher';
import { DrizzleRenewalNoticeDeliveryRepository } from '../../src/adapters/repositories/drizzle-renewal-notice-delivery-repository';
import { zUuid } from '../../src/adapters/shared/zod-schemas';
import type { RenewalNoticeDeliveryRepository } from '../../src/application/ports/repositories';
import { RequeueRenewalNoticeDeliveryUseCase } from '../../src/application/use-cases/requeue-renewal-notice-delivery';
import { runHumanDatabaseCommand } from '../database/database-command';
import { isMain } from '../lib/entry-point.mts';

// DEBT-414 F23: the supported way to send a quarantined renewal notice again.
// It goes through RequeueRenewalNoticeDeliveryUseCase, so an unknown outcome
// still needs confirmation that nothing was sent (ADR-027), and the operator,
// reason and prior status land in the row's audit fields. The next renewal-
// notice run picks the row up and rechecks it before sending.

const OPERATOR_ENV = 'RENEWAL_NOTICE_OPERATOR';
const SQL_END_TIMEOUT_SECONDS = 5;

const USAGE = `Usage: ${OPERATOR_ENV}=<you> DATABASE_URL=<url> pnpm notice:requeue --delivery-id <uuid> --expected-attempt-count <count> --reason "<why>" [--confirmed-no-send]`;

export type RequeueRenewalNoticeOptions = {
  deliveryId: string;
  expectedAttemptCount: number;
  reason: string;
  confirmedNoSend: boolean;
};

export type RequeueRenewalNoticeDeps = {
  openRepository(databaseUrl: string): {
    repository: RenewalNoticeDeliveryRepository;
    close(): Promise<void>;
  };
};

type TextOutput = { write(text: string): unknown };

const DEFAULT_DEPS: RequeueRenewalNoticeDeps = {
  openRepository: (databaseUrl) => {
    const sql = postgres(databaseUrl, { max: 1 });
    return {
      repository: new DrizzleRenewalNoticeDeliveryRepository(
        drizzle(sql, { schema }),
        new NobleSha256Hasher(),
      ),
      close: () => sql.end({ timeout: SQL_END_TIMEOUT_SECONDS }),
    };
  },
};

export function parseRequeueRenewalNoticeArgs(
  argv: string[],
): RequeueRenewalNoticeOptions {
  const values = new Map<
    '--delivery-id' | '--reason' | '--expected-attempt-count',
    string
  >();
  let confirmedNoSend = false;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];

    if (flag === '--confirmed-no-send') {
      confirmedNoSend = true;
      continue;
    }

    if (
      flag === '--delivery-id' ||
      flag === '--reason' ||
      flag === '--expected-attempt-count'
    ) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw usageError(`${flag} needs a value`);
      }
      if (values.has(flag)) {
        throw usageError(`${flag} was given more than once`);
      }
      values.set(flag, value);
      index += 1;
      continue;
    }

    throw usageError(`Unknown flag: ${flag}`);
  }

  const deliveryId = values.get('--delivery-id');
  const reason = values.get('--reason');
  if (deliveryId === undefined) {
    throw usageError('--delivery-id is required');
  }
  if (reason === undefined || reason.trim().length === 0) {
    throw usageError('--reason is required');
  }
  if (!zUuid.safeParse(deliveryId).success) {
    throw usageError('--delivery-id must be a delivery UUID');
  }

  const count = values.get('--expected-attempt-count');
  if (count === undefined) {
    throw usageError('--expected-attempt-count is required');
  }
  const expectedAttemptCount = Number(count);
  if (
    !/^(0|[1-9]\d*)$/.test(count) ||
    !Number.isSafeInteger(expectedAttemptCount)
  ) {
    throw usageError(
      '--expected-attempt-count must be a non-negative safe integer',
    );
  }

  return { deliveryId, expectedAttemptCount, reason, confirmedNoSend };
}

export async function runRequeueRenewalNotice({
  argv = process.argv.slice(2),
  env = process.env,
  output = process.stdout,
  errorOutput = process.stderr,
  deps = DEFAULT_DEPS,
  now,
}: {
  argv?: string[];
  env?: Readonly<Record<string, string | undefined>>;
  output?: TextOutput;
  errorOutput?: TextOutput;
  deps?: RequeueRenewalNoticeDeps;
  now?: () => Date;
} = {}): Promise<void> {
  const options = parseRequeueRenewalNoticeArgs(argv);
  const operator = env[OPERATOR_ENV];
  if (operator === undefined || operator.trim().length === 0) {
    throw new Error(
      `${OPERATOR_ENV} must name the operator, such as your email address; the requeue audit records it.`,
    );
  }

  await runHumanDatabaseCommand({
    env,
    execute: async (databaseUrl) => {
      const { repository, close } = deps.openRepository(databaseUrl);

      try {
        const delivery = await new RequeueRenewalNoticeDeliveryUseCase(
          repository,
          now,
        ).execute({ ...options, operator });
        output.write(
          `Requeued renewal notice ${delivery.id}; its status is now ${delivery.status}.\n` +
            `Audit entry: ${JSON.stringify(delivery.requeueAudit.at(-1))}\n` +
            'The next daily renewal-notice run, which starts between 09:00 and 10:00 UTC, rechecks it before sending it.\n',
        );
      } finally {
        await close();
      }
    },
    log: (message) => {
      errorOutput.write(`${message}\n`);
    },
  });
}

function usageError(message: string): Error {
  return new Error(`${message}\n${USAGE}`);
}

/* v8 ignore start */
if (isMain(import.meta.url)) {
  runRequeueRenewalNotice().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
/* v8 ignore stop */
