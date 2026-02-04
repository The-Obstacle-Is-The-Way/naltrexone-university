'use client';

import { type ReactNode, useState } from 'react';
import { useFormStatus } from 'react-dom';

export function IdempotencyKeyField() {
  const [key] = useState(() => crypto.randomUUID());
  return <input type="hidden" name="idempotencyKey" value={key} />;
}

export function SubscribeButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-8 block w-full rounded-full bg-zinc-100 py-3 text-center text-sm font-medium text-zinc-900 hover:bg-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Processing...' : children}
    </button>
  );
}
