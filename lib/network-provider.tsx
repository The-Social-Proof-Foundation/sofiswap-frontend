'use client';

import Cookies from 'js-cookie';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';

import {
  getClientSelectedNetwork,
  getDefaultNetwork,
  isNetworkType,
  NETWORK_COOKIE_NAME,
  NETWORK_LABELS,
  type NetworkType,
} from '@/lib/network-utils';
import { resetMySoGraphQLClient } from '@/lib/myso-graphql-client';
import { resetMySoJsonRpcClients } from '@/lib/myso-client';

interface NetworkContextValue {
  currentNetwork: NetworkType;
  changeNetwork: (network: NetworkType) => void;
  isChangingNetwork: boolean;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) {
    throw new Error('useNetwork must be used within NetworkProvider');
  }
  return ctx;
}

/** Optional: use when provider may be absent (e.g. marketing pages only). */
export function useNetworkOptional(): NetworkContextValue | null {
  return useContext(NetworkContext);
}

interface NetworkProviderProps {
  children: ReactNode;
}

export function NetworkProvider({ children }: NetworkProviderProps) {
  const [currentNetwork, setCurrentNetwork] = useState<NetworkType>(() =>
    getClientSelectedNetwork()
  );
  const [isChangingNetwork, setIsChangingNetwork] = useState(false);

  useEffect(() => {
    const existing = Cookies.get(NETWORK_COOKIE_NAME);
    if (!existing || !isNetworkType(existing)) {
      const initial = getDefaultNetwork();
      Cookies.set(NETWORK_COOKIE_NAME, initial, { expires: 365 });
      setCurrentNetwork(initial);
    }
  }, []);

  const changeNetwork = useCallback(async (network: NetworkType) => {
    if (isChangingNetwork || network === currentNetwork) return;

    setIsChangingNetwork(true);
    try {
      Cookies.set(NETWORK_COOKIE_NAME, network, { expires: 365 });
      setCurrentNetwork(network);
      resetMySoGraphQLClient();
      resetMySoJsonRpcClients();
      toast.success(`Network switched to ${NETWORK_LABELS[network]}`);
    } catch (e) {
      console.error('[NetworkProvider] changeNetwork', e);
      toast.error('Failed to change network');
    } finally {
      setIsChangingNetwork(false);
    }
  }, [currentNetwork, isChangingNetwork]);

  const value = useMemo(
    () => ({
      currentNetwork,
      changeNetwork,
      isChangingNetwork,
    }),
    [currentNetwork, changeNetwork, isChangingNetwork]
  );

  return (
    <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
  );
}
