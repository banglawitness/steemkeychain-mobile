import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {useVault} from '../auth/VaultContext';
import AccountAvatar from '../components/AccountAvatar';
import {failureMessage} from '../browser/requests';
import ConfirmSheet from '../components/ConfirmSheet';
import PinPad from '../components/PinPad';
import {RootStackParamList} from '../navigation/RootNavigator';
import {biometricEnabled} from '../storage/vault';
import {Palette, useThemedStyles} from '../theme';

const ROLES = ['posting', 'active', 'memo'] as const;

export default function AccountScreen() {
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const {accounts, activeName, removeKey, forgetAccount, unlockWithPin, unlockWithBiometric} = useVault();
  const account = accounts.find(item => item.name === activeName);
  const [forgetKeys, setForgetKeys] = useState(false);
  const [forgetCopy, setForgetCopy] = useState(false);
  const [role, setRole] = useState<(typeof ROLES)[number] | null>(null);
  const [reveal, setReveal] = useState<(typeof ROLES)[number] | null>(null);
  const [shown, setShown] = useState<(typeof ROLES)[number] | null>(null);
  const [authPin, setAuthPin] = useState('');
  const [authError, setAuthError] = useState('');
  const [copied, setCopied] = useState(false);
  const [fingerprintOn, setFingerprintOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    biometricEnabled().then(setFingerprintOn).catch(() => setFingerprintOn(false));
  }, []);

  useEffect(() => {
    if (!reveal || !fingerprintOn) return;
    let cancel = false;
    unlockWithBiometric()
      .then(() => {
        if (cancel) return;
        setShown(reveal);
        setCopied(false);
        setReveal(null);
        setAuthPin('');
        setAuthError('');
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [reveal, fingerprintOn, unlockWithBiometric]);

  useEffect(() => {
    if (!reveal || authPin.length < 4) return;
    let cancel = false;
    unlockWithPin(authPin)
      .then(() => {
        if (cancel) return;
        setShown(reveal);
        setCopied(false);
        setReveal(null);
        setAuthPin('');
        setAuthError('');
      })
      .catch(cause => {
        if (cancel) return;
        setAuthError(cause instanceof Error ? cause.message : 'Wrong PIN.');
        setAuthPin('');
      });
    return () => {
      cancel = true;
    };
  }, [authPin, reveal, unlockWithPin]);

  if (!account) {
    return (
      <View style={styles.screen}>
        <Text style={styles.note}>Choose an account on the wallet first.</Text>
      </View>
    );
  }

  const dropKey = async () => {
    if (!role) return;
    setBusy(true);
    setError('');
    try {
      await removeKey(account.name, role);
      setRole(null);
    } catch (cause) {
      setError(failureMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const forget = async () => {
    setBusy(true);
    setError('');
    try {
      const last = accounts.length === 1;
      await forgetAccount(account.name);
      navigation.reset({index: 0, routes: [{name: last ? 'AddKey' : 'Wallet'}]});
    } catch (cause) {
      setError(failureMessage(cause));
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.identity}>
        <AccountAvatar name={account.name} size={40} />
        <Text style={styles.name}>@{account.name}</Text>
      </View>
      {ROLES.map(item => (
        <View key={item} style={styles.row}>
          <Text style={styles.keyLabel}>{label(item)} · {account.keys[item] ? 'saved' : 'missing'}</Text>
          {account.keys[item] ? (
            <View style={styles.actions}>
              <Pressable
                style={styles.showButton}
                onPress={() => {
                  setError('');
                  setAuthError('');
                  setAuthPin('');
                  setReveal(item);
                }}>
                <Text style={styles.showText}>Show</Text>
              </Pressable>
              <Pressable
                style={styles.removeButton}
                onPress={() => { setError(''); setRole(item); }}>
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}
      <Pressable style={styles.primary} onPress={() => navigation.navigate('AddKey', {username: account.name})}>
        <Text style={styles.primaryText}>Add a key</Text>
      </Pressable>

      <Text style={styles.section}>Forget this account</Text>
      <Check label="I understand this removes the account from this phone." checked={forgetKeys} onPress={() => setForgetKeys(value => !value)} />
      <Check label="I still have a copy of the keys or the master password." checked={forgetCopy} onPress={() => setForgetCopy(value => !value)} />
      <Pressable
        style={[styles.dangerButton, !(forgetKeys && forgetCopy) && styles.disabled]}
        disabled={!(forgetKeys && forgetCopy) || busy}
        onPress={forget}>
        <Text style={styles.primaryText}>Forget account</Text>
      </Pressable>
      {error && !role ? <Text style={styles.error}>{error}</Text> : null}
      {role ? (
        <ConfirmSheet
          title={`Remove ${label(role).toLowerCase()}`}
          lines={[`@${account.name}`, 'The other saved keys stay on this phone.']}
          busy={busy}
          error={error}
          onCancel={() => { setRole(null); setError(''); }}
          onConfirm={dropKey}
        />
      ) : null}
      {shown && account.keys[shown] ? (
        <View style={styles.authCover}>
          <View style={styles.authCard}>
            <Text style={styles.authTitle}>{label(shown)}</Text>
            <Text style={styles.secret} selectable>{account.keys[shown]}</Text>
            <Pressable
              style={styles.primary}
              onPress={async () => {
                const secret = account.keys[shown];
                if (!secret) return;
                await Clipboard.setStringAsync(secret);
                setCopied(true);
              }}>
              <Text style={styles.primaryText}>{copied ? 'Copied' : 'Copy key'}</Text>
            </Pressable>
            <Pressable style={styles.cancel} onPress={() => { setShown(null); setCopied(false); }}>
              <Text style={styles.cancelText}>Hide</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {reveal ? (
        <View style={styles.authCover}>
          <View style={styles.authCard}>
            <Text style={styles.authTitle}>Confirm to show this key</Text>
            <Text style={styles.authHint}>Enter your PIN{fingerprintOn ? '. Fingerprint opens if it is turned on.' : '.'}</Text>
            <PinPad value={authPin} onChange={setAuthPin} />
            {authError ? <Text style={styles.error}>{authError}</Text> : null}
            <Pressable style={styles.cancel} onPress={() => { setReveal(null); setAuthPin(''); setAuthError(''); }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function label(role: (typeof ROLES)[number]) {
  if (role === 'posting') return 'Posting key';
  if (role === 'active') return 'Active key';
  return 'Memo key';
}

function Check({label: text, checked, onPress}: {label: string; checked: boolean; onPress: () => void}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable style={styles.check} onPress={onPress}>
      <View style={[styles.box, checked && styles.boxOn]} />
      <Text style={styles.note}>{text}</Text>
    </Pressable>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
  screen: {flex: 1, backgroundColor: c.background, padding: 14},
  name: {color: c.text, fontSize: 22, fontWeight: '700', flexShrink: 1},
  identity: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10},
  row: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: c.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6, gap: 8},
  keyLabel: {color: c.text, flex: 1, fontSize: 15},
  actions: {flexDirection: 'row', gap: 6},
  showButton: {backgroundColor: c.accentSoft, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7},
  showText: {color: c.accentDeep, fontWeight: '800', fontSize: 13},
  removeButton: {backgroundColor: c.dangerSoft, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7},
  removeText: {color: c.danger, fontWeight: '800', fontSize: 13},
  note: {color: c.muted, flex: 1, lineHeight: 20},
  authCover: {...StyleSheet.absoluteFill, backgroundColor: 'rgba(5,8,14,0.72)', justifyContent: 'center', padding: 16, zIndex: 20},
  authCard: {backgroundColor: c.card, borderRadius: 16, padding: 16},
  authTitle: {color: c.text, fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 8},
  authHint: {color: c.muted, textAlign: 'center', lineHeight: 20, marginBottom: 8},
  secret: {color: c.text, fontSize: 13, lineHeight: 20, marginBottom: 12},
  cancel: {alignItems: 'center', paddingVertical: 12},
  cancelText: {color: c.muted, fontWeight: '700'},
  primary: {backgroundColor: c.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 6},
  primaryText: {color: c.onAccent, fontWeight: '700', fontSize: 16},
  section: {color: c.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 28, marginBottom: 10},
  check: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12},
  box: {width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: c.line, backgroundColor: c.card},
  boxOn: {backgroundColor: c.accent, borderColor: c.accent},
  dangerButton: {backgroundColor: c.danger, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 6},
  disabled: {opacity: 0.4},
  error: {color: c.danger, marginTop: 12},
});
}
