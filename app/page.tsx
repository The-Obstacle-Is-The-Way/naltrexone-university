import Link from 'next/link';
import { AuthNav } from '@/components/auth-nav';

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
            <Link
              href="/pricing"
              className="inline-block rounded-full bg-orange-600 px-8 py-3 text-base font-medium text-white hover:bg-orange-700"
            >
              Get Started
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
