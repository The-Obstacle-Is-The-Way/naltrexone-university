import { test as base } from '@playwright/test';
import { reportFailedClerkAuthTrace } from './clerk-auth-trace';

// The restore helper starts the trace. Teardown reports it before the page
// closes, including failures that neither render an alert nor reach sign-in.
export const test = base.extend<{ clerkAuthTrace: undefined }>({
  clerkAuthTrace: [
    async ({ page }, use, testInfo) => {
      await use(undefined);
      if (testInfo.status !== testInfo.expectedStatus) {
        await reportFailedClerkAuthTrace(page);
      }
    },
    { auto: true },
  ],
});
