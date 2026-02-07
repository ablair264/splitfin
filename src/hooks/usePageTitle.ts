import { useEffect } from 'react';

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} — Splitfin` : 'Splitfin';
    return () => {
      document.title = 'Splitfin';
    };
  }, [title]);
}
