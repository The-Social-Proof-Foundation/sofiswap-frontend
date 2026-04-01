/**
 * On-chain ids for MySocial package modules (social_graph, etc.).
 * Defaults match testnet deployment; set env when mainnet or other networks differ.
 */
export const MYSOCIAL_SOCIAL_PACKAGE_ID =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_MYSOCIAL_PACKAGE_ID?.trim()
    ? process.env.NEXT_PUBLIC_MYSOCIAL_PACKAGE_ID.trim()
    : '0x00000000000000000000000000000000000000000000000000000000000050c1';

/** Shared `0x50c1::social_graph::SocialGraph` object. */
export const MYSOCIAL_SOCIAL_GRAPH_OBJECT_ID =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_MYSOCIAL_SOCIAL_GRAPH_OBJECT_ID?.trim()
    ? process.env.NEXT_PUBLIC_MYSOCIAL_SOCIAL_GRAPH_OBJECT_ID.trim()
    : '0xdc22f8182e7e0e98bad0430e601170b3809e771daf42883f2607acc9c6854bec';
