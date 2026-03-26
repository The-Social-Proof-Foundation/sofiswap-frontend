'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '@/lib/utils';

const TabsRoot = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export type UnderlineTabItem = {
  id: string;
  label: string;
  /** Badge, count, or extra chrome after the label (e.g. beta pill). */
  suffix?: React.ReactNode;
};

export type UnderlineTabsProps = {
  tabs: UnderlineTabItem[];
  /** Controlled active tab id. */
  activeTab?: string;
  /** Uncontrolled initial tab id (defaults to first tab). */
  defaultActiveTab?: string;
  onTabChange?: (id: string) => void;
  className?: string;
  listClassName?: string;
  triggerClassName?: string;
  'aria-label'?: string;
};

function Tabs({
  tabs,
  activeTab: activeTabProp,
  defaultActiveTab,
  onTabChange,
  className,
  listClassName,
  triggerClassName,
  'aria-label': ariaLabel,
}: UnderlineTabsProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const btnRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const isControlled = activeTabProp !== undefined;
  const [internalActive, setInternalActive] = React.useState(
    () => defaultActiveTab ?? tabs[0]?.id ?? ''
  );

  const activeTab = isControlled ? activeTabProp! : internalActive;

  const setActive = React.useCallback(
    (id: string) => {
      if (!isControlled) setInternalActive(id);
      onTabChange?.(id);
    },
    [isControlled, onTabChange]
  );

  const [indicator, setIndicator] = React.useState({ left: 0, width: 0 });

  const updateIndicator = React.useCallback(() => {
    const container = containerRef.current;
    const idx = tabs.findIndex((t) => t.id === activeTab);
    if (!container || idx < 0) return;
    const btn = btnRefs.current[idx];
    if (!btn) return;
    const cRect = container.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    setIndicator({ left: bRect.left - cRect.left, width: bRect.width });
  }, [activeTab, tabs]);

  React.useLayoutEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => updateIndicator());
    ro.observe(container);
    window.addEventListener('resize', updateIndicator);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateIndicator);
    };
  }, [updateIndicator]);

  const activeStyle: React.CSSProperties = {
    left: indicator.left,
    width: indicator.width > 0 ? indicator.width : undefined,
    opacity: indicator.width > 0 ? 1 : 0,
  };

  if (tabs.length === 0) return null;

  return (
    <div ref={containerRef} className={cn('relative w-full min-w-0', className)}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={cn(
          'relative flex w-full min-w-0 items-stretch justify-start gap-3 border-b border-trade-shell',
          listClassName
        )}
      >
        {tabs.map((tab, i) => {
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`underline-tab-${tab.id}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              ref={(el) => {
                btnRefs.current[i] = el;
              }}
              className={cn(
                'inline-flex flex-none shrink-0 px-2 py-1.5 text-left text-xs font-medium leading-snug text-muted-foreground transition-colors',
                'hover:text-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                selected && 'text-foreground',
                triggerClassName
              )}
              onClick={() => setActive(tab.id)}
            >
              <span className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap">
                <span>{tab.label}</span>
                {tab.suffix}
              </span>
            </button>
          );
        })}
        <div
          className="pointer-events-none absolute bottom-[-1px] left-0 h-[2px] bg-[#0e0f11] transition-all duration-300 ease-out dark:bg-white"
          style={activeStyle}
          aria-hidden
        />
      </div>
    </div>
  );
}

export { Tabs, TabsRoot, TabsList, TabsTrigger, TabsContent };
