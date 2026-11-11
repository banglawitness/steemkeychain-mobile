import steem from 'steem';
import {Balances, DelegationRow, HistoryRow, SavingsWithdraw} from '../types';
import {applySavedRpc} from './rpc';

type GlobalProps = {
  total_vesting_fund_steem: string;
  total_vesting_shares: string;
  vote_power_reserve_rate?: number;
};

type RewardFund = {
  reward_balance: string;
  recent_claims: string | number;
};

type MedianPrice = {
  base: string;
  quote: string;
};

type ChainAccount = {
  balance: string;
  sbd_balance: string;
  savings_balance: string;
  savings_sbd_balance: string;
  vesting_shares: string;
  reward_steem_balance: string;
  reward_sbd_balance: string;
  reward_vesting_balance: string;
  reward_vesting_steem: string;
  to_withdraw: string | number;
  withdrawn: string | number;
  next_vesting_withdrawal: string;
  posting: {key_auths: [string, number][]};
  active: {key_auths: [string, number][]};
  owner: {key_auths: [string, number][]};
  memo_key: string;
  delegated_vesting_shares?: string;
  received_vesting_shares?: string;
  vesting_withdraw_rate?: string;
  voting_power?: number;
  voting_manabar?: {current_mana: string | number; last_update_time: number};
};

const MANA_REGEN_SECONDS = 432000;

function regeneratedMana(current: number, max: number, lastUpdate: number) {
  if (!max || !Number.isFinite(current)) return 0;
  const delta = Math.max(0, Date.now() / 1000 - lastUpdate);
  return Math.min(max, Math.max(0, current + (delta * max) / MANA_REGEN_SECONDS));
}

function manaPercent(current: number, max: number, lastUpdate: number) {
  const mana = regeneratedMana(current, max, lastUpdate);
  const percent = max ? (mana / max) * 100 : 0;
  if (!Number.isFinite(percent) || percent < 0) return 0;
  return Math.min(100, percent);
}

function compactCount(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const units = [{n: 1e12, s: 'T'}, {n: 1e9, s: 'B'}, {n: 1e6, s: 'M'}, {n: 1e3, s: 'K'}];
  const unit = units.find(item => value >= item.n);
  if (!unit) return value.toFixed(2);
  const scaled = value / unit.n;
  return `${scaled.toFixed(2)} ${unit.s}`;
}

function effectiveVests(account: ChainAccount) {
  return Math.max(
    0,
    quantity(account.vesting_shares)
      + quantity(account.received_vesting_shares || '0')
      - quantity(account.delegated_vesting_shares || '0')
      - quantity(account.vesting_withdraw_rate || '0'),
  );
}

function votingPower(account: ChainAccount) {
  const maxMana = effectiveVests(account) * 1e6;
  if (account.voting_manabar && maxMana > 0) {
    return manaPercent(Number(account.voting_manabar.current_mana), maxMana, account.voting_manabar.last_update_time) * 100;
  }
  if (typeof account.voting_power === 'number') return account.voting_power;
  return 0;
}

function votingMana(account: ChainAccount) {
  if (!account.voting_manabar && typeof account.voting_power !== 'number') return '';
  return (votingPower(account) / 100).toFixed(2);
}

function voteWorth(account: ChainAccount, props: GlobalProps, fund: RewardFund, price: MedianPrice) {
  const vests = Math.round(effectiveVests(account) * 1e6);
  const recent = Number(fund.recent_claims);
  const quote = quantity(price.quote);
  if (!vests || !recent || !quote) return '';
  const reserve = props.vote_power_reserve_rate || 10;
  const maxVoteDenom = (reserve * MANA_REGEN_SECONDS) / 86400;
  let used = Math.round((votingPower(account) * 10000) / 10000);
  used = Math.round((used + maxVoteDenom - 1) / maxVoteDenom);
  const rshares = Math.round((vests * used) / 10000);
  const steemReward = (rshares * quantity(fund.reward_balance)) / recent;
  const value = steemReward * (quantity(price.base) / quote);
  return Number.isFinite(value) && value >= 0 ? value.toFixed(2) : '';
}

