import { expect, type Page, test } from '@playwright/test';

// BUG-378 and DEBT-502 item 6: Clerk signs in and up on the site's own pages,
// not on its Account Portal, and keeps the page a visitor came from. Literal
// paths on purpose: reading the same route constants production reads would
// let a wrong constant pass.

const PLAN_RETURN = '/pricing?plan=monthly';

async function waitForClerk(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Reflect.get(window, 'Clerk')?.loaded === true,
  );
}

// The page a Clerk link leads to, resolved against the site.
async function linkTarget(page: Page, name: string): Promise<URL> {
  const link = page.getByRole('link', { name, exact: true });
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  if (!href) throw new Error(`The "${name}" link has no href`);
  return new URL(href, page.url());
}

// A redirect carries the return in its query; a link between Clerk's
// components carries it in the fragment (`/sign-up#/?redirect_url=…`).
function returnPath(target: URL): string | null {
  const fragment = new URLSearchParams(target.hash.replace(/^#\/?\??/, ''));
  const back =
    target.searchParams.get('redirect_url') ?? fragment.get('redirect_url');
  if (!back) return null;
  const url = new URL(back, target);
  return `${url.pathname}${url.search}`;
}

test('a signed-out visit to a protected page signs in on the site', async ({
  page,
  baseURL,
}) => {
  await page.goto('/app/dashboard');

  await expect(page).toHaveURL((url) => url.pathname === '/sign-in');
  const url = new URL(page.url());
  expect(url.origin).toBe(new URL(baseURL ?? page.url()).origin);
  expect(returnPath(url)).toBe('/app/dashboard');
});

test("sign-up's sign-in link stays on the site and keeps the plan", async ({
  page,
}) => {
  await page.goto(`/sign-up?redirect_url=${encodeURIComponent(PLAN_RETURN)}`);
  await waitForClerk(page);

  const target = await linkTarget(page, 'Sign in');

  expect(target.origin).toBe(new URL(page.url()).origin);
  expect(target.pathname).toBe('/sign-in');
  expect(returnPath(target)).toBe(PLAN_RETURN);
});

test("sign-in's sign-up link stays on the site and keeps the plan", async ({
  page,
}) => {
  await page.goto(`/sign-in?redirect_url=${encodeURIComponent(PLAN_RETURN)}`);
  await waitForClerk(page);

  const target = await linkTarget(page, 'Sign up');

  expect(target.origin).toBe(new URL(page.url()).origin);
  expect(target.pathname).toBe('/sign-up');
  expect(returnPath(target)).toBe(PLAN_RETURN);
});
