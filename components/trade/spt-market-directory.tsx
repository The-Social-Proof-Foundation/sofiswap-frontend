'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, FileText, Loader2, RefreshCw, Search, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMySocialAuth } from '@/hooks/useMySocialAuth';
import { usePolledResource } from '@/hooks/usePolledResource';
import { fetchSptDirectory, findSptProfileByUsername } from '@/lib/graphql/spt-directory';
import { useNetwork } from '@/lib/network-provider';
import { tradeSptPath, tradeSptPostPath } from '@/lib/trade-route-path';
import { cn } from '@/lib/utils';

function short(value: string) { return `${value.slice(0, 8)}…${value.slice(-6)}`; }

export function SptMarketDirectory() {
  const { currentNetwork } = useNetwork();
  const { displayAddress, isAuthenticated } = useMySocialAuth();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<'all' | 'profile' | 'post' | 'mine'>('all');
  const [query, setQuery] = useState('');
  const [lookup, setLookup] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const lookupRequest = useRef(0);
  useEffect(() => () => { lookupRequest.current += 1; }, []);
  const owner = filter === 'mine' ? displayAddress : null;
  const load = useCallback(() => fetchSptDirectory({ network: currentNetwork, offset: page * 50, owner }), [currentNetwork, page, owner]);
  const { data, error, isLoading, revalidate } = usePolledResource(`${currentNetwork}:${page}:${owner}`, load, 30_000);
  const rows = useMemo(() => {
    const profiles = (data?.profiles ?? []).map((p) => ({
      id: p.address, kind: 'profile', title: p.displayName || p.username || short(p.address),
      detail: p.username ? `@${p.username}` : short(p.address), href: tradeSptPath(p.address),
      status: p.socialProofToken?.poolId || p.socialProofToken?.isActive ? 'Trading' : 'Reservations',
      search: [p.displayName, p.username, p.address, p.bio].join(' '),
    }));
    const posts = (data?.posts ?? []).map((p) => ({
      id: p.postId, kind: 'post', title: p.content.replace(/\s+/g, ' ').trim() || 'Untitled post',
      detail: p.ownerProfile?.username ? `@${p.ownerProfile.username}` : p.ownerProfile?.displayName || short(p.owner),
      href: tradeSptPostPath(p.postId), status: 'Enabled',
      search: [p.content, p.postId, p.owner, p.ownerProfile?.username, p.ownerProfile?.displayName].join(' '),
    }));
    const q = query.trim().replace(/^@/, '').toLowerCase();
    return [...profiles, ...posts].filter((row) => (filter === 'all' || filter === 'mine' || row.kind === filter) && (!q || row.search.toLowerCase().includes(q)));
  }, [data, filter, query]);
  return (
    <section className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain font-satoshi">
      <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Social markets</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Social Proof Tokens</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Explore enabled profile and post tokens. Reserve before launch or trade live tokens. You can still find any profile by its @username.</p></div>
          {isAuthenticated && displayAddress ? <Button asChild variant="outline" className="rounded-full"><Link href={tradeSptPath(displayAddress)}>Manage my profile <ArrowRight className="ml-2 size-4" /></Link></Button> : null}
        </div>
        <form className="mt-8 flex gap-2" onSubmit={(event) => {
          event.preventDefault();
          if (!query.startsWith('@') || lookup) return;
          const request = ++lookupRequest.current;
          setLookup(true); setLookupError(null);
          void findSptProfileByUsername(currentNetwork, query).then((address) => {
            if (request === lookupRequest.current) router.push(tradeSptPath(address));
          }).catch((reason) => {
            if (request === lookupRequest.current) setLookupError(reason instanceof Error ? reason.message : 'Profile lookup failed.');
          }).finally(() => { if (request === lookupRequest.current) setLookup(false); });
        }}>
          <label className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-trade-shell bg-muted/20 px-3 focus-within:ring-2 focus-within:ring-ring">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input aria-label="Filter this page or look up an exact username" value={query} onChange={(event) => { setQuery(event.target.value); setLookupError(null); }} placeholder="Filter this page, or enter @username" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          {query.startsWith('@') ? <Button type="submit" disabled={lookup} className="h-11">{lookup ? <Loader2 className="size-4 animate-spin" /> : 'Find profile'}</Button> : <Button type="button" variant="outline" className="h-11" disabled={isLoading} onClick={revalidate} aria-label="Refresh Social Proof Tokens"><RefreshCw className={cn('size-4', isLoading && 'animate-spin')} /></Button>}
        </form>
        {lookupError ? <p className="mt-2 text-sm text-destructive" role="alert">{lookupError}</p> : null}
        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Token types">
          {(['all', 'profile', 'post', ...(isAuthenticated ? ['mine'] : [])] as Array<typeof filter>).map((value) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(0); }} className={cn('rounded-full px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring', value === filter ? 'bg-foreground text-background' : 'bg-muted/30 text-muted-foreground hover:text-foreground')}>
              {{ all: 'All', profile: 'Profiles', post: 'Posts', mine: 'My profiles & posts' }[value]}
            </button>
          ))}
        </div>
        <div className="mt-6 divide-y divide-trade-shell border-y border-trade-shell">
          {error ? <div className="py-12 text-center" role="alert"><p className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={revalidate} className="mt-4">Try again</Button></div>
            : !data && isLoading ? <p className="py-12 text-center text-sm text-muted-foreground" role="status">Loading enabled Social Proof Tokens…</p>
              : rows.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">{query ? 'No enabled tokens match on this page. Try another page or find any profile by its exact @username.' : data?.hasNext ? 'No enabled Social Proof Tokens on this page. Try the next page.' : 'No enabled Social Proof Tokens to show on this page yet.'}</p>
                : rows.map((row) => (
                  <Link key={`${row.kind}:${row.id}`} href={row.href} className="group flex min-w-0 items-center gap-3 py-4 transition-colors hover:bg-muted/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring sm:gap-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">{row.kind === 'profile' ? <UserRound className="size-4" /> : <FileText className="size-4" />}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{row.title}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{row.detail} · {row.kind === 'profile' ? 'Profile' : 'Post'}</span></span>
                    <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px]', row.status === 'Trading' ? 'bg-primary/15 text-primary' : 'bg-muted/40 text-muted-foreground')}>{row.status}</span>
                    <ArrowRight className="mr-1 hidden size-4 shrink-0 text-muted-foreground group-hover:text-foreground sm:block" />
                  </Link>
                ))}
        </div>
        <div className="mt-5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>Page {page + 1} · {rows.length} shown</span>
          <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0 || isLoading} onClick={() => setPage((n) => n - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={!data?.hasNext || isLoading} onClick={() => setPage((n) => n + 1)}>Next</Button></div>
        </div>
      </div>
    </section>
  );
}
