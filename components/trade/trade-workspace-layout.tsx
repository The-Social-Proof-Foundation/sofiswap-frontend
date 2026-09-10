'use client';

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { TradeActivityEmptyState } from '@/components/trade/trade-activity-empty-state';
import {
  TradePanelCenteredState,
  TradePanelCenteredStateFrame,
} from '@/components/trade/trade-panel-centered-state';
import { TradeHistoryPanel } from '@/components/trade/trade-history-panel';
import { TradeOpenOrdersTable } from '@/components/trade/trade-open-orders-table';
import { TradeOrderBookPanel } from '@/components/trade/trade-order-book-panel';
import { TradeOrderPanel } from '@/components/trade/trade-order-panel';
import { TradeUserTradeHistoryTable } from '@/components/trade/trade-user-trade-history-table';
import { SlidingSegmentTabs } from '@/components/ui/sliding-segment-tabs';
import { Tabs, type UnderlineTabItem } from '@/components/ui/tabs';
import { useAccountOpenOrders } from '@/hooks/useAccountOpenOrders';
import { useAccountTradeHistory } from '@/hooks/useAccountTradeHistory';
import { useMySocialAuth } from '@/hooks/useMySocialAuth';
import { usePoolBalanceManagerBalances } from '@/hooks/usePoolBalanceManagerBalances';
import { usePoolOnchainMeta } from '@/hooks/usePoolOnchainMeta';
import { usePoolOrderBook } from '@/hooks/usePoolOrderBook';
import { usePoolTrades } from '@/hooks/usePoolTrades';
import { useTradingSetupStatus } from '@/hooks/useTradingSetupStatus';
import { orderbookTradingNetwork } from '@/lib/orderbook/config';
import { getOrderbookIndexerRestBase, tradeTapeIndexerUnsetDetail } from '@/lib/orderbook-indexer/ohlcv';
import { useNetwork } from '@/lib/network-provider';
import { executeCancelPoolOrder } from '@/lib/tx/cancel-order';
import { executePlaceLimitOrder } from '@/lib/tx/place-limit-order';
import { executePlaceMarketOrder } from '@/lib/tx/place-market-order';
import { poolTickerForKey, spotAssetSymbolDisplay } from '@/lib/trade/trade-pool-catalog';
import { generateClientOrderId } from '@/lib/trade/order-placement-utils';
import { ORDERBOOK_DEFAULT_LEVELS_PER_SIDE } from '@/lib/trade/orderbook-types';
import { tradeRailSegmentListClass } from '@/lib/trade-shell-styles';
import { cn } from '@/lib/utils';
import { ArrowRightToLine, Menu } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

const MD_QUERY = '(min-width: 768px)';
/** Swap-only column on very large viewports (Tailwind 2xl). */
const VIEWPORT_2XL_QUERY = '(min-width: 1536px)';
/**
 * With order book open: OB and swap are each 1/6 of the row; together = 1/3.
 * OB sits inside the workspace ((100−⅙)% wide), so OB flex-basis = ⅙÷(100−⅙) = 20% of workspace.
 */
const ORDERBOOK_FLEX_BASIS_PCT_OF_WORKSPACE = (100 / 6) / (100 - 100 / 6);
/** Floor / cap order book + swapping column width (desktop rail). */
const MIN_ORDERBOOK_SWAP_PX = 240;
const MAX_ORDERBOOK_SWAP_PX = 480;
/** Open trades height bounds (% of vertical split to the left of the swap column). */
const OPEN_TRADES_MIN_PCT = 4.25;
const OPEN_TRADES_MAX_PCT = 32;

