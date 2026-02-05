'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';

export function ManageBillingButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="rounded-full">
      {pending ? 'Processing...' : 'Manage in Stripe'}
    </Button>
  );
}
