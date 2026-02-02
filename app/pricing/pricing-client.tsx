'use client';

import { useFormStatus } from 'react-dom';

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
