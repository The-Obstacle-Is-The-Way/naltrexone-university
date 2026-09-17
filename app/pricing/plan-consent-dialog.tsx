'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { useFormStatus } from 'react-dom';
import type { PricingAction } from '@/app/pricing/pricing-auth-cta';
import { IdempotencyKeyField } from '@/components/idempotency-key-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { PRICING_DATA } from '@/lib/pricing-data';
import { type PricingPlan, ROUTES } from '@/lib/routes';

const legalLinkClassName =
  'rounded-sm font-medium text-foreground hover:underline ring-focus';

type PlanConsentDetailsProps = { plan: PricingPlan; hasTrial: boolean };

export function PlanConsentDetails({
  plan,
  hasTrial,
}: PlanConsentDetailsProps) {
  const consent = PRICING_DATA[plan].consent[hasTrial ? 'trial' : 'standard'];
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

function ConsentSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Processing...' : label}
    </Button>
  );
}

export function PlanConsentDialog({
  plan,
  hasTrial,
  initiallyOpen = false,
  subscribeAction,
}: PlanConsentDetailsProps & {
  initiallyOpen?: boolean;
  subscribeAction: PricingAction;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const pricing = PRICING_DATA[plan];
  const consent = pricing.consent[hasTrial ? 'trial' : 'standard'];
  return (
    <Dialog defaultOpen={initiallyOpen}>
      <DialogTrigger asChild>
        <Button className="mt-8 h-auto w-full rounded-full py-3 text-base">
          {hasTrial
            ? pricing.trialCta
            : plan === 'monthly'
              ? 'Subscribe Monthly'
              : 'Subscribe Annual'}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle
            ref={titleRef}
            tabIndex={-1}
            className="rounded-sm ring-focus"
          >
            {hasTrial
              ? 'Start your 7-day free trial'
              : `Subscribe to ${pricing.name}`}
          </DialogTitle>
          <DialogDescription>
            {hasTrial
              ? 'Review the terms, then start. No payment method is needed today.'
              : 'Review the terms, then subscribe.'}
          </DialogDescription>
        </DialogHeader>
        <form
          action={subscribeAction}
          aria-label={`Subscribe ${plan} plan`}
          className="space-y-4"
        >
          <IdempotencyKeyField />
          <input
            type="hidden"
            name="disclosureVersion"
            value={pricing.disclosureVersion}
          />
          <input type="hidden" name="hasTrial" value={String(hasTrial)} />
          <PlanConsentDetails plan={plan} hasTrial={hasTrial} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <ConsentSubmitButton label={consent.buttonLabel} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
