import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { TrialPaymentConsentDialog } from '@/app/(app)/app/trial-payment-consent-dialog';
import { createTrialPaymentMethodAction } from '@/app/(app)/app/trial-payment-method-actions';
import { AppDesktopNav } from '@/components/app-desktop-nav';
import { AuthNav } from '@/components/auth-nav';
import { MobileNav } from '@/components/mobile-nav';
import { getRequestAuthState } from '@/lib/auth-request-cache';
import { createDepsResolver, loadAppContainer } from '@/lib/controller-helpers';
import { PRICING_DATA } from '@/lib/pricing-data';
import { ROUTES } from '@/lib/routes';
import { ApplicationError } from '@/src/application/errors';
import type { AuthGateway } from '@/src/application/ports/gateways';
import type {
  CheckEntitlementUseCase,
  CheckTrialSavedCardUseCase,
} from '@/src/application/ports/use-cases';
import type {
  SubscriptionPlan,
  SubscriptionStatus,
} from '@/src/domain/value-objects';
import { awaitRequestBoundary } from './request-boundary';

// Shared layout executes auth/entitlement checks on every app route request.
// Explicitly cap server-rendered work to avoid Vercel Fluid Compute defaults.
export const maxDuration = 30;

export type AppLayoutDeps = {
  authGateway: AuthGateway;
  checkEntitlementUseCase: CheckEntitlementUseCase;
  checkTrialSavedCardUseCase: CheckTrialSavedCardUseCase;
};

export type EntitledAppUser = {
  subscriptionStatus: SubscriptionStatus | null;
  plan: SubscriptionPlan | null;
  trialEndsAt: Date | null;
  // BUG-308: whether the trial already renews on a card the learner saved.
  trialCardSaved: boolean;
};

const getCheckTrialSavedCardUseCase = createDepsResolver<
  CheckTrialSavedCardUseCase,
  { createCheckTrialSavedCardUseCase: () => CheckTrialSavedCardUseCase }
>(
  (container) => container.createCheckTrialSavedCardUseCase(),
  loadAppContainer,
);

