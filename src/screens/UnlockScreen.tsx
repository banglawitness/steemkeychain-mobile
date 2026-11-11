import {useEffect, useState} from 'react';
import {Image, Pressable, StyleSheet, Text} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useVault} from '../auth/VaultContext';
import PinPad from '../components/PinPad';
import {biometricEnabled} from '../storage/vault';
import {Palette, useColors, useThemedStyles} from '../theme';

function FingerprintMark() {
  const colors = useColors();
  const stroke = colors.accent;
  return (
    <Svg width={36} height={36} viewBox="0 0 64 64">
      <Path d="M32 58c-14 0-24-12-24-26" stroke={stroke} strokeWidth={3} strokeLinecap="round" fill="none" />
      <Path d="M16 48c-5-5-8-12-8-20C8 16 18 6 32 6s24 10 24 22c0 6-2 12-5 16" stroke={stroke} strokeWidth={3} strokeLinecap="round" fill="none" />
      <Path d="M22 44c-3-4-5-8-5-14 0-8 7-15 15-15s15 7 15 15c0 5-1 9-4 13" stroke={stroke} strokeWidth={3} strokeLinecap="round" fill="none" />
      <Path d="M27 40c-2-3-3-6-3-9 0-4 4-8 8-8s8 4 8 8c0 3-.6 5-2 8" stroke={stroke} strokeWidth={3} strokeLinecap="round" fill="none" />
      <Path d="M32 34v14" stroke={stroke} strokeWidth={3} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

export default function UnlockScreen() {
  const styles = useThemedStyles(makeStyles);
  const {unlockWithPin, unlockWithBiometric} = useVault();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [fingerprintOn, setFingerprintOn] = useState(false);

  useEffect(() => {
    biometricEnabled().then(setFingerprintOn).catch(() => setFingerprintOn(false));
  }, []);

  useEffect(() => {
    if (pin.length < 4) return;
    unlockWithPin(pin).catch(cause => {
      setError(cause instanceof Error ? cause.message : 'Wrong PIN.');
      setPin('');
    });
  }, [pin, unlockWithPin]);

  const onFingerprint = async () => {
    setError('');
    try {
      await unlockWithBiometric();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Fingerprint unlock failed.');
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Image source={require('../../assets/steem-keychain-logo.png')} style={styles.logo} resizeMode="contain" />
      <Text style={styles.subtitle}>Enter your PIN</Text>
      <PinPad value={pin} onChange={setPin} onConfirm={() => pin.length === 4 && unlockWithPin(pin).catch(cause => {
        setError(cause instanceof Error ? cause.message : 'Wrong PIN.');
        setPin('');
      })} />
      {fingerprintOn ? (
        <Pressable style={styles.fingerprint} onPress={onFingerprint} accessibilityLabel="Unlock with fingerprint">
          <FingerprintMark />
        </Pressable>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </SafeAreaView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: c.background,
    padding: 24,
    justifyContent: 'center',
  },
  logo: {width: 52, height: 52, alignSelf: 'center'},
  subtitle: {
    color: c.muted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 28,
  },
  fingerprint: {
    marginTop: 8,
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: c.danger,
    textAlign: 'center',
    marginTop: 12,
  },
});
}
