'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import * as React from 'react';

export function ThemeToggle() {
  const [mounted, setMounted] = React.useState(false);
  const { theme, setTheme } = useTheme();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="relative rounded-full p-2 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:hover:bg-[#1F1F23]"
    >
      <Sun
        aria-hidden="true"
        className="h-5 w-5 text-gray-600 dark:text-gray-300 transition-colors dark:hidden"
      />
      <Moon
        aria-hidden="true"
        className="h-5 w-5 text-gray-600 dark:text-gray-300 transition-colors hidden dark:block"
      />
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}
