import { CircleIcon } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/routes';

export default function NotFound() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-[100dvh] items-center justify-center"
    >
      <div className="max-w-md space-y-8 p-4 text-center">
        <div className="flex justify-center">
          <CircleIcon
            aria-hidden="true"
            className="size-12 text-muted-foreground"
          />
        </div>
        <h1 className="text-4xl font-bold font-heading tracking-tight text-foreground">
          Page Not Found
        </h1>
        <p className="text-base text-muted-foreground">
          The page you are looking for might have been removed, had its name
          changed, or is temporarily unavailable.
        </p>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="mx-auto w-full max-w-48 rounded-full"
        >
          <Link href={ROUTES.HOME}>Back to Home</Link>
        </Button>
      </div>
    </main>
  );
}