function OpenTradesSection({
  className,
  poolName,
  refreshNonce = 0,
}: {
  className?: string;
  poolName: string;
  /** Incremented by the parent after a trade/deposit to trigger refresh. */
  refreshNonce?: number;
}) {
  const { currentNetwork } = useNetwork();
  const tradeOb = orderbookTradingNetwork(currentNetwork);
  const {
    isAuthenticated,
    isLoading: authLoading,
    displayAddress,
    signIn,
    keypair,
  } = useMySocialAuth();
  const [segment, setSegment] = useState<string>('open-orders');
  const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null);

  const openOrdersTabActive = segment === 'open-orders';
  const tradeHistoryTabActive = segment === 'trade-history';
  const myTradesTabActive = segment === 'my-trades';

  const tradingSetup = useTradingSetupStatus({
    isAuthenticated,
    displayAddress,
    authLoading,
    network: currentNetwork,
    enabled: isAuthenticated && !authLoading,
  });

  const {
    rows: openOrderRows,
    error: openOrdersError,
    isLoading: openOrdersLoading,
    refresh: refreshOpenOrders,
  } = useAccountOpenOrders({
    poolName,
    obNet: tradeOb,
    primaryBalanceManagerId: tradingSetup.primaryBalanceManagerId,
    enabled:
      openOrdersTabActive &&
      isAuthenticated &&
      !authLoading &&
      Boolean(tradeOb) &&
      Boolean(tradingSetup.primaryBalanceManagerId),
  });

  const {
    data: poolTrades,
    error: poolTradesError,
    isLoading: poolTradesLoading,
    refresh: refreshPoolTrades,
  } = usePoolTrades({
    poolName,
    enabled: Boolean(poolName.trim()),
  });

  const {
    data: myTradeRows,
    error: myTradesError,
    isLoading: myTradesLoading,
    refresh: refreshMyTrades,
  } = useAccountTradeHistory({
    poolName,
    balanceManagerId: tradingSetup.primaryBalanceManagerId,
    enabled:
      myTradesTabActive &&
      isAuthenticated &&
      !authLoading &&
      Boolean(tradingSetup.primaryBalanceManagerId),
  });

  // Trigger refresh when the parent signals a trade/deposit completed.
  useEffect(() => {
    if (refreshNonce <= 0) return;
    refreshOpenOrders();
    refreshPoolTrades();
    refreshMyTrades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshNonce]);

  const tradeTapeEmptyDetail = useMemo(() => {
    if (!getOrderbookIndexerRestBase(currentNetwork)) {
      return tradeTapeIndexerUnsetDetail();
    }
    if (process.env.NODE_ENV === 'development') {
      return 'If this stays empty, ensure the indexer has a pools row for this market name and order_fills is populated.';
    }
    return undefined;
  }, [currentNetwork]);

  const tradeHistoryCount = poolTrades.length;
  const myTradesCount = myTradeRows.length;

  const tabs = useMemo((): UnderlineTabItem[] => {
    const tradeHistorySuffix =
      tradeHistoryCount > 0 ? (
        <span className="text-[10px] font-normal tabular-nums text-[var(--muted-foreground)]">
          ({tradeHistoryCount})
        </span>
      ) : undefined;
    const myTradesSuffix =
      myTradesCount > 0 ? (
        <span className="text-[10px] font-normal tabular-nums text-[var(--muted-foreground)]">
          ({myTradesCount})
        </span>
      ) : undefined;

    return [
      { id: 'open-orders', label: 'Open Orders' },
      {
        id: 'trade-history',
        label: 'Trade History',
        suffix: tradeHistorySuffix,
      },
      {
        id: 'my-trades',
        label: 'My Trades',
        suffix: myTradesSuffix,
      },
    ];
  }, [tradeHistoryCount, myTradesCount]);

  useEffect(() => {
    const ids = tabs.map((t) => t.id);
    if (!ids.includes(segment)) {
      setSegment(ids[0] ?? 'open-orders');
    }
  }, [tabs, segment]);

  const onGetStarted = useCallback(() => {
    void signIn('none');
  }, [signIn]);

  /** Sign-in CTA only for guests; hide while auth is still resolving to avoid flashing the wrong state. */
  const showSignInOnEmpty = !authLoading && !isAuthenticated;

  const onCancelOrder = useCallback(
    async (orderId: string) => {
      const tradeOb = orderbookTradingNetwork(currentNetwork);
      if (!tradeOb) {
        toast.error('Cancel unavailable', {
          description: 'Order cancel is not available on this network.',
        });
        return;
      }
      if (!displayAddress || !keypair) {
        toast.error('Signing unavailable', {
          description: 'Connect a wallet that can sign transactions.',
        });
        return;
      }
      const managerId = tradingSetup.primaryBalanceManagerId;
      if (!managerId) {
        toast.error('Trading setup incomplete', {
          description: 'Balance manager not found for this wallet.',
        });
        return;
      }
      setCancelingOrderId(orderId);
      try {
        await executeCancelPoolOrder({
          network: currentNetwork,
          obNet: tradeOb,
          poolKey: poolName.trim(),
          orderId,
          balanceManagerObjectId: managerId,
          sender: displayAddress,
          signer: keypair,
        });
        toast.success('Order canceled');
        refreshOpenOrders();
        refreshPoolTrades();
      } catch (e) {
        toast.error('Could not cancel order', {
          description: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setCancelingOrderId(null);
      }
    },
    [
      displayAddress,
      keypair,
      tradingSetup.primaryBalanceManagerId,
      currentNetwork,
      poolName,
      refreshOpenOrders,
      refreshPoolTrades,
    ]
  );

  const renderEmptyState = () => (
    <TradeActivityEmptyState
      showGetStarted={showSignInOnEmpty}
      onGetStarted={onGetStarted}
    />
  );

  return (
    <section
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden border-t border-trade-shell bg-background',
        className
      )}
      aria-label="Open orders and trade history"
    >
      <div className="shrink-0 pt-1 md:pt-1.5">
        <Tabs
          tabs={tabs}
          activeTab={segment}
          onTabChange={(id) => setSegment(id)}
          aria-label="Panel view"
          listClassName="gap-3 pb-1"
          tabStripInsetClassName="px-2 md:px-3"
          triggerClassName="px-2 py-1 font-medium"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto px-2 py-2 md:px-3">
        {segment === 'open-orders' ? (
          openOrdersTabActive &&
          isAuthenticated &&
          !authLoading &&
          tradeOb &&
          tradingSetup.isLoading ? (
            <TradePanelCenteredStateFrame>
              <TradePanelCenteredState
                variant="muted"
                headline="Loading wallet setup…"
                message=""
              />
            </TradePanelCenteredStateFrame>
          ) : openOrdersTabActive && isAuthenticated && !authLoading && tradeOb && tradingSetup.error ? (
            <TradePanelCenteredStateFrame>
              <TradePanelCenteredState
                headline="Trading setup unavailable"
                message={tradingSetup.error}
                headlineClassName="text-primary"
              />
            </TradePanelCenteredStateFrame>
          ) : openOrdersLoading ? (
            <TradePanelCenteredStateFrame>
              <TradePanelCenteredState
                variant="muted"
                headline="Loading open orders…"
                message=""
              />
            </TradePanelCenteredStateFrame>
          ) : openOrdersError ? (
            <TradePanelCenteredStateFrame>
              <TradePanelCenteredState headline="Unable to load open orders" message={openOrdersError} />
            </TradePanelCenteredStateFrame>
          ) : openOrderRows.length > 0 ? (
            <TradeOpenOrdersTable
              rows={openOrderRows}
              onCancelOrder={
                tradeOb && keypair && tradingSetup.primaryBalanceManagerId ? onCancelOrder : undefined
              }
              cancelingOrderId={cancelingOrderId}
            />
          ) : (
            renderEmptyState()
          )
        ) : null}

        {segment === 'trade-history' ? (
          tradeHistoryTabActive && poolTradesLoading ? (
            <TradePanelCenteredStateFrame>
              <TradePanelCenteredState
                variant="muted"
                headline="Loading trade history…"
                message=""
              />
            </TradePanelCenteredStateFrame>
          ) : (
            <TradeHistoryPanel
              className="min-h-[8rem]"
              trades={poolTrades}
              isLoading={poolTradesLoading}
              error={poolTradesError}
              emptyDetail={tradeTapeEmptyDetail}
            />
          )
        ) : null}

        {segment === 'my-trades' ? (
          myTradesTabActive && !isAuthenticated && !authLoading ? (
            renderEmptyState()
          ) : myTradesTabActive && authLoading ? (
            <TradePanelCenteredStateFrame>
              <TradePanelCenteredState
                variant="muted"
                headline="Loading wallet…"
                message=""
              />
            </TradePanelCenteredStateFrame>
          ) : myTradesTabActive && !tradingSetup.primaryBalanceManagerId && !tradingSetup.isLoading ? (
            <TradePanelCenteredStateFrame>
              <TradePanelCenteredState
                variant="muted"
                headline="No balance manager yet"
                message="Complete trading setup to see your trade history."
              />
            </TradePanelCenteredStateFrame>
          ) : myTradesTabActive && myTradesLoading ? (
            <TradePanelCenteredStateFrame>
              <TradePanelCenteredState
                variant="muted"
                headline="Loading your trades…"
                message=""
              />
            </TradePanelCenteredStateFrame>
          ) : myTradesTabActive && myTradesError ? (
            <TradePanelCenteredStateFrame>
              <TradePanelCenteredState headline="Unable to load your trades" message={myTradesError} />
            </TradePanelCenteredStateFrame>
          ) : myTradesTabActive && myTradeRows.length > 0 ? (
            <TradeUserTradeHistoryTable rows={myTradeRows} />
          ) : myTradesTabActive ? (
            renderEmptyState()
          ) : null
        ) : null}
      </div>
    </section>
  );
}

