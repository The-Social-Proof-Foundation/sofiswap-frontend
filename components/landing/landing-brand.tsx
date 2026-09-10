import Image from 'next/image';

export function BrandMark({ className = 'size-10' }: { className?: string }) {
  return (
    <span className={`relative block shrink-0 ${className}`}>
      <Image src="/logo_dark.svg" alt="" fill className="object-contain dark:hidden" aria-hidden />
      <Image src="/logo_light.svg" alt="" fill className="hidden object-contain dark:block" aria-hidden />
    </span>
  );
}

const artifactPaths = [
  'M12 4c8 6 14 16 10 28-3 9-12 12-18 7-7-6-6-18 2-26 2-2 4-6 6-9z',
  'M16 3c9 4 14 14 11 24-2 8-10 13-18 10C2 34-1 22 5 12 8 7 12 5 16 3z',
  'M8 6c11-2 22 6 20 16-2 9-12 14-21 9C-2 25-1 12 8 6z',
  'M18 2c7 8 9 20 3 28-5 7-16 7-21 0C-5 22 3 8 12 3c2-1 4-1 6-1z',
  'M6 10c10-8 24-4 26 8 2 10-8 18-18 16C4 32-2 20 6 10z',
  'M14 4c10 3 16 14 12 24-3 8-13 11-20 6C-1 28 0 14 8 7c2-2 4-3 6-3z',
  'M10 5c8-3 20 2 22 13 1 9-8 17-17 15C5 31-1 20 4 11c2-3 4-5 6-6z',
] as const;

export const brandArtifacts = [
  { path: artifactPaths[0], className: 'right-[42%] top-[12%] w-16 text-primary/15' },
  { path: artifactPaths[1], className: 'right-[6%] top-[10%] w-20 text-primary/20 xl:right-[8%]' },
  { path: artifactPaths[2], className: 'right-[18%] top-[38%] w-14 text-primary/10' },
  { path: artifactPaths[3], className: 'right-[3%] top-[52%] w-16 text-primary/15 xl:right-[5%]' },
  { path: artifactPaths[4], className: 'right-[28%] bottom-[18%] w-20 text-primary/12' },
  { path: artifactPaths[5], className: 'right-[8%] bottom-[10%] w-24 text-primary/15 xl:right-[10%]' },
  { path: artifactPaths[6], className: 'right-[36%] top-[6%] w-12 text-primary/10' },
] as const;

export function BrandArtifact({
  path,
  className,
}: (typeof brandArtifacts)[number]) {
  return (
    <div
      data-brand-artifact
      className={`pointer-events-none absolute hidden select-none will-change-transform lg:block ${className}`}
      aria-hidden
    >
      <svg viewBox="0 0 36 40" className="h-auto w-full fill-current" role="presentation">
        <path d={path} />
      </svg>
    </div>
  );
}
