import type { Metadata } from 'next';
import { PUBLIC_SITE_ORIGIN, PUBLIC_SOCIAL_IMAGE_PATH } from './public-routes';

export function publicPageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const image = {
    url: new URL(PUBLIC_SOCIAL_IMAGE_PATH, PUBLIC_SITE_ORIGIN).href,
    width: 1200,
    height: 630,
    alt: 'Addiction Boards — Addiction Psychiatry and Addiction Medicine board preparation',
  };
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: 'Addiction Boards',
      title,
      description,
      url: new URL(path, PUBLIC_SITE_ORIGIN).href,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}
