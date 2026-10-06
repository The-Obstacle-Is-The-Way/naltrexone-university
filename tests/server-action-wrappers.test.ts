import { describe, expect, it } from 'vitest';
import { manageBillingAction as manageBillingFromApp } from '@/app/(app)/app/billing/manage-billing-actions';
import { removeBookmarkAction } from '@/app/(app)/app/bookmarks/bookmarks-actions';
import { manageBillingAction as manageBillingFromPricing } from '@/app/pricing/manage-billing-actions';

// The exported actions are thin: they pass the form data to the logic module
// with production dependencies, and their tests inject through that module.
describe('exported server action wrappers', () => {
  it('removeBookmarkAction redirects a form without a question', async () => {
    await expect(removeBookmarkAction(new FormData())).rejects.toThrow(
      'NEXT_REDIRECT',
    );
  });

  it.each([
    ['pricing', manageBillingFromPricing],
    ['app billing', manageBillingFromApp],
  ])('the %s manageBillingAction redirects', async (_where, action) => {
    await expect(action(new FormData())).rejects.toThrow('NEXT_REDIRECT');
  });
});
