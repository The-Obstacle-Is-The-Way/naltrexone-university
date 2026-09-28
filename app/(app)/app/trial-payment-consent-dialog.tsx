'use client';

import { useRef } from 'react';
import { ConsentSubmitButton } from '@/components/consent-submit-button';
import { ConsentTerms } from '@/components/consent-terms';
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
import {
  PRICING_DATA,
  TRIAL_PAYMENT_DISCLOSURE_VERSION,
} from '@/lib/pricing-data';
import type { SubscriptionPlan } from '@/src/domain/value-objects';

// DEBT-414 F03b: the trial add-card offer, in the same S-4 consent dialog as
// checkout: bold terms, a separate unchecked renewal opt-in, and the displayed
// version, which the server compares with the current one before Stripe.
export function TrialPaymentConsentDialog({
  plan,
  createTrialPaymentMethodActionFn,
}: {
  plan: SubscriptionPlan;
  createTrialPaymentMethodActionFn: (formData: FormData) => Promise<void>;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const consent = PRICING_DATA[plan].trialPaymentConsent;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
        >
          Add a card to keep access
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
            Keep access after your trial
          </DialogTitle>
          <DialogDescription>
            Review the terms, then add a card on Stripe's secure page.
          </DialogDescription>
        </DialogHeader>
        <form
          action={createTrialPaymentMethodActionFn}
          aria-label="Add a card"
          className="space-y-4"
        >
          <IdempotencyKeyField />
          <input
            type="hidden"
            name="disclosureVersion"
            value={TRIAL_PAYMENT_DISCLOSURE_VERSION}
          />
          <ConsentTerms consent={consent} />
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
