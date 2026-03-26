import type { MySoJsonRpcClient, MySoTransactionBlockResponse } from '@socialproof/myso/jsonRpc';

function isBalanceManagerCreatedType(objectType: string): boolean {
  return objectType.toLowerCase().includes('::balance_manager::balancemanager');
}

function packagePrefixMatches(objectType: string, orderbookPackageId: string): boolean {
  const pkgNorm = orderbookPackageId.replace(/^0x/i, '').toLowerCase();
  const t = objectType.toLowerCase();
  return t.startsWith(`0x${pkgNorm}::`) || t.includes(`0x${pkgNorm}::`);
}

function parseCreatedObjectIdsFromExecutedEffects(
  effects: MySoTransactionBlockResponse['effects'] | null | undefined
): string[] {
  if (!effects || typeof effects !== 'object') return [];
  const raw = (effects as { created?: unknown }).created;
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const ref = (entry as { reference?: { objectId?: string } }).reference;
    const id = ref?.objectId;
    if (typeof id === 'string') ids.push(id);
  }
  return ids;
}

async function objectIsOrderbookBalanceManager(
  client: MySoJsonRpcClient,
  objectId: string,
  orderbookPackageId: string
): Promise<boolean> {
  try {
    const o = await client.getObject({
      id: objectId,
      options: { showType: true },
    });
    const type = o.data?.type;
    if (typeof type !== 'string') return false;
    return isBalanceManagerCreatedType(type) && packagePrefixMatches(type, orderbookPackageId);
  } catch {
    return false;
  }
}

/**
 * Parse `objectChanges` from a committed transaction for a newly created shared BalanceManager.
 */
export function findCreatedBalanceManagerObjectId(
  orderbookPackageId: string,
  block: MySoTransactionBlockResponse
): string | null {
  const changes = block.objectChanges;
  if (!changes?.length) return null;

  const pkgNorm = orderbookPackageId.replace(/^0x/i, '').toLowerCase();
  const packageMatches = (objectType: string): boolean => {
    const t = objectType.toLowerCase();
    return t.startsWith(`0x${pkgNorm}`) || t.startsWith(`0x${pkgNorm}::`) || t.includes(`0x${pkgNorm}::`);
  };

  const matches: string[] = [];
  for (const c of changes) {
    if (c.type !== 'created') continue;
    if (!('objectType' in c) || !('objectId' in c)) continue;
    const ot = String(c.objectType);
    if (!isBalanceManagerCreatedType(ot)) continue;
    if (packageMatches(ot)) {
      return c.objectId;
    }
    matches.push(c.objectId);
  }

  return matches.length === 1 ? matches[0]! : matches[0] ?? null;
}

/**
 * Prefer `effects.created` from the execute / wait response (matches sponsored payloads), optionally
 * validate with a single `getObject` when exactly one object was created. Fall back to
 * `getTransactionBlock` when multiple objects were created (e.g. join + balance manager) or parsing fails.
 */
async function resolveFromExecutedEffectsWhenUnambiguous(
  client: MySoJsonRpcClient,
  orderbookPackageId: string,
  executedEffects: MySoTransactionBlockResponse['effects'] | null | undefined
): Promise<string | null> {
  const ids = parseCreatedObjectIdsFromExecutedEffects(executedEffects);
  if (ids.length !== 1) return null;
  const candidate = ids[0]!;
  if (await objectIsOrderbookBalanceManager(client, candidate, orderbookPackageId)) {
    return candidate;
  }
  return null;
}

/**
 * Load object changes from chain (needed for sponsored execute responses that omit `objectChanges`), or
 * use executed `effects` when it uniquely identifies the new BalanceManager.
 */
export async function resolveCreatedBalanceManagerObjectId(
  client: MySoJsonRpcClient,
  digest: string,
  orderbookPackageId: string,
  executedEffects?: MySoTransactionBlockResponse['effects'] | null
): Promise<string> {
  const fromEffects = await resolveFromExecutedEffectsWhenUnambiguous(
    client,
    orderbookPackageId,
    executedEffects
  );
  if (fromEffects) return fromEffects;

  const block = await client.getTransactionBlock({
    digest,
    options: {
      showObjectChanges: true,
      showEffects: true,
    },
  });
  const id = findCreatedBalanceManagerObjectId(orderbookPackageId, block);
  if (!id) {
    throw new Error(
      'Could not find a created BalanceManager in this transaction. Confirm NEXT_PUBLIC_ORDERBOOK_PACKAGE_ID_* and NEXT_PUBLIC_ORDERBOOK_REGISTRY_ID_* are a matching pair from the same on-chain deployment.'
    );
  }
  return id;
}
