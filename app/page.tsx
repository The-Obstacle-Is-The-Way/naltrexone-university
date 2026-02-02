import { AuthNav } from '@/components/auth-nav';
import { GetStartedCta } from '@/components/get-started-cta';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-muted">
      <header className="border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-foreground">
              Addiction Boards Question Bank
            </h1>
            <AuthNav />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-4xl font-bold tracking-tight text-foreground">
            Board-Ready Question Bank
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            High-quality multiple-choice questions with detailed explanations
            for Addiction Psychiatry and Addiction Medicine board exam prep.
          </p>
          <div className="mt-8">
            <GetStartedCta />
          </div>
        </div>
      </main>
    </div>
  );
}
