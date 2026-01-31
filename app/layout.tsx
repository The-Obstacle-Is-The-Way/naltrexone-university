import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';

export const metadata: Metadata = {
  title: 'Addiction Boards Question Bank',
  description:
    'Board-relevant questions with detailed explanations for Addiction Psychiatry and Addiction Medicine exam prep.',
};

export const viewport: Viewport = {
  maximumScale: 1,
};

const manrope = Manrope({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`bg-white dark:bg-gray-950 text-black dark:text-white ${manrope.className}`}
      >
        <body className="min-h-[100dvh] bg-gray-50">{children}</body>
      </html>
    </ClerkProvider>
  );
}
