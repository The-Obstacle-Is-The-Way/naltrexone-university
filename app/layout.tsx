import './globals.css';
import type { Metadata } from 'next';
import { Instrument_Sans, Manrope, Plus_Jakarta_Sans } from 'next/font/google';
import { headers } from 'next/headers';
import { Suspense } from 'react';
import { Providers } from '@/components/providers';
import { ThemeProvider } from '@/components/theme-provider';

export const metadata: Metadata = {
  title: 'Addiction Boards Question Bank',
  description:
    'Board-relevant questions with detailed explanations for Addiction Psychiatry and Addiction Medicine exam prep.',
};

const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-plus-jakarta-sans',
});
const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument-sans',
});

export function RootProvidersShell({
  children,
  nonce,
}: {
  children: React.ReactNode;
  nonce?: string;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      nonce={nonce}
    >
      <RootContentShell>
        <Providers nonce={nonce}>{children}</Providers>
      </RootContentShell>
    </ThemeProvider>
  );
}

function RootContentShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
      >
        Skip to content
      </a>
      {children}
    </>
  );
}

function RootFallbackShell({ children }: { children: React.ReactNode }) {
  return (
    <RootContentShell>
      <Suspense fallback={null}>{children}</Suspense>
    </RootContentShell>
  );
}

export async function NonceBoundProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return <RootProvidersShell nonce={nonce}>{children}</RootProvidersShell>;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${manrope.className} ${manrope.variable} ${plusJakartaSans.variable} ${instrumentSans.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-[100dvh]">
        {/* next-themes injects a server script, so the prerender fallback must
            avoid provider shells until the request nonce is available. */}
        <Suspense fallback={<RootFallbackShell>{children}</RootFallbackShell>}>
          <NonceBoundProviders>{children}</NonceBoundProviders>
        </Suspense>
      </body>
    </html>
  );
}
