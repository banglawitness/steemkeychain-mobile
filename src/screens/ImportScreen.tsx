import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import * as DocumentPicker from 'expo-document-picker';
import {useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useVault} from '../auth/VaultContext';
import {RootStackParamList} from '../navigation/RootNavigator';
import {Palette, useColors, useThemedStyles} from '../theme';

export default function ImportScreen() {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const {importExport} = useVault();
  const [raw, setRaw] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const pickFile = async () => {
    setError('');
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      type: '*/*',
    });
    if (result.canceled || !result.assets?.[0]) return;
    const response = await fetch(result.assets[0].uri);
    setRaw(await response.text());
    setMessage(result.assets[0].name || 'accounts.kc');
  };

  const onImport = async () => {
    setBusy(true);
    setError('');
    try {
      await importExport(raw, password);
      navigation.reset({index: 0, routes: [{name: 'Wallet'}]});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.lead}>
        Scan a Steem Keychain account QR code, or open an accounts.kc file and enter the same
        master password.
      </Text>
      <Pressable style={styles.primary} onPress={() => navigation.navigate('Scan')}>
        <Text style={styles.primaryText}>Scan QR code</Text>
      </Pressable>
      <Pressable style={styles.secondary} onPress={pickFile}>
        <Text style={styles.secondaryText}>Choose accounts.kc</Text>
      </Pressable>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Extension master password"
        placeholderTextColor={colors.muted}
        secureTextEntry
        autoCapitalize="none"
      />
      <TextInput
        style={[styles.input, styles.paste]}
        value={raw}
        onChangeText={setRaw}
        placeholder="Or paste the export text"
        placeholderTextColor={colors.muted}
        multiline
        autoCapitalize="none"
      />
      <Pressable style={styles.primary} onPress={onImport} disabled={busy}>
        {busy ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={styles.primaryText}>Import accounts</Text>
        )}
      </Pressable>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: c.background,
    padding: 14,
  },
  lead: {
    color: c.muted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  secondary: {
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryText: {
    color: c.text,
    fontSize: 16,
  },
  input: {
    backgroundColor: c.card,
    color: c.text,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  paste: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  primary: {
    backgroundColor: c.accent,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryText: {
    color: c.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  message: {
    color: c.text,
    textAlign: 'center',
    marginTop: 16,
  },
  error: {
    color: c.danger,
    textAlign: 'center',
    marginTop: 12,
  },
});
}
