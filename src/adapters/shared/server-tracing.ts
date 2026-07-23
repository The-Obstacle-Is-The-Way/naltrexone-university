import { ApplicationErrorCodes } from '@/src/application/errors';

export const SERVER_SPAN_FAMILIES = {
  finalizeExamAnswers: {
    name: 'action.finalizeExamAnswers',
    op: 'server.action',
    action: 'finalizeExamAnswers',
  },
  getBookmarks: {
    name: 'action.getBookmarks',
    op: 'server.action',
    action: 'getBookmarks',
  },
  getUserStats: {
    name: 'action.getUserStats',
    op: 'server.action',
    action: 'getUserStats',
  },
  getAttemptedQuestions: {
    name: 'action.getAttemptedQuestions',
    op: 'server.action',
    action: 'getAttemptedQuestions',
  },
  stripe: {
    parent: {
      name: 'stripe.webhook.process',
      op: 'stripe.webhook',
      route: '/api/stripe/webhook',
    },
    subscriptionRetrieve: {
      name: 'stripe.api.subscriptions.retrieve',
      op: 'stripe.api',
      operation: 'stripe.subscriptions.retrieve',
    },
  },
} as const;

const ALLOWED_ACTIONS = new Set<string>([
  SERVER_SPAN_FAMILIES.finalizeExamAnswers.action,
  SERVER_SPAN_FAMILIES.getBookmarks.action,
  SERVER_SPAN_FAMILIES.getUserStats.action,
  SERVER_SPAN_FAMILIES.getAttemptedQuestions.action,
]);
const ALLOWED_ROUTES = new Set<string>([
  SERVER_SPAN_FAMILIES.stripe.parent.route,
]);
const ALLOWED_OPERATIONS = new Set<string>([
  SERVER_SPAN_FAMILIES.stripe.subscriptionRetrieve.operation,
]);
const ALLOWED_ERROR_CODES = new Set<string>(ApplicationErrorCodes);

type SafeSpanAttributes = Record<string, string | number>;

function readAttribute(input: unknown, key: string): unknown {
  if (!input || typeof input !== 'object') return undefined;
  try {
    return (input as Record<string, unknown>)[key];
  } catch {
    // Hostile accessors must not turn telemetry into an application failure.
    return undefined;
  }
}

export function projectSafeSpanAttributes(input: unknown): SafeSpanAttributes {
  const attributes: SafeSpanAttributes = {};

  const action = readAttribute(input, 'app.action');
  if (typeof action === 'string' && ALLOWED_ACTIONS.has(action)) {
    attributes['app.action'] = action;
  }

  const route = readAttribute(input, 'app.route');
  if (typeof route === 'string' && ALLOWED_ROUTES.has(route)) {
    attributes['app.route'] = route;
  }

  const operation = readAttribute(input, 'app.operation');
  if (typeof operation === 'string' && ALLOWED_OPERATIONS.has(operation)) {
    attributes['app.operation'] = operation;
  }

  const durationMs = readAttribute(input, 'app.duration_ms');
  if (
    typeof durationMs === 'number' &&
    Number.isFinite(durationMs) &&
    durationMs >= 0
  ) {
    attributes['app.duration_ms'] = durationMs;
  }

  const count = readAttribute(input, 'app.count');
  if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) {
    attributes['app.count'] = count;
  }

  const errorCode = readAttribute(input, 'app.error_code');
  if (typeof errorCode === 'string' && ALLOWED_ERROR_CODES.has(errorCode)) {
    attributes['app.error_code'] = errorCode;
  }

  return attributes;
}