type OrderBookRailSegment = 'orderbook' | 'trade-history';

const orderBookRailSegmentItems = [
  {
    value: 'orderbook',
    label: 'Orderbook',
    triggerClassName: 'px-2 py-0 text-[13px] leading-tight',
  },
  {
    value: 'trade-history',
    label: 'History',
    triggerClassName: 'px-2 py-0 text-[13px] leading-tight',
  },
] as const;

function OrderBookSection({
  className,
  onClosePanel,
  poolName,
}: {
  className?: string;
  /** Desktop rail: leave button to the left of the Orderbook / History segment switch. */
  onClosePanel?: () => void;
  poolName: string;
}) {
  const { currentNetwork } = useNetwork();
  const [segment, setSegment] = useState<OrderBookRailSegment>('orderbook');

  const { baseSymbol, quoteSymbol } = useMemo(() => {
    const { base, quote } = poolTickerForKey(currentNetwork, poolName);
    return {
      baseSymbol: spotAssetSymbolDisplay(base),
      quoteSymbol: spotAssetSymbolDisplay(quote),
    };
  }, [currentNetwork, poolName]);

  const showOrderbookLadder = segment === 'orderbook';
  const showTradeTape = segment === 'trade-history';

  const {
    data: orderBook,
    error: orderBookError,
    isLoading: orderBookLoading,
  } = usePoolOrderBook({ poolName, enabled: showOrderbookLadder });

  const {
    data: tradesRaw,
    error: tradesError,
    isLoading: tradesLoading,
  } = usePoolTrades({ poolName, enabled: showTradeTape });

  const tradeTapeEmptyDetail = useMemo(() => {
    if (!getOrderbookIndexerRestBase(currentNetwork)) {
      return tradeTapeIndexerUnsetDetail();
    }
    if (process.env.NODE_ENV === 'development') {
      return 'If this stays empty, ensure the indexer has a pools row for this market name and order_fills is populated.';
    }
    return undefined;
  }, [currentNetwork]);

  const trades = useMemo(() => [...tradesRaw].reverse(), [tradesRaw]);

  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden border-t border-trade-shell bg-muted/20 md:border-t-0',
        className
      )}
      aria-label="Orderbook"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-trade-shell px-2 py-2">
        {onClosePanel ? (
          <button
            type="button"
            onClick={onClosePanel}
            className={cn(
              'inline-flex size-6 shrink-0 items-center justify-center rounded-md p-0',
              'text-[var(--muted-foreground)] hover:bg-muted/80 hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
            )}
            aria-label="Leave order book and history panel"
            title="Leave panel"
          >
            <ArrowRightToLine className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
        <SlidingSegmentTabs
          value={segment}
          onValueChange={(v) => setSegment(v as OrderBookRailSegment)}
          className="min-w-0 flex-1"
          listClassName={cn(tradeRailSegmentListClass, 'h-10 w-full')}
          aria-label="Orderbook panel"
          items={orderBookRailSegmentItems}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {segment === 'orderbook' ? (
          <TradeOrderBookPanel
            baseSymbol={baseSymbol}
            quoteSymbol={quoteSymbol}
            snapshot={orderBook}
            isLoading={orderBookLoading}
            error={orderBookError}
            maxLevelsPerSide={ORDERBOOK_DEFAULT_LEVELS_PER_SIDE}
          />
        ) : (
          <TradeHistoryPanel
            trades={trades}
            isLoading={tradesLoading}
            error={tradesError}
            emptyDetail={tradeTapeEmptyDetail}
          />
        )}
      </div>
    </div>
  );
}

