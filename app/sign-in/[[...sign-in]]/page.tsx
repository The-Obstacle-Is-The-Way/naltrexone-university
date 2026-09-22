import type { Metadata } from 'next';
import SignInPageClient from './sign-in-page-client';

export const metadata: Metadata = {
  title: 'Sign In - Addiction Boards',
  robots: { index: false, follow: true },
};

export default function SignInPage() {
  return <SignInPageClient />;
}
