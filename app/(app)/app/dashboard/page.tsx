import Link from 'next/link';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Your progress and performance will show up here.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">
              Ready to practice?
            </div>
            <div className="text-sm text-muted-foreground">
              Start answering questions in tutor mode.
            </div>
          </div>
          <Link
            href="/app/practice"
            className="inline-flex items-center justify-center rounded-full bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            Go to Practice
          </Link>
        </div>
      </div>
    </div>
  );
}
