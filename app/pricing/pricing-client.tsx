'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';

export function SubscribeButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="mt-8 h-auto w-full rounded-full py-3 text-base"
    >
      {pending ? 'Processing...' : children}
    </Button>
  );
}
