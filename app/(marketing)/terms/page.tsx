import type { Metadata } from 'next';
import { renderTermsPage } from '@/app/(marketing)/terms/terms-page-renderer';

export const metadata: Metadata = {
  title: 'Terms of Service - Addiction Boards',
};

export default function TermsPage() {
  return renderTermsPage();
}
