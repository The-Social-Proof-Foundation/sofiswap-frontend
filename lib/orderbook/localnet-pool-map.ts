import { testnetPools } from '@socialproof/orderbook';

type PoolRowLike = { baseCoin?: string; quoteCoin?: string; address?: string };

/** Last segment of `0x...::module::SYMBOL` (e.g. MYSO, MYUSD). */
function coinSymbolFromMoveType(type: unknown): string | undefined {
  if (typeof type !== 'string' || !type.includes('::')) return undefined;
  const last = type.split('::').pop();
  if (!last) return undefined;
  return last.toUpperCase();
}

function extractPoolObjectId(row: Record<string, unknown>): string | undefined {
  const poolId = row.poolId ?? row.pool_id;
  const address = row.address ?? row.objectId ?? row.object_id;
  for (const v of [poolId, address]) {
    if (typeof v === 'string') {
      const t = v.trim();
      if (t.startsWith('0x') && t.length > 4) return t;
    }
  }
  return undefined;
}

/** Optional explicit SDK pool key (`MYUSD_MYSO`, `MYSO_MYUSD`, …). */
function explicitPoolKey(row: Record<string, unknown>): string | undefined {
  for (const k of ['poolKey', 'pool_key', 'key', 'name', 'poolName', 'pool_name']) {
    const v = row[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return undefined;
}

function candidateKeysFromPair(baseSym: string, quoteSym: string): [string, string] {
  const b = baseSym.toUpperCase();
  const q = quoteSym.toUpperCase();
  return [`${b}_${q}`, `${q}_${b}`];
}

function mergePoolRow(
  out: Record<string, unknown>,
  mergeKey: string,
  address: string,
  baseSym: string | undefined,
  quoteSym: string | undefined
): void {
  const prev = out[mergeKey] as PoolRowLike | undefined;
  const patch: PoolRowLike = { address };
  if (prev && typeof prev === 'object' && !Array.isArray(prev)) {
    out[mergeKey] = { ...prev, ...patch };
    return;
  }
  if (baseSym && quoteSym) {
    out[mergeKey] = {
      baseCoin: baseSym.toUpperCase(),
      quoteCoin: quoteSym.toUpperCase(),
      address,
    };
  } else {
    out[mergeKey] = patch;
  }
}

function applyPatchRowToMap(
  out: Record<string, unknown>,
  row: Record<string, unknown>
): void {
  const address = extractPoolObjectId(row);
  if (!address) return;

  const exp = explicitPoolKey(row);
  if (exp) {
    mergePoolRow(out, exp, address, undefined, undefined);
    return;
  }

  const bs = coinSymbolFromMoveType(row.baseCoinType ?? row.base_coin_type);
  const qs = coinSymbolFromMoveType(row.quoteCoinType ?? row.quote_coin_type);
  if (bs && qs) {
    const [k1, k2] = candidateKeysFromPair(bs, qs);
    const toPatch = [k1, k2].filter((k) => Object.hasOwn(out, k));
    if (toPatch.length > 0) {
      for (const k of toPatch) {
        mergePoolRow(out, k, address, bs, qs);
      }
    } else {
      mergePoolRow(out, k1, address, bs, qs);
    }
    return;
  }

  console.warn(
    '[orderbook] NEXT_PUBLIC_ORDERBOOK_LOCALNET_POOLS_JSON entry missing poolKey and coin types; skipped.',
    row
  );
}

/** Merge env JSON over bundled testnet pool map (`address` / pool object id for gRPC). */
export function localnetPoolsFromTestnetDefaults<
  T extends Record<string, { baseCoin?: string; quoteCoin?: string; address?: string }>,
>(): T {
  const base = { ...testnetPools } as T;
  const raw = process.env.NEXT_PUBLIC_ORDERBOOK_LOCALNET_POOLS_JSON?.trim();
  if (!raw) return base;

  let jsonText = raw;
  if (
    (jsonText.startsWith("'") && jsonText.endsWith("'")) ||
    (jsonText.startsWith('"') && jsonText.endsWith('"'))
  ) {
    jsonText = jsonText.slice(1, -1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    console.warn(
      '[orderbook] Invalid NEXT_PUBLIC_ORDERBOOK_LOCALNET_POOLS_JSON — not valid JSON. ' +
        'Use double quotes. Examples: {"MYSO_MYUSD":{"poolId":"0x…"}} or a JSON array of { poolId, baseCoinType, quoteCoinType }.'
    );
    return base;
  }

  const out = { ...(base as Record<string, unknown>) };

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      applyPatchRowToMap(out, item as Record<string, unknown>);
    }
  } else if (parsed && typeof parsed === 'object') {
    for (const [k, row] of Object.entries(parsed as Record<string, unknown>)) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      const addr = extractPoolObjectId(row as Record<string, unknown>);
      if (addr) {
        const prev = out[k];
        const rowObj = row as Record<string, unknown>;
        out[k] =
          prev && typeof prev === 'object' && !Array.isArray(prev)
            ? { ...(prev as object), ...rowObj, address: addr }
            : { ...rowObj, address: addr };
      }
    }
  }

  return out as T;
}
