import {useMemo, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View} from 'react-native';
import {File, Paths} from 'expo-file-system';
import QRCode from 'react-qr-code';
import {useVault} from '../auth/VaultContext';
import {buildAccountQrPages, encodeAccountQrPage, AccountQrPage} from '../crypto/accountQr';
import {encryptKeychainExport} from '../crypto/keychainExport';
import {Palette, useColors, useThemedStyles} from '../theme';
import {StoredAccount} from '../types';

export default function ExportScreen() {
  const styles = useThemedStyles(makeStyles);
  const {accounts} = useVault();
  const pages = useMemo(() => buildAccountQrPages(accounts), [accounts]);
  const [mode, setMode] = useState<'choose' | 'qr' | 'kc'>('choose');
  const exportable = pages.flatMap(page => page.data).filter(account => Object.keys(account.keys).length > 0);
  const hasKeys = exportable.length > 0;

  if (accounts.length === 0) {
    return (
      <View style={styles.screen}>
        <Text style={styles.lead}>Import an account before exporting.</Text>
      </View>
    );
  }

  if (!hasKeys) {
    return (
      <View style={styles.screen}>
        <Text style={styles.lead}>These accounts have no private keys to export.</Text>
      </View>
    );
  }

  if (mode === 'qr') return <QrExport pages={pages} onBack={() => setMode('choose')} />;
  if (mode === 'kc') return <KcExport accounts={exportable} onBack={() => setMode('choose')} />;

  return (
    <View style={[styles.screen, styles.choose]}>
      <Pressable style={styles.choice} onPress={() => setMode('qr')}>
        <Text style={styles.choiceTitle}>Export QR</Text>
        <Text style={styles.choiceLine}>A QR code to scan into Steem Keychain.</Text>
      </Pressable>
      <Pressable style={styles.choice} onPress={() => setMode('kc')}>
        <Text style={styles.choiceTitle}>Export .kc</Text>
        <Text style={styles.choiceLine}>An accounts.kc file, encrypted like the Steem Keychain extension.</Text>
      </Pressable>
    </View>
  );
}
function QrExport({pages, onBack}: {pages: AccountQrPage[]; onBack: () => void}) {
  const styles = useThemedStyles(makeStyles);
  const {width} = useWindowDimensions();
  const [pageIndex, setPageIndex] = useState(0);
  const [notSharing, setNotSharing] = useState(false);
  const [understandsLoss, setUnderstandsLoss] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const page = pages[Math.min(pageIndex, pages.length - 1)];
  const qrSize = Math.min(width - 120, 220);
  const confirmed = notSharing && understandsLoss;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack} hitSlop={8}>
        <Text style={styles.back}>‹ Export</Text>
      </Pressable>
      <Text style={styles.lead}>
        This QR code contains the private keys for these accounts. Use it only to import them into
        Steem Keychain.
      </Text>
      <Text style={styles.warning}>Do not share it with anyone.</Text>
      {revealed ? (
        <View>
          <Text style={styles.pageLabel}>
            {page.index}/{page.total} : {page.data.map(account => `@${account.name}`).join(', ')}
          </Text>
          <View style={styles.qrCard}>
            <QRCode
              value={encodeAccountQrPage(page)}
              size={qrSize}
              bgColor="#ffffff"
              fgColor="#10141c"
            />
          </View>
          {pages.length > 1 ? (
            <>
              <View style={styles.row}>
                <Pressable
                  style={[styles.secondary, pageIndex === 0 && styles.disabled]}
                  disabled={pageIndex === 0}
                  onPress={() => setPageIndex(index => Math.max(0, index - 1))}>
                  <Text style={styles.secondaryText}>Previous</Text>
                </Pressable>
                <Pressable
                  style={[styles.secondary, pageIndex >= pages.length - 1 && styles.disabled]}
                  disabled={pageIndex >= pages.length - 1}
                  onPress={() => setPageIndex(index => Math.min(pages.length - 1, index + 1))}>
                  <Text style={styles.secondaryText}>Next</Text>
                </Pressable>
              </View>
              <Text style={styles.hint}>Scan the pages in order. Each code holds up to two accounts.</Text>
            </>
          ) : null}
        </View>
      ) : (
        <View>
          <CheckRow
            checked={notSharing}
            label="I am not sharing my screen, and I will not send a screenshot of these QR codes to anyone."
            onPress={() => setNotSharing(value => !value)}
          />
          <CheckRow
            checked={understandsLoss}
            label="I understand that anyone who scans these QR codes can take the funds in these accounts."
            onPress={() => setUnderstandsLoss(value => !value)}
          />
          <Pressable
            style={[styles.primary, !confirmed && styles.disabled]}
            disabled={!confirmed}
            onPress={() => setRevealed(true)}>
            <Text style={styles.primaryText}>Show QR code</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function KcExport({accounts, onBack}: {accounts: StoredAccount[]; onBack: () => void}) {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [notSharing, setNotSharing] = useState(false);
  const [understandsLoss, setUnderstandsLoss] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = password.length > 0 && password === confirm && notSharing && understandsLoss;

  const exportFile = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      const encrypted = encryptKeychainExport(accounts, password);
      const file = new File(Paths.cache, 'accounts.kc');
      file.create({overwrite: true});
      await file.write(encrypted);
      const Sharing = await import('expo-sharing');
      if (!(await Sharing.isAvailableAsync())) {
        setError('Sharing is not available on this phone.');
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/octet-stream',
        dialogTitle: 'Export accounts.kc',
        UTI: 'public.data',
      });
    } catch {
      setError('Could not create the accounts.kc file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack} hitSlop={8}>
        <Text style={styles.back}>‹ Export</Text>
      </Pressable>
      <Text style={styles.lead}>
        This creates an accounts.kc file encrypted with a master password, the same way the Steem Keychain extension does. Import it with that password.
      </Text>
      <Text style={styles.warning}>Do not share the file or the password.</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Master password"
        placeholderTextColor={colors.muted}
        secureTextEntry
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Confirm master password"
        placeholderTextColor={colors.muted}
        secureTextEntry
        autoCapitalize="none"
      />
      {password && confirm && password !== confirm ? <Text style={styles.warning}>Passwords do not match.</Text> : null}
      <CheckRow
        checked={notSharing}
        label="I am not sharing my screen, and I will not send this file to anyone."
        onPress={() => setNotSharing(value => !value)}
      />
      <CheckRow
        checked={understandsLoss}
        label="I understand that anyone with this file and the password can take the funds in these accounts."
        onPress={() => setUnderstandsLoss(value => !value)}
      />
      <Pressable style={[styles.primary, !ready && styles.disabled]} disabled={!ready || busy} onPress={exportFile}>
        {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryText}>Export accounts.kc</Text>}
      </Pressable>
      {error ? <Text style={styles.warning}>{error}</Text> : null}
    </ScrollView>
  );
}