type SwapSideSegment = 'buy' | 'sell';
type SwapOrderTypeSegment = 'market' | 'limit';

const swapOrderTypeTabs = [
  { id: 'market', label: 'Market' },
  { id: 'limit', label: 'Limit' },
] as const;

const swapSideSegmentItems = [
  {
    value: 'buy',
    label: 'Buy',
    triggerClassName: cn(
      'px-2 py-0 text-[13px] leading-tight',
      'data-[state=active]:text-[var(--primary)] dark:data-[state=active]:text-[var(--primary)]'
    ),
  },
  {
    value: 'sell',
    label: 'Sell',
    triggerClassName: cn(
      'px-2 py-0 text-[13px] leading-tight',
      'data-[state=active]:text-[var(--destructive)] dark:data-[state=active]:text-[var(--destructive)]'
    ),
  },
] as const;

function SwappingInputsSection({
  className,
  style,
  poolName,
  orderBookCollapsed,
  onToggleOrderBook,
  showOrderBookToggle,
  onTradeComplete,
}: {
  className?: string;
  style?: CSSProperties;
  poolName: string;
  orderBookCollapsed?: boolean;
  onToggleOrderBook?: () => void;
  showOrderBookToggle?: boolean;
  /** Called after a successful trade so the parent can refresh sibling panels. */
  onTradeComplete?: () => void;
}) {
  const { currentNetwork } = useNetwork();
  const tradeOb = orderbookTradingNetwork(currentNetwork);
  const [side, setSide] = useState<SwapSideSegment>('buy');
  const [orderType, setOrderType] = useState<SwapOrderTypeSegment>('market');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const orderSubmitLock = useRef(false);

  const {
    isAuthenticated,
    isLoading: authLoading,
    displayAddress,
    keypair,
  } = useMySocialAuth();

  const tradingSetup = useTradingSetupStatus({
    isAuthenticated,
    displayAddress,
    authLoading,
    network: currentNetwork,
    enabled: isAuthenticated && !authLoading,
  });

  const managerId = tradingSetup.primaryBalanceManagerId;
  const obNet = tradeOb;
  const balanceEnabled =
    isAuthenticated && !authLoading && Boolean(obNet) && Boolean(managerId) && Boolean(displayAddress);

  const {
    data: orderBook,
    refresh: refreshOrderBook,
  } = usePoolOrderBook({ poolName, enabled: Boolean(poolName.trim()) });

  const {
    data: onchainMeta,
    refresh: refreshOnchainMeta,
  } = usePoolOnchainMeta({
    poolName,
    obNet: tradeOb,
    enabled: Boolean(tradeOb) && Boolean(poolName.trim()),
  });

  const {
    baseBalance,
    quoteBalance,
    refresh: refreshBalances,
  } = usePoolBalanceManagerBalances({
    network: currentNetwork,
    obNet: tradeOb,
    poolName,
    primaryBalanceManagerId: managerId,
    displayAddress,
    enabled: balanceEnabled,
  });

  const midPrice = orderBook?.midPrice ?? null;
  const bestBid = orderBook?.bids[0]?.price ?? null;
  const bestAsk = orderBook?.asks.length ? orderBook.asks[orderBook.asks.length - 1]!.price : null;
  const bookParams = onchainMeta?.bookParams ?? null;
  const takerFee = onchainMeta?.tradeParams.takerFee ?? null;

  const refreshLocalAfterTrade = useCallback(() => {
    refreshOrderBook();
    refreshOnchainMeta();
    refreshBalances();
  }, [refreshOrderBook, refreshOnchainMeta, refreshBalances]);

  const onSubmitOrder = useCallback(
    async (input: {
      side: SwapSideSegment;
      orderType: SwapOrderTypeSegment;
      amount: number;
      limitPrice?: number;
    }) => {
      if (orderSubmitLock.current) return;
      if (!displayAddress || !keypair) {
        toast.error('Signing unavailable', {
          description: 'Connect a wallet that can sign transactions.',
        });
        return;
      }
      if (!managerId) {
        toast.error('Trading setup incomplete', {
          description: 'Balance manager not found for this wallet.',
        });
        return;
      }

      const clientOrderId = generateClientOrderId();
      orderSubmitLock.current = true;
      setIsSubmitting(true);
      try {
        if (input.orderType === 'limit') {
          await executePlaceLimitOrder({
            network: currentNetwork,
            obNet: tradeOb,
            poolKey: poolName.trim(),
            balanceManagerObjectId: managerId,
            side: input.side,
            price: input.limitPrice!,
            quantity: input.amount,
            clientOrderId,
            sender: displayAddress,
            signer: keypair,
          });
        } else {
          await executePlaceMarketOrder({
            network: currentNetwork,
            obNet: tradeOb,
            poolKey: poolName.trim(),
            balanceManagerObjectId: managerId,
            side: input.side,
            quantity: input.amount,
            clientOrderId,
            sender: displayAddress,
            signer: keypair,
          });
        }
        toast.success(`${input.side === 'buy' ? 'Buy' : 'Sell'} order placed`);
        refreshLocalAfterTrade();
        onTradeComplete?.();
      } catch (e) {
        toast.error('Could not place order', {
          description: e instanceof Error ? e.message : String(e),
        });
      } finally {
        orderSubmitLock.current = false;
        setIsSubmitting(false);
      }
    },
    [
      tradeOb,
      displayAddress,
      keypair,
      managerId,
      currentNetwork,
      poolName,
      refreshLocalAfterTrade,
      onTradeComplete,
    ]
  );

  return (
    <aside
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden border-t border-trade-shell bg-muted/30',
        className
      )}
      style={style}
      aria-label="Swapping inputs"
    >
      <div className="flex shrink-0 flex-col">
        <div className="flex items-center gap-2 border-b border-trade-shell px-2 py-2 md:px-3">
          {showOrderBookToggle && onToggleOrderBook && orderBookCollapsed ? (
            <button
              type="button"
              onClick={onToggleOrderBook}
              className={cn(
                'inline-flex size-6 shrink-0 items-center justify-center rounded-md p-0',
                'text-[var(--muted-foreground)] hover:bg-muted/80 hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
              )}
              aria-label="Show order book and history panel"
              aria-expanded={false}
              aria-controls="trade-orderbook-panel"
            >
              <Menu className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
          <SlidingSegmentTabs
            value={side}
            onValueChange={(v) => setSide(v as SwapSideSegment)}
            className="min-w-0 flex-1"
            listClassName={cn(tradeRailSegmentListClass, 'h-10 w-full')}
            aria-label="Buy or sell"
            items={swapSideSegmentItems}
          />
        </div>
        <div className="pb-1.5 pt-1">
          <Tabs
            tabs={[...swapOrderTypeTabs]}
            activeTab={orderType}
            onTabChange={(id) => setOrderType(id as SwapOrderTypeSegment)}
            aria-label="Order type"
            listClassName="gap-4 pb-1"
            tabStripInsetClassName="px-2 md:px-3"
            triggerClassName="px-2 py-1 font-semibold"
          />
        </div>
      </div>
      <TradeOrderPanel
        poolName={poolName}
        side={side}
        orderType={orderType}
        midPrice={midPrice}
        bestBid={bestBid}
        bestAsk={bestAsk}
        baseBalance={baseBalance}
        quoteBalance={quoteBalance}
        bookParams={bookParams}
        takerFee={takerFee}
        isSubmitting={isSubmitting}
        onSubmitOrder={onSubmitOrder}
        className="text-left"
      />
    </aside>
  );
}

