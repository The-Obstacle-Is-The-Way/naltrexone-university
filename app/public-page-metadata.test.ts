import type { Metadata } from 'next';
import { beforeAll, describe, expect, it } from 'vitest';

let pages: Record<string, Metadata>;

beforeAll(async () => {
  const [home, pricing, privacy, terms, signIn, signUp] = await Promise.all([
    import('./page'),
    import('./pricing/page'),
    import('./(marketing)/privacy/page'),
    import('./(marketing)/terms/page'),
    import('./sign-in/[[...sign-in]]/page'),
    import('./sign-up/[[...sign-up]]/page'),
  ]);
  pages = {
    '/': home.metadata,
    '/pricing': pricing.metadata,
    '/privacy': privacy.metadata,
    '/terms': terms.metadata,
    '/sign-in': signIn.metadata,
    '/sign-up': signUp.metadata,
  };
});

describe('public page metadata', () => {
  it.each([
    [
      '/',
      'Prepare for Addiction Psychiatry and Addiction Medicine boards with practice questions, detailed explanations, and progress tracking.',
    ],
    [
      '/pricing',
      'Compare monthly and annual Addiction Boards plans and learn how the free trial works before choosing your board-prep subscription.',
    ],
    [
      '/privacy',
      'Read how Addiction Boards collects, uses, and protects your information, including account data, payments, and study activity.',
    ],
    [
      '/terms',
      'Review the terms for using Addiction Boards, including subscriptions, automatic renewal, cancellation, and educational-use limitations.',
    ],
  ])('describes the actual content at %s', (path, description) => {
    expect(pages[path]?.description).toBe(description);
  });

  it.each(['/', '/pricing', '/privacy', '/terms'])(
    'declares the query-free canonical path for %s',
    (path) => {
      expect(pages[path]?.alternates?.canonical).toBe(path);
    },
  );

  it.each(['/sign-in', '/sign-up'])(
    'excludes the %s catch-all from indexing while allowing link following',
    (path) => {
      expect(pages[path]?.robots).toEqual({ index: false, follow: true });
      expect(pages[path]?.alternates?.canonical).toBeUndefined();
    },
  );

  it.each(['/', '/pricing', '/privacy', '/terms'])(
    'shares %s with its own canonical identity and the public site image',
    (path) => {
      const page = pages[path];
      const image = {
        url: 'https://addictionboards.com/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Addiction Boards — Addiction Psychiatry and Addiction Medicine board preparation',
      };
      expect(page?.openGraph).toEqual({
        type: 'website',
        siteName: 'Addiction Boards',
        title: page?.title,
        description: page?.description,
        url: new URL(path, 'https://addictionboards.com').href,
        images: [image],
      });
      expect(page?.twitter).toEqual({
        card: 'summary_large_image',
        title: page?.title,
        description: page?.description,
        images: [image],
      });
    },
  );
});
