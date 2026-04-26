'use client';

import type { CSSProperties } from 'react';
import { useTheme } from 'next-themes';
import { Toaster as Sonner, ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          width: 'fit-content',
          maxWidth: 'calc(100vw - 2rem)',
          minWidth: '0'
        } as CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
