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
  getDefaultNetwork,
  isNetworkType,
  NETWORK_COOKIE_NAME,
  NETWORK_LABELS,
  SOFISWAP_SELECTED_NETWORK_CHANGE_EVENT,
  type NetworkType,
} from '@/lib/network-utils';
import { resetMySoGraphQLClient } from '@/lib/myso-graphql-client';
import { resetMySoJsonRpcClients } from '@/lib/myso-client';
import { resetMySocialAuthInstance } from '@/lib/mysocial-auth-client';
import { clearAllTradingSetupCache } from '@/lib/trading-setup-cache';

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
  // The server cannot see browser cookies during static rendering. Hydrate with
  // the same default first, then apply the persisted selection after mount.
  const [currentNetwork, setCurrentNetwork] = useState<NetworkType>(getDefaultNetwork);
  const [isChangingNetwork, setIsChangingNetwork] = useState(false);

  useEffect(() => {
    const existing = Cookies.get(NETWORK_COOKIE_NAME);
    if (isNetworkType(existing)) {
      setCurrentNetwork(existing);
    } else {
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

      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent(SOFISWAP_SELECTED_NETWORK_CHANGE_EVENT, {
              detail: { network },
            })
          );
        }
      } catch {
        /* ignore SSR */
      }
      resetMySocialAuthInstance();

      setCurrentNetwork(network);
      resetMySoGraphQLClient();
      resetMySoJsonRpcClients();
      clearAllTradingSetupCache();
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
