import Link from 'next/link';
import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-gray-900">
              Addiction Boards Question Bank
            </h1>
            <div className="flex items-center space-x-4">
              <SignedOut>
                <Link
                  href="/pricing"
                  className="text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Pricing
                </Link>
                <Link
                  href="/sign-in"
                  className="rounded-full bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
                >
                  Sign In
                </Link>
              </SignedOut>
              <SignedIn>
                <Link
                  href="/app/dashboard"
                  className="text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Dashboard
                </Link>
                <UserButton />
              </SignedIn>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-4xl font-bold tracking-tight text-gray-900">
            Board-Ready Question Bank
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
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