async function resourceCredits(username: string) {
  const empty = {percent: '', amount: '', max: ''};
  const result = await steemSend<{rc_accounts?: {max_rc: string | number; rc_manabar: {current_mana: string | number; last_update_time: number}}[]}>('rc_api', 'find_rc_accounts', {accounts: [username]});
  const row = result?.rc_accounts?.[0];
  if (!row?.rc_manabar) return empty;
  const max = Number(row.max_rc);
  const current = regeneratedMana(Number(row.rc_manabar.current_mana), max, row.rc_manabar.last_update_time);
  return {
    percent: manaPercent(Number(row.rc_manabar.current_mana), max, row.rc_manabar.last_update_time).toFixed(2),
    amount: compactCount(current),
    max: compactCount(max),
  };
}

export async function steemCall<T>(method: string, args: unknown[]): Promise<T> {
  await applySavedRpc();
  const fn = steem.api[method];
  return new Promise((resolve, reject) => {
    fn(...args, (error: unknown, result: T) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

function steemSend<T>(api: string, method: string, params: unknown): Promise<T> {
  return applySavedRpc().then(() => new Promise((resolve, reject) => {
    steem.api.send(api, {method, params}, (error: unknown, result: T) => {
      if (error) reject(error);
      else resolve(result);
    });
  }));
}

export function quantity(value: string | number): number {
  return parseFloat(String(value).split(' ')[0]) || 0;
}

export function vestsToSp(vests: string | number, props: GlobalProps): number {
  const fund = quantity(props.total_vesting_fund_steem);
  const shares = quantity(props.total_vesting_shares);
  if (!shares) return 0;
  const amount = typeof vests === 'number' ? vests : quantity(vests);
  return (amount * fund) / shares;
}

async function chainAccount(username: string): Promise<ChainAccount> {
  const accounts = await steemCall<ChainAccount[]>('getAccounts', [[username]]);
  const account = accounts?.[0];
  if (!account) throw new Error(`@${username} was not found on Steem.`);
  return account;
}

export async function loadChainAccount(username: string) {
  return chainAccount(username);
}

export async function loadProps() {
  return steemCall<GlobalProps>('getDynamicGlobalProperties', []);
}

export async function loadBalances(username: string): Promise<Balances> {
  const [account, props, rc, fund, price] = await Promise.all([
    chainAccount(username),
    loadProps(),
    resourceCredits(username).catch(() => ({percent: '', amount: '', max: ''})),
    steemCall<RewardFund>('getRewardFund', ['post']).catch(() => null),
    steemCall<MedianPrice>('getCurrentMedianHistoryPrice', []).catch(() => null),
  ]);
  const remainingRaw = (Number(account.to_withdraw) - Number(account.withdrawn)) / 1e6;
  const poweringDown = remainingRaw > 0 ? vestsToSp(remainingRaw, props).toFixed(3) : '0.000';
  return {
    steem: quantity(account.balance).toFixed(3),
    sbd: quantity(account.sbd_balance).toFixed(3),
    sp: vestsToSp(account.vesting_shares, props).toFixed(3),
    savingsSteem: quantity(account.savings_balance).toFixed(3),
    savingsSbd: quantity(account.savings_sbd_balance).toFixed(3),
    rewardSteem: quantity(account.reward_steem_balance).toFixed(3),
    rewardSbd: quantity(account.reward_sbd_balance).toFixed(3),
    rewardSp: quantity(account.reward_vesting_steem || '0').toFixed(3),
    rewardVests: account.reward_vesting_balance || '0.000000 VESTS',
    poweringDown,
    nextPowerDown: remainingRaw > 0 ? account.next_vesting_withdrawal : '',
    votingMana: votingMana(account),
    voteValue: fund && price ? voteWorth(account, props, fund, price) : '',
    rc: rc.percent,
    rcAmount: rc.amount,
    rcMax: rc.max,
  };
}

type ChainAsset = string | {amount: string; precision?: number};

function assetToNumber(value: ChainAsset) {
  if (typeof value === 'string') return quantity(value);
  const precision = Number(value.precision) || 0;
  return Number(value.amount) / 10 ** precision;
}

export async function loadDelegations(username: string): Promise<DelegationRow[]> {
  const props = await loadProps();
  const rows: DelegationRow[] = [];
  const seen = new Set<string>();
  let start = '';
  for (let page = 0; page < 20; page++) {
    const result = await steemSend<{delegations?: {delegator: string; delegatee: string; vesting_shares: ChainAsset}[]}>('database_api', 'list_vesting_delegations', {
      start: [username, start],
      limit: 100,
      order: 'by_delegation',
    });
    const list = result?.delegations || [];
    let passed = false;
    for (const row of list) {
      if (row.delegator !== username) {
        passed = true;
        break;
      }
      if (seen.has(row.delegatee)) continue;
      seen.add(row.delegatee);
      const vests = assetToNumber(row.vesting_shares);
      if (vests <= 0) continue;
      rows.push({account: row.delegatee, sp: vestsToSp(vests, props).toFixed(3)});
    }
    const last = list[list.length - 1];
    if (passed || list.length < 100 || !last || last.delegator !== username) break;
    start = last.delegatee;
  }
  return rows;
}

export async function loadSavingsWithdrawals(username: string): Promise<SavingsWithdraw[]> {
  const rows = await steemCall<{to: string; amount: string; request_id: number; complete: string}[]>('getSavingsWithdrawFrom', [username]);
  return (rows || []).map(row => ({
    requestId: row.request_id,
    to: row.to,
    amount: row.amount,
    complete: row.complete,
  }));
}

type HistoryOp = [string, Record<string, unknown>];

export async function loadHistory(username: string, from = -1, limit = 100): Promise<{rows: HistoryRow[]; oldest: number}> {
  const page = await steemCall<[number, {timestamp: string; op: HistoryOp}][]>('getAccountHistory', [username, from, limit]);
  const indexes = (page || []).map(([index]) => index);
  const oldest = indexes.length ? Math.min(...indexes) : 0;
  const rows: HistoryRow[] = [];
  for (const [index, entry] of page || []) {
    const [type, payload] = entry.op;
    rows.push({
      id: String(index),
      type,
      timestamp: entry.timestamp,
      text: describeHistory(username, type, payload),
      direction: directionOf(username, type, payload),
    });
  }
  rows.reverse();
  return {rows, oldest};
}

function directionOf(username: string, type: string, payload: Record<string, unknown>): HistoryRow['direction'] {
  if (type === 'vote') {
    if (payload.author === username && payload.voter !== username) return 'in';
    if (payload.voter === username) return 'out';
  }
  if (type === 'comment') {
    if (payload.parent_author === username) return 'in';
    if (payload.author === username) return 'out';
  }
  const from = String(payload.from || payload.delegator || payload.owner || payload.account || payload.voter || '');
  const to = String(payload.to || payload.delegatee || payload.receiver || '');
  if (type === 'claim_reward_balance' || type === 'fill_vesting_withdraw' || type === 'fill_convert_request') return 'in';
  if (type === 'withdraw_vesting' || type === 'convert') return 'out';
  if (from === username && to && to !== username) return 'out';
  if (to === username && from !== username) return 'in';
  if (from === username) return 'out';
  return 'other';
}

function describeHistory(username: string, type: string, payload: Record<string, unknown>): string {
  const amount = payload.amount || payload.vesting_shares || payload.reward_steem || '';
  switch (type) {
    case 'transfer':
    case 'transfer_to_savings':
    case 'transfer_from_savings':
      return `${payload.from} → ${payload.to} ${amount}`;
    case 'delegate_vesting_shares':
      return `@${payload.delegator} delegated ${payload.vesting_shares} to @${payload.delegatee}`;
    case 'transfer_to_vesting':
      return `@${payload.from} powered up ${amount} to @${payload.to}`;
    case 'withdraw_vesting':
      return `@${username} started a power down`;
    case 'convert':
      return `@${payload.owner} converted ${amount}`;
    case 'claim_reward_balance':
      return `Claimed ${payload.reward_steem}, ${payload.reward_sbd}, ${payload.reward_vests}`;
    case 'vote':
      return `@${payload.voter} voted on @${payload.author}/${payload.permlink}`;
    case 'comment':
      return `@${payload.author} replied to @${payload.parent_author || payload.permlink}`;
    case 'custom_json':
      return String(payload.id || 'custom json');
    case 'cancel_transfer_from_savings':
      return `@${payload.from} cancelled savings withdraw ${payload.request_id}`;
    default:
      return type.split('_').join(' ');
  }
}
