'use client';

import { ErrorBoundaryPage } from '@/components/error-boundary-page';
import { ROUTES } from '@/lib/routes';

export default function BookmarksError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorBoundaryPage
      error={error}
      reset={reset}
      title="Bookmarks error"
      description="We couldn't load your bookmarks right now. Please try again."
      links={[{ href: ROUTES.APP_DASHBOARD, label: 'Back to Dashboard' }]}
      logPrefix="app/(app)/app/bookmarks/error.tsx:"
    />
  );
}
