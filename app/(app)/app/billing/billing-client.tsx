'use client';

import { useFormStatus } from 'react-dom';

export function ManageBillingButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Processing...' : 'Manage in Stripe'}
    </button>
  );
}
