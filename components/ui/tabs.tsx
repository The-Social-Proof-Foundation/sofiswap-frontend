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
      'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-[var(--muted-foreground)]',
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
  /** Optional leading icon (matches legacy Tab API). */
  icon?: React.ReactNode;
  /** Badge, count, or extra chrome after the label. */
  suffix?: React.ReactNode;
};

export type UnderlineTabsProps = {
  tabs: UnderlineTabItem[];
  activeTab?: string;
  defaultActiveTab?: string;
  onTabChange?: (id: string) => void;
  className?: string;
  listClassName?: string;
  triggerClassName?: string;
  /** When set, the bottom border spans full width; tab triggers get this horizontal inset only. */
  tabStripInsetClassName?: string;
  'aria-label'?: string;
};

type BarStyle = { left: string; width: string };

function measureTab(parentEl: HTMLElement | null, tabEl: HTMLElement | null): BarStyle {
  if (!parentEl || !tabEl) return { left: '0px', width: '0px' };
  const p = parentEl.getBoundingClientRect();
  const t = tabEl.getBoundingClientRect();
  return {
    left: `${t.left - p.left}px`,
    width: `${t.width}px`,
  };
}

const Tabs = React.forwardRef<HTMLDivElement, UnderlineTabsProps>(
  (
    {
      className,
      tabs,
      activeTab: activeTabProp,
      defaultActiveTab,
      onTabChange,
      listClassName,
      triggerClassName,
      tabStripInsetClassName,
      'aria-label': ariaLabel,
    },
    ref
  ) => {
    const isControlled = activeTabProp !== undefined;

    const indexFromId = React.useCallback(
      (id: string) => {
        const i = tabs.findIndex((t) => t.id === id);
        return i >= 0 ? i : 0;
      },
      [tabs]
    );

    const [internalIndex, setInternalIndex] = React.useState(() =>
      defaultActiveTab ? indexFromId(defaultActiveTab) : 0
    );

    const activeIndex = isControlled ? indexFromId(activeTabProp!) : internalIndex;

    const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
    const [hoverStyle, setHoverStyle] = React.useState<BarStyle>({ left: '0px', width: '0px' });
    const [activeStyle, setActiveStyle] = React.useState<BarStyle>({ left: '0px', width: '0px' });

    const shellRef = React.useRef<HTMLDivElement>(null);
    const tabRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

    const updateActiveStyle = React.useCallback(() => {
      const shell = shellRef.current;
      const el = tabRefs.current[activeIndex];
      setActiveStyle(measureTab(shell, el));
    }, [activeIndex]);

    const updateHoverStyle = React.useCallback(() => {
      if (hoveredIndex == null) return;
      const shell = shellRef.current;
      const el = tabRefs.current[hoveredIndex];
      setHoverStyle(measureTab(shell, el));
    }, [hoveredIndex]);

    React.useLayoutEffect(() => {
      updateActiveStyle();
      const raf = requestAnimationFrame(updateActiveStyle);
      return () => cancelAnimationFrame(raf);
    }, [updateActiveStyle, tabs]);

    React.useLayoutEffect(() => {
      updateHoverStyle();
    }, [updateHoverStyle]);

    React.useEffect(() => {
      const shell = shellRef.current;
      if (!shell) return;
      const ro = new ResizeObserver(() => {
        updateActiveStyle();
        updateHoverStyle();
      });
      ro.observe(shell);
      for (const btn of tabRefs.current) {
        if (btn) ro.observe(btn);
      }
      const onWin = () => {
        updateActiveStyle();
        updateHoverStyle();
      };
      window.addEventListener('resize', onWin);
      return () => {
        ro.disconnect();
        window.removeEventListener('resize', onWin);
      };
    }, [updateActiveStyle, updateHoverStyle, tabs.length]);

    React.useEffect(() => {
      if (!isControlled || tabs.length === 0) return;
      if (!tabs.some((t) => t.id === activeTabProp)) {
        onTabChange?.(tabs[0]!.id);
      }
    }, [isControlled, activeTabProp, tabs, onTabChange]);

    React.useEffect(() => {
      if (isControlled || tabs.length === 0) return;
      if (internalIndex >= tabs.length) setInternalIndex(0);
    }, [isControlled, internalIndex, tabs.length]);

    if (tabs.length === 0) return null;

    const tabButtons = tabs.map((tab, index) => {
      const selected = index === activeIndex;
      return (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`underline-tab-${tab.id}`}
          aria-selected={selected}
          tabIndex={selected ? 0 : -1}
          ref={(el) => {
            tabRefs.current[index] = el;
          }}
          className={cn(
            'flex h-[30px] shrink-0 cursor-pointer items-center justify-center px-3 py-2 transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            selected
              ? 'text-[#0e0e10] dark:text-white'
              : 'text-[#0e0f1199] dark:text-[#ffffff99]',
            triggerClassName
          )}
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(null)}
          onClick={() => {
            if (!isControlled) setInternalIndex(index);
            onTabChange?.(tab.id);
          }}
        >
          <span className="flex h-full items-center justify-center whitespace-nowrap text-sm font-medium leading-5">
            {tab.icon ? <span className="mr-3 flex items-center">{tab.icon}</span> : null}
            <span className="inline-flex max-w-full items-center gap-1.5">
              <span>{tab.label}</span>
              {tab.suffix}
            </span>
          </span>
        </button>
      );
    });

    const tabListClass = cn(
      'relative z-[2] flex w-full min-w-0 flex-nowrap items-center gap-3',
      tabStripInsetClassName ? 'border-b-0' : 'border-b border-trade-shell',
      listClassName,
      tabStripInsetClassName
    );

    const tabListEl = (
      <div role="tablist" aria-label={ariaLabel} className={tabListClass}>
        {tabButtons}
      </div>
    );

    return (
      <div ref={ref} className={cn('w-full min-w-0', className)}>
        <div ref={shellRef} className="relative w-full min-w-0">
          <div
            className="pointer-events-none absolute z-0 flex h-[30px] items-center rounded-md bg-[#0e0f1114] transition-all duration-300 ease-out dark:bg-[#ffffff1a]"
            style={{
              ...hoverStyle,
              opacity: hoveredIndex !== null ? 1 : 0,
            }}
            aria-hidden
          />

          <div
            className="pointer-events-none absolute bottom-[-2px] left-0 z-[1] h-[2px] bg-[#0e0f11] transition-all duration-300 ease-out dark:bg-white"
            style={activeStyle}
            aria-hidden
          />

          {tabStripInsetClassName ? (
            <div className="w-full min-w-0 border-b border-trade-shell">{tabListEl}</div>
          ) : (
            tabListEl
          )}
        </div>
      </div>
    );
  }
);

Tabs.displayName = 'Tabs';

export { Tabs, TabsRoot, TabsList, TabsTrigger, TabsContent };
