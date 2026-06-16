'use client';
import type { ThemeProviderProps } from 'next-themes';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

type AppThemeProviderProps = Omit<ThemeProviderProps, 'nonce'> & {
  nonce?: ThemeProviderProps['nonce'] | undefined;
};

export function ThemeProvider({
  children,
  nonce,
  ...props
}: AppThemeProviderProps) {
  return (
    // exactOptionalPropertyTypes rejects passing `nonce={undefined}` to next-themes.
    <NextThemesProvider {...props} {...(nonce !== undefined ? { nonce } : {})}>
      {children}
    </NextThemesProvider>
  );
}
