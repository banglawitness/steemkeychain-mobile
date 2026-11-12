import AsyncStorage from '@react-native-async-storage/async-storage';
import {BlurView} from 'expo-blur';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {useVault} from '../auth/VaultContext';
import AccountDrawer from '../components/AccountDrawer';
import BottomBar from '../components/BottomBar';
import SteemLogo, {SbdLogo, SpLogo} from '../components/SteemLogo';
import {RootStackParamList} from '../navigation/RootNavigator';
import {unseenCount} from '../storage/notices';
import {loadBalances} from '../steem/client';
import {loadPrices, money, Prices} from '../steem/price';
import {Palette, useColors, useTheme, useThemedStyles} from '../theme';
import {Balances} from '../types';

type OpenRow = 'STEEM' | 'SBD' | 'SP' | null;

const HIDE_BALANCES_KEY = 'steem.wallet.hideBalances';
let hideBalancesCache: boolean | null = null;

export default function WalletScreen() {
  const colors = useColors();
  const {mode} = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const {accounts, activeName, selectAccount} = useVault();
  const [balances, setBalances] = useState<Balances | null>(null);
  const [prices, setPrices] = useState<Prices | null>(null);
  const [badge, setBadge] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [picker, setPicker] = useState(false);
  const [open, setOpen] = useState<OpenRow>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState(hideBalancesCache === true);
  const [hideReady, setHideReady] = useState(hideBalancesCache !== null);

  const refresh = useCallback(async (silent = false) => {
    if (!activeName) {
      setBalances(null);
      return;
    }
    if (!silent) setLoading(true);
    setError('');
    try {
      setBalances(await loadBalances(activeName));
    } catch (cause) {
      setBalances(null);
      setError(cause instanceof Error ? cause.message : 'Could not load balances.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activeName]);

  useEffect(() => {
    loadPrices().then(setPrices).catch(() => setPrices(null));
  }, [activeName]);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(HIDE_BALANCES_KEY).then(value => {
      const next = value === '1';
      hideBalancesCache = next;
      if (!alive) return;
      setHidden(next);
      setHideReady(true);
    }).catch(() => {
      if (alive) setHideReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useFocusEffect(useCallback(() => {
    let alive = true;
    unseenCount().then(count => { if (alive) setBadge(count); }).catch(() => undefined);
    refresh();
    const later = setTimeout(() => {
      if (alive) refresh(true);
    }, 4000);
    return () => {
      alive = false;
      clearTimeout(later);
    };
  }, [refresh]));

  const go = (kind: RootStackParamList['Operate']['kind']) => navigation.navigate('Operate', {kind});
  const ready = Boolean(activeName);
  const total = totalUsd(balances, prices);
  const totalMove = portfolioChange(balances, prices);
  const concealed = !hideReady || hidden;
  const mask = (value: string) => (concealed ? '*****' : value);
  const toggleHidden = () => {
    if (!hideReady) return;
    setHidden(value => {
      const next = !value;
      hideBalancesCache = next;
      AsyncStorage.setItem(HIDE_BALANCES_KEY, next ? '1' : '0').catch(() => undefined);
      return next;
    });
  };

  return (
    <View style={styles.screen}>
    <SafeAreaView style={styles.body} edges={['top']}>
      <View style={styles.header}>
          <Pressable style={styles.iconButton} onPress={() => setDrawer(true)}>
            <Text style={styles.iconText}>☰</Text>
          </Pressable>
          <View style={styles.identity}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{activeName || 'No account'}</Text>
              {accounts.length > 1 ? (
                <Pressable style={styles.caret} onPress={() => setPicker(value => !value)} accessibilityLabel="Switch account">
                  <CaretMark open={picker} color={colors.accent} />
                </Pressable>
              ) : null}
            </View>
          </View>
          <Pressable style={styles.iconButton} onPress={() => navigation.navigate('Scan')} accessibilityLabel="Scan QR code">
            <ScanMark />
          </Pressable>
          <Pressable style={styles.iconButton} onPress={() => navigation.navigate('Activity')} accessibilityLabel="Notifications">
            <ActivityMark />
            {badge ? <Text style={styles.headerBadge}>{badge > 9 ? '9+' : badge}</Text> : null}
          </Pressable>
      </View>
      <View style={styles.body}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, {paddingBottom: insets.bottom + 92}]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} />}>

        <View style={styles.hero}>
          <View style={styles.valueHead}>
            <Text style={styles.totalLabel}>Estimated value</Text>
            <Text style={[styles.priceArrow, totalMove > 0 && styles.priceUp, totalMove < 0 && styles.priceDown]}>
              {totalMove > 0 ? '▲' : totalMove < 0 ? '▼' : '–'}
            </Text>
            <View style={styles.valueSpacer} />
            <Pressable
              style={styles.eyeButton}
              onPress={toggleHidden}
              accessibilityLabel={concealed ? 'Show balances' : 'Hide balances'}>
              <EyeMark hidden={concealed} color={colors.muted} />
            </Pressable>
          </View>
          <Text style={styles.total} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.45}>{mask(total || '—')}</Text>
          <View style={styles.stats}>
            <Stat
              label="VP"
              value={balances?.votingMana ? `${balances.votingMana}%` : '—'}
              note="Vote value"
              noteValue={mask(balances?.voteValue ? `$${balances.voteValue}` : '—')}
            />
            <View style={styles.statSplit} />
            <Stat
              label="RC"
              value={balances?.rc ? `${balances.rc}%` : '—'}
              note="RC value"
              noteValue={balances?.rcAmount || '—'}
            />
          </View>
          <View style={styles.priceRow}>
            <PriceLine name="STEEM" amount={prices?.steemUsd} change={prices?.steemChange} />
            <PriceLine name="SBD" amount={prices?.sbdUsd} change={prices?.sbdChange} />
          </View>
        </View>

        {accounts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No account yet</Text>
            <Text style={styles.empty}>Add a key, scan a QR code, or import from Steem Keychain.</Text>
          </View>
        ) : null}

        <BalanceRow
          logo={<SteemLogo size={36} />}
          title="STEEM"
          hint="Liquid"
          hintGreen
          amount={mask(balances?.steem ?? '—')}
          usd={mask(money(valueOf(balances?.steem, prices?.steemUsd)))}
          extra={balances ? `Savings ${mask(balances.savingsSteem)}` : undefined}
          open={open === 'STEEM'}
          onPress={() => setOpen(current => current === 'STEEM' ? null : 'STEEM')}
          actions={[
            {label: 'Send', disabled: !ready, onPress: () => go('transfer')},
            {label: 'Receive', disabled: !ready, onPress: () => navigation.navigate('Receive')},
            {label: 'Power up', disabled: !ready, onPress: () => go('powerUp')},
            {label: 'Savings', disabled: !ready, onPress: () => go('savings')},
          ]}
        />
        <BalanceRow
          logo={<SbdLogo size={36} />}
          title="SBD"
          hint="Steem Dollars"
          amount={mask(balances?.sbd ?? '—')}
          usd={mask(money(valueOf(balances?.sbd, prices?.sbdUsd)))}
          extra={balances ? `Savings ${mask(balances.savingsSbd)}` : undefined}
          open={open === 'SBD'}
          onPress={() => setOpen(current => current === 'SBD' ? null : 'SBD')}
          actions={[
            {label: 'Send', disabled: !ready, onPress: () => go('transfer')},
            {label: 'Receive', disabled: !ready, onPress: () => navigation.navigate('Receive')},
            {label: 'Convert', disabled: !ready, onPress: () => go('convert')},
            {label: 'Savings', disabled: !ready, onPress: () => go('savings')},
          ]}
        />
        <BalanceRow
          logo={<SpLogo size={36} />}
          title="SP"
          hint="Voting"
          hintGreen
          below="Steem Power"
          amount={mask(balances?.sp ?? '—')}
          usd={mask(money(valueOf(balances?.sp, prices?.steemUsd)))}
          open={open === 'SP'}
          onPress={() => setOpen(current => current === 'SP' ? null : 'SP')}
          actions={[
            {label: 'Delegate', disabled: !ready, onPress: () => go('delegate')},
            {label: 'Power down', disabled: !ready, onPress: () => go('powerDown')},
            {label: 'Power up', disabled: !ready, onPress: () => go('powerUp')},
          ]}
        />

        {hasRewards(balances) ? (
          <Pressable style={styles.claim} onPress={() => go('claim')}>
            <View style={styles.claimCopy}>
              <Text style={styles.claimTitle}>Rewards ready</Text>
              <Text style={styles.claimText}>
                {mask(`${balances?.rewardSteem} STEEM · ${balances?.rewardSbd} SBD · ${balances?.rewardSp} SP`)}
              </Text>
            </View>
            <Text style={styles.claimAction}>Claim</Text>
          </Pressable>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={[styles.historyCard, !ready && styles.disabled]} disabled={!ready} onPress={() => navigation.navigate('History')}>
          <View style={styles.historyIcon}><HistoryMark /></View>
          <View style={styles.historyCopy}>
            <Text style={styles.shortcutTitle} numberOfLines={1}>History</Text>
            <Text style={styles.historyHint} numberOfLines={1}>Transfers and rewards</Text>
          </View>
        </Pressable>
      </ScrollView>
      <View style={[styles.floatBar, {bottom: insets.bottom + 12}]} pointerEvents="box-none">
        <BottomBar current="Wallet" />
      </View>
      {picker && accounts.length > 1 ? (
        <View style={styles.pickerLayer}>
          <BlurView intensity={46} tint={mode === 'light' ? 'light' : 'dark'} experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPicker(false)} accessibilityLabel="Close account list" />
          <View style={styles.picker}>
            <Text style={styles.pickerLabel}>Switch account</Text>
            <ScrollView style={styles.pickerScroll} bounces={false} keyboardShouldPersistTaps="handled">
              {accounts.map(account => {
                const current = account.name === activeName;
                return (
                  <Pressable
                    key={account.name}
                    style={[styles.pickerRow, current && styles.pickerOn]}
                    onPress={() => { selectAccount(account.name); setPicker(false); }}>
                    <View style={[styles.pickerAvatar, current && styles.pickerAvatarOn]}>
                      <Text style={[styles.pickerAvatarText, current && styles.pickerAvatarTextOn]}>{account.name.slice(0, 1).toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.pickerText, current && styles.pickerTextOn]} numberOfLines={1}>{account.name}</Text>
                    <Text style={styles.pickerMark}>{current ? '✓' : ''}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      ) : null}
      </View>
    </SafeAreaView>
    <AccountDrawer open={drawer} onClose={() => setDrawer(false)} />
    </View>
  );
}

function Stat({label, value, note, noteValue}: {label: string; value: string; note: string; noteValue: string}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
      <Text style={styles.statNote}>{note}</Text>
      <Text style={styles.statNoteValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{noteValue}</Text>
    </View>
  );
}

function PriceLine({name, amount, change}: {name: string; amount?: number; change?: number}) {
  const styles = useThemedStyles(makeStyles);
  const up = change !== undefined && change > 0;
  const down = change !== undefined && change < 0;
  return (
    <View style={styles.priceLine}>
      <Text style={styles.priceName}>{name}</Text>
      <Text style={styles.priceText}>{amount !== undefined ? money(amount) : '—'}</Text>
      <Text style={[styles.priceArrow, up && styles.priceUp, down && styles.priceDown]}>{up ? '▲' : down ? '▼' : '–'}</Text>
    </View>
  );
}

function EyeMark({hidden, color}: {hidden: boolean; color: string}) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" stroke={color} strokeWidth={2} />
      {hidden ? <Path d="M4 5l16 14" stroke={color} strokeWidth={2} strokeLinecap="round" /> : null}
    </Svg>
  );
}

function CaretMark({open, color}: {open: boolean; color: string}) {
  return (
    <Svg width={18} height={8} viewBox="0 0 18 8">
      <Path d={open ? 'M1 6.5 L9 1.5 L17 6.5' : 'M1 1.5 L9 6.5 L17 1.5'} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function HistoryMark() {
  const colors = useColors();
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 7v5l3 2" stroke={colors.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 21a9 9 0 1 0-7.5-4" stroke={colors.accent} strokeWidth={2} strokeLinecap="round" />
      <Path d="M4 16v4h4" stroke={colors.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ActivityMark() {
  const colors = useColors();
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M6 16h12l-1.3-2.1V10a4.7 4.7 0 0 0-9.4 0v3.9L6 16z" stroke={colors.text} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M10 16.5a2 2 0 0 0 4 0" stroke={colors.text} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function ScanMark() {
  const colors = useColors();
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M4 8V5h3M16 5h3v3M19 16v3h-3M8 19H5v-3" stroke={colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M7 12h10" stroke={colors.text} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function hasRewards(balances: Balances | null) {
  if (!balances) return false;
  return Number(balances.rewardSteem) > 0 || Number(balances.rewardSbd) > 0 || Number(balances.rewardSp) > 0;
}

function valueOf(amount?: string, price?: number) {
  if (!amount || price === undefined) return undefined;
  const value = Number(amount) * price;
  return Number.isFinite(value) ? value : undefined;
}

function portfolioChange(balances: Balances | null, prices: Prices | null) {
  if (!balances || prices?.steemUsd === undefined) return 0;
  const steemAmount = Number(balances.steem) + Number(balances.savingsSteem) + Number(balances.sp);
  const sbdAmount = Number(balances.sbd) + Number(balances.savingsSbd);
  const steemValue = steemAmount * prices.steemUsd;
  const sbdValue = sbdAmount * (prices.sbdUsd || 0);
  const total = steemValue + sbdValue;
  if (!total) return 0;
  return (steemValue * (prices.steemChange || 0) + sbdValue * (prices.sbdChange || 0)) / total;
}

function totalUsd(balances: Balances | null, prices: Prices | null) {
  if (!balances || !prices?.steemUsd) return '';
  const steem = Number(balances.steem) + Number(balances.savingsSteem) + Number(balances.sp);
  const sbd = (Number(balances.sbd) + Number(balances.savingsSbd)) * (prices.sbdUsd || 0);
  const total = steem * prices.steemUsd + sbd;
  return Number.isFinite(total) ? money(total) : '';
}

function BalanceRow({
  logo,
  title,
  hint,
  hintGreen,
  below,
  amount,
  usd,
  extra,
  open,
  onPress,
  actions,
}: {
  logo: React.ReactNode;
  title: string;
  hint: string;
  hintGreen?: boolean;
  below?: string;
  amount: string;
  usd?: string;
  extra?: string;
  open: boolean;
  onPress: () => void;
  actions: {label: string; onPress: () => void; disabled?: boolean}[];
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.token}>
      <Pressable style={styles.tokenMain} onPress={onPress}>
        {logo}
        <View style={styles.tokenCopy}>
          <View style={styles.titleRow}>
            <Text style={styles.tokenTitle} numberOfLines={1}>{title}</Text>
            <Text style={[styles.tokenHint, hintGreen && styles.tokenHintGreen]} numberOfLines={1}>{hint}</Text>
          </View>
          {below ? <Text style={styles.tokenBelow} numberOfLines={1}>{below}</Text> : null}
          {extra ? <Text style={styles.tokenExtra} numberOfLines={1}>{extra}</Text> : null}
        </View>
        <View style={styles.tokenValues}>
          <Text style={styles.tokenAmount} numberOfLines={1}>{amount}</Text>
          {usd ? <Text style={styles.tokenUsd}>{usd}</Text> : null}
        </View>
        <Text style={styles.chevron}>{open ? '▾' : '›'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.actions}>
          {actions.map(action => (
            <Pressable key={action.label} style={[styles.action, action.disabled && styles.disabled]} disabled={action.disabled} onPress={action.onPress}>
              <Text style={styles.actionText} numberOfLines={1}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
  screen: {flex: 1, backgroundColor: c.background},
  scroll: {flex: 1},
  body: {flex: 1},
  content: {paddingHorizontal: 14, paddingTop: 4, paddingBottom: 18},
  header: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10, backgroundColor: c.background},
  iconButton: {backgroundColor: c.card, borderRadius: 12, width: 40, height: 40, alignItems: 'center', justifyContent: 'center'},
  headerBadge: {position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, overflow: 'hidden', backgroundColor: c.accent, color: c.onAccent, fontSize: 9, fontWeight: '800', textAlign: 'center', lineHeight: 16, paddingHorizontal: 3},
  iconText: {color: c.accentDeep, fontSize: 12, fontWeight: '700'},
  identity: {flex: 1},
  nameRow: {flexDirection: 'row', alignItems: 'center', gap: 4},
  name: {color: c.text, fontSize: 15, fontWeight: '700', flexShrink: 1},
  caret: {width: 28, height: 18, alignItems: 'center', justifyContent: 'center'},
  pickerLayer: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20},
  picker: {marginHorizontal: 16, marginTop: 10, maxHeight: '72%', backgroundColor: c.card, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, padding: 10},
  pickerScroll: {flexGrow: 0},
  pickerLabel: {color: c.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginLeft: 8, marginBottom: 8, marginTop: 4},
  pickerRow: {flexDirection: 'row', alignItems: 'center', borderRadius: 16, paddingVertical: 11, paddingHorizontal: 10, gap: 12},
  pickerOn: {backgroundColor: c.accentSoft},
  pickerAvatar: {width: 36, height: 36, borderRadius: 18, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center'},
  pickerAvatarOn: {backgroundColor: c.accent},
  pickerAvatarText: {color: c.text, fontSize: 15, fontWeight: '800'},
  pickerAvatarTextOn: {color: c.onAccent},
  pickerText: {flex: 1, color: c.text, fontSize: 17, fontWeight: '700'},
  pickerTextOn: {color: c.accentDeep},
  pickerMark: {color: c.accent, fontSize: 18, fontWeight: '800', width: 20, textAlign: 'center'},
  hero: {backgroundColor: c.card, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, marginBottom: 10},
  valueHead: {flexDirection: 'row', alignItems: 'center', gap: 6},
  valueSpacer: {flex: 1},
  eyeButton: {width: 28, height: 28, alignItems: 'center', justifyContent: 'center'},
  totalLabel: {color: c.muted, fontSize: 12, fontWeight: '700'},
  total: {color: c.text, fontSize: 34, fontWeight: '900', marginTop: 2},
  stats: {flexDirection: 'row', alignItems: 'stretch', marginTop: 12},
  stat: {flex: 1},
  statSplit: {width: StyleSheet.hairlineWidth, backgroundColor: c.line, marginHorizontal: 14},
  statLabel: {color: c.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8},
  statValue: {color: c.text, fontSize: 22, fontWeight: '800', marginTop: 2},
  statNote: {color: c.muted, fontSize: 11, fontWeight: '600', marginTop: 8},
  statNoteValue: {color: c.text, fontSize: 14, fontWeight: '700', marginTop: 1},
  priceRow: {flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line},
  priceLine: {flexDirection: 'row', alignItems: 'center', gap: 6},
  priceName: {color: c.muted, fontSize: 12, fontWeight: '700', width: 48},
  priceText: {color: c.text, fontSize: 14, fontWeight: '800'},
  priceArrow: {fontSize: 11, fontWeight: '800', color: c.muted, width: 12},
  priceUp: {color: '#2fbf5a'},
  priceDown: {color: c.danger},
  floatBar: {position: 'absolute', left: 0, right: 0, alignItems: 'center'},
  emptyCard: {backgroundColor: c.card, borderRadius: 6, padding: 12, marginBottom: 8},
  emptyTitle: {color: c.text, fontSize: 15, fontWeight: '700', marginBottom: 4},
  empty: {color: c.muted, fontSize: 13, lineHeight: 18},
  token: {backgroundColor: c.card, borderRadius: 8, marginBottom: 8, overflow: 'hidden'},
  tokenMain: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 13, gap: 10},
  tokenCopy: {flex: 1},
  titleRow: {flexDirection: 'row', alignItems: 'baseline', gap: 6},
  tokenTitle: {color: c.text, fontSize: 15, fontWeight: '800'},
  tokenHint: {color: c.muted, fontSize: 12, fontWeight: '600', flexShrink: 1},
  tokenHintGreen: {color: '#2fbf5a'},
  tokenBelow: {color: c.muted, fontSize: 11, marginTop: 1},
  tokenExtra: {color: c.accentDeep, marginTop: 2, fontSize: 11},
  tokenValues: {alignItems: 'flex-end'},
  tokenAmount: {color: c.text, fontSize: 16, fontWeight: '800'},
  tokenUsd: {color: c.muted, marginTop: 2, fontSize: 11},
  actions: {flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingBottom: 8},
  action: {flex: 1, alignItems: 'center', backgroundColor: c.accentSoft, borderRadius: 0, paddingHorizontal: 2, paddingVertical: 8},
  actionText: {color: c.accentDeep, fontSize: 11, fontWeight: '700'},
  claim: {backgroundColor: c.card, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 8},
  claimCopy: {flex: 1},
  claimTitle: {color: c.text, fontSize: 13, fontWeight: '700', marginBottom: 2},
  claimText: {color: c.muted, fontSize: 12},
  claimAction: {color: c.accent, fontSize: 13, fontWeight: '800'},
  error: {color: c.danger, marginBottom: 8, fontSize: 12},
  historyCard: {flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.card, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginTop: 6},
  historyIcon: {width: 40, height: 40, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center'},
  historyCopy: {flex: 1},
  historyHint: {color: c.muted, fontSize: 12, fontWeight: '600', marginTop: 1},
  shortcutTitle: {color: c.text, fontSize: 16, fontWeight: '800'},
  chevron: {color: c.muted, fontSize: 18, lineHeight: 18},
  disabled: {opacity: 0.4},
});
}
