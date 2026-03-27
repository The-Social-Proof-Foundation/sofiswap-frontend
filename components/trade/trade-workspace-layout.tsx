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
import { useMySocialAuth } from '@/hooks/useMySocialAuth';
import { usePoolOrderBook } from '@/hooks/usePoolOrderBook';
import { usePoolTrades } from '@/hooks/usePoolTrades';
import { useTradingSetupStatus } from '@/hooks/useTradingSetupStatus';
import { orderbookRuntimeNetwork } from '@/lib/orderbook-config';
import { useNetwork } from '@/lib/network-provider';
import { poolTickerForKey } from '@/lib/trade/trade-pool-catalog';
import type { UserTradeHistoryRow } from '@/lib/trade/activity-tables';
import { cn } from '@/lib/utils';
import { ArrowRightToLine, Menu } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

const MD_QUERY = '(min-width: 768px)';
/** Swap-only column on very large viewports (Tailwind 2xl). */
const VIEWPORT_2XL_QUERY = '(min-width: 1536px)';
/**
 * With order book open: OB and swap are each 1/6 of the row; together = 1/3.
 * OB sits inside the workspace ((100−⅙)% wide), so OB flex-basis = ⅙÷(100−⅙) = 20% of workspace.
 */
const ORDERBOOK_FLEX_BASIS_PCT_OF_WORKSPACE = (100 / 6) / (100 - 100 / 6);
/** Cap order book + swapping column width on very wide monitors. */
const MAX_ORDERBOOK_SWAP_PX = 480;
/** Open trades height bounds (% of vertical split to the left of the swap column). */
const OPEN_TRADES_MIN_PCT = 4.25;
const OPEN_TRADES_MAX_PCT = 32;

const railSegmentListClass = cn(
  'grid grid-cols-2 gap-0 rounded-[10px] border border-trade-shell bg-muted/70 p-[3px] shadow-inner',
  'dark:bg-muted/40 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
);