function useIsMd() {
  const [isMd, setIsMd] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(MD_QUERY);
    setIsMd(mq.matches);
    const onChange = () => setIsMd(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isMd;
}

function useIsViewport2xl() {
  const [is2xl, setIs2xl] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(VIEWPORT_2XL_QUERY);
    setIs2xl(mq.matches);
    const onChange = () => setIs2xl(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return is2xl;
}

export function TradeWorkspaceLayout({
  chart,
  poolName = 'MYSO_MYUSD',
}: {
  chart: ReactNode;
  poolName?: string;
}) {
  const isMd = useIsMd();
  const isViewport2xl = useIsViewport2xl();
  const [orderBookCollapsed, setOrderBookCollapsed] = useState(false);
  const [tradeRefreshNonce, setTradeRefreshNonce] = useState(0);

  const toggleOrderBook = useCallback(() => {
    setOrderBookCollapsed((c) => !c);
  }, []);

  const closeOrderBookPanel = useCallback(() => {
    setOrderBookCollapsed(true);
  }, []);

  const handleTradeComplete = useCallback(() => {
    setTradeRefreshNonce((n) => n + 1);
  }, []);

  /** Swap column: fixed % of full trade row (viewport-wide). OB open → ⅙ (Tailwind arbitrary). */
  const swapColumnClass = orderBookCollapsed
    ? isViewport2xl
      ? 'w-1/5'
      : 'w-1/4'
    : 'w-[16.666667%]';

  const handleClass =
    'w-px shrink-0 bg-trade-shell-border after:bg-trade-shell-border focus-visible:ring-offset-background';

  if (!isMd) {
    return (
      <div
        className={cn(
          'flex w-full flex-col overflow-x-hidden',
          /* Below md: height follows content so the scrollable page column can move. */
          'md:min-h-0 md:flex-1 md:overflow-hidden'
        )}
        aria-label="Trading workspace"
      >
        {/* Mobile stack: chart (capped) → order book → swap → activity; parent scrolls. */}
        <div className="flex h-[min(38vh,20rem)] min-h-[10.5rem] max-h-[24rem] shrink-0 flex-col overflow-hidden border-b border-trade-shell">
          {chart}
        </div>
        <div className="flex h-[min(28vh,16rem)] min-h-[9rem] max-h-[18.5rem] shrink-0 flex-col overflow-hidden">
          <OrderBookSection
            poolName={poolName}
            className="h-full min-h-0 flex-1 border-t-0"
          />
        </div>
        <SwappingInputsSection
          poolName={poolName}
          className="shrink-0"
          onTradeComplete={handleTradeComplete}
        />
        <OpenTradesSection
          poolName={poolName}
          className="min-h-[min(40vh,19rem)] shrink-0"
          refreshNonce={tradeRefreshNonce}
        />
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-row overflow-hidden"
      aria-label="Trading workspace"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-trade-shell md:border-r">
        <ResizablePanelGroup
          direction="vertical"
          autoSaveId="sofiswap-trade-chart-v"
          className="min-h-0 flex-1"
        >
          <ResizablePanel
            defaultSize={72}
            minSize={52}
            maxSize={99}
            order={1}
            className="min-h-0 min-w-0"
          >
            {orderBookCollapsed ? (
              <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">{chart}</div>
            ) : (
              <div className="flex h-full min-h-0 min-w-0 flex-row overflow-hidden">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{chart}</div>
                <div
                  id="trade-orderbook-panel"
                  className="box-border flex h-full min-h-0 min-w-0 shrink-0 grow-0 flex-col overflow-hidden border-l border-trade-shell"
                  style={{
                    flex: `0 0 ${ORDERBOOK_FLEX_BASIS_PCT_OF_WORKSPACE * 100}%`,
                    minWidth: MIN_ORDERBOOK_SWAP_PX,
                    maxWidth: MAX_ORDERBOOK_SWAP_PX,
                  }}
                >
                  <OrderBookSection
                    className="h-full flex-1 border-t-0"
                    onClosePanel={closeOrderBookPanel}
                    poolName={poolName}
                  />
                </div>
              </div>
            )}
          </ResizablePanel>
          <ResizableHandle className={handleClass} />
          <ResizablePanel
            id="trade-open-trades-panel"
            order={2}
            defaultSize={28}
            minSize={OPEN_TRADES_MIN_PCT}
            maxSize={OPEN_TRADES_MAX_PCT}
            className="min-h-0 min-w-0"
          >
            <OpenTradesSection
              className="border-t-0"
              poolName={poolName}
              refreshNonce={tradeRefreshNonce}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <SwappingInputsSection
        poolName={poolName}
        className={cn(
          'box-border h-full shrink-0 border-t-0 md:border-l md:border-trade-shell',
          swapColumnClass
        )}
        style={{
          minWidth: MIN_ORDERBOOK_SWAP_PX,
          maxWidth: MAX_ORDERBOOK_SWAP_PX,
        }}
        orderBookCollapsed={orderBookCollapsed}
        onToggleOrderBook={toggleOrderBook}
        showOrderBookToggle
        onTradeComplete={handleTradeComplete}
      />
    </div>
  );
}
