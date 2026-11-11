import steem from 'steem';
import {AccountKeys, StoredAccount} from '../types';
import {loadChainAccount} from './client';

type Authority = {key_auths?: [string, number][]};

function hasPublicKey(authority: Authority | undefined, pubkey: string) {
  return Boolean(authority?.key_auths?.some(pair => pair[0] === pubkey));
}

function remember(keys: AccountKeys, role: 'posting' | 'active' | 'memo', secret: string, pubkey: string) {
  keys[role] = secret;
  keys[role === 'memo' ? 'memoPubkey' : role === 'active' ? 'activePubkey' : 'postingPubkey'] = pubkey;
}

export async function accountFromSecret(username: string, secret: string): Promise<StoredAccount> {
  const name = username.trim().toLowerCase();
  if (!/^[a-z0-9.-]{3,16}$/.test(name)) throw new Error('Enter a Steem account name.');
  const trimmed = secret.trim();
  if (!trimmed) throw new Error('Enter a private key or master password.');
  const chain = await loadChainAccount(name);
  const keys: AccountKeys = {};

  if (steem.auth.isWif(trimmed)) {
    const pubkey = steem.auth.wifToPublic(trimmed);
    if (hasPublicKey(chain.posting, pubkey)) remember(keys, 'posting', trimmed, pubkey);
    else if (hasPublicKey(chain.active, pubkey)) remember(keys, 'active', trimmed, pubkey);
    else if (chain.memo_key === pubkey) remember(keys, 'memo', trimmed, pubkey);
    else if (hasPublicKey(chain.owner, pubkey)) throw new Error('That is the owner key. Add the posting, active, or memo key instead.');
    else throw new Error('That key does not match the posting, active, or memo authority.');
    return {name, keys};
  }

  const derived = steem.auth.getPrivateKeys(name, trimmed, ['posting', 'active', 'memo']);
  if (hasPublicKey(chain.posting, derived.postingPubkey)) remember(keys, 'posting', derived.posting, derived.postingPubkey);
  if (hasPublicKey(chain.active, derived.activePubkey)) remember(keys, 'active', derived.active, derived.activePubkey);
  if (chain.memo_key === derived.memoPubkey) remember(keys, 'memo', derived.memo, derived.memoPubkey);
  if (!keys.posting && !keys.active && !keys.memo) {
    throw new Error('That master password does not match this account.');
  }
  return {name, keys};
}
