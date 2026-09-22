import type { MetadataRoute } from 'next';
import { PUBLIC_SITE_ORIGIN } from '@/lib/public-routes';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app/', '/api/', '/checkout/'],
    },
    sitemap: new URL('/sitemap.xml', PUBLIC_SITE_ORIGIN).href,
  };
}
