import type { MetadataRoute } from 'next';
import { PUBLIC_PAGE_POLICY, PUBLIC_SITE_ORIGIN } from '@/lib/public-routes';

export default function sitemap(): MetadataRoute.Sitemap {
  return Object.entries(PUBLIC_PAGE_POLICY)
    .filter(([, policy]) => policy.indexable)
    .map(([path]) => ({ url: new URL(path, PUBLIC_SITE_ORIGIN).href }));
}
