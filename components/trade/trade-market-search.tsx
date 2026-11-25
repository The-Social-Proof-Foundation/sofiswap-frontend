'use client';

import type { SpotlightItem } from '@sehaj23/react-spotlight-search';
import { ChevronRight, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useOrderbookMarketTicker } from '@/hooks/useOrderbookMarketTicker';
import { useNetwork } from '@/lib/network-provider';
import { formatReservationPercent } from '@/lib/graphql/spt-discovery';
import {
  formatTickerPrice,
  marketDisplayPrice,
  type OrderbookMarketSummary,
} from '@/lib/orderbook-indexer/ticker';
import { tradeDownTextClass, tradeUpTextClass } from '@/lib/trade-shell-styles';
import { cn } from '@/lib/utils';

const RECENT_KEY = 'sofiswap-market-search-recent';
const MAX_RECENT = 6;

function readRecentIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeRecentIds(ids: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, MAX_RECENT)));
  } catch {
    // Private mode can reject storage; search still works for this session.
  }
}

function baseSymbol(item: SpotlightItem): string {
  if (!item.id.startsWith('spt:') && !item.id.startsWith('owned:') && item.id.includes('_')) {
    return item.id.split('_')[0]?.toUpperCase() || item.name;
  }
  const word = item.name.split(/[·/]/)[0]?.trim() || item.name;
  return word.slice(0, 8);
}

function tokenImage(symbol: string): string | null {
  if (symbol === 'MYSO') return '/MySo-icon-green.png';
  return null;
}

function tokenTone(symbol: string): string {
  if (symbol === 'BTC') return 'bg-[#F7931A] text-white';
  if (symbol === 'ETH') return 'bg-[#627EEA] text-white';
  return 'bg-muted text-foreground';
}

function TokenMark({
  symbol,
  image,
  square,
}: {
  symbol: string;
  image?: string | null;
  square?: boolean;
}) {
  const src = image || tokenImage(symbol);
  return (
    <span
      className={cn(
        'relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden text-[11px] font-semibold',
        square ? 'rounded-md' : 'rounded-full',
        src ? 'bg-muted' : tokenTone(symbol)
      )}
      aria-hidden
    >
      {src ? (
        // Absolute so the file's intrinsic size cannot stretch the row.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        symbol.slice(0, 1)
      )}
    </span>
  );
}

function quoteFor(item: SpotlightItem, markets: OrderbookMarketSummary[]) {
  const market = markets.find((row) => row.trading_pairs === item.id);
  if (!market) return null;
  return {
    price: marketDisplayPrice(market),
    change: market.price_change_percent_24h ?? null,
  };
}

export function TradeMarketSearch({
  open,
  items,
  onClose,
  onSelect,
}: {
  open: boolean;
  items: SpotlightItem[];
  onClose: () => void;
  onSelect: (item: SpotlightItem) => void;
}) {
  const { currentNetwork } = useNetwork();
  const { markets } = useOrderbookMarketTicker(currentNetwork);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    setRecentIds(readRecentIds());
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const recent = useMemo(
    () => recentIds.map((id) => byId.get(id)).filter((item): item is SpotlightItem => Boolean(item)),
    [byId, recentIds]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const haystack = [item.name, ...(item.tags ?? [])].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [items, query]);

  const rows = useMemo(() => {
    if (query.trim()) return filtered.slice(0, 24);
    const recentSet = new Set(recent.map((item) => item.id));
    return [...recent, ...filtered.filter((item) => !recentSet.has(item.id))].slice(0, 24);
  }, [filtered, query, recent]);

  useEffect(() => {
    setActive(0);
  }, [query, open]);

  const choose = (item: SpotlightItem) => {
    const next = [item.id, ...recentIds.filter((id) => id !== item.id)].slice(0, MAX_RECENT);
    setRecentIds(next);
    writeRecentIds(next);
    onSelect(item);
  };

  const recentCount = query.trim() ? 0 : Math.min(recent.length, rows.length);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        overlayClassName="bg-black/50 backdrop-blur-sm"
        className="top-[12vh] max-w-lg translate-y-0 gap-0 overflow-hidden p-0 sm:rounded-xl [&>button]:hidden"
        aria-label="Search markets"
      >
        <div className="flex items-center gap-2 border-b border-trade-shell px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((index) => Math.min(index + 1, Math.max(rows.length - 1, 0)));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((index) => Math.max(index - 1, 0));
              } else if (event.key === 'Enter' && rows[active]) {
                event.preventDefault();
                choose(rows[active]);
              }
            }}
            placeholder="Search tokens, markets, and wallets"
            className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            aria-autocomplete="list"
            aria-controls="trade-market-search-list"
          />
          <kbd className="hidden rounded border border-trade-shell px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            esc
          </kbd>
        </div>
        <div id="trade-market-search-list" role="listbox" className="max-h-[min(24rem,60vh)] overflow-y-auto py-1">
          {rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {query.trim() ? 'No markets match that search.' : 'No markets on this network yet.'}
            </p>
          ) : (
            rows.map((item, index) => {
              const quote = quoteFor(item, markets);
              const reservedTag = item.tags?.find((tag) => tag.startsWith('reservation-pct:'));
              const reserved = reservedTag ? Number(reservedTag.slice('reservation-pct:'.length)) : null;
              const symbol = baseSymbol(item);
              const change = quote?.change;
              const showHeader = index === 0 || (recentCount > 0 && index === recentCount);
              const header = index < recentCount ? 'Recent' : query.trim() ? 'Results' : 'Markets';
              return (
                <div key={item.id}>
                  {showHeader ? (
                    <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {header}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(item)}
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-2 text-left',
                      index === active ? 'bg-foreground/10' : 'hover:bg-foreground/5'
                    )}
                  >
                    <TokenMark
                      symbol={symbol}
                      image={item.icon}
                      square={item.id.includes(':post:') || item.url.includes('/post/')}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#1c2820] dark:text-[#e8ece9]">
                      {item.name.replaceAll(' · ', ' ').replaceAll('·', '')}
                    </span>
                    {quote?.price != null ? (
                      <span className="shrink-0 text-right">
                        <span className="block font-mono text-xs tabular-nums text-[#1c2820] dark:text-[#e8ece9]">
                          ${formatTickerPrice(quote.price)}
                        </span>
                        {change != null ? (
                          <span
                            className={cn(
                              'block font-mono text-[10px] tabular-nums',
                              change > 0 ? tradeUpTextClass : change < 0 ? tradeDownTextClass : 'text-muted-foreground'
                            )}
                          >
                            {change > 0 ? '+' : ''}
                            {change.toFixed(2)}%
                          </span>
                        ) : null}
                      </span>
                    ) : reserved != null && Number.isFinite(reserved) ? (
                      <span className="shrink-0 font-mono text-xs tabular-nums text-[#1c2820] dark:text-[#e8ece9]">
                        {formatReservationPercent(reserved)}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {item.id.startsWith('owned:') ? 'Held' : item.id.startsWith('spt:') ? 'Social proof' : ''}
                      </span>
                    )}
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
