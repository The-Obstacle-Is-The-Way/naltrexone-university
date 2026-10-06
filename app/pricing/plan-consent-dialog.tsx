'use client';

import { useRef } from 'react';
import type { PricingAction } from '@/app/pricing/pricing-auth-cta';
import { ConsentSubmitButton } from '@/components/consent-submit-button';
import { ConsentTerms } from '@/components/consent-terms';
import { ErrorCard } from '@/components/error-card';
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
import type { PricingPlan } from '@/lib/routes';

type PlanConsentDetailsProps = { plan: PricingPlan; hasTrial: boolean };

export function PlanConsentDetails({
  plan,
  hasTrial,
}: PlanConsentDetailsProps) {
  return (
    <ConsentTerms
      consent={PRICING_DATA[plan].consent[hasTrial ? 'trial' : 'standard']}
    />
  );
}

export function PlanConsentDialog({
  plan,
  hasTrial,
  initiallyOpen = false,
  errorMessage,
  subscribeAction,
}: PlanConsentDetailsProps & {
  initiallyOpen?: boolean;
  /**
   * BUG-322: why the last attempt failed. The dialog covers the page's
   * banner, so the reopened dialog shows it where the person retries.
   */
  errorMessage?: string | undefined;
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
              ? 'Subscribe monthly'
              : 'Subscribe annual'}
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
        {errorMessage ? (
          <ErrorCard className="p-4">{errorMessage}</ErrorCard>
        ) : null}
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
