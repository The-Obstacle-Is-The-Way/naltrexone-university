import { CircleIcon } from 'lucide-react';
import Link from 'next/link';
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
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          Page Not Found
        </h1>
        <p className="text-base text-muted-foreground">
          The page you are looking for might have been removed, had its name
          changed, or is temporarily unavailable.
        </p>
        <Link
          href={ROUTES.HOME}
          className="mx-auto flex max-w-48 justify-center rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:bg-muted"
        >
          Back to Home
        </Link>
      </div>
    </main>
  );
}
