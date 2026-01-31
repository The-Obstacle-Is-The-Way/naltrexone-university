import Link from 'next/link';

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">
            Pricing
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
            Choose the plan that works for you.
          </p>
        </div>
        <div className="mt-16 grid gap-8 md:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">Pro Monthly</h3>
            <p className="mt-4 text-4xl font-bold text-gray-900">
              $29<span className="text-lg font-normal text-gray-600">/mo</span>
            </p>
            <ul className="mt-6 space-y-3 text-sm text-gray-600">
              <li>Access to all questions</li>
              <li>Detailed explanations</li>
              <li>Progress tracking</li>
            </ul>
            <Link
              href="/sign-up"
              className="mt-8 block w-full rounded-full bg-orange-600 py-3 text-center text-sm font-medium text-white hover:bg-orange-700"
            >
              Get Started
            </Link>
          </div>
          <div className="rounded-2xl border-2 border-orange-500 bg-white p-8 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">Pro Annual</h3>
            <p className="mt-4 text-4xl font-bold text-gray-900">
              $199<span className="text-lg font-normal text-gray-600">/yr</span>
            </p>
            <p className="text-sm text-green-600">Save $149 per year</p>
            <ul className="mt-6 space-y-3 text-sm text-gray-600">
              <li>Everything in Pro Monthly</li>
              <li>Best value</li>
            </ul>
            <Link
              href="/sign-up"
              className="mt-8 block w-full rounded-full bg-orange-600 py-3 text-center text-sm font-medium text-white hover:bg-orange-700"
            >
              Get Started
            </Link>
          </div>
        </div>
        <div className="mt-8 text-center">
          <Link href="/" className="text-sm text-gray-600 hover:text-gray-900">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
