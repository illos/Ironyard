import { type ReactNode, useEffect } from 'react';

export type Theme = 'dark' | 'light';
export type Pack = 'lightning' | 'shadow' | 'fireball' | 'chrome';
export type Density = 'compact' | 'default' | 'roomy';

export interface ThemeProviderProps {
  theme?: Theme;
  pack?: Pack;
  density?: Density;
  children: ReactNode;
}

/** Sets data-theme / data-pack / data-density on <html>. */
export function ThemeProvider({
  theme = 'dark',
  pack = 'lightning',
  density = 'default',
  children,
}: ThemeProviderProps) {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-pack', pack);
    root.setAttribute('data-density', density);
  }, [theme, pack, density]);

  return <>{children}</>;
}
