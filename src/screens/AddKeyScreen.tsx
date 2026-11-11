import {RouteProp, useNavigation, useRoute} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useVault} from '../auth/VaultContext';
import {RootStackParamList} from '../navigation/RootNavigator';
import {accountFromSecret} from '../steem/keys';
import {Palette, useColors, useThemedStyles} from '../theme';

export default function AddKeyScreen({required = false}: {required?: boolean}) {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'AddKey'>>();
  const {saveAccount} = useVault();
  const [username, setUsername] = useState(route.params?.username || '');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSave = async () => {
    setBusy(true);
    setError('');
    try {
      const account = await accountFromSecret(username, secret);
      await saveAccount(account);
      navigation.reset({index: 0, routes: [{name: 'Wallet'}]});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add that account.');
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <View style={styles.screen}>
      {required ? <Text style={styles.title}>Add your account</Text> : null}
      <Text style={styles.lead}>
        {required
          ? 'Add a Steem account before you can open the wallet. Enter a name and key, or import from a QR code or an accounts.kc file.'
          : 'Enter the account name and one private key, or the master password. Steem Keychain checks it against the account on the chain before saving it.'}
      </Text>
      <TextInput
        style={styles.input}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Account name"
        placeholderTextColor={colors.muted}
      />
      <TextInput
        style={styles.input}
        value={secret}
        onChangeText={setSecret}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        placeholder="Private key or master password"
        placeholderTextColor={colors.muted}
      />
      <Pressable style={styles.primary} onPress={onSave} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryText}>Check and save</Text>}
      </Pressable>
      {required ? (
        <Pressable style={styles.secondary} onPress={() => navigation.navigate('Import')}>
          <Text style={styles.secondaryText}>Import</Text>
        </Pressable>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );

  if (required) return <SafeAreaView style={styles.safe}>{body}</SafeAreaView>;
  return body;
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
  safe: {flex: 1, backgroundColor: c.background},
  screen: {flex: 1, backgroundColor: c.background, padding: 14},
  title: {color: c.text, fontSize: 22, fontWeight: '700', marginBottom: 8, marginTop: 12},
  lead: {color: c.muted, lineHeight: 22, marginBottom: 16},
  input: {backgroundColor: c.card, color: c.text, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, fontSize: 15},
  primary: {backgroundColor: c.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4},
  primaryText: {color: c.onAccent, fontWeight: '700', fontSize: 15},
  secondary: {borderColor: c.line, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8},
  secondaryText: {color: c.text, fontWeight: '700', fontSize: 15},
  error: {color: c.danger, textAlign: 'center', marginTop: 12},
});
}
