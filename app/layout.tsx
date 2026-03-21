import './globals.css';
import type { Metadata } from 'next';
import { Instrument_Sans, Manrope, Plus_Jakarta_Sans } from 'next/font/google';
import { headers } from 'next/headers';
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${manrope.className} ${manrope.variable} ${plusJakartaSans.variable} ${instrumentSans.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-[100dvh]">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          nonce={nonce}
        >
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            Skip to content
          </a>
          <Providers nonce={nonce}>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
