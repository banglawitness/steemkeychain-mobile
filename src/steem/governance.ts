import {loadProps, quantity, steemCall, vestsToSp} from './client';

export const MAX_WITNESS_VOTES = 30;
export const WITNESS_PAGE = 100;
const DISABLED_SIGNING_KEY = 'STM1111111111111111111111111111111114T1Anm';

export type GovernanceAccount = {
  proxy: string;
  witnessVotes: string[];
};

export type WitnessRow = {
  name: string;
  url: string;
  active: boolean;
  missed: number;
};

export type ProposalStatus = 'funded' | 'partial' | 'pending' | 'return';

export type ProposalRow = {
  id: number;
  creator: string;
  receiver: string;
  subject: string;
  permlink: string;
  dailyPay: string;
  start: string;
  end: string;
  votes: string;
  voted: boolean;
  status: ProposalStatus;
};

type ChainWitness = {
  owner: string;
  url: string;
  signing_key: string;
  total_missed: number;
};

type ChainProposal = {
  proposal_id: number;
  creator: string;
  receiver: string;
  subject: string;
  permlink: string;
  daily_pay: string;
  start_date: string;
  end_date: string;
  total_votes: string;
};

type ProposalVote = {
  voter: string;
  proposal?: {proposal_id?: number};
};

export async function loadGovernanceAccount(username: string): Promise<GovernanceAccount> {
  const accounts = await steemCall<{proxy?: string; witness_votes?: string[]}[]>('getAccounts', [[username]]);
  const account = accounts?.[0];
  if (!account) throw new Error(`@${username} was not found on Steem.`);
  return {
    proxy: account.proxy || '',
    witnessVotes: account.witness_votes || [],
  };
}

export async function loadWitnesses(from = '', limit = WITNESS_PAGE): Promise<WitnessRow[]> {
  const rows = await steemCall<ChainWitness[]>('getWitnessesByVote', [from, limit]);
  return (rows || []).map(row => ({
    name: row.owner,
    url: row.url || '',
    active: Boolean(row.signing_key) && row.signing_key !== DISABLED_SIGNING_KEY,
    missed: Number(row.total_missed) || 0,
  }));
}

export async function loadProposals(voter: string): Promise<ProposalRow[]> {
  const [proposals, votePage, dao, props] = await Promise.all([
    steemCall<ChainProposal[]>('listProposals', [[-1], 200, 'by_total_votes', 'descending', 'votable']),
    steemCall<ProposalVote[]>('listProposalVotes', [[voter], 1000, 'by_voter_proposal', 'descending', 'votable']).catch(() => []),
    steemCall<{sbd_balance?: string}[]>('getAccounts', [['steem.dao']]),
    loadProps(),
  ]);
  const voted = new Set(
    (votePage || [])
      .filter(row => row.voter === voter && row.proposal?.proposal_id !== undefined)
      .map(row => Number(row.proposal?.proposal_id)),
  );
  let budget = quantity(dao?.[0]?.sbd_balance || '0') / 100;
  return (proposals || []).map(proposal => {
    const daily = quantity(proposal.daily_pay);
    const isReturn = proposal.proposal_id === 0;
    let status: ProposalStatus = 'pending';
    if (isReturn) status = 'return';
    else if (budget > 0 && budget - daily >= 0) status = 'funded';
    else if (budget > 0) status = 'partial';
    budget -= daily;
    const sp = vestsToSp(Number(proposal.total_votes) / 1e6, props);
    return {
      id: proposal.proposal_id,
      creator: proposal.creator,
      receiver: proposal.receiver,
      subject: proposal.subject,
      permlink: proposal.permlink,
      dailyPay: proposal.daily_pay,
      start: String(proposal.start_date || '').slice(0, 10),
      end: String(proposal.end_date || '').slice(0, 10),
      votes: compact(sp),
      voted: voted.has(proposal.proposal_id),
      status,
    };
  });
}

function compact(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}
