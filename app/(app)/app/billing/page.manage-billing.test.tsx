// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSubscription } from '@/src/domain/test-helpers';

let BillingContent: typeof import('./page').BillingContent;

beforeAll(async () => {
  BillingContent = (await import('./page')).BillingContent;
});

describe('app/(app)/app/billing/page manage billing', () => {
  it('renders an idempotency field for the manage billing form', () => {
    const html = renderToStaticMarkup(
      <BillingContent
        subscription={createSubscription()}
        manageBillingAction={async () => undefined}
      />,
    );

    expect(html.match(/name="idempotencyKey"/g)).toHaveLength(1);
  });
});
