import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useVault} from '../auth/VaultContext';
import {failureMessage} from '../browser/requests';
import ConfirmSheet from '../components/ConfirmSheet';
import {RootStackParamList} from '../navigation/RootNavigator';
import {Palette, useThemedStyles} from '../theme';

const ROLES = ['posting', 'active', 'memo'] as const;

export default function AccountScreen() {
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const {accounts, activeName, removeKey, forgetAccount} = useVault();
  const account = accounts.find(item => item.name === activeName);
  const [forgetKeys, setForgetKeys] = useState(false);
  const [forgetCopy, setForgetCopy] = useState(false);
  const [role, setRole] = useState<(typeof ROLES)[number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
      <Text style={styles.name}>@{account.name}</Text>
      {ROLES.map(item => (
        <View key={item} style={styles.row}>
          <Text style={styles.keyLabel}>{label(item)} · {account.keys[item] ? 'saved' : 'missing'}</Text>
          {account.keys[item] ? (
            <Pressable onPress={() => { setError(''); setRole(item); }}>
              <Text style={styles.danger}>Remove</Text>
            </Pressable>
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
  name: {color: c.text, fontSize: 22, fontWeight: '700', marginBottom: 10},
  row: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: c.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6},
  keyLabel: {color: c.text, flex: 1, fontSize: 16},
  note: {color: c.muted, flex: 1, lineHeight: 20},
  danger: {color: c.danger, fontWeight: '700', marginLeft: 12},
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
