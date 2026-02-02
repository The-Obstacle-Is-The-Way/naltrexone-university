'use server';

import { redirect } from 'next/navigation';
import { createCheckoutSession } from '@/src/adapters/controllers/billing-controller';
import { runSubscribeAction } from './subscribe-action';

export async function subscribeMonthlyAction(): Promise<void> {
  return runSubscribeAction(
    { plan: 'monthly' },
    { createCheckoutSessionFn: createCheckoutSession, redirectFn: redirect },
  );
}

export async function subscribeAnnualAction(): Promise<void> {
  return runSubscribeAction(
    { plan: 'annual' },
    { createCheckoutSessionFn: createCheckoutSession, redirectFn: redirect },
  );
}
