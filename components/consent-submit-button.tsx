'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';

// The consent form's commit button, disabled while the request is pending.
export function ConsentSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Processing...' : label}
    </Button>
  );
}
