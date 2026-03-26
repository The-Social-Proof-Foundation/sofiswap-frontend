'use client';

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { SlidingSegmentTabs } from '@/components/ui/sliding-segment-tabs';
import { Tabs } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ArrowRightToLine, Menu } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

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

const openTradesUnderlineTabs = [
  { id: 'positions', label: 'Positions' },
  { id: 'open-orders', label: 'Open Orders' },
  { id: 'trade-history', label: 'Trade History' },
] as const;

type OpenTradesUnderlineId = (typeof openTradesUnderlineTabs)[number]['id'];

function OpenTradesSection({ className }: { className?: string }) {
  const [segment, setSegment] = useState<OpenTradesUnderlineId>('positions');

  return (
    <section
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden border-t border-trade-shell bg-background',
        className
      )}
      aria-label="Positions, open orders, and trade history"
    >
      <div className="shrink-0 px-2 pt-1 md:px-3 md:pt-1.5">
        <Tabs
          tabs={[...openTradesUnderlineTabs]}
          activeTab={segment}
          onTabChange={(id) => setSegment(id as OpenTradesUnderlineId)}
          aria-label="Panel view"
          listClassName="gap-3"
          triggerClassName="px-1.5 py-1 font-medium"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4 text-left text-sm text-muted-foreground">
        {segment === 'positions' ? (
          <span>Positions placeholder</span>
        ) : segment === 'open-orders' ? (
          <span>Open orders placeholder</span>
        ) : (
          <span>Trade history placeholder</span>
        )}
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
}: {
  className?: string;
  /** Desktop rail: leave button to the left of the Orderbook / History segment switch. */
  onClosePanel?: () => void;
}) {
  const [segment, setSegment] = useState<OrderBookRailSegment>('orderbook');

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
              'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
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
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 text-center text-sm text-muted-foreground">
            Orderbook placeholder
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 text-center text-sm text-muted-foreground">
            Trade history placeholder
          </div>
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
    triggerClassName: 'px-2 py-0 text-[13px] leading-tight',
  },
  {
    value: 'sell',
    label: 'Sell',
    triggerClassName: 'px-2 py-0 text-[13px] leading-tight',
  },
] as const;

function SwappingInputsSection({
  className,
  style,
  orderBookCollapsed,
  onToggleOrderBook,
  showOrderBookToggle,
}: {
  className?: string;
  style?: CSSProperties;
  orderBookCollapsed?: boolean;
  onToggleOrderBook?: () => void;
  showOrderBookToggle?: boolean;
}) {
  const [side, setSide] = useState<SwapSideSegment>('buy');
  const [orderType, setOrderType] = useState<SwapOrderTypeSegment>('market');

  const sideLabel = side === 'buy' ? 'Buy' : 'Sell';
  const typeLabel = orderType === 'market' ? 'Market' : 'Limit';

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
                'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
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
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 text-center text-sm text-muted-foreground">
        {sideLabel} · {typeLabel} panel placeholder
      </div>
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

export function TradeWorkspaceLayout({ chart }: { chart: ReactNode }) {
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
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,3fr)_minmax(0,1fr)] overflow-hidden">
          <div className="flex h-full min-h-0 min-w-0 overflow-hidden">{chart}</div>
          <OpenTradesSection />
        </div>
        <OrderBookSection />
        <SwappingInputsSection />
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
            <OpenTradesSection className="border-t-0" />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <SwappingInputsSection
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
