'use client';
import type { ThemeProviderProps } from 'next-themes';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({
  children,
  nonce,
  ...props
}: ThemeProviderProps) {
  return (
    <NextThemesProvider nonce={nonce} {...props}>
      {children}
    </NextThemesProvider>
  );
}
