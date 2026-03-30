import { z } from 'zod';

/**
 * GET reservation pools from the social indexer REST base (`getSocialIndexerRestBaseUrl`).
 * CORS must allow the app origin for GET /spt/reservation-pools.
 */

/** Accepts numbers, numeric strings, and strings with `%` / commas (common API variants). */
export function coerceVolumeMetric(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim().replace(/%$/, '').replace(/,/g, '');
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

const looseVolumeMetric = z.preprocess(
  (v) => coerceVolumeMetric(v),
  z.number().optional()
);

const reservationPoolRowSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  pool_id: z.string().optional(),
  associated_id: z.string().optional(),
  token_type: z.coerce.number().optional(),
  owner: z.string().optional(),
  total_reserved: z.coerce.number(),
  required_threshold: z.coerce.number(),
  status: z.string().optional(),
  created_at: z.string().optional(),
  time: z.string().optional(),
  transaction_id: z.string().optional(),
  icon: z.string().optional().nullable(),
  primary_label: z.string().optional().nullable(),
  secondary_label: z.string().optional().nullable(),
  volume_24h: looseVolumeMetric,
  volume_change_24h: looseVolumeMetric,
  volume_change_percent_24h: looseVolumeMetric,
});

const paginationSchema = z.object({
  page: z.coerce.number(),
  limit: z.coerce.number(),
  total: z.coerce.number(),
  total_pages: z.coerce.number().optional(),
});

const reservationPoolsResponseSchema = z.object({
  data: z.array(reservationPoolRowSchema),
  pagination: paginationSchema,
});

type ReservationPoolRowRaw = z.infer<typeof reservationPoolRowSchema>;
/** Rows returned from the API after normalizing a non-empty `pool_id`. */
export type ReservationPoolRow = Omit<ReservationPoolRowRaw, 'pool_id'> & { pool_id: string };
export type ReservationPoolsPagination = z.infer<typeof paginationSchema> & {
  total_pages: number;
};

export type FetchReservationPoolsResult =
  | { ok: true; data: ReservationPoolRow[]; pagination: ReservationPoolsPagination }
  | { ok: false; error: string };

/**
 * Indexer `token_type`: **1** = profile SPT reservation (round avatar in UI); **2** = post (square).
 * Unknown / missing defaults to profile to match historic samples (`token_type: 1`).
 */
export function isProfileReservationPool(pool: ReservationPoolRow): boolean {
  return pool.token_type !== 2;
}

/**
 * **24h volume change (%)** from the indexer only (`volume_change_percent_24h`).
 * Does not derive from absolute volume fields. Returns null when missing, not finite, or zero.
 */
export function reservationPoolVolumeChangePercent24h(pool: ReservationPoolRow): number | null {
  const api = pool.volume_change_percent_24h;
  if (api === undefined || api === null || !Number.isFinite(api) || api === 0) return null;
  return api;
}

/**
 * Direction for reservation-pool marquee (▲/▼ + red/green) from
 * `reservationPoolVolumeChangePercent24h`.
 */
export function reservationPoolVolumeTrend(pool: ReservationPoolRow): 'up' | 'down' | null {
  const p = reservationPoolVolumeChangePercent24h(pool);
  if (p === null) return null;
  return p > 0 ? 'up' : 'down';
}

export function buildReservationPoolsUrl(
  baseRaw: string,
  page: number,
  limit: number
): string {
  const root = baseRaw.trim().replace(/\/$/, '');
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  return `${root}/spt/reservation-pools?${params.toString()}`;
}

export async function fetchReservationPools(input: {
  baseUrl: string;
  page: number;
  limit: number;
  signal?: AbortSignal;
}): Promise<FetchReservationPoolsResult> {
  const base = input.baseUrl.trim();
  if (!base) {
    return { ok: false, error: 'Reservation pools base URL is empty.' };
  }

  const url = buildReservationPoolsUrl(base, input.page, input.limit);
  let res: Response;
  try {
    res = await fetch(url, { signal: input.signal, cache: 'no-store' });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Failed to reach server: ${msg}` };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const hint = body ? ` — ${body.slice(0, 200)}` : '';
    return { ok: false, error: `Server returned ${res.status}${hint}` };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: 'Response was not valid JSON.' };
  }

  const parsed = reservationPoolsResponseSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: 'Unexpected reservation-pools response shape.' };
  }

  const paginationIn = parsed.data.pagination;
  const pagination: ReservationPoolsPagination = {
    ...paginationIn,
    total_pages:
      paginationIn.total_pages ??
      Math.max(1, Math.ceil(paginationIn.total / Math.max(1, paginationIn.limit))),
  };

  const rawRows: unknown[] =
    json !== null &&
    typeof json === 'object' &&
    'data' in json &&
    Array.isArray((json as { data: unknown }).data)
      ? ((json as { data: unknown[] }).data as unknown[])
      : [];

  const data = parsed.data.data
    .map((row, index): ReservationPoolRow | null => {
      const poolId =
        (row.pool_id && String(row.pool_id).trim()) ||
        (row.id !== undefined && row.id !== null ? String(row.id) : '');
      if (!poolId) return null;

      const raw = rawRows[index];
      const rawObj =
        raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined;

      const volume_change_percent_24h =
        row.volume_change_percent_24h ??
        coerceVolumeMetric(rawObj?.volumeChangePercent24h);
      const volume_change_24h =
        row.volume_change_24h ?? coerceVolumeMetric(rawObj?.volumeChange24h);
      const volume_24h = row.volume_24h ?? coerceVolumeMetric(rawObj?.volume24h);

      return {
        ...row,
        pool_id: poolId,
        volume_24h,
        volume_change_24h,
        volume_change_percent_24h,
      };
    })
    .filter((row): row is ReservationPoolRow => row !== null);

  return {
    ok: true,
    data,
    pagination,
  };
}
