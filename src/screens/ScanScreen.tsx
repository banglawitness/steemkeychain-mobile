import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {BarcodeScanningResult, CameraView, useCameraPermissions} from 'expo-camera';
import {useRef, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {useVault} from '../auth/VaultContext';
import {parseAccountQr} from '../crypto/keychainExport';
import {RootStackParamList} from '../navigation/RootNavigator';
import {Palette, useColors, useThemedStyles} from '../theme';
import {StoredAccount} from '../types';

export default function ScanScreen() {
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const {importAccounts, activeName} = useVault();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState('Scan an account name to send, or a Steem Keychain account QR code to import.');
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const collectedRef = useRef<StoredAccount[]>([]);
  const scannedPagesRef = useRef(0);
  const busyRef = useRef(false);
  const lastScanRef = useRef(0);

  const onBarcodeScanned = async ({data}: BarcodeScanningResult) => {
    const now = Date.now();
    if (busyRef.current || now - lastScanRef.current < 600) return;
    lastScanRef.current = now;
    const previousAccounts = collectedRef.current;
    const previousPages = scannedPagesRef.current;
    try {
      const page = parseAccountQr(data);
      if (page.total < 1 || page.index < 1 || page.index > page.total) {
        throw new Error('That QR code is not a Steem Keychain account export.');
      }
      const expected = scannedPagesRef.current + 1;
      if (page.index !== expected) {
        setError(
          page.index < expected
            ? `Page already scanned. Move to page ${expected}.`
            : `Scan page ${expected} first.`,
        );
        return;
      }
      collectedRef.current = [...previousAccounts, ...page.accounts];
      scannedPagesRef.current = page.index;
      setError('');
      if (page.index < page.total) {
        setStatus(`Page ${page.index} of ${page.total} scanned. Scan page ${page.index + 1}.`);
        return;
      }
      busyRef.current = true;
      setImporting(true);
      await importAccounts(collectedRef.current);
      navigation.reset({index: 0, routes: [{name: 'Wallet'}]});
    } catch (cause) {
      const name = accountNameOnly(data);
      if (name && previousPages === 0) {
        if (!activeName) {
          setError('Add an account before sending.');
          return;
        }
        navigation.replace('Operate', {kind: 'transfer', to: name});
        return;
      }
      collectedRef.current = previousAccounts;
      scannedPagesRef.current = previousPages;
      busyRef.current = false;
      setImporting(false);
      setError(cause instanceof Error ? cause.message : 'Could not read that QR code.');
    }
  };

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.lead}>
          Steem Keychain uses the camera to scan an account QR code from the extension or another phone.
        </Text>
        <Pressable style={styles.primary} onPress={requestPermission}>
          <Text style={styles.primaryText}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.banner}>
        <Text style={styles.status}>{importing ? 'Saving accounts…' : status}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      {importing ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <View style={styles.cameraWrap}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{barcodeTypes: ['qr']}}
            onBarcodeScanned={onBarcodeScanned}
          />
          <View style={styles.frame} pointerEvents="none" />
        </View>
      )}
    </View>
  );
}

function accountNameOnly(data: string) {
  const name = data.trim().replace(/^@/, '').toLowerCase();
  return /^[a-z0-9.-]{3,16}$/.test(name) ? name : '';
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: c.background,
  },
  centered: {
    flex: 1,
    backgroundColor: c.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  lead: {
    color: c.muted,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  banner: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  status: {
    color: c.text,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: c.danger,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  cameraWrap: {
    flex: 1,
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  frame: {
    position: 'absolute',
    top: '18%',
    left: '12%',
    right: '12%',
    bottom: '18%',
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 16,
  },
  primary: {
    backgroundColor: c.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  primaryText: {
    color: c.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
});
}
