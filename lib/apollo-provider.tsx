'use client'

import { ReactNode, useState, useEffect } from 'react';
import { NetworkProvider } from '@/lib/network-context';

interface ApolloWrapperProps {
  children: ReactNode;
}

export function ApolloWrapper({ children }: ApolloWrapperProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    // Return a placeholder during server-side rendering to avoid hydration mismatches
    return <>{children}</>;
  }

  return (
    <NetworkProvider>
      {children}
    </NetworkProvider>
  );
} 