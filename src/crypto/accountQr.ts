import {Buffer} from 'buffer';
import {AccountKeys, StoredAccount} from '../types';

export const QR_ACCOUNTS_PREFIX = 'keychain://add_accounts=';

export type AccountQrPage = {
  data: StoredAccount[];
  index: number;
  total: number;
};

function takeKey(
  keys: AccountKeys,
  account: StoredAccount,
  privateField: 'posting' | 'active' | 'memo',
  publicField: 'postingPubkey' | 'activePubkey' | 'memoPubkey',
) {
  const privateKey = account.keys[privateField];
  const publicKey = account.keys[publicField];
  if (!privateKey || privateKey.startsWith('#') || !publicKey) return;
  keys[privateField] = privateKey;
  if (publicField === 'memoPubkey' || publicKey.startsWith('@')) {
    keys[publicField] = publicKey;
  }
}

function exportableAccount(account: StoredAccount): StoredAccount {
  const keys: AccountKeys = {};
  takeKey(keys, account, 'active', 'activePubkey');
  takeKey(keys, account, 'posting', 'postingPubkey');
  takeKey(keys, account, 'memo', 'memoPubkey');
  return {name: account.name, keys};
}

export function buildAccountQrPages(accounts: StoredAccount[]): AccountQrPage[] {
  const chunks: StoredAccount[][] = [];
  for (let i = 0; i < accounts.length; i += 2) {
    chunks.push(accounts.slice(i, i + 2).map(exportableAccount));
  }
  return chunks.map((data, index) => ({
    data,
    index: index + 1,
    total: chunks.length,
  }));
}

export function encodeAccountQrPage(page: AccountQrPage): string {
  return QR_ACCOUNTS_PREFIX + Buffer.from(JSON.stringify(page), 'utf8').toString('base64');
}

export function readAccountQrPage(raw: string): {data: unknown; index: number; total: number} {
  const encoded = raw.trim().slice(QR_ACCOUNTS_PREFIX.length);
  const json = Buffer.from(encoded, 'base64').toString('utf8');
  if (!json) throw new Error('That QR code is not a Steem Keychain account export.');
  let page: {data?: unknown; index?: unknown; total?: unknown};
  try {
    page = JSON.parse(json);
  } catch {
    throw new Error('That QR code is not a Steem Keychain account export.');
  }
  return {
    data: page?.data ?? [],
    index: typeof page?.index === 'number' ? page.index : 1,
    total: typeof page?.total === 'number' ? page.total : 1,
  };
}
