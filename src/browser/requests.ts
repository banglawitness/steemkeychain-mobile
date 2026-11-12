import {Buffer} from 'buffer';
import steem from 'steem';
import Signature from 'steem/lib/auth/ecc/src/signature';
import {applySavedRpc} from '../steem/rpc';
import {AccountKeys, StoredAccount} from '../types';

export type KeychainRequest = {
  type: string;
  username?: string;
  domain?: string;
  method?: string;
  enforce?: boolean;
  [key: string]: unknown;
};

export type KeyRole = 'posting' | 'active' | 'memo';

type Authority = {
  weight_threshold: number;
  account_auths: [string, number][];
  key_auths: [string, number][];
};

type ChainAccount = {
  name: string;
  memo_key: string;
  json_metadata: string;
  owner: Authority;
  active: Authority;
  posting: Authority;
  balance: string;
  sbd_balance: string;
};

const TITLES: Record<string, string> = {
  transfer: 'Transfer',
  vote: 'Vote',
  custom: 'Custom JSON',
  post: 'Post',
  broadcast: 'Broadcast',
  signBuffer: 'Sign message',
  signTx: 'Sign transaction',
  encode: 'Encode message',
  encodeWithKeys: 'Encode for several keys',
  decode: 'Decode message',
  signedCall: 'Signed API call',
  delegation: 'Delegate SP',
  powerUp: 'Power up',
  powerDown: 'Power down',
  savings: 'Savings',
  convert: 'Convert',
  witnessVote: 'Witness vote',
  proxy: 'Witness proxy',
  createProposal: 'Create proposal',
  removeProposal: 'Remove proposal',
  updateProposalVote: 'Proposal vote',
  sendToken: 'Token transfer',
  swap: 'Swap',
  addAccount: 'Add account',
  createClaimedAccount: 'Create account',
  addAccountAuthority: 'Add account authority',
  removeAccountAuthority: 'Remove account authority',
  addKeyAuthority: 'Add key authority',
  removeKeyAuthority: 'Remove key authority',
  recurrentTransfer: 'Recurrent transfer',
};

