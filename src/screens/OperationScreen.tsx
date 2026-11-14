import {RouteProp, useNavigation, useRoute} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import * as Clipboard from 'expo-clipboard';
import {BarcodeScanningResult, CameraView, useCameraPermissions} from 'expo-camera';
import {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import Svg, {Path, Rect} from 'react-native-svg';
import {useVault} from '../auth/VaultContext';
import {broadcastOperations, executeRequest, failureMessage} from '../browser/requests';
import AccountAvatar from '../components/AccountAvatar';
import ConfirmSheet from '../components/ConfirmSheet';
import {RootStackParamList} from '../navigation/RootNavigator';
import {loadRecipients, removeRecipient, SavedWallet, saveRecipient} from '../storage/recipients';
import {loadBalances, loadChainAccount, loadConversions, loadDelegations, loadSavingsWithdrawals} from '../steem/client';
import {Palette, useColors, useThemedStyles} from '../theme';
import {Balances, ConvertRequest, DelegationRow, SavingsWithdraw} from '../types';

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
  const [conversions, setConversions] = useState<ConvertRequest[]>([]);
  const [delegateTab, setDelegateTab] = useState<'form' | 'outgoing'>('form');
  const [delSearch, setDelSearch] = useState('');
  const [delMenuFor, setDelMenuFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState('');
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanLead, setScanLead] = useState('Scan a receive QR code. The account name fills in To.');
  const [saved, setSaved] = useState<SavedWallet[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<SavedWallet | null>(null);
  const [editingName, setEditingName] = useState('');
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
      kind === 'convert' ? loadConversions(activeName) : Promise.resolve(null),
    ])
      .then(([nextBalances, delegations, pending, converts]) => {
        if (!alive) return;
        setBalances(nextBalances);
        setOutgoing(delegations || []);
        setWithdrawals(pending || []);
        setConversions(converts || []);
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

  const keepRecipient = async () => {
    if (!/^[a-z0-9.-]{3,16}$/.test(receiverName)) {
      setError('Enter a valid Steem account name.');
      return;
    }
    setError('');
    if (editingName && editingName !== receiverName) await removeRecipient(editingName);
    setSaved(await saveRecipient(receiverName, memo.trim()));
    setEditingName('');
    setSavedOpen(true);
  };

  const openSaved = (item: SavedWallet, next?: 'STEEM' | 'SBD') => {
    setTo(item.name);
    setMemo(item.memo);
    if (next) setCurrency(next);
    setEditingName('');
    setError('');
    setMenuFor(null);
    setSavedOpen(false);
  };

  const editSaved = (item: SavedWallet) => {
    setTo(item.name);
    setMemo(item.memo);
    setEditingName(item.name);
    setError('');
    setMenuFor(null);
    setSavedOpen(false);
  };

  const available = availableBalance(kind, currency, savingsMode, balances);
  const availableLabel = availableUnit(kind, currency, savingsMode);
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
            {/* ── Segmented control: currency + saved wallet (transfer/savings only) ── */}
            {kind === 'transfer' || kind === 'savings' ? (
              <View style={styles.segBar}>
                {(['STEEM', 'SBD'] as const).map((symbol, i) => (
                  <Pressable
                    key={symbol}
                    style={[
                      styles.segItem,
                      i === 0 && styles.segItemFirst,
                      i === 1 && !savedOpen && styles.segItemLast,
                      !savedOpen && currency === symbol && styles.segItemOn,
                    ]}
                    onPress={() => { setCurrency(symbol); setSavedOpen(false); }}>
                    <Text style={[styles.segText, !savedOpen && currency === symbol && styles.segTextOn]}>{symbol}</Text>
                  </Pressable>
                ))}
                {kind === 'transfer' ? (
                  <Pressable
                    style={[styles.segItem, styles.segItemLast, savedOpen && styles.segItemOn]}
                    onPress={() => setSavedOpen(true)}>
                    <Text style={[styles.segText, savedOpen && styles.segTextOn]}>Saved</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {/* ── Savings deposit/withdraw toggle ── */}
            {kind === 'transfer' && savedOpen ? null : kind === 'savings' ? (
              <View style={styles.segBar}>
                {(['deposit', 'withdraw'] as const).map((mode, i) => (
                  <Pressable
                    key={mode}
                    style={[styles.segItem, i === 0 && styles.segItemFirst, i === 1 && styles.segItemLast, savingsMode === mode && styles.segItemOn]}
                    onPress={() => setSavingsMode(mode)}>
                    <Text style={[styles.segText, savingsMode === mode && styles.segTextOn]}>{mode === 'deposit' ? 'Deposit' : 'Withdraw'}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {/* ── Saved wallet list ── */}
            {kind === 'transfer' && savedOpen ? (
              saved.length ? (
                <View style={styles.savedList}>
                  {saved.map(item => (
                    <View key={item.name} style={styles.savedChip}>
                      <Pressable style={styles.savedCopy} onPress={() => openSaved(item)}>
                        <Text style={styles.chipText} numberOfLines={1}>{item.name}</Text>
                        {item.memo ? <Text style={styles.savedMemo} numberOfLines={1}>{item.memo}</Text> : null}
                      </Pressable>
                      <Pressable hitSlop={8} onPress={() => setMenuFor(item)} accessibilityLabel={`Options for ${item.name}`}>
                        <Text style={styles.savedMore}>⋮</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : <Text style={styles.note}>No saved wallets.</Text>
            ) : null}

            {/* ── Recipient card (transfer only) ── */}
            {kind === 'transfer' && !savedOpen ? (
              <View style={styles.fieldCard}>
                <View style={styles.memoHeader}>
                  <View style={styles.fieldCardHeader}>
                    <AccountAvatar name={receiverName} size={32} />
                    <Text style={styles.fieldLabel}>Recipient</Text>
                  </View>
                  <View style={styles.suffixIcons}>
                    <Pressable style={styles.suffixBtn} onPress={() => pasteInto(setTo)} accessibilityLabel="Paste">
                      <PasteMark size={15} />
                    </Pressable>
                    <Pressable style={styles.suffixBtn} onPress={() => openScan('to')} accessibilityLabel="Scan QR">
                      <QrMark size={13} />
                    </Pressable>
                  </View>
                </View>
                <TextInput
                  style={[styles.input, styles.inputFlex]}
                  value={to}
                  onChangeText={setTo}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="@username"
                  placeholderTextColor={colors.muted}
                />
              </View>
            ) : null}

            {/* ── Delegate tab bar ── */}
            {kind === 'delegate' ? (
              <View style={styles.segBar}>
                <Pressable
                  style={[styles.segItem, styles.segItemFirst, delegateTab === 'form' && styles.segItemOn]}
                  onPress={() => setDelegateTab('form')}>
                  <Text style={[styles.segText, delegateTab === 'form' && styles.segTextOn]}>Delegate</Text>
                </Pressable>
                <Pressable
                  style={[styles.segItem, styles.segItemLast, delegateTab === 'outgoing' && styles.segItemOn]}
                  onPress={() => setDelegateTab('outgoing')}>
                  <Text style={[styles.segText, delegateTab === 'outgoing' && styles.segTextOn]}>Outgoing</Text>
                </Pressable>
              </View>
            ) : null}

            {/* ── Recipient input for delegate / powerUp / savings withdraw ── */}
            {kind === 'transfer' && savedOpen ? null : kind === 'delegate' && delegateTab === 'outgoing' ? null : kind === 'delegate' && delegateTab === 'form' ? (
              <View style={styles.fieldCard}>
                <View style={styles.memoHeader}>
                  <View style={styles.fieldCardHeader}>
                    <AccountAvatar name={to.trim().replace(/^@/, '').toLowerCase()} size={32} />
                    <Text style={styles.fieldLabel}>Delegate to</Text>
                  </View>
                  <View style={styles.suffixIcons}>
                    <Pressable style={styles.suffixBtn} onPress={() => pasteInto(setTo)} accessibilityLabel="Paste">
                      <PasteMark size={15} />
                    </Pressable>
                  </View>
                </View>
                <TextInput
                  style={[styles.input, styles.inputFlex]}
                  value={to}
                  onChangeText={setTo}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="@username"
                  placeholderTextColor={colors.muted}
                />
              </View>
            ) : (kind === 'savings' && savingsMode === 'withdraw') || kind === 'powerUp' ? (
              <View style={styles.toRow}>
                <TextInput
                  style={[styles.input, styles.toInput]}
                  value={to}
                  onChangeText={setTo}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={kind === 'powerUp' ? 'Power up to (optional)' : 'To'}
                  placeholderTextColor={colors.muted}
                />
                <PasteButton onPress={() => pasteInto(setTo)} />
              </View>
            ) : null}

            {/* ── Delegate outgoing list ── */}
            {kind === 'delegate' && delegateTab === 'outgoing' ? (
              outgoing.length === 0 ? (
                <Text style={styles.note}>No outgoing delegations.</Text>
              ) : (
                <View style={styles.savedList}>
                  <View style={styles.delSearchRow}>
                    <Text style={styles.delSearchIcon}>🔍</Text>
                    <TextInput
                      style={styles.delSearchInput}
                      value={delSearch}
                      onChangeText={setDelSearch}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder="Search delegatee…"
                      placeholderTextColor={colors.muted}
                    />
                    {delSearch.length > 0 ? (
                      <Pressable onPress={() => setDelSearch('')} style={styles.delSearchClear}>
                        <Text style={styles.delSearchClearText}>✕</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {outgoing
                    .filter(row => row.account.toLowerCase().includes(delSearch.toLowerCase()))
                    .map(row => (
                      <View key={row.account} style={styles.delegationRow}>
                        <AccountAvatar name={row.account} size={32} />
                        <View style={styles.delegationCopy}>
                          <Text style={styles.delegationName}>@{row.account}</Text>
                          <Text style={styles.delegationSp}>{row.sp} SP</Text>
                        </View>
                        <Pressable
                          hitSlop={8}
                          style={styles.delEditBtn}
                          onPress={() => {
                            setTo(row.account);
                            setAmount(row.sp);
                            setDelegateTab('form');
                            setDelMenuFor(null);
                          }}
                          accessibilityLabel={`Edit delegation to ${row.account}`}>
                          <EditIcon />
                        </Pressable>
                      </View>
                    ))}
                  {outgoing.filter(row => row.account.toLowerCase().includes(delSearch.toLowerCase())).length === 0 ? (
                    <Text style={styles.note}>No results for "{delSearch}".</Text>
                  ) : null}
                </View>
              )
            ) : null}

            {/* ── Amount card ── */}
            {kind === 'transfer' && savedOpen ? null : kind === 'delegate' && delegateTab === 'outgoing' ? null : (
              <View style={styles.fieldCard}>
                <View style={styles.amountHeader}>
                  <Text style={styles.fieldLabel}>Amount</Text>
                  {available !== null ? (
                    <Pressable onPress={() => setAmount(available)} accessibilityLabel={`Use max ${available}`}>
                      <View style={styles.maxBadge}>
                        <Text style={styles.maxText}>MAX</Text>
                      </View>
                    </Pressable>
                  ) : null}
                </View>
                <TextInput
                  style={[styles.input, styles.inputFlex]}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder={amountLabel(kind)}
                  placeholderTextColor={colors.muted}
                />
                {available !== null ? (
                  <Text style={styles.helperText}>Available  {available} {availableLabel}</Text>
                ) : null}
              </View>
            )}

            {/* ── Memo card (transfer / savings) ── */}
            {kind === 'transfer' && savedOpen ? null : kind === 'transfer' || kind === 'savings' ? (
              <View style={styles.fieldCard}>
                <View style={styles.memoHeader}>
                  <Text style={styles.fieldLabel}>Memo <Text style={styles.fieldLabelSub}>(optional)</Text></Text>
                  <View style={styles.suffixIcons}>
                    <Pressable style={styles.suffixBtn} onPress={() => pasteInto(setMemo)} accessibilityLabel="Paste memo">
                      <PasteMark size={15} />
                    </Pressable>
                    {kind === 'transfer' ? (
                      <Pressable style={styles.suffixBtn} onPress={() => openScan('memo')} accessibilityLabel="Scan memo QR">
                        <QrMark size={13} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                <TextInput
                  style={[styles.input, styles.inputFlex, styles.memoInput]}
                  value={memo}
                  onChangeText={setMemo}
                  placeholder="Start with # to encrypt"
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={2}
                />
              </View>
            ) : null}
          </>
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
        {kind === 'convert' ? (
          <View>
            <Text style={styles.section}>Ongoing conversions</Text>
            {conversions.length === 0 ? (
              <Text style={styles.note}>No conversions in progress.</Text>
            ) : conversions.map(row => (
              <View key={row.requestId} style={styles.pending}>
                <View style={styles.convertRow}>
                  <Text style={styles.convertAmount}>{row.amount}</Text>
                  <View style={styles.convertBadge}>
                    <Text style={styles.convertBadgeText}>~3.5 days</Text>
                  </View>
                </View>
                <Text style={styles.note}>Completes {row.complete.replace('T', ' ').slice(0, 16)}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {error && !confirming && !savedOpen ? <Text style={styles.error}>{error}</Text> : null}
        {kind === 'transfer' && savedOpen ? null : kind === 'delegate' && delegateTab === 'outgoing' ? null : (
        <View style={styles.actionRow}>
          {kind === 'transfer' ? (
            <Pressable style={[styles.secondary, styles.actionGrow]} onPress={keepRecipient}>
              <Text style={styles.secondaryText}>Save</Text>
            </Pressable>
          ) : null}
          <Pressable style={[styles.primary, styles.actionGrow]} onPress={prepare}>
            <Text style={styles.primaryText}>{kind === 'claim' ? 'Claim' : 'Review'}</Text>
          </Pressable>
        </View>
        )}
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
      {menuFor ? (
        <View style={styles.menuBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuFor(null)} />
          <View style={styles.menuSheet}>
            <Text style={styles.menuTitle} numberOfLines={1}>{menuFor.name}</Text>
            <Pressable style={styles.menuRow} onPress={() => openSaved(menuFor, 'SBD')}>
              <Text style={styles.menuText}>Send SBD</Text>
            </Pressable>
            <Pressable style={styles.menuRow} onPress={() => openSaved(menuFor, 'STEEM')}>
              <Text style={styles.menuText}>Send STEEM</Text>
            </Pressable>
            <Pressable style={styles.menuRow} onPress={() => editSaved(menuFor)}>
              <Text style={styles.menuText}>Edit</Text>
            </Pressable>
            <Pressable style={styles.menuRow} onPress={() => { removeRecipient(menuFor.name).then(setSaved); setMenuFor(null); }}>
              <Text style={styles.menuDanger}>Delete</Text>
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
    <Pressable style={styles.qrButton} onPress={onPress} accessibilityLabel="Paste">
      <PasteMark />
    </Pressable>
  );
}

function PasteMark({size = 16}: {size?: number}) {
  const colors = useColors();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M9 3h6a1 1 0 0 1 1 1v2H8V4a1 1 0 0 1 1-1z"
        fill="none"
        stroke={colors.accentDeep}
        strokeWidth={1.8}
      />
      <Path
        d="M8 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
        fill="none"
        stroke={colors.accentDeep}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function QrMark({size = 12}: {size?: number}) {
  const colors = useColors();
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
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

function EditIcon({size = 15}: {size?: number}) {
  const colors = useColors();
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path
        d="M14.5 2.5a2.121 2.121 0 0 1 3 3L6 17H3v-3L14.5 2.5z"
        stroke={colors.accentDeep}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
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

function availableUnit(kind: Kind, currency: 'STEEM' | 'SBD', savingsMode: 'deposit' | 'withdraw') {
  if (kind === 'powerDown' || kind === 'delegate') return 'SP';
  if (kind === 'convert' || kind === 'powerUp') return kind === 'convert' ? 'SBD' : 'STEEM';
  if (kind === 'savings' && savingsMode === 'withdraw') return currency;
  return currency;
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
  content: {padding: 16, paddingBottom: 32, gap: 12},
  note: {color: c.muted, lineHeight: 21, marginBottom: 8},
  section: {color: c.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 18, marginBottom: 8},

  /* ── Segmented control ── */
  segBar: {flexDirection: 'row', backgroundColor: c.card, borderRadius: 12, padding: 3, marginBottom: 4},
  segItem: {flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10},
  segItemFirst: {borderTopLeftRadius: 10, borderBottomLeftRadius: 10},
  segItemLast: {borderTopRightRadius: 10, borderBottomRightRadius: 10},
  segItemOn: {backgroundColor: c.accentSoft},
  segText: {color: c.muted, fontWeight: '600', fontSize: 13},
  segTextOn: {color: c.accentDeep, fontWeight: '700'},

  /* ── Field cards ── */
  fieldCard: {backgroundColor: c.card, borderRadius: 16, padding: 14, gap: 8},
  fieldCardHeader: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2},
  fieldLabel: {color: c.text, fontWeight: '700', fontSize: 13},
  fieldLabelSub: {color: c.muted, fontWeight: '400', fontSize: 12},
  amountHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  memoHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  maxBadge: {backgroundColor: c.accentSoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4},
  maxText: {color: c.accentDeep, fontWeight: '700', fontSize: 12},
  helperText: {color: c.muted, fontSize: 12, marginTop: -4},

  /* ── Inputs ── */
  input: {backgroundColor: c.background, color: c.text, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15},
  inputFlex: {flex: 1},
  memoInput: {minHeight: 56, textAlignVertical: 'top'},

  /* ── Suffix icons inside field cards ── */
  inputSuffixRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  suffixIcons: {flexDirection: 'row', gap: 6},
  suffixBtn: {width: 32, height: 32, borderRadius: 8, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center'},

  /* ── To row (delegate / powerUp / savings-withdraw — unchanged layout) ── */
  toRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 0},
  toInput: {flex: 1, marginBottom: 0, backgroundColor: c.card},
  qrButton: {width: 40, height: 40, borderRadius: 12, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center'},

  /* ── Saved wallets ── */
  chips: {flexDirection: 'row', gap: 8, marginBottom: 0},
  chip: {backgroundColor: c.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8},
  chipOn: {backgroundColor: c.accentSoft},
  chipText: {color: c.text, fontWeight: '600'},
  savedList: {gap: 8, marginBottom: 0},
  savedChip: {flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card, borderRadius: 14, paddingLeft: 12, paddingRight: 8, paddingVertical: 8},
  savedCopy: {flex: 1},
  savedMemo: {color: c.muted, fontSize: 12, marginTop: 2},
  savedMore: {color: c.text, fontSize: 22, fontWeight: '700', paddingHorizontal: 6, lineHeight: 24},

  /* ── Bottom sheet menu ── */
  menuBackdrop: {...StyleSheet.absoluteFill, backgroundColor: 'rgba(5,8,14,0.55)', justifyContent: 'flex-end'},
  menuSheet: {backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24},
  menuTitle: {color: c.text, fontSize: 16, fontWeight: '800', marginBottom: 8},
  menuRow: {paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line},
  menuText: {color: c.text, fontSize: 16, fontWeight: '700'},
  menuDanger: {color: c.danger, fontSize: 16, fontWeight: '700'},

  /* ── Action bar ── */
  actionRow: {flexDirection: 'row', gap: 8, marginTop: 4},
  actionGrow: {flex: 1},
  secondary: {backgroundColor: c.card, borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.line},
  secondaryText: {color: c.text, fontWeight: '700', fontSize: 15},
  primary: {backgroundColor: c.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center'},
  primaryText: {color: c.onAccent, fontWeight: '700', fontSize: 15},

  /* ── Error ── */
  error: {color: c.danger, fontSize: 14},

  /* ── Delegation list rows ── */
  delegationRow: {flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.card, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10},
  delegationCopy: {flex: 1},
  delegationName: {color: c.text, fontSize: 14, fontWeight: '700'},
  delegationSp: {color: c.accentDeep, fontSize: 12, fontWeight: '600', marginTop: 2},
  delEditBtn: {width: 32, height: 32, borderRadius: 8, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center'},
  delMenu: {position: 'absolute', right: 36, top: 4, backgroundColor: c.card, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, zIndex: 10, minWidth: 160, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: {width: 0, height: 2}, elevation: 6},
  delMenuItem: {paddingHorizontal: 14, paddingVertical: 12},
  delMenuText: {color: c.text, fontSize: 14, fontWeight: '600'},
  delSearchRow: {flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8, gap: 6},
  delSearchIcon: {fontSize: 13},
  delSearchInput: {flex: 1, color: c.text, fontSize: 14, paddingVertical: 2},
  delSearchClear: {padding: 4},
  delSearchClearText: {color: c.muted, fontSize: 12, fontWeight: '700'},

  /* ── Pending withdrawals ── */
  pending: {backgroundColor: c.card, borderRadius: 16, padding: 14, marginBottom: 8},
  convertRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4},
  convertAmount: {color: c.text, fontSize: 15, fontWeight: '700'},
  convertBadge: {backgroundColor: c.accentSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3},
  convertBadgeText: {color: c.accentDeep, fontSize: 11, fontWeight: '700'},

  /* ── Scanner ── */
  scanScreen: {flex: 1, backgroundColor: c.background, padding: 16, paddingTop: 48},
  scanLead: {color: c.muted, textAlign: 'center', marginBottom: 14, lineHeight: 20},
  cameraWrap: {flex: 1, borderRadius: 16, overflow: 'hidden', marginBottom: 14},
  camera: {flex: 1},
  scanClose: {backgroundColor: c.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center'},

  /* ── Success overlay ── */
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

  /* ── Available (non-transfer) ── */
  availableRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8},
  availableLabel: {color: c.muted, fontSize: 14},
  availableAmount: {color: c.text, fontSize: 14, fontWeight: '700'},

  /* ── Legacy icon helpers (delegate/powerUp/savings rows) ── */
  iconGroup: {flexDirection: 'row', gap: 4},
  iconBtn: {width: 30, height: 30, borderRadius: 8, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center'},
});
}
