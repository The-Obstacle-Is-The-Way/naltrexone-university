// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, expect, it } from 'vitest';
import { parseHtml } from '@/tests/shared/dom-helpers';

let PricingViewSkeleton: typeof import('./pricing-view-skeleton').PricingViewSkeleton;
beforeAll(async () => {
  ({ PricingViewSkeleton } = await import('./pricing-view-skeleton'));
});

it('matches the narrowed plans section without a redundant home link or visible Plans heading', async () => {
  const doc = parseHtml(renderToStaticMarkup(await PricingViewSkeleton()));
  const section = doc.querySelector('section');
  expect(section?.classList.contains('max-w-3xl')).toBe(true);
  expect(section?.querySelector('h2')?.classList.contains('sr-only')).toBe(
    true,
  );
  expect(section?.querySelector('.grid')?.classList.contains('gap-6')).toBe(
    true,
  );
  expect(doc.querySelector('a')).toBeNull();
});