async function api<T>(method: string, args: unknown[]): Promise<T> {
  await applySavedRpc();
  const fn = steem.api[method];
  return new Promise((resolve, reject) => {
    fn(...args, (error: Error | null, result: T) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

type HeadBlock = {
  head_block_number: number;
  head_block_id: string;
  time: string;
};

export async function broadcastOperations(role: 'posting' | 'active', wif: string, operations: unknown[]) {
  await applySavedRpc();
  const props = await api<HeadBlock>('getDynamicGlobalProperties', []);
  const head = Buffer.from(props.head_block_id, 'hex');
  const signed = steem.auth.signTransaction({
    ref_block_num: props.head_block_number & 0xffff,
    ref_block_prefix: head.readUInt32LE(4),
    expiration: new Date(Date.parse(`${props.time}Z`) + 90 * 1000),
    extensions: [],
    operations,
  }, {[role]: wif});
  await api('broadcastTransaction', [signed]);
  return signed;
}

export function requestTitle(type: string) {
  return TITLES[type] || 'Steem request';
}

export function requiredRole(request: KeychainRequest): KeyRole {
  if (request.type === 'signedCall') {
    const wifType = String(request.typeWif || 'active').toLowerCase();
    if (wifType === 'memo') return 'memo';
    if (wifType === 'posting') return 'posting';
    return 'active';
  }
  const method = String(request.method || '').toLowerCase();
  if (method === 'memo') return 'memo';
  if (method === 'active') return 'active';
  if (method === 'posting') return 'posting';
  switch (request.type) {
    case 'vote':
    case 'post':
    case 'custom':
      return 'posting';
    default:
      return 'active';
  }
}

export function requestCode(request: KeychainRequest): string {
  const payload = request.type === 'custom' || request.type === 'broadcast' || request.type === 'swap'
    ? request.json || request.operations || request.steps
    : request.type === 'signedCall'
      ? request.params
      : request.operations;
  if (payload === undefined || payload === null || payload === '') return '';
  if (typeof payload === 'string') {
    try {
      return JSON.stringify(JSON.parse(payload), null, 2);
    } catch {
      return payload;
    }
  }
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

export function describeRequest(request: KeychainRequest): string[] {
  const lines: string[] = [];
  const add = (label: string, value: unknown) => {
    if (value === undefined || value === null || value === '') return;
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    lines.push(`${label}: ${text.length > 280 ? `${text.slice(0, 280)}…` : text}`);
  };
  add('To', request.to || request.delegatee || request.recipient || request.receiver || request.witness || request.proxy);
  add('Amount', request.amount || request.steem || request.steem_power);
  add('Currency', request.currency || request.unit);
  add('Memo', request.memo);
  add('Author', request.author);
  add('Permlink', request.permlink || request.parent_perm);
  add('Weight', request.weight);
  add('Id', request.id);
  add('Message', request.display_msg || request.message || request.title || request.subject);
  add('Operation', request.operation);
  add('New account', request.new_account || request.authorizedUsername);
  add('Role', request.role);
  if (request.type === 'addAccount' && request.keys && typeof request.keys === 'object') {
    const names = Object.keys(request.keys as object).filter(name => !name.endsWith('Pubkey'));
    add('Keys included', names.join(', '));
  }
  if (request.type === 'signedCall') add('RPC method', request.method);
  if (request.type === 'encodeWithKeys' && Array.isArray(request.publicKeys)) {
    add('Public keys', request.publicKeys.length);
  }
  return lines;
}

function privateKey(account: StoredAccount, role: KeyRole): string {
  const key = account.keys[role];
  if (!key || key.startsWith('#') || key.startsWith('@')) {
    throw new Error(`@${account.name} has no ${role} key in this wallet.`);
  }
  return key;
}

function asset(value: unknown, symbol: string): string {
  const text = String(value ?? '').trim();
  if (/^[0-9]+(\.[0-9]+)? [A-Z]+$/.test(text)) {
    const [amount, name] = text.split(' ');
    return `${Number(amount).toFixed(name === 'VESTS' ? 6 : 3)} ${name === 'HBD' ? 'SBD' : name}`;
  }
  const amount = Number(text);
  if (!Number.isFinite(amount)) throw new Error('Amount is not a number.');
  const name = symbol === 'HBD' ? 'SBD' : symbol === 'HP' ? 'VESTS' : symbol;
  return `${amount.toFixed(name === 'VESTS' ? 6 : 3)} ${name}`;
}

function asList(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number).filter(item => Number.isFinite(item));
  if (typeof value === 'number') return [value];
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(Number).filter(item => Number.isFinite(item));
  } catch {
    /* comma separated */
  }
  return value
    .split(',')
    .map(part => Number(part.trim()))
    .filter(item => Number.isFinite(item));
}

function asExtensions(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
}

function slug(value: unknown): string {
  const text = String(value || 'post')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 180);
  return text || `post-${Date.now()}`;
}

async function chainAccount(name: string): Promise<ChainAccount> {
  const accounts = await api<ChainAccount[]>('getAccounts', [[name]]);
  const account = accounts?.[0];
  if (!account) throw new Error(`@${name} was not found on Steem.`);
  return account;
}

async function globalProps() {
  return api<{total_vesting_fund_steem: string; total_vesting_shares: string}>('getDynamicGlobalProperties', []);
}

async function powerToVests(power: number): Promise<string> {
  const props = await globalProps();
  const fund = parseFloat(props.total_vesting_fund_steem.split(' ')[0]);
  const shares = parseFloat(props.total_vesting_shares.split(' ')[0]);
  if (!fund) throw new Error('Could not read Steem Power properties.');
  return `${((power * shares) / fund).toFixed(6)} VESTS`;
}

async function maybeEncryptMemo(memo: unknown, from: StoredAccount, to: string): Promise<string> {
  const text = typeof memo === 'string' ? memo : '';
  if (!text.startsWith('#')) return text;
  const memoKey = privateKey(from, 'memo');
  const receiver = await chainAccount(to);
  if (!receiver.memo_key) throw new Error(`@${to} has no memo key.`);
  return steem.memo.encode(memoKey, receiver.memo_key, text);
}

function cloneAuthority(authority: Authority): Authority {
  return {
    weight_threshold: authority.weight_threshold,
    account_auths: authority.account_auths.map(pair => [pair[0], Number(pair[1])]),
    key_auths: authority.key_auths.map(pair => [pair[0], Number(pair[1])]),
  };
}

function sortAuthority(authority: Authority) {
  authority.account_auths.sort((left, right) => (left[0] < right[0] ? -1 : 1));
  authority.key_auths.sort((left, right) => (left[0] < right[0] ? -1 : 1));
}

async function updateAccount(
  account: StoredAccount,
  change: (current: ChainAccount, next: {owner: Authority; active: Authority; posting: Authority; memo_key: string; json_metadata: string}) => void,
) {
  const current = await chainAccount(account.name);
  const next = {
    owner: cloneAuthority(current.owner),
    active: cloneAuthority(current.active),
    posting: cloneAuthority(current.posting),
    memo_key: current.memo_key,
    json_metadata: current.json_metadata || '',
  };
  change(current, next);
  sortAuthority(next.owner);
  sortAuthority(next.active);
  sortAuthority(next.posting);
  return broadcastOperations('active', privateKey(account, 'active'), [
    ['account_update', {account: account.name, ...next}],
  ]);
}

function authorityFor(role: unknown, next: {active: Authority; posting: Authority}): Authority {
  const name = String(role || 'posting').toLowerCase();
  if (name === 'memo') throw new Error('Memo authority on Steem is a single memo key.');
  if (name === 'active') return next.active;
  return next.posting;
}

export async function executeRequest(
  request: KeychainRequest,
  account: StoredAccount,
  importAccounts: (accounts: StoredAccount[]) => Promise<number>,
): Promise<unknown> {
  const name = account.name;
  switch (request.type) {
    case 'transfer': {
      const to = String(request.to || '');
      const currency = String(request.currency || 'STEEM');
      const memo = await maybeEncryptMemo(request.memo, account, to);
      return broadcastOperations('active', privateKey(account, 'active'), [
        ['transfer', {from: name, to, amount: asset(request.amount, currency), memo}],
      ]);
    }
    case 'savings': {
      const to = String(request.to || name);
      const currency = String(request.currency || 'STEEM');
      const amount = asset(request.amount, currency);
      const memo = await maybeEncryptMemo(request.memo, account, to);
      if (request.operation === 'withdraw') {
        return broadcastOperations('active', privateKey(account, 'active'), [
          ['transfer_from_savings', {from: name, request_id: Date.now() % 1000000000, to, amount, memo}],
        ]);
      }
      return broadcastOperations('active', privateKey(account, 'active'), [
        ['transfer_to_savings', {from: name, to, amount, memo}],
      ]);
    }
    case 'convert': {
      if (request.collaterized) {
        throw new Error('Steem does not have collateralized convert. Use a regular convert.');
      }
      return broadcastOperations('active', privateKey(account, 'active'), [
        ['convert', {owner: name, requestid: Date.now() % 1000000000, amount: asset(request.amount, 'SBD')}],
      ]);
    }
    case 'powerUp': {
      const amount = asset(request.steem, 'STEEM');
      return broadcastOperations('active', privateKey(account, 'active'), [
        ['transfer_to_vesting', {from: name, to: String(request.recipient || name), amount}],
      ]);
    }
    case 'powerDown': {
      const vestingShares = await powerToVests(Number(request.steem_power ?? 0));
      return broadcastOperations('active', privateKey(account, 'active'), [
        ['withdraw_vesting', {account: name, vesting_shares: vestingShares}],
      ]);
    }
    case 'delegation': {
      const unit = String(request.unit || 'SP').toUpperCase();
      const vestingShares =
        unit === 'VESTS' ? asset(request.amount, 'VESTS') : await powerToVests(Number(request.amount));
      return broadcastOperations('active', privateKey(account, 'active'), [
        ['delegate_vesting_shares', {delegator: name, delegatee: String(request.delegatee || ''), vesting_shares: vestingShares}],
      ]);
    }
    case 'vote':
      return broadcastOperations('posting', privateKey(account, 'posting'), [
        ['vote', {voter: name, author: String(request.author || ''), permlink: String(request.permlink || ''), weight: Number(request.weight)}],
      ]);
    case 'post': {
      const metadata = request.json_metadata;
      const operations: unknown[] = [
        ['comment', {
          parent_author: String(request.parent_username || ''),
          parent_permlink: String(request.parent_perm || ''),
          author: name,
          permlink: String(request.permlink || slug(request.title)),
          title: String(request.title || ''),
          body: String(request.body || ''),
          json_metadata: typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {}),
        }],
      ];
      if (request.comment_options && typeof request.comment_options === 'object') {
        operations.push(['comment_options', request.comment_options]);
      }
      return broadcastOperations('posting', privateKey(account, 'posting'), operations);
    }
    case 'custom': {
      const role = requiredRole(request) === 'active' ? 'active' : 'posting';
      const json = typeof request.json === 'string' ? request.json : JSON.stringify(request.json ?? {});
      return broadcastOperations(role, privateKey(account, role), [
        ['custom_json', {
          required_auths: role === 'active' ? [name] : [],
          required_posting_auths: role === 'posting' ? [name] : [],
          id: String(request.id || ''),
          json,
        }],
      ]);
    }
    case 'broadcast': {
      const operations = Array.isArray(request.operations) ? request.operations : [];
      if (!operations.length) throw new Error('The broadcast has no operations.');
      const role = requiredRole(request) === 'posting' ? 'posting' : 'active';
      return broadcastOperations(role, privateKey(account, role), operations);
    }
    case 'signBuffer': {
      const role = requiredRole(request);
      const wif = privateKey(account, role === 'memo' ? 'memo' : role === 'active' ? 'active' : 'posting');
      return {
        signature: Signature.sign(String(request.message ?? ''), wif).toHex(),
        publicKey: steem.auth.wifToPublic(wif),
      };
    }
    case 'signTx': {
      const role = requiredRole(request) === 'posting' ? 'posting' : 'active';
      const wif = privateKey(account, role);
      let tx = (request.tx && typeof request.tx === 'object' ? request.tx : {}) as Record<string, unknown>;
      if (!tx.expiration) tx = await steem.broadcast._prepareTransaction(tx);
      return steem.auth.signTransaction(tx, {[role]: wif});
    }
    case 'encodeWithKeys': {
      const role = requiredRole(request);
      const wif = privateKey(account, role);
      const keys = Array.isArray(request.publicKeys) ? request.publicKeys.map(key => String(key)) : [];
      if (!keys.length) throw new Error('No public keys were given to encode the message.');
      const message = String(request.message ?? '');
      return keys.map(publicKey => steem.memo.encode(wif, publicKey, message));
    }
    case 'encode': {
      const role = requiredRole(request);
      const wif = privateKey(account, role);
      const receiver = await chainAccount(String(request.receiver || ''));
      const publicKey =
        role === 'memo'
          ? receiver.memo_key
          : (role === 'active' ? receiver.active : receiver.posting).key_auths[0]?.[0];
      if (!publicKey) throw new Error(`@${receiver.name} has no ${role} public key.`);
      return steem.memo.encode(wif, publicKey, String(request.message ?? ''));
    }
    case 'decode': {
      const role = requiredRole(request);
      const message = String(request.message ?? '');
      if (!message.startsWith('#')) return message;
      return steem.memo.decode(privateKey(account, role), message);
    }
    case 'signedCall': {
      const role = requiredRole(request);
      const wif = privateKey(account, role);
      let params: unknown = request.params ?? [];
      if (typeof params === 'string') {
        try {
          params = params ? JSON.parse(params) : [];
        } catch {
          throw new Error('Signed call params must be a JSON array.');
        }
      }
      if (!Array.isArray(params)) throw new Error('Signed call params must be an array.');
      await applySavedRpc();
      return new Promise((resolve, reject) => {
        steem.api.signedCall(String(request.method || ''), params, name, wif, (error: unknown, result: unknown) => {
          if (error) reject(error);
          else resolve(result);
        });
      });
    }
    case 'sendToken':
      return broadcastOperations('active', privateKey(account, 'active'), [
        ['custom_json', {
          required_auths: [name],
          required_posting_auths: [],
          id: 'ssc-mainnet1',
          json: JSON.stringify({
            contractName: 'tokens',
            contractAction: 'transfer',
            contractPayload: {
              symbol: String(request.currency || ''),
              to: String(request.to || ''),
              quantity: String(request.amount ?? ''),
              memo: String(request.memo || ''),
            },
          }),
        }],
      ]);
    case 'swap':
      return broadcastOperations('active', privateKey(account, 'active'), swapOperations(name, request.steps));
    case 'witnessVote':
      return broadcastOperations('active', privateKey(account, 'active'), [
        ['account_witness_vote', {account: name, witness: String(request.witness || ''), approve: Boolean(request.vote)}],
      ]);
    case 'proxy':
      return broadcastOperations('active', privateKey(account, 'active'), [
        ['account_witness_proxy', {account: name, proxy: String(request.proxy || '')}],
      ]);
    case 'createProposal':
      return broadcastOperations('active', privateKey(account, 'active'), [
        ['create_proposal', {
          creator: name,
          receiver: String(request.receiver || ''),
          start_date: String(request.start || ''),
          end_date: String(request.end || ''),
          daily_pay: asset(request.daily_pay, 'SBD'),
          subject: String(request.subject || ''),
          permlink: String(request.permlink || ''),
          extensions: asExtensions(request.extensions),
        }],
      ]);
    case 'updateProposalVote':
      return broadcastOperations('active', privateKey(account, 'active'), [
        ['update_proposal_votes', {
          voter: name,
          proposal_ids: asList(request.proposal_ids),
          approve: Boolean(request.approve),
          extensions: asExtensions(request.extensions),
        }],
      ]);
    case 'removeProposal':
      return broadcastOperations('active', privateKey(account, 'active'), [
        ['remove_proposal', {
          proposal_owner: name,
          proposal_ids: asList(request.proposal_ids),
          extensions: asExtensions(request.extensions),
        }],
      ]);
    case 'createClaimedAccount':
      return broadcastOperations('active', privateKey(account, 'active'), [
        ['create_claimed_account', {
          creator: name,
          new_account_name: String(request.new_account || ''),
          owner: request.owner,
          active: request.active,
          posting: request.posting,
          memo_key: String(request.memo || ''),
          json_metadata: '',
          extensions: [],
        }],
      ]);
    case 'addAccountAuthority':
    case 'removeAccountAuthority':
    case 'addKeyAuthority':
    case 'removeKeyAuthority':
      return updateAccount(account, (_current, next) => {
        if (String(request.role || '').toLowerCase() === 'memo') {
          if (request.type !== 'addKeyAuthority') throw new Error('Memo authority on Steem is a single memo key.');
          next.memo_key = String(request.authorizedKey || '');
          return;
        }
        const authority = authorityFor(request.role, next);
        const accountName = String(request.authorizedUsername || '');
        const key = String(request.authorizedKey || '');
        const weight = Number(request.weight ?? 1);
        if (request.type === 'addAccountAuthority') upsert(authority.account_auths, accountName, weight);
        if (request.type === 'removeAccountAuthority') removePair(authority.account_auths, accountName);
        if (request.type === 'addKeyAuthority') upsert(authority.key_auths, key, weight);
        if (request.type === 'removeKeyAuthority') removePair(authority.key_auths, key);
      });
    case 'addAccount': {
      const username = String(request.username || '').trim().toLowerCase();
      if (!/^[a-z0-9.-]{3,16}$/.test(username)) throw new Error('That account name is not valid.');
      const incoming = request.keys && typeof request.keys === 'object' ? (request.keys as AccountKeys) : {};
      const keys: AccountKeys = {};
      for (const field of ['posting', 'postingPubkey', 'active', 'activePubkey', 'memo', 'memoPubkey'] as const) {
        const value = incoming[field];
        if (typeof value === 'string' && value) keys[field] = value;
      }
      if (!keys.posting && !keys.active && !keys.memo) throw new Error('Add at least one private key.');
      await importAccounts([{name: username, keys}]);
      return {name: username};
    }
    case 'recurrentTransfer':
      throw new Error('Recurrent transfers are not a Steem operation.');
    default:
      throw new Error(`Steem Keychain cannot run “${request.type}” from the browser.`);
  }
}

function upsert(pairs: [string, number][], entry: string, weight: number) {
  if (!entry) throw new Error('The authority is missing.');
  const existing = pairs.find(pair => pair[0] === entry);
  if (existing) existing[1] = weight;
  else pairs.push([entry, weight]);
}

function removePair(pairs: [string, number][], entry: string) {
  const index = pairs.findIndex(pair => pair[0] === entry);
  if (index < 0) throw new Error('That authority is not on the account.');
  pairs.splice(index, 1);
}

function swapOperations(username: string, steps: unknown): unknown[] {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('This swap has no steps to broadcast.');
  }
  const operations = steps.flatMap(step => {
    if (Array.isArray(step) && typeof step[0] === 'string' && step[1] && typeof step[1] === 'object') {
      return [[step[0], step[1]]];
    }
    if (step && typeof step === 'object' && 'contractName' in step && 'contractAction' in step) {
      return [[
        'custom_json',
        {
          required_auths: [username],
          required_posting_auths: [],
          id: 'ssc-mainnet1',
          json: JSON.stringify(step),
        },
      ]];
    }
    return [];
  });
  if (!operations.length) throw new Error('These swap steps are not a Steem operation this wallet can broadcast.');
  return operations;
}

export function failureMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === 'object' && 'message' in cause) return String(cause.message);
  return 'The request failed.';
}