function OpenTradesSection({
  className,
  poolName,
}: {
  className?: string;
  poolName: string;
}) {
  const { currentNetwork } = useNetwork();
  const obNet = orderbookRuntimeNetwork(currentNetwork);
  const { isAuthenticated, isLoading: authLoading, displayAddress, signIn } =
    useMySocialAuth();
  const [segment, setSegment] = useState<string>('open-orders');

  const openOrdersTabActive = segment === 'open-orders';
  const tradingForOpenOrders = useTradingSetupStatus({
    isAuthenticated,
    displayAddress,
    authLoading,
    network: currentNetwork,
    enabled: openOrdersTabActive,
  });

  const {
    rows: openOrderRows,
    error: openOrdersError,
    isLoading: openOrdersLoading,
  } = useAccountOpenOrders({
    poolName,
    obNet,
    primaryBalanceManagerId: tradingForOpenOrders.primaryBalanceManagerId,
    enabled:
      openOrdersTabActive &&
      isAuthenticated &&
      !authLoading &&
      Boolean(obNet) &&
      Boolean(tradingForOpenOrders.primaryBalanceManagerId),
  });

  const tradeHistoryRows = useMemo<UserTradeHistoryRow[]>(() => [], []);

  const tradeHistoryCount = tradeHistoryRows.length;

  const tabs = useMemo((): UnderlineTabItem[] => {
    const tradeHistorySuffix =
      tradeHistoryCount > 0 ? (
        <span className="text-[10px] font-normal tabular-nums text-[var(--muted-foreground)]">
          ({tradeHistoryCount})
        </span>
      ) : undefined;

    return [
      { id: 'open-orders', label: 'Open Orders' },
      {
        id: 'trade-history',
        label: 'Trade History',
        suffix: tradeHistorySuffix,
      },
    ];
  }, [tradeHistoryCount]);

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
      <div className="shrink-0 px-2 pt-1 md:px-3 md:pt-1.5">
        <Tabs
          tabs={tabs}
          activeTab={segment}
          onTabChange={(id) => setSegment(id)}
          aria-label="Panel view"
          listClassName="gap-3"
          triggerClassName="px-1.5 py-1 font-medium"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto px-2 py-2 md:px-3">
        {segment === 'open-orders' ? (
          openOrdersTabActive &&
          isAuthenticated &&
          !authLoading &&
          obNet &&
          tradingForOpenOrders.isLoading ? (
            <TradePanelCenteredStateFrame>
              <TradePanelCenteredState
                variant="muted"
                headline="Loading wallet setup…"
                message=""
              />
            </TradePanelCenteredStateFrame>
          ) : openOrdersTabActive && isAuthenticated && !authLoading && obNet && tradingForOpenOrders.error ? (
            <TradePanelCenteredStateFrame>
              <TradePanelCenteredState
                headline="Trading setup unavailable"
                message={tradingForOpenOrders.error}
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
            <TradeOpenOrdersTable rows={openOrderRows} />
          ) : (
            renderEmptyState()
          )
        ) : null}

        {segment === 'trade-history' ? (
          tradeHistoryRows.length > 0 ? (
            <TradeUserTradeHistoryTable rows={tradeHistoryRows} />
          ) : (
            renderEmptyState()
          )
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
    return { baseSymbol: base, quoteSymbol: quote };
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
          listClassName={cn(railSegmentListClass, 'h-9 w-full')}
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
            maxLevelsPerSide={14}
          />
        ) : (
          <TradeHistoryPanel trades={trades} isLoading={tradesLoading} error={tradesError} />
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
}: {
  className?: string;
  style?: CSSProperties;
  poolName: string;
  orderBookCollapsed?: boolean;
  onToggleOrderBook?: () => void;
  showOrderBookToggle?: boolean;
}) {
  const [side, setSide] = useState<SwapSideSegment>('buy');
  const [orderType, setOrderType] = useState<SwapOrderTypeSegment>('market');

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
            listClassName={cn(railSegmentListClass, 'h-9 w-full')}
            aria-label="Buy or sell"
            items={swapSideSegmentItems}
          />
        </div>
        <div className="px-2 pb-1.5 pt-1 md:px-3">
          <Tabs
            tabs={[...swapOrderTypeTabs]}
            activeTab={orderType}
            onTabChange={(id) => setOrderType(id as SwapOrderTypeSegment)}
            aria-label="Order type"
            listClassName="border-b-0 gap-4"
            triggerClassName="px-2 py-1 font-semibold"
          />
        </div>
      </div>
      <TradeOrderPanel poolName={poolName} side={side} orderType={orderType} className="text-left" />
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

  const toggleOrderBook = useCallback(() => {
    setOrderBookCollapsed((c) => !c);
  }, []);

  const closeOrderBookPanel = useCallback(() => {
    setOrderBookCollapsed(true);
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
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        aria-label="Trading workspace"
      >
        {/* Mobile stack: chart (capped) → order book → swap → open activity (flexes). */}
        <div className="flex h-[min(42vh,22rem)] min-h-[11.5rem] max-h-[26rem] shrink-0 flex-col overflow-hidden border-b border-trade-shell">
          {chart}
        </div>
        <div className="flex h-[min(30vh,17.5rem)] min-h-[10rem] max-h-[21rem] shrink-0 flex-col overflow-hidden">
          <OrderBookSection
            poolName={poolName}
            className="h-full min-h-0 flex-1 border-t-0"
          />
        </div>
        <SwappingInputsSection poolName={poolName} className="shrink-0" />
        <OpenTradesSection poolName={poolName} className="min-h-0 flex-1" />
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
            <OpenTradesSection className="border-t-0" poolName={poolName} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <SwappingInputsSection
        poolName={poolName}
        className={cn(
          'box-border h-full shrink-0 border-t-0 md:border-l md:border-trade-shell',
          swapColumnClass
        )}
        style={{ maxWidth: MAX_ORDERBOOK_SWAP_PX }}
        orderBookCollapsed={orderBookCollapsed}
        onToggleOrderBook={toggleOrderBook}
        showOrderBookToggle
      />
    </div>
  );
}
