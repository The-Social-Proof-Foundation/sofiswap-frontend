/**
 * Shared CORS for browser calls to /api/gas-pool/* from the static app origin.
 */
export const GAS_POOL_PROXY_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
