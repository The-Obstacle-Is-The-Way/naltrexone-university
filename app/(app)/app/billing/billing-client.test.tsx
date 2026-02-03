// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ManageBillingButton } from '@/app/(app)/app/billing/billing-client';

describe('app/(app)/app/billing/billing-client', () => {
  describe('ManageBillingButton', () => {
    it('renders "Manage in Stripe" text', () => {
      const html = renderToStaticMarkup(
        <form>
          <ManageBillingButton />
        </form>,
      );

      expect(html).toContain('Manage in Stripe');
    });
  });
});
