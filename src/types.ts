export type AccountKeys = {
  posting?: string;
  postingPubkey?: string;
  active?: string;
  activePubkey?: string;
  memo?: string;
  memoPubkey?: string;
};

export type StoredAccount = {
  name: string;
  keys: AccountKeys;
};

export type Balances = {
  steem: string;
  sbd: string;
  sp: string;
  savingsSteem: string;
  savingsSbd: string;
  rewardSteem: string;
  rewardSbd: string;
  rewardSp: string;
  rewardVests: string;
  poweringDown: string;
  nextPowerDown: string;
  votingMana: string;
  downvoteMana: string;
  voteValue: string;
  rc: string;
  rcAmount: string;
  rcMax: string;
};

export type DelegationRow = {
  account: string;
  sp: string;
};

export type SavingsWithdraw = {
  requestId: number;
  to: string;
  amount: string;
  complete: string;
};

export type ConvertRequest = {
  requestId: number;
  amount: string;
  complete: string;
};

export type HistoryRow = {
  id: string;
  type: string;
  timestamp: string;
  text: string;
  direction: 'in' | 'out' | 'other';
};
