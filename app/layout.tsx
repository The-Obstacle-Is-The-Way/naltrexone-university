import './globals.css';
import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import Script from 'next/script';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: 'Addiction Boards Question Bank',
  description:
    'Board-relevant questions with detailed explanations for Addiction Psychiatry and Addiction Medicine exam prep.',
};

const manrope = Manrope({ subsets: ['latin'] });
const themeScript = `(() => {
  try {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', prefersDark);
  } catch {
    // No-op: if matchMedia is unavailable, default to light mode.
  }
})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={manrope.className} suppressHydrationWarning>
      <body className="min-h-[100dvh]">
        <Script id="theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
