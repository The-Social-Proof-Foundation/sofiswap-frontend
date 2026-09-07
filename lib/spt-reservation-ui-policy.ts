/**
 * Chooses swap vs reservation panel for social proof token workspace.
 *
 * - Live **trading pool** → `full` (swap layout + trading quote when data exists).
 * - **Reservation anchor** still accepting deposits → always `simple` (reserve) until a trading pool
 *   exists — including when the token is “enabled” and the reservation threshold is met; users can
 *   keep reserving until the creator launches trading.
 * - MET / THRESHOLD_MET are **not** treated as closed: they do not hide the reservation panel.
 */

const CLOSED_RESERVATION_STATUS = new Set(
  [
    'COMPLETE',
    'COMPLETED',
    'CLOSED',
    'NONE',
    'INACTIVE',
    'ENDED',
    'CANCELLED',
    'CANCELED',
    'FULFILLED',
    // Note: MET / THRESHOLD_MET intentionally omitted — threshold met still allows new reserves
    // until a live trading pool exists.
    'EXPIRED',
    'MINTED',
    'LAUNCHED',
    'CONVERTED',
  ].map((s) => s.toUpperCase())
);

export function isReservationStatusOpen(reservationStatus: string | null | undefined): boolean {
  const s = reservationStatus?.trim().toUpperCase() ?? '';
  if (!s) return true;
  return !CLOSED_RESERVATION_STATUS.has(s);
}

export function hasReservationAnchor(input: {
  reservationPoolId: string | null | undefined;
  reservationPoolAddress: string | null | undefined;
}): boolean {
  return Boolean(input.reservationPoolId?.trim() || input.reservationPoolAddress?.trim());
}

export type SptSidePanelMode = 'full' | 'simple' | 'none';

/**
 * @see file-level comment — reservation UI stays on for any non-terminal status while there is no
 * live SPT pool; swap/full layout only after `hasSptPool`.
 */
export function resolveSptSidePanelMode(input: {
  hasSptPool: boolean;
  reservationPoolId: string | null;
  reservationPoolAddress: string | null;
  reservationStatus: string | null;
}): SptSidePanelMode {
  if (input.hasSptPool) return 'full';

  const anchor = hasReservationAnchor({
    reservationPoolId: input.reservationPoolId,
    reservationPoolAddress: input.reservationPoolAddress,
  });
  const open = isReservationStatusOpen(input.reservationStatus);

  if (anchor && open) return 'simple';
  return 'none';
}

/** Parse a USD number from formatted header price labels (e.g. `$1.23`). */
export function parseUsdNumberFromPriceLabel(priceLabel: string | null | undefined): number | null {
  if (!priceLabel?.trim() || priceLabel.trim() === '—') return null;
  const s = priceLabel.replace(/[$,\s]/g, '').trim();
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * USD per 1 MYSO for reservation amount ↔ USD toggle. Prefer env; otherwise a small label-derived heuristic.
 */
export function resolveUsdPerMysoReservationQuote(input: {
  envUsdPerMyso: number | null;
  priceLabel: string | null;
}): number | null {
  if (input.envUsdPerMyso != null && input.envUsdPerMyso > 0) {
    return input.envUsdPerMyso;
  }
  const fromLabel = parseUsdNumberFromPriceLabel(input.priceLabel);
  if (fromLabel != null && fromLabel > 0 && fromLabel <= 500) {
    return fromLabel;
  }
  return null;
}
