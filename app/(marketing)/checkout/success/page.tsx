import type { Metadata } from 'next';
import type { JSX } from 'react';
import {
  type CheckoutSuccessDeps,
  type CheckoutSuccessTransaction,
  runCheckoutSuccessPage,
  syncCheckoutSuccess,
} from './checkout-success-sync';

export const metadata: Metadata = {
  title: 'Checkout Success - Addiction Boards',
};

export const maxDuration = 30;

export {
  runCheckoutSuccessPage,
  syncCheckoutSuccess,
  type CheckoutSuccessDeps,
  type CheckoutSuccessTransaction,
};

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}): Promise<JSX.Element> {
  return runCheckoutSuccessPage({ searchParams });
}
