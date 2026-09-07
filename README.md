# SofiSwap frontend

Next.js exchange frontend for MySocial native orderbook markets and profile/post Social Proof Tokens.

## Local checks

Use npm with the committed `package-lock.json`. The project currently depends on the sibling MySocial SDK workspace; see the `file:` dependencies in `package.json`.

```sh
npm install
npm run typecheck
npm test
npm run lint
npm run build
npm run start
```

These checks do not start a blockchain or indexer. Transaction tests mock network calls and capture real transaction builders; they do not sign or execute real trades. Schema tests read `../myso-core/crates/myso-indexer-alt-graphql/schema.graphql`, or `MYSO_GRAPHQL_SCHEMA_PATH` when supplied. They check query compatibility, not deployed service availability.

## Configuration and discovery

Use `.env.example` for endpoint and authentication configuration. The network selector controls GraphQL, RPC, gRPC, indexer reads and transaction submission. RPC and sponsored-gas requests pin their network explicitly so a cookie change cannot redirect an in-flight payment.

- Native pool IDs, coin types and decimals are refreshed through GraphQL, including after local genesis changes.
- Shared SPT objects and the approved platform named `SofiSwap` are discovered through GraphQL. No platform, registry, block-list or token object IDs need to be pasted into the frontend environment.
- Profile and post routes resolve their live pool through the subject registry; the original reservation pool ID is not assumed to become the trading pool ID.
- Search includes native markets and social subjects, including profiles that have not enabled SPTs. The main SPT directory lists only enabled profile/post tokens (both reservation and live trading stages), with filters, pagination, owner views and exact `@username` lookup. Direct profile visits and owner enable actions remain available. Text filtering applies to the displayed page.
- gRPC provides native book/manager reads. The orderbook indexer provides native history/charts; the social indexer provides the reservation ticker. Configure their local endpoint URLs if they differ from defaults.
- For an HTTPS production site, configure HTTPS and CORS-enabled browser-facing GraphQL, gRPC and indexer endpoints. Local HTTP endpoints are for local development. Keep gas-pool credentials server-only.

Localnet uses user-paid gas; keep MYSO available outside the balance manager. Authentication must use a registered client ID and the matching `/auth/callback` redirect URI.

## Manual acceptance test

Start the chain and indexers manually, then select the matching network. Use a development wallet and small amounts. Offline tests and a successful build are not proof of live financial execution.

1. Refresh markets after a fresh deployment. Check that native pool IDs, coin decimals and SPT subjects appear without copying addresses.
2. Native exchange: create/register a balance manager; deposit each asset; submit a limit buy and sell; cancel an open order; execute market buy/sell against funded liquidity; withdraw remaining balances. Compare wallet, manager, fills and open orders after refresh.
3. Profile SPT: as owner, enable reservations; as supporter, reserve and partially/fully withdraw; fund the threshold; as owner, launch; confirm the page switches to the discovered live pool; buy, buy more and partially/fully sell.
4. Post SPT: repeat the same lifecycle for an ordinary post. Simple post withdrawal requires the current core functions `withdraw_reservation_for_post_simple` and `withdraw_reservation_with_platform_for_post_simple` to be deployed.
5. Test an escrow-backed post end to end. Buy, buy more and sell should resolve every beneficiary vault through GraphQL and atomically route creator-fee slices; confirm the trade history, creator-fee settlement record and vault balances converge in the social indexer.
6. Confirm non-owners cannot enable/launch. Test insufficient balances, excess decimal places, rapid double-clicks, failed transactions, disconnected services and changing network/account during a refresh. Failed actions should preserve input and never show success.

## Remaining production gates

- Live signing, Move execution and indexer convergence still require the manual test above; no chain or indexer was started for implementation verification.
- Deploy the matching MySocial package/indexer/GraphQL build before testing vault-aware trades. The frontend uses additive `*_with_vault_routing` entrypoints and refuses to submit until GraphQL has resolved every required beneficiary vault and the PoC configuration; wallet-routed and profile SPT trades keep their existing entrypoints.
- The current SPT sell ABI has no minimum-received argument. The UI shows an estimate and explains that the execution price can change; it does not promise slippage protection. SPT buys cap the payment used for the requested token amount.
- Production authentication, gas sponsorship, endpoint TLS/CORS and deployment-specific service health must be verified against the intended environment.

The landing page and unavailable-data states do not present fabricated prices or activity as live market data. The landing book is explicitly labelled illustrative.
