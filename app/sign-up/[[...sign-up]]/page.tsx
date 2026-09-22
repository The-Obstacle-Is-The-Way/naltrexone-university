import type { Metadata } from 'next';
import SignUpPageClient from './sign-up-page-client';

export const metadata: Metadata = {
  title: 'Sign Up - Addiction Boards',
  robots: { index: false, follow: true },
};

export default function SignUpPage() {
  return <SignUpPageClient />;
}
