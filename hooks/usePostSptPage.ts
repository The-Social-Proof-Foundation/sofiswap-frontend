'use client';

import { useCallback } from 'react';
import { usePolledResource } from '@/hooks/usePolledResource';
import { fetchPostSptPage } from '@/lib/graphql/post-spt-page';
import type { NetworkType } from '@/lib/network-utils';

export function usePostSptPage(input: {
  postId: string | null;
  viewer?: string | null;
  network: NetworkType;
  enabled: boolean;
}) {
  const { postId, viewer, network, enabled } = input;
  const load = useCallback(() => fetchPostSptPage({ network, postId: postId!, viewer }), [network, postId, viewer]);
  const result = usePolledResource(enabled && postId ? `${network}:${postId}:${viewer}` : null, load);
  return { ...result, error: result.error || result.data?.errors?.map((e) => e.message).join('; ') || null };
}
