import type { Metadata } from 'next';
import { renderPrivacyPage } from '@/app/(marketing)/privacy/privacy-page-renderer';

export const metadata: Metadata = {
  title: 'Privacy Policy - Addiction Boards',
};

export default function PrivacyPage() {
  return renderPrivacyPage();
}
