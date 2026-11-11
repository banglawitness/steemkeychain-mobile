import {useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {useVault} from '../auth/VaultContext';
import {executeRequest, failureMessage} from '../browser/requests';
import ConfirmSheet from '../components/ConfirmSheet';
import {APP_VERSION} from '../config';
import {NoticePrefs, readNoticePrefs, writeNoticePrefs} from '../storage/notices';
import {readAutoLock, writeAutoLock} from '../storage/security';
import {biometricEnabled} from '../storage/vault';
import {addCustomRpc, customRpcs, measureRpc, rpcChoices, savedRpc, selectRpc} from '../steem/rpc';
import {Palette, useColors, useTheme, useThemedStyles} from '../theme';

const LOCK_CHOICES = [
  {label: 'Now', value: 0},
  {label: '1 min', value: 60},
  {label: '5 min', value: 300},
  {label: 'Never', value: -1},
];

const NOTICES: {key: keyof NoticePrefs; label: string}[] = [
  {key: 'vote', label: 'Votes'},
  {key: 'reply', label: 'Replies'},
  {key: 'mention', label: 'Mentions'},
  {key: 'follow', label: 'Follows'},
  {key: 'transfer', label: 'Transfers'},
];

export default function SettingsScreen() {
  const colors = useColors();
  const {mode, setMode} = useTheme();
  const styles = useThemedStyles(makeStyles);
  const {setBiometric, wipe} = useVault();
  const [autoLock, setAutoLock] = useState(60);
  const [biometric, setBiometricOn] = useState(false);
  const [prefs, setPrefs] = useState<NoticePrefs | null>(null);
  const [nodes, setNodes] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [latency, setLatency] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState('');
  const [adding, setAdding] = useState(false);
  const [forgetKeys, setForgetKeys] = useState(false);
  const [forgetCopy, setForgetCopy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    readAutoLock().then(setAutoLock).catch(() => undefined);
    biometricEnabled().then(setBiometricOn).catch(() => undefined);
    readNoticePrefs().then(setPrefs).catch(() => undefined);
    Promise.all([savedRpc(), customRpcs()]).then(([current, extra]) => {
      setSelected(current);
      setNodes(rpcChoices(extra));
    }).catch(() => undefined);
  }, []);

  const savePrefs = async (next: NoticePrefs) => {
    setPrefs(next);
    await writeNoticePrefs(next);
  };

  const testNodes = async () => {
    setError('');
    const results: Record<string, string> = {};
    for (const node of nodes) {
      try {
        results[node] = `${await measureRpc(node)} ms`;
      } catch {
        results[node] = 'Down';
      }
      setLatency({...results});
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.kicker}>Look</Text>
      <View style={styles.card}>
        <Text style={styles.cardHint}>Theme on this phone.</Text>
        <View style={styles.segment}>
          {(['dark', 'light'] as const).map(choice => {
            const on = mode === choice;
            return (
              <Pressable key={choice} style={[styles.segmentItem, on && styles.segmentOn]} onPress={() => setMode(choice)}>
                <Text style={[styles.segmentText, on && {color: colors.accentDeep}]}>{choice === 'dark' ? 'Dark' : 'Light'}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={styles.kicker}>Security</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Lock after</Text>
        <View style={styles.chips}>
          {LOCK_CHOICES.map(choice => {
            const on = autoLock === choice.value;
            return (
              <Pressable
                key={choice.label}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => { setAutoLock(choice.value); writeAutoLock(choice.value).catch(() => undefined); }}>
                <Text style={[styles.chipText, on && {color: colors.accentDeep}]}>{choice.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          style={styles.row}
          onPress={async () => {
            setError('');
            try {
              await setBiometric(!biometric);
              setBiometricOn(!biometric);
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Could not change fingerprint unlock.');
            }
          }}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Fingerprint</Text>
            <Text style={styles.rowHint}>Use biometrics instead of the PIN.</Text>
          </View>
          <Pill on={biometric} />
        </Pressable>
      </View>

      <Text style={styles.kicker}>Node</Text>
      <View style={styles.card}>
        <Text style={styles.cardHint}>The Steem API this wallet uses.</Text>
        {nodes.map(node => {
          const on = node === selected;
          const speed = latency[node];
          return (
            <Pressable
              key={node}
              style={[styles.node, on && styles.nodeOn]}
              onPress={() => selectRpc(node).then(() => setSelected(node)).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not switch node.'))}>
              <View style={[styles.radio, on && styles.radioOn]} />
              <Text style={styles.nodeText} numberOfLines={1}>{node.replace(/^https?:\/\//, '')}</Text>
              {speed ? <Text style={[styles.speed, speed === 'Down' && styles.speedDown]}>{speed}</Text> : null}
            </Pressable>
          );
        })}
        <Pressable style={styles.textButton} onPress={testNodes}>
          <Text style={styles.textButtonLabel}>Check speed</Text>
        </Pressable>
        <TextInput
          style={styles.input}
          value={custom}
          onChangeText={setCustom}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://api.example"
          placeholderTextColor={colors.muted}
          keyboardType="url"
          autoComplete="off"
        />
        <Pressable
          style={[styles.add, adding && styles.disabled]}
          disabled={adding}
          onPress={async () => {
            setError('');
            setAdding(true);
            try {
              const next = await addCustomRpc(custom);
              const extra = await customRpcs();
              setNodes(rpcChoices(extra));
              setSelected(next);
              setCustom('');
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Could not add that node.');
            } finally {
              setAdding(false);
            }
          }}>
          <Text style={styles.addText}>{adding ? 'Checking…' : 'Add node'}</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <Text style={styles.kicker}>Alerts</Text>
      <View style={styles.card}>
        <Text style={styles.cardHint}>Shown in Activity.</Text>
        {prefs ? NOTICES.map((item, index) => (
          <Pressable
            key={item.key}
            style={[styles.row, index > 0 && styles.rowLine]}
            onPress={() => savePrefs({...prefs, [item.key]: !prefs[item.key]})}>
            <Text style={styles.rowTitle}>{item.label}</Text>
            <Pill on={prefs[item.key]} />
          </Pressable>
        )) : null}
      </View>

      <Text style={[styles.kicker, {color: colors.danger}]}>Erase</Text>
      <View style={styles.card}>
        <Text style={styles.cardHint}>Removes the PIN, keys, and settings from this phone.</Text>
        <Check label="I understand this cannot be undone." checked={forgetKeys} onPress={() => setForgetKeys(value => !value)} />
        <Check label="I still have my keys or master password." checked={forgetCopy} onPress={() => setForgetCopy(value => !value)} />
        <Pressable
          style={[styles.danger, !(forgetKeys && forgetCopy) && styles.disabled]}
          disabled={!(forgetKeys && forgetCopy)}
          onPress={() => wipe().catch(cause => setError(cause instanceof Error ? cause.message : 'Could not clear this phone.'))}>
          <Text style={styles.dangerText}>Clear all data</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

export function AboutScreen() {
  const styles = useThemedStyles(makeStyles);
  const {accounts, activeName, importAccounts} = useVault();
  const [voteOpen, setVoteOpen] = useState(false);
  const [voteBusy, setVoteBusy] = useState(false);
  const [voteError, setVoteError] = useState('');
  const [voteNote, setVoteNote] = useState('');

  const askWitnessVote = () => {
    const account = accounts.find(item => item.name === activeName);
    if (!account?.keys.active) {
      setVoteError('This account has no active key, so it cannot vote for a witness.');
      return;
    }
    setVoteError('');
    setVoteOpen(true);
  };

  const sendWitnessVote = async () => {
    const account = accounts.find(item => item.name === activeName);
    if (!account) return;
    setVoteBusy(true);
    setVoteError('');
    try {
      await executeRequest({
        type: 'witnessVote',
        username: account.name,
        witness: 'bangla.witness',
        vote: true,
      }, account, importAccounts);
      setVoteOpen(false);
      setVoteNote('Your vote for @bangla.witness was broadcast.');
    } catch (cause) {
      setVoteError(failureMessage(cause));
    } finally {
      setVoteBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.body}>Steem Keychain {APP_VERSION}</Text>
          <Text style={styles.note}>Balances, transfers, savings, governance, and dApp signing. Keys stay encrypted on this phone.</Text>
          <Text style={styles.note}>Built by the bangla.witness team.</Text>
          <Text style={styles.note}>To support this wallet, vote for the witness @bangla.witness.</Text>
          <Pressable style={styles.add} onPress={askWitnessVote}>
            <Text style={styles.addText}>Vote for @bangla.witness</Text>
          </Pressable>
          {voteNote ? <Text style={styles.voteNote}>{voteNote}</Text> : null}
          {voteError && !voteOpen ? <Text style={styles.error}>{voteError}</Text> : null}
        </View>
      </ScrollView>
      {voteOpen && activeName ? (
        <ConfirmSheet
          title="Vote witness"
          lines={[`Account @${activeName}`, 'Vote for @bangla.witness']}
          busy={voteBusy}
          error={voteError}
          onCancel={() => { if (!voteBusy) { setVoteOpen(false); setVoteError(''); } }}
          onConfirm={sendWitnessVote}
        />
      ) : null}
    </View>
  );
}

export function PrivacyScreen() {
  const styles = useThemedStyles(makeStyles);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.note}>Keys are stored with AES-256. The PIN stays on this phone, and only the secure store sees it when fingerprint unlock is on.</Text>
        <Text style={styles.note}>Nodes see account names and the operations you broadcast. Prices come from the Steem market and CoinGecko. There is no Steem Keychain server.</Text>
        <Text style={styles.note}>You confirm every transaction. A transfer on the chain cannot be undone.</Text>
      </View>
    </ScrollView>
  );
}

function Pill({on}: {on: boolean}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.track, on && styles.trackOn]}>
      <View style={[styles.knob, on && styles.knobOn]} />
    </View>
  );
}

function Check({label, checked, onPress}: {label: string; checked: boolean; onPress: () => void}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable style={styles.check} onPress={onPress}>
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked ? <Text style={styles.tick}>✓</Text> : null}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    screen: {flex: 1, backgroundColor: c.background},
    content: {paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28},
    kicker: {color: c.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 18, marginBottom: 8, marginLeft: 4},
    card: {
      backgroundColor: c.card,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
      padding: 14,
    },
    cardHint: {color: c.muted, fontSize: 13, lineHeight: 18, marginBottom: 12},
    label: {color: c.text, fontSize: 14, fontWeight: '700', marginBottom: 10},
    segment: {flexDirection: 'row', backgroundColor: c.background, borderRadius: 14, padding: 4},
    segmentItem: {flex: 1, borderRadius: 11, paddingVertical: 10, alignItems: 'center'},
    segmentOn: {backgroundColor: c.accentSoft},
    segmentText: {color: c.muted, fontWeight: '700'},
    chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4},
    chip: {backgroundColor: c.background, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8},
    chipOn: {backgroundColor: c.accentSoft},
    chipText: {color: c.text, fontWeight: '700', fontSize: 13},
    row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 12},
    rowLine: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, marginTop: 12},
    rowText: {flex: 1},
    rowTitle: {color: c.text, fontSize: 15, fontWeight: '700'},
    rowHint: {color: c.muted, fontSize: 12, lineHeight: 16, marginTop: 2},
    track: {width: 44, height: 26, borderRadius: 13, backgroundColor: c.background, padding: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line},
    trackOn: {backgroundColor: c.accent, borderColor: c.accent},
    knob: {width: 20, height: 20, borderRadius: 10, backgroundColor: c.muted},
    knobOn: {alignSelf: 'flex-end', backgroundColor: c.onAccent},
    node: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line},
    nodeOn: {},
    radio: {width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: c.line},
    radioOn: {borderColor: c.accent, backgroundColor: c.accent},
    nodeText: {flex: 1, color: c.text, fontWeight: '600', fontSize: 14},
    speed: {color: c.accent, fontSize: 12, fontWeight: '700'},
    speedDown: {color: c.danger},
    textButton: {alignSelf: 'flex-start', paddingVertical: 10},
    textButtonLabel: {color: c.accent, fontWeight: '800', fontSize: 14},
    input: {backgroundColor: c.background, color: c.text, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15},
    add: {marginTop: 10, backgroundColor: c.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center'},
    addText: {color: c.onAccent, fontWeight: '800'},
    check: {flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 12},
    box: {width: 22, height: 22, borderRadius: 7, borderWidth: 1, borderColor: c.line, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center'},
    boxOn: {backgroundColor: c.accent, borderColor: c.accent},
    tick: {color: c.onAccent, fontSize: 13, fontWeight: '800'},
    checkLabel: {color: c.text, flex: 1, lineHeight: 18, fontSize: 13},
    danger: {backgroundColor: c.danger, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 2},
    dangerText: {color: '#ffffff', fontWeight: '800'},
    disabled: {opacity: 0.4},
    error: {color: c.danger, marginTop: 10, lineHeight: 18},
    body: {color: c.text, fontSize: 16, fontWeight: '700', marginBottom: 8},
    note: {color: c.muted, lineHeight: 20, marginBottom: 10},
    voteNote: {color: c.accentDeep, lineHeight: 20, marginTop: 12},
  });
}
