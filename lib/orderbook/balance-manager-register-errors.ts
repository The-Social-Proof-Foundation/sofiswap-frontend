import { ORDERBOOK_DEPLOYMENT_ENV_HINT } from '@/lib/orderbook/config';

/**
 * Orderbook v3: `register_balance_manager` → `registry::add_balance_manager` calls `load_inner_mut()` on the
 * registry's `Versioned` inner before touching the balance-manager table. `get_balance_manager_ids` simulates
 * without loading that inner, so an empty id list can still be returned while registration aborts inside
 * `dynamic_field::borrow_child_object_mut` (often abort code 1) when versioned/config state is inconsistent.
 */
export interface RegisterBalanceManagerErrorContext {
  network: string;
  orderbookPackageId: string;
  registryId: string;
}

export function augmentRegisterBalanceManagerError(
  err: unknown,
  ctx?: RegisterBalanceManagerErrorContext
): Error {
  const base = err instanceof Error ? err : new Error(String(err));
  const msg = base.message;
  if (!msg.includes('dynamic_field::borrow_child_object_mut')) {
    return base;
  }

  const hint =
    'This orderbook registry cannot complete registration for the current package (its versioned ' +
    'inner failed to load). `get_balance_manager_ids` may still simulate as empty because it does not ' +
    'touch that path. ' +
    ORDERBOOK_DEPLOYMENT_ENV_HINT +
    ' Or ask the network operator to restore registry state (admin: `init_balance_manager_map` if needed, ' +
    '`enable_version` / version alignment for the published package).';

  const resolved =
    ctx !== undefined
      ? `\n\nResolved in this app: network=${ctx.network}, orderbookPackageId=${ctx.orderbookPackageId}, registryId=${ctx.registryId}. If these look wrong, set both env vars from the same deployment or unset both to fall back to \`@socialproof/orderbook\` defaults.`
      : '';

  return new Error(`${hint}${resolved}\n\nTechnical: ${msg}`);
}
