import './globals.css';
import type { Metadata, Viewport } from 'next';
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

export const viewport: Viewport = {
  themeColor: '#090909',
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
  nonce?: string | undefined;
}) {
  return (
    // DEBT-421: light mode is unfinished, so the app is pinned to dark via
    // `forcedTheme`. This overrides the OS preference AND any stale `theme:light`
    // in localStorage, guaranteeing no user renders the unfinished light theme.
    // `defaultTheme="dark"` only affects fresh users with no stored preference;
    // returning-user guarantees come from `forcedTheme` plus Providers' fallback.
    // Do not delete the light tokens/components — they stay dormant for re-enable.
    <ThemeProvider
      attribute="class"
      forcedTheme="dark"
      defaultTheme="dark"
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
      <a href="#main-content" className="sr-only focus:not-sr-only ring-focus">
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
    // DEBT-421: author forced dark statically because the nonce-bound
    // next-themes script streams after some body content under PPR.
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`dark ${manrope.className} ${manrope.variable} ${plusJakartaSans.variable} ${instrumentSans.variable}`}
      style={{ colorScheme: 'dark' }}
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
