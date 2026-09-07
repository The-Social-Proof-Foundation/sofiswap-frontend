/** Bound the SDK's number-based amounts before conversion to a Move u64. */
export function checkedOrderbookAmount(amount: number, scalar: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(scalar) || scalar <= 0) {
    throw new Error('Enter a positive amount for this asset.');
  }
  const scaled = amount * scalar;
  const rounded = Math.round(scaled);
  // Allow only floating-point representation noise, not an extra decimal place.
  if (!Number.isSafeInteger(rounded) || rounded <= 0 || Math.abs(scaled - rounded) > Math.max(1, Math.abs(scaled)) * Number.EPSILON * 2) {
    throw new Error('The amount is too large or has more decimal places than this asset supports.');
  }
  return BigInt(rounded);
}
