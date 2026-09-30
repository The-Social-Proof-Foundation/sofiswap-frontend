import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildSchema, parse, validate } from 'graphql';
import { SOCIAL_PROOF_TOKEN_PAGE_QUERY } from '../lib/graphql/social-proof-token-page';
import { RESOLVE_POST_SPT_QUERY, POST_SPT_DETAIL_QUERY } from '../lib/graphql/post-spt-page';
import { SPT_DIRECTORY_QUERY, SPT_USERNAME_QUERY } from '../lib/graphql/spt-directory';
import { SPT_DISCOVERY_QUERY } from '../lib/graphql/spt-discovery';
import { ORDERBOOK_MARKETS_QUERY, ORDERBOOK_COIN_METADATA_QUERY } from '../lib/graphql/orderbook-markets';
import { SPT_OBJECT_QUERY, SPT_TABLE_VALUE_QUERY } from '../lib/spt/pool-state';
import { buildSptHoldingSubjectsQuery } from '../lib/graphql/spt-holding-subjects';
import {
  WALLET_COIN_METADATA_QUERY,
  WALLET_TOKEN_BALANCES_QUERY,
} from '../lib/graphql/wallet-token-balances';
import { buildSptChainConfigQuery } from '../lib/spt/chain-config';

const schema = buildSchema(readFileSync(process.env.MYSO_GRAPHQL_SCHEMA_PATH || '../myso-core/crates/myso-indexer-alt-graphql/schema.graphql', 'utf8'));
const profileSubjectId = `0x${'a'.repeat(64)}`;
const postSubjectId = `0x${'b'.repeat(64)}`;
for (const [name, query] of Object.entries({
  SOCIAL_PROOF_TOKEN_PAGE_QUERY, RESOLVE_POST_SPT_QUERY, POST_SPT_DETAIL_QUERY,
  SPT_DIRECTORY_QUERY, SPT_USERNAME_QUERY, SPT_DISCOVERY_QUERY,
  ORDERBOOK_MARKETS_QUERY, ORDERBOOK_COIN_METADATA_QUERY,
  SPT_OBJECT_QUERY, SPT_TABLE_VALUE_QUERY, SPT_CONFIG_QUERY: buildSptChainConfigQuery('0x50c1'),
  WALLET_TOKEN_BALANCES_QUERY, WALLET_COIN_METADATA_QUERY,
  SPT_HOLDING_SUBJECTS_QUERY: buildSptHoldingSubjectsQuery([profileSubjectId], [postSubjectId]),
})) {
  test(`${name} matches the MySocial GraphQL schema`, () => {
    assert.deepEqual(validate(schema, parse(query)).map((e) => e.message), []);
  });
}
