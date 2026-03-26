import type { SpotlightItem } from '@sehaj23/react-spotlight-search';

/** Pools offered in the trade chart spotlight picker (extend when indexer/registry is wired). */
export const TRADE_POOL_SPOTLIGHT_ITEMS: SpotlightItem[] = [
  {
    id: 'MYSO_MYUSD',
    name: 'MYSO / MYUSD',
    url: '/trade',
    tags: ['MYSO', 'MYUSD', 'myusd', 'stable', 'pool'],
  },
  {
    id: 'MYSO_USDC',
    name: 'MYSO / USDC',
    url: '/trade',
    tags: ['MYSO', 'USDC', 'usd', 'pool'],
  },
  {
    id: 'MYUSD_USDC',
    name: 'MYUSD / USDC',
    url: '/trade',
    tags: ['MYUSD', 'USDC', 'stable', 'pool'],
  },
];
