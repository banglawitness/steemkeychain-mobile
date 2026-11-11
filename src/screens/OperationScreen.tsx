import {RouteProp, useNavigation, useRoute} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import * as Clipboard from 'expo-clipboard';
import {BarcodeScanningResult, CameraView, useCameraPermissions} from 'expo-camera';
import {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import Svg, {Rect} from 'react-native-svg';
import {useVault} from '../auth/VaultContext';
import {broadcastOperations, executeRequest, failureMessage} from '../browser/requests';
import ConfirmSheet from '../components/ConfirmSheet';
import {RootStackParamList} from '../navigation/RootNavigator';
import {loadRecipients, removeRecipient, saveRecipient} from '../storage/recipients';
import {loadBalances, loadChainAccount, loadDelegations, loadSavingsWithdrawals} from '../steem/client';
import {Palette, useColors, useThemedStyles} from '../theme';
import {Balances, DelegationRow, SavingsWithdraw} from '../types';

type Kind = RootStackParamList['Operate']['kind'];

const TITLES: Record<Kind, string> = {
  transfer: 'Transfer',
  powerUp: 'Power up',
  powerDown: 'Power down',
  delegate: 'Delegate SP',
  savings: 'Savings',
  convert: 'Convert',
  claim: 'Claim rewards',
};

const SENT: Record<Kind, string> = {
  transfer: 'Sent',
  powerUp: 'Powered up',
  powerDown: 'Power down started',
  delegate: 'Delegated',
  savings: 'Savings updated',
  convert: 'Convert started',
  claim: 'Rewards claimed',
};

export default function OperationScreen() {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Operate'>>();
  const kind = route.params.kind;
  const {accounts, activeName, importAccounts} = useVault();
  const account = accounts.find(item => item.name === activeName);
  const [to, setTo] = useState(route.params.to || '');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [currency, setCurrency] = useState<'STEEM' | 'SBD'>(route.params.currency || 'STEEM');
  const [savingsMode, setSavingsMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [balances, setBalances] = useState<Balances | null>(null);
  const [outgoing, setOutgoing] = useState<DelegationRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<SavingsWithdraw[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState('');
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanLead, setScanLead] = useState('Scan a receive QR code. The account name fills in To.');
  const [saved, setSaved] = useState<string[]>([]);
  const [permission, requestPermission] = useCameraPermissions();
  const scanLock = useRef(false);
  const scanFor = useRef<'to' | 'memo'>('to');

  useEffect(() => {
    if (!activeName) return;
    let alive = true;
    setLoading(true);
    Promise.all([
      loadBalances(activeName),
      kind === 'delegate' ? loadDelegations(activeName) : Promise.resolve(null),
      kind === 'savings' ? loadSavingsWithdrawals(activeName) : Promise.resolve(null),
    ])
      .then(([nextBalances, delegations, pending]) => {
        if (!alive) return;
        setBalances(nextBalances);
        setOutgoing(delegations || []);
        setWithdrawals(pending || []);
      })
      .catch(cause => {
        if (alive) setError(failureMessage(cause));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [activeName, kind]);

  const openScan = async (target: 'to' | 'memo') => {
    scanLock.current = false;
    scanFor.current = target;
    setScanLead(target === 'memo'
      ? 'Scan a QR code. Its text fills in Memo.'
      : 'Scan a receive QR code. The account name fills in To.');
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setError(target === 'memo' ? 'Allow the camera to scan a memo QR code.' : 'Allow the camera to scan a receive QR code.');
        return;
      }
    }
    setScanning(true);
  };

  const pasteInto = async (apply: (value: string) => void) => {
    const text = (await Clipboard.getStringAsync()).trim();
    if (text) apply(text);
  };

  const onRecipientScan = ({data}: BarcodeScanningResult) => {
    if (scanLock.current) return;
    const text = data.trim();
    if (!text) return;
    if (scanFor.current === 'memo') {
      scanLock.current = true;
      setMemo(text);
      setError('');
      setScanning(false);
      return;
    }
    const name = accountFromQr(text);
    if (!name) {
      setError('That QR code does not contain a Steem account.');
      return;
    }
    scanLock.current = true;
    setTo(name);
    setError('');
    setScanning(false);
  };

  useEffect(() => {
    if (kind !== 'transfer') return;
    loadRecipients().then(setSaved);
  }, [kind]);

  const receiverName = to.trim().replace(/^@/, '').toLowerCase();
  const receiverSaved = saved.includes(receiverName);

  const keepRecipient = async () => {
    if (!/^[a-z0-9.-]{3,16}$/.test(receiverName)) {
      setError('Enter a valid Steem account name.');
      return;
    }
    setError('');
    setSaved(await saveRecipient(receiverName));
  };

  const available = availableBalance(kind, currency, savingsMode, balances);
  const parsed = Number(amount);
  const allowsZero = kind === 'powerDown' || kind === 'delegate';

  const prepare = async () => {
    setError('');
    if (!account) {
      setError('Choose an account on the wallet first.');
      return;
    }
    if (kind !== 'claim') {
      if (!Number.isFinite(parsed) || parsed < 0 || (parsed === 0 && !allowsZero)) {
        setError('Enter an amount.');
        return;
      }
      if (available !== null && parsed > Number(available)) {
        setError(`That is more than the available ${available}.`);
        return;
      }
    }
    const receiver = to.trim().replace(/^@/, '');
    if ((kind === 'transfer' || kind === 'delegate') && !receiver) {
      setError(kind === 'delegate' ? 'Enter the account that receives the delegation.' : 'Enter the receiver.');
      return;
    }
    if ((kind === 'transfer' || kind === 'delegate') && !/^[a-z0-9.-]{3,16}$/.test(receiver)) {
      setError('Enter a valid Steem account name.');
      return;
    }
    if (kind === 'transfer' || kind === 'delegate') {
      try {
        await loadChainAccount(receiver);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'That account was not found on Steem.');
        return;
      }
    }
    setConfirming(true);
  };

  const submit = async () => {
    if (!account || !activeName) return;
    setBusy(true);
    setError('');
    try {
      if (kind === 'claim') {
        if (!account.keys.posting) throw new Error('This account has no posting key.');
        if (!balances) throw new Error('Rewards are still loading.');
        await broadcastOperations('posting', account.keys.posting, [[
          'claim_reward_balance',
          {
            account: activeName,
            reward_steem: `${balances.rewardSteem} STEEM`,
            reward_sbd: `${balances.rewardSbd} SBD`,
            reward_vests: balances.rewardVests,
          },
        ]]);
      } else if (cancelId !== null) {
        if (!account.keys.active) throw new Error('This account has no active key.');
        await broadcastOperations('active', account.keys.active, [[
          'cancel_transfer_from_savings',
          {from: activeName, request_id: cancelId},
        ]]);
      } else {
        await executeRequest(requestFor(kind, {
          to: to.trim().replace(/^@/, ''),
          amount: parsed,
          memo,
          currency,
          savingsMode,
          self: activeName,
        }), account, importAccounts);
      }
      setConfirming(false);
      setSent(cancelId !== null ? 'Withdraw canceled' : SENT[kind]);
      setCancelId(null);
    } catch (cause) {
      setError(failureMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const lines = confirmLines(kind, {
    account: activeName || '',
    to: to.trim().replace(/^@/, ''),
    amount,
    currency,
    memo,
    savingsMode,
    available,
    balances,
    cancelId,
  });

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {loading ? <ActivityIndicator color={colors.accent} /> : null}
        {kind === 'powerDown' && balances ? (
          <Text style={styles.note}>
            {Number(balances.poweringDown) > 0
              ? `Powering down ${balances.poweringDown} SP. Next withdraw ${balances.nextPowerDown}. Enter 0 to stop.`
              : 'This account is not powering down. Enter 0 to cancel a power down later.'}
          </Text>
        ) : null}
        {kind === 'claim' && balances ? (
          <View>
            <Text style={styles.note}>STEEM {balances.rewardSteem}</Text>
            <Text style={styles.note}>SBD {balances.rewardSbd}</Text>
            <Text style={styles.note}>SP {balances.rewardSp}</Text>
          </View>
        ) : null}
        {kind === 'convert' ? (
          <Text style={styles.note}>A regular convert takes about 3.5 days. Collateralized convert is not a Steem operation.</Text>
        ) : null}
        {kind !== 'claim' ? (
          <>
            {kind === 'transfer' || kind === 'savings' ? (
              <View style={styles.chips}>
                {(['STEEM', 'SBD'] as const).map(symbol => (
                  <Pressable key={symbol} style={[styles.chip, currency === symbol && styles.chipOn]} onPress={() => setCurrency(symbol)}>
                    <Text style={styles.chipText}>{symbol}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {kind === 'savings' ? (
              <View style={styles.chips}>
                {(['deposit', 'withdraw'] as const).map(mode => (
                  <Pressable key={mode} style={[styles.chip, savingsMode === mode && styles.chipOn]} onPress={() => setSavingsMode(mode)}>
                    <Text style={styles.chipText}>{mode === 'deposit' ? 'Deposit' : 'Withdraw'}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {kind === 'transfer' ? (
              <View style={styles.toRow}>
                <TextInput
                  style={[styles.input, styles.toInput]}
                  value={to}
                  onChangeText={setTo}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="To"
                  placeholderTextColor={colors.muted}
                />
                <PasteButton onPress={() => pasteInto(setTo)} />
                <Pressable style={styles.qrButton} onPress={() => openScan('to')} accessibilityLabel="Scan QR code">
                  <QrMark />
                </Pressable>
              </View>
            ) : null}
            {kind === 'transfer' ? (
              <View>
                <Pressable style={styles.saveWallet} onPress={keepRecipient}>
                  <Text style={styles.saveWalletText}>{receiverSaved ? 'Saved' : 'Save wallet'}</Text>
                </Pressable>
                {saved.length ? (
                  <View style={styles.savedList}>
                    {saved.map(name => (
                      <View key={name} style={[styles.savedChip, name === receiverName && styles.chipOn]}>
                        <Pressable onPress={() => { setTo(name); setError(''); }}>
                          <Text style={styles.chipText}>{name}</Text>
                        </Pressable>
                        <Pressable hitSlop={8} onPress={() => removeRecipient(name).then(setSaved)} accessibilityLabel={`Remove ${name}`}>
                          <Text style={styles.savedRemove}>×</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
            {kind === 'delegate' || (kind === 'savings' && savingsMode === 'withdraw') || kind === 'powerUp' ? (
              <View style={styles.toRow}>
                <TextInput
                  style={[styles.input, styles.toInput]}
                  value={to}
                  onChangeText={setTo}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={kind === 'delegate' ? 'Delegate to' : kind === 'powerUp' ? 'Power up to (optional)' : 'To'}
                  placeholderTextColor={colors.muted}
                />
                <PasteButton onPress={() => pasteInto(setTo)} />
              </View>
            ) : null}
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder={amountLabel(kind)}
              placeholderTextColor={colors.muted}
            />
            {available !== null ? <Text style={styles.note}>Available {available}</Text> : null}
            {kind === 'transfer' || kind === 'savings' ? (
              <View style={styles.toRow}>
                <TextInput
                  style={[styles.input, styles.toInput]}
                  value={memo}
                  onChangeText={setMemo}
                  placeholder="Memo. Start with # to encrypt"
                  placeholderTextColor={colors.muted}
                />
                <PasteButton onPress={() => pasteInto(setMemo)} />
                {kind === 'transfer' ? (
                  <Pressable style={styles.qrButton} onPress={() => openScan('memo')} accessibilityLabel="Scan memo QR code">
                    <QrMark />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}
        {kind === 'delegate' ? (
          <View>
            <Text style={styles.section}>Outgoing</Text>
            {outgoing.length === 0 ? <Text style={styles.note}>No outgoing delegations.</Text> : outgoing.map(row => (
              <Text key={row.account} style={styles.note}>@{row.account} · {row.sp} SP</Text>
            ))}
          </View>
        ) : null}
        {kind === 'savings' ? (
          <View>
            <Text style={styles.section}>Pending withdrawals</Text>
            {withdrawals.length === 0 ? <Text style={styles.note}>None pending.</Text> : withdrawals.map(row => (
              <Pressable key={row.requestId} style={styles.pending} onPress={() => { setCancelId(row.requestId); setConfirming(true); }}>
                <Text style={styles.note}>#{row.requestId} · {row.amount} to @{row.to}</Text>
                <Text style={styles.note}>Completes {row.complete}. Tap to cancel.</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {error && !confirming ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.primary} onPress={prepare}>
          <Text style={styles.primaryText}>{kind === 'claim' ? 'Claim' : 'Review'}</Text>
        </Pressable>
      </ScrollView>
      {confirming ? (
        <ConfirmSheet
          title={cancelId !== null ? 'Cancel savings withdraw' : TITLES[kind]}
          lines={lines}
          busy={busy}
          error={error}
          onCancel={() => { setConfirming(false); setCancelId(null); setError(''); }}
          onConfirm={submit}
        />
      ) : null}
      {sent ? (
        <View style={styles.successBackdrop}>
          <View style={styles.successCard}>
            <View style={styles.successMark}>
              <Text style={styles.successTick}>✓</Text>
            </View>
            <Text style={styles.successTitle}>{sent}</Text>
            <Text style={styles.successBody}>The Steem broadcast was successful.</Text>
            <Pressable style={[styles.primary, styles.successButton]} onPress={() => navigation.goBack()}>
              <Text style={styles.primaryText}>OK</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <View style={styles.scanScreen}>
          <Text style={styles.scanLead}>{scanLead}</Text>
          <View style={styles.cameraWrap}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{barcodeTypes: ['qr']}}
              onBarcodeScanned={onRecipientScan}
            />
          </View>
          <Pressable style={styles.scanClose} onPress={() => setScanning(false)}>
            <Text style={styles.primaryText}>Close</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

function PasteButton({onPress}: {onPress: () => void}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable style={styles.pasteButton} onPress={onPress}>
      <Text style={styles.pasteText}>Paste</Text>
    </Pressable>
  );
}

function QrMark() {
  const colors = useColors();
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Rect x="1" y="1" width="6" height="6" rx="1" fill={colors.accentDeep} />
      <Rect x="11" y="1" width="6" height="6" rx="1" fill={colors.accentDeep} />
      <Rect x="1" y="11" width="6" height="6" rx="1" fill={colors.accentDeep} />
      <Rect x="12" y="12" width="2" height="2" fill={colors.accentDeep} />
      <Rect x="15" y="12" width="2" height="2" fill={colors.accentDeep} />
      <Rect x="12" y="15" width="2" height="2" fill={colors.accentDeep} />
      <Rect x="15" y="15" width="2" height="2" fill={colors.accentDeep} />
    </Svg>
  );
}

function accountFromQr(data: string) {
  const text = data.trim();
  const whole = text.replace(/^@/, '').toLowerCase();
  if (/^[a-z0-9.-]{3,16}$/.test(whole)) return whole;
  const named = text.match(/@([a-z0-9.-]{3,16})\b/i);
  return named ? named[1].toLowerCase() : '';
}

function availableBalance(kind: Kind, currency: 'STEEM' | 'SBD', savingsMode: 'deposit' | 'withdraw', balances: Balances | null) {
  if (!balances) return null;
  if (kind === 'transfer' || kind === 'powerUp' || (kind === 'savings' && savingsMode === 'deposit')) {
    return currency === 'SBD' && kind !== 'powerUp' ? balances.sbd : balances.steem;
  }
  if (kind === 'savings' && savingsMode === 'withdraw') return currency === 'SBD' ? balances.savingsSbd : balances.savingsSteem;
  if (kind === 'convert') return balances.sbd;
  if (kind === 'powerDown' || kind === 'delegate') return balances.sp;
  return null;
}

function amountLabel(kind: Kind) {
  if (kind === 'powerUp') return 'STEEM to power up';
  if (kind === 'powerDown' || kind === 'delegate') return 'SP amount (0 clears it)';
  if (kind === 'convert') return 'SBD to convert';
  return 'Amount';
}

function requestFor(kind: Kind, input: {to: string; amount: number; memo: string; currency: string; savingsMode: string; self: string}) {
  const base = {username: input.self, domain: 'steem-keychain'};
  switch (kind) {
    case 'transfer':
      return {...base, type: 'transfer', to: input.to, amount: input.amount, currency: input.currency, memo: input.memo};
    case 'powerUp':
      return {...base, type: 'powerUp', steem: input.amount, recipient: input.to || input.self};
    case 'powerDown':
      return {...base, type: 'powerDown', steem_power: input.amount};
    case 'delegate':
      return {...base, type: 'delegation', delegatee: input.to, amount: input.amount, unit: 'SP'};
    case 'savings':
      return {...base, type: 'savings', operation: input.savingsMode, to: input.to || input.self, amount: input.amount, currency: input.currency, memo: input.memo};
    case 'convert':
      return {...base, type: 'convert', amount: input.amount, collaterized: false};
    default:
      return {...base, type: kind};
  }
}

function confirmLines(kind: Kind, input: {
  account: string;
  to: string;
  amount: string;
  currency: string;
  memo: string;
  savingsMode: string;
  available: string | null;
  balances: Balances | null;
  cancelId: number | null;
}) {
  if (input.cancelId !== null) {
    return [`Account @${input.account}`, `Cancel savings request ${input.cancelId}`];
  }
  if (kind === 'claim' && input.balances) {
    return [
      `Account @${input.account}`,
      `STEEM ${input.balances.rewardSteem}`,
      `SBD ${input.balances.rewardSbd}`,
      `SP ${input.balances.rewardSp}`,
    ];
  }
  const unit = kind === 'powerDown' || kind === 'delegate' ? 'SP' : kind === 'powerUp' || kind === 'convert' ? (kind === 'convert' ? 'SBD' : 'STEEM') : input.currency;
  const lines = [`Account @${input.account}`, `Amount ${input.amount || '0'} ${unit}`];
  if (input.available !== null) lines.push(`Available ${input.available}`);
  if (input.to) lines.push(`To @${input.to}`);
  if (kind === 'savings') lines.push(input.savingsMode === 'withdraw' ? 'Withdraw from savings' : 'Deposit to savings');
  if (input.memo) lines.push(input.memo.startsWith('#') ? 'Memo will be encrypted' : `Memo ${input.memo}`);
  return lines;
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
  screen: {flex: 1, backgroundColor: c.background},
  content: {padding: 14, paddingBottom: 24},
  note: {color: c.muted, lineHeight: 21, marginBottom: 8},
  section: {color: c.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 18, marginBottom: 8},
  chips: {flexDirection: 'row', gap: 8, marginBottom: 12},
  chip: {backgroundColor: c.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8},
  chipOn: {backgroundColor: c.accentSoft},
  chipText: {color: c.text, fontWeight: '600'},
  input: {backgroundColor: c.card, color: c.text, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, fontSize: 15},
  toRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8},
  toInput: {flex: 1, marginBottom: 0},
  qrButton: {width: 44, height: 44, borderRadius: 12, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center'},
  pasteButton: {height: 44, borderRadius: 12, backgroundColor: c.card, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center'},
  pasteText: {color: c.accentDeep, fontSize: 13, fontWeight: '700'},
  saveWallet: {alignSelf: 'flex-start', marginBottom: 8},
  saveWalletText: {color: c.accent, fontSize: 13, fontWeight: '800'},
  savedList: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8},
  savedChip: {flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.card, borderRadius: 20, paddingLeft: 12, paddingRight: 8, paddingVertical: 7},
  savedRemove: {color: c.muted, fontSize: 16, fontWeight: '700', lineHeight: 16},
  scanScreen: {flex: 1, backgroundColor: c.background, padding: 16, paddingTop: 48},
  scanLead: {color: c.muted, textAlign: 'center', marginBottom: 14, lineHeight: 20},
  cameraWrap: {flex: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 14},
  camera: {flex: 1},
  scanClose: {backgroundColor: c.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center'},
  pending: {backgroundColor: c.card, borderRadius: 16, padding: 14, marginBottom: 8},
  error: {color: c.danger, marginBottom: 8},
  primary: {backgroundColor: c.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 6},
  primaryText: {color: c.onAccent, fontWeight: '700', fontSize: 15},
  successBackdrop: {...StyleSheet.absoluteFill, backgroundColor: 'rgba(5,8,14,0.72)', justifyContent: 'center', padding: 24},
  successCard: {
    backgroundColor: c.card,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
    alignItems: 'center',
  },
  successMark: {width: 64, height: 64, borderRadius: 32, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14},
  successTick: {color: c.accentDeep, fontSize: 32, fontWeight: '800'},
  successTitle: {color: c.text, fontSize: 22, fontWeight: '800', marginBottom: 6},
  successBody: {color: c.muted, fontSize: 15, lineHeight: 21, textAlign: 'center', marginBottom: 16},
  successButton: {alignSelf: 'stretch', marginTop: 4},
});
}
