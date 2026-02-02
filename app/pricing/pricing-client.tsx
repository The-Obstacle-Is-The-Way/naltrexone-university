'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { PricingView } from './pricing-view';
import type { PricingBanner } from './types';

export function SubscribeButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-8 block w-full rounded-full bg-orange-600 py-3 text-center text-sm font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Processing...' : children}
    </button>
  );
}

export type PricingClientProps = {
  isEntitled: boolean;
  initialBanner: PricingBanner | null;
  subscribeMonthlyAction: () => Promise<void>;
  subscribeAnnualAction: () => Promise<void>;
};

export function PricingClient({
  isEntitled,
  initialBanner,
  subscribeMonthlyAction,
  subscribeAnnualAction,
}: PricingClientProps) {
  const [banner, setBanner] = useState<PricingBanner | null>(initialBanner);

  return (
    <PricingView
      isEntitled={isEntitled}
      banner={banner}
      onDismissBanner={() => setBanner(null)}
      subscribeMonthlyAction={subscribeMonthlyAction}
      subscribeAnnualAction={subscribeAnnualAction}
      SubscribeButtonComponent={SubscribeButton}
    />
  );
}
