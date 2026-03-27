'use client';

import { motion } from 'framer-motion';
import * as React from 'react';

import { TabsList, TabsRoot, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

/** Text + interaction only; the pill background is the sliding thumb. */
export const slidingSegmentTriggerClass = cn(
  'relative z-[1] flex h-full min-h-0 w-full min-w-0 items-center justify-center rounded-md font-medium shadow-none',
  'bg-transparent text-[var(--muted-foreground)] transition-colors duration-200',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  'data-[state=inactive]:hover:text-foreground/90',
  'data-[state=active]:bg-transparent data-[state=active]:text-[var(--foreground)] data-[state=active]:shadow-none',
  'dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-white dark:data-[state=active]:shadow-none'
);

const thumbClass = cn(
  'pointer-events-none z-0 rounded-md will-change-[left,width,top,height]',
  'bg-background shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_1px_rgba(0,0,0,0.04)]',
  'dark:bg-zinc-800/95 dark:shadow-[0_3px_10px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)]'
);

export type SlidingSegmentItem = {
  value: string;
  label: React.ReactNode;
  triggerClassName?: string;
};

export type SlidingSegmentTabsProps = {
  value: string;
  onValueChange: (value: string) => void;
  items: ReadonlyArray<SlidingSegmentItem>;
  className?: string;
  listClassName?: string;
  'aria-label'?: string;
};

export function SlidingSegmentTabs({
  value,
  onValueChange,
  items,
  className,
  listClassName,
  'aria-label': ariaLabel,
}: SlidingSegmentTabsProps) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const triggerRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const [thumb, setThumb] = React.useState({ left: 0, width: 0, top: 0, height: 0 });

  const updateThumb = React.useCallback(() => {
    const list = listRef.current;
    const idx = items.findIndex((x) => x.value === value);
    if (!list || idx < 0) return;
    const el = triggerRefs.current[idx];
    if (!el) return;
    const lr = list.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    setThumb({
      left: er.left - lr.left,
      width: er.width,
      top: er.top - lr.top,
      height: er.height,
    });
  }, [value, items]);

  React.useLayoutEffect(() => {
    updateThumb();
  }, [updateThumb]);

  React.useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const ro = new ResizeObserver(() => updateThumb());
    ro.observe(list);
    window.addEventListener('resize', updateThumb);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateThumb);
    };
  }, [updateThumb]);

  const spring = {
    type: 'spring' as const,
    stiffness: 520,
    damping: 38,
    mass: 0.45,
  };

  return (
    <TabsRoot value={value} onValueChange={onValueChange} className={className}>
      <TabsList
        ref={listRef}
        aria-label={ariaLabel}
        className={cn('relative', listClassName)}
      >
        <motion.div
          aria-hidden
          className={thumbClass}
          initial={false}
          animate={{
            left: thumb.width > 0 ? thumb.left : 0,
            width: thumb.width,
            top: thumb.height > 0 ? thumb.top : 0,
            height: thumb.height,
            opacity: thumb.width > 0 ? 1 : 0,
          }}
          transition={spring}
          style={{ position: 'absolute' }}
        />
        {items.map((item, i) => (
          <TabsTrigger
            key={item.value}
            ref={(el) => {
              triggerRefs.current[i] = el;
            }}
            value={item.value}
            className={cn(slidingSegmentTriggerClass, item.triggerClassName)}
          >
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </TabsRoot>
  );
}
