import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { ApolloProvider, ApolloClient } from '@apollo/client';
import Cookies from 'js-cookie';
import { createApolloClient } from './apollo-client';
import { toast } from 'sonner';

type NetworkType = 'mainnet' | 'testnet' | 'localnet';

interface NetworkContextType {
  currentNetwork: NetworkType;
  changeNetwork: (network: NetworkType) => void;
  isChangingNetwork: boolean;
}

const NetworkContext = createContext<NetworkContextType>({
  currentNetwork: 'localnet',
  changeNetwork: () => {},
  isChangingNetwork: false
});

export const useNetwork = () => useContext(NetworkContext);

interface NetworkProviderProps {
  children: ReactNode;
}

export const NetworkProvider: React.FC<NetworkProviderProps> = ({ children }) => {
  // Get initial network from cookie
  const getInitialNetwork = (): NetworkType => {
    const savedNetwork = Cookies.get('selectedNetwork');
    if (savedNetwork === 'mainnet' || savedNetwork === 'testnet' || savedNetwork === 'localnet') {
      return savedNetwork;
    }
    return 'localnet';
  };

  const [currentNetwork, setCurrentNetwork] = useState<NetworkType>(getInitialNetwork());
  const [isChangingNetwork, setIsChangingNetwork] = useState(false);
  const [client, setClient] = useState<ApolloClient<any>>(() => createApolloClient());

  // Set default cookie if not present
  useEffect(() => {
    if (!Cookies.get('selectedNetwork')) {
      Cookies.set('selectedNetwork', 'localnet', { expires: 365 });
    }
  }, []);

  // Handle network change
  const changeNetwork = async (network: NetworkType) => {
    if (isChangingNetwork || network === currentNetwork) return;
    
    setIsChangingNetwork(true);
    
    try {
      console.log(`Network change requested to: ${network}`);
      
      // Update the cookie FIRST
      Cookies.set('selectedNetwork', network, { expires: 365 });
      console.log(`Cookie updated to network: ${network}`);
      
      // Update UI state
      setCurrentNetwork(network);
      
      // Create a brand new Apollo client with the new network endpoint
      const newClient = createApolloClient();
      setClient(newClient);
      
      // Show successful update notification
      const networkNames = {
        'mainnet': 'Mainnet',
        'testnet': 'Testnet',
        'localnet': 'Localnet'
      };
      
      toast.success(`Network changed to ${networkNames[network]}`);
    } catch (error) {
      console.error('Error changing network:', error);
      toast.error('Failed to change network');
    } finally {
      setIsChangingNetwork(false);
    }
  };

  return (
    <NetworkContext.Provider value={{ currentNetwork, changeNetwork, isChangingNetwork }}>
      <ApolloProvider client={client}>
        {children}
      </ApolloProvider>
    </NetworkContext.Provider>
  );
}; 