import type { Metadata } from 'next';
import SignInPageClient from './sign-in-page-client';

export const metadata: Metadata = {
  title: 'Sign In - Addiction Boards',
};

export default function SignInPage() {
  return <SignInPageClient />;
}
