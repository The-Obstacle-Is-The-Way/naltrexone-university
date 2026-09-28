import Link from 'next/link';
import type { CheckoutConsent } from '@/lib/pricing-data';
import { ROUTES } from '@/lib/routes';

const legalLinkClassName =
  'rounded-sm font-medium text-foreground hover:underline ring-focus';

// The consent terms as a learner sees and accepts them: the bold rows, the
// separate renewal opt-in (Pattern Registry I-7, DEBT-414 F03) and the closing
// sentence with its legal links. Checkout and the trial add-card offer share
// it, so both record exactly what they render.
export function ConsentTerms({ consent }: { consent: CheckoutConsent }) {
  return (
    <>
      <dl className="text-sm">
        {consent.rows.map(({ label, value }) => (
          <div
            key={label}
            className="grid gap-x-6 gap-y-1 border-t border-border/40 py-3 sm:grid-cols-3"
          >
            <dt className="text-sm text-muted-foreground">{label}:</dt>
            <dd className="text-sm font-bold text-foreground sm:col-span-2">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {/* Pattern Registry I-7: DEBT-414 F03's separate renewal opt-in. */}
      <label className="flex items-start gap-3 text-sm font-bold text-foreground">
        <input
          type="checkbox"
          name="renewalOptIn"
          value="yes"
          required
          className="mt-0.5 size-4 shrink-0 rounded-sm accent-primary focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        />
        <span>{consent.optIn}</span>
      </label>
      <p className="text-sm text-muted-foreground">
        {consent.sentence
          .split(/(Terms of Service|Privacy Policy)/)
          .map((part) => {
            if (part === 'Terms of Service' || part === 'Privacy Policy') {
              return (
                <Link
                  key={part}
                  href={
                    part === 'Terms of Service' ? ROUTES.TERMS : ROUTES.PRIVACY
                  }
                  className={legalLinkClassName}
                >
                  {part}
                </Link>
              );
            }
            return part;
          })}
      </p>
    </>
  );
}
