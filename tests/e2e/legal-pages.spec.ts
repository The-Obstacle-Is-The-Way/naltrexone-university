import { expect, test } from '@playwright/test';

const legalPages = [
  {
    path: '/privacy',
    heading: 'Privacy Policy',
    mandatoryClause: 'We do not sell personal information',
  },
  {
    path: '/terms',
    heading: 'Terms of Service',
    mandatoryClause: 'The Service is not medical advice',
  },
] as const;

for (const legalPage of legalPages) {
  test(`serves ${legalPage.path} signed out without a sign-in redirect`, async ({
    request,
  }) => {
    const response = await request.get(legalPage.path);
    const body = await response.text();

    expect(response.status()).toBe(200);
    expect(new URL(response.url()).pathname).toBe(legalPage.path);
    expect(body).toContain(legalPage.heading);
    expect(body).toContain(legalPage.mandatoryClause);
  });
}