export async function enforceEntitledAppUser(
  deps?: AppLayoutDeps,
  redirectFn: (url: string) => never = redirect,
): Promise<EntitledAppUser> {
  const authState = await getRequestAuthState({ deps });

  if (!authState.user) {
    throw new ApplicationError('UNAUTHENTICATED', 'User not authenticated');
  }

  if (!authState.entitlement.isEntitled) {
    const reason = authState.entitlement.reason ?? 'subscription_required';
    redirectFn(`${ROUTES.PRICING}?reason=${reason}`);
  }

  const subscriptionStatus = authState.entitlement.subscriptionStatus ?? null;
  // Only a trial can be waiting for a card, so only a trial pays for the query.
  const trialCardSaved =
    subscriptionStatus === 'inTrial'
      ? (
          await (
            await getCheckTrialSavedCardUseCase(
              deps?.checkTrialSavedCardUseCase,
            )
          ).execute({ userId: authState.user.id })
        ).cardSaved
      : false;

  return {
    subscriptionStatus,
    plan: authState.entitlement.plan ?? null,
    trialEndsAt: authState.entitlement.trialEndsAt ?? null,
    trialCardSaved,
  };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days remaining before the trial ends; any partial day counts as a
 * full day so a trial that ends tomorrow morning still reads "1 day left".
 * Clamped to 1: render-time `now` can drift past `trialEndsAt` after the
 * entitlement check, and "0 days left" is never valid banner copy.
 */
export function getTrialDaysLeft(trialEndsAt: Date, now: Date): number {
  return Math.max(
    1,
    Math.ceil((trialEndsAt.getTime() - now.getTime()) / MS_PER_DAY),
  );
}

export type AppLayoutShellProps = {
  children: React.ReactNode;
  mobileNav: React.ReactNode;
  authNav: React.ReactNode;
  banner?: React.ReactNode;
};

export function AppLayoutShell({
  children,
  mobileNav,
  authNav,
  banner,
}: AppLayoutShellProps) {
  return (
    <div className="flex h-dvh min-h-screen flex-col bg-background">
      {banner}
      <header className="relative border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link
              href={ROUTES.APP_DASHBOARD}
              className="rounded-md text-base font-bold font-heading whitespace-nowrap text-foreground transition-colors hover:text-foreground/80 ring-focus"
            >
              Addiction Boards
            </Link>
            <AppDesktopNav />
          </div>
          <div className="flex items-center gap-2">
            {mobileNav}
            {/* DEBT-421: ThemeToggle unmounted while light mode is disabled. */}
            {authNav}
          </div>
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8"
      >
        <Suspense
          fallback={
            <output
              className="text-sm text-muted-foreground"
              aria-live="polite"
            >
              Loading app content…
            </output>
          }
        >
          {children}
        </Suspense>
      </main>
    </div>
  );
}

// Pattern Registry F-10: layout-level informational banner (DEBT-410).
export function TrialCountdownBanner({
  daysLeft,
  plan,
  cardSaved,
  createTrialPaymentMethodActionFn,
}: {
  daysLeft: number;
  plan: SubscriptionPlan;
  cardSaved: boolean;
  createTrialPaymentMethodActionFn: (formData: FormData) => Promise<void>;
}) {
  const countdown =
    daysLeft === 1 ? '1 day left in trial' : `${daysLeft} days left in trial`;
  const pricing = PRICING_DATA[plan];
  return (
    // Server-rendered at page load; no live-region role needed.
    <div className="block border-b border-border bg-card px-4 py-3 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-3">
        <span className="font-medium text-foreground">{countdown}</span>
        {cardSaved ? (
          <>
            {/* BUG-308: the trial already renews on the learner's card. */}
            <span className="text-foreground">
              {`${pricing.name} renews at ${pricing.price} per ${pricing.frequency} on your saved card when your trial ends.`}
            </span>
            <Link
              href={ROUTES.APP_BILLING}
              className="underline font-medium transition-colors hover:text-foreground"
            >
              Manage billing
            </Link>
          </>
        ) : (
          <>
            <span className="text-foreground">
              Add a card before your trial ends to keep access.
            </span>
            {/* DEBT-414 F03b: the add-card terms and opt-in live in this dialog. */}
            <TrialPaymentConsentDialog
              plan={plan}
              createTrialPaymentMethodActionFn={
                createTrialPaymentMethodActionFn
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

export function PastDueBanner() {
  return (
    // Server-rendered at page load; no live-region role needed.
    <div className="block border-b border-warning bg-warning/10 px-4 py-3 text-center text-sm text-warning-foreground">
      Your payment failed — please{' '}
      <Link
        href={ROUTES.APP_BILLING}
        className="underline font-medium transition-colors hover:text-foreground"
      >
        update your billing information
      </Link>
      .
    </div>
  );
}

export async function renderAppLayout(input: {
  children: React.ReactNode;
  enforceEntitledAppUserFn?: () => Promise<EntitledAppUser>;
  authNavFn?: () => Promise<React.ReactNode>;
  mobileNav?: React.ReactNode;
  createTrialPaymentMethodActionFn?: (formData: FormData) => Promise<void>;
  nowFn?: () => Date;
}): Promise<React.ReactElement> {
  const enforceEntitledAppUserFn =
    input.enforceEntitledAppUserFn ?? enforceEntitledAppUser;
  const authNavFn =
    input.authNavFn ?? (() => AuthNav({ showPrimaryLink: false }));
  const mobileNav = input.mobileNav ?? <MobileNav />;
  const createTrialPaymentMethodActionFn =
    input.createTrialPaymentMethodActionFn ?? createTrialPaymentMethodAction;
  const nowFn = input.nowFn ?? (() => new Date());

  const [{ subscriptionStatus, plan, trialEndsAt, trialCardSaved }, authNav] =
    await Promise.all([enforceEntitledAppUserFn(), authNavFn()]);
  const banner =
    subscriptionStatus === 'pastDue' ? (
      <PastDueBanner />
    ) : subscriptionStatus === 'inTrial' && plan && trialEndsAt ? (
      <TrialCountdownBanner
        daysLeft={getTrialDaysLeft(trialEndsAt, nowFn())}
        plan={plan}
        cardSaved={trialCardSaved}
        createTrialPaymentMethodActionFn={createTrialPaymentMethodActionFn}
      />
    ) : undefined;

  return (
    <AppLayoutShell authNav={authNav} mobileNav={mobileNav} banner={banner}>
      {input.children}
    </AppLayoutShell>
  );
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await awaitRequestBoundary();
  return renderAppLayout({ children });
}
