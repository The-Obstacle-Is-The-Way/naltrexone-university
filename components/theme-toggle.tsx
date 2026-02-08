'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import * as React from 'react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const [mounted, setMounted] = React.useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="relative rounded-full"
    >
      <Sun
        aria-hidden="true"
        className="h-5 w-5 text-muted-foreground transition-colors dark:hidden"
      />
      <Moon
        aria-hidden="true"
        className="h-5 w-5 text-muted-foreground transition-colors hidden dark:block"
      />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
