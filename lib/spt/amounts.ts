export const SPT_DECIMALS = 9;
export const SPT_SCALE = BigInt(1_000_000_000);
export const SPT_BPS_DENOMINATOR = BigInt(10_000);
export const MAX_U64 = (BigInt(1) << BigInt(64)) - BigInt(1);

export function parseDisplayAmountToBaseUnits(value: string): bigint | null {
  const normalized = value.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;

  const [whole = '0', fraction = ''] = normalized.split('.');
  if (fraction.length > SPT_DECIMALS) return null;

  try {
    const amount = (
      BigInt(whole || '0') * SPT_SCALE +
      BigInt(fraction.padEnd(SPT_DECIMALS, '0') || '0')
    );
    return amount <= MAX_U64 ? amount : null;
  } catch {
    return null;
  }
}

export function baseUnitsToDisplay(value: bigint, maxFractionDigits = 6): string {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const whole = absolute / SPT_SCALE;
  const fraction = absolute % SPT_SCALE;
  if (fraction === BigInt(0) || maxFractionDigits <= 0) {
    return `${negative ? '-' : ''}${whole.toString()}`;
  }

  const digits = fraction
    .toString()
    .padStart(SPT_DECIMALS, '0')
    .slice(0, Math.min(SPT_DECIMALS, maxFractionDigits))
    .replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole.toString()}${digits ? `.${digits}` : ''}`;
}

export function scalarToBigInt(value: string | number | bigint | null | undefined): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) return null;
    return BigInt(value);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  try {
    return BigInt(trimmed);
  } catch {
    return null;
  }
}

export function feeFromBps(amount: bigint, bps: bigint): bigint {
  if (amount <= BigInt(0) || bps <= BigInt(0)) return BigInt(0);
  return (amount * bps) / SPT_BPS_DENOMINATOR;
}

/** Mirrors `social_proof_tokens::calculate_buy_price` with arbitrary-width integers. */
export function calculateSptBuyCost(input: {
  basePrice: bigint;
  quadraticCoefficient: bigint;
  currentSupply: bigint;
  tokenAmount: bigint;
}): bigint {
  const { basePrice, quadraticCoefficient: coefficient, currentSupply: supply, tokenAmount } = input;
  if (tokenAmount <= BigInt(0)) return BigInt(0);

  const basePart = (basePrice * tokenAmount) / SPT_SCALE;
  const polynomial =
    BigInt(3) * supply * supply +
    BigInt(3) * supply * tokenAmount +
    tokenAmount * tokenAmount;
  const denominator = BigInt(30_000) * SPT_SCALE * SPT_SCALE * SPT_SCALE;
  const quadraticPart = (coefficient * tokenAmount * polynomial) / denominator;
  return basePart + quadraticPart;
}

/** Mirrors `social_proof_tokens::calculate_sell_price`. */
export function calculateSptSellRefund(input: {
  basePrice: bigint;
  quadraticCoefficient: bigint;
  currentSupply: bigint;
  tokenAmount: bigint;
}): bigint {
  const { basePrice, quadraticCoefficient: coefficient, currentSupply: supply, tokenAmount } = input;
  if (tokenAmount <= BigInt(0) || tokenAmount > supply) return BigInt(0);

  const basePart = (basePrice * tokenAmount) / SPT_SCALE;
  const polynomial =
    BigInt(3) * supply * supply -
    BigInt(3) * supply * tokenAmount +
    tokenAmount * tokenAmount;
  const denominator = BigInt(30_000) * SPT_SCALE * SPT_SCALE * SPT_SCALE;
  const quadraticPart = (coefficient * tokenAmount * polynomial) / denominator;
  return basePart + quadraticPart;
}

/** Largest nano-SPT amount whose curve cost does not exceed the supplied MYSO budget. */
export function calculateMaxSptBuyAmount(input: {
  basePrice: bigint;
  quadraticCoefficient: bigint;
  currentSupply: bigint;
  mysoBudget: bigint;
}): { tokenAmount: bigint; cost: bigint } {
  const { mysoBudget, ...curve } = input;
  const cap = MAX_U64 - curve.currentSupply;
  if (mysoBudget <= BigInt(0) || cap <= BigInt(0) || curve.currentSupply < BigInt(0) ||
      curve.basePrice <= BigInt(0) || curve.quadraticCoefficient < BigInt(0)) {
    return { tokenAmount: BigInt(0), cost: BigInt(0) };
  }

  const cost = (tokenAmount: bigint) => calculateSptBuyCost({ ...curve, tokenAmount });
  if (cost(BigInt(1)) > mysoBudget) return { tokenAmount: BigInt(0), cost: BigInt(0) };

  let low = BigInt(0);
  let lowCost = BigInt(0);
  let high = cap + BigInt(1);

  while (low + BigInt(1) < high) {
    const middle = low + (high - low) / BigInt(2);
    const middleCost = cost(middle);
    if (middleCost <= mysoBudget) {
      low = middle;
      lowCost = middleCost;
    } else {
      high = middle;
    }
  }
  return { tokenAmount: low, cost: lowCost };
}