function CheckRow({
  checked,
  label,
  onPress,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable style={styles.checkRow} onPress={onPress}>
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Text style={styles.tick}>✓</Text> : null}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: c.background,
  },
  content: {
    padding: 14,
    paddingBottom: 20,
  },
  choose: {
    padding: 14,
  },
  back: {
    color: c.accent,
    fontWeight: '800',
    fontSize: 15,
    marginBottom: 12,
  },
  choice: {
    backgroundColor: c.card,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    paddingHorizontal: 14,
    paddingVertical: 16,
    marginBottom: 10,
  },
  choiceTitle: {
    color: c.text,
    fontSize: 16,
    fontWeight: '800',
  },
  choiceLine: {
    color: c.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  input: {
    backgroundColor: c.card,
    color: c.text,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  lead: {
    color: c.muted,
    lineHeight: 22,
    marginBottom: 12,
  },
  warning: {
    color: c.danger,
    fontWeight: '700',
    marginBottom: 20,
  },
  pageLabel: {
    color: c.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  qrCard: {
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  hint: {
    color: c.muted,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: c.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  boxChecked: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  tick: {
    color: c.onAccent,
    fontSize: 14,
    fontWeight: '700',
  },
  checkLabel: {
    flex: 1,
    color: c.text,
    lineHeight: 22,
  },
  secondary: {
    flex: 1,
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: {
    color: c.text,
    fontSize: 16,
  },
  primary: {
    backgroundColor: c.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryText: {
    color: c.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.4,
  },
});
}
