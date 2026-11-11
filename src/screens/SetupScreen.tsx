import {useEffect, useRef, useState} from 'react';
import {StyleSheet, Switch, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useVault} from '../auth/VaultContext';
import PinPad from '../components/PinPad';
import {biometricAvailable} from '../storage/vault';
import {Palette, useThemedStyles} from '../theme';

export default function SetupScreen() {
  const styles = useThemedStyles(makeStyles);
  const {setup} = useVault();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [step, setStep] = useState<'create' | 'confirm'>('create');
  const [useBiometric, setUseBiometric] = useState(false);
  const [canUseBiometric, setCanUseBiometric] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);

  useEffect(() => {
    biometricAvailable().then(setCanUseBiometric).catch(() => setCanUseBiometric(false));
  }, []);

  useEffect(() => {
    if (pin.length < 4) return;
    if (step === 'create') {
      setStep('confirm');
      return;
    }
    if (confirm.length < 4 || saving.current) return;
    if (confirm !== pin) {
      setError('Those PINs do not match.');
      setConfirm('');
      setStep('create');
      setPin('');
      return;
    }
    saving.current = true;
    setup(pin, useBiometric).catch(cause => {
      saving.current = false;
      setError(cause instanceof Error ? cause.message : 'Could not save the PIN.');
      setConfirm('');
      setStep('create');
      setPin('');
    });
  }, [pin, confirm, step, setup, useBiometric]);

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>Steem Keychain</Text>
      <Text style={styles.subtitle}>
        {step === 'create' ? 'Create a 4-digit PIN' : 'Enter the same PIN again'}
      </Text>
      {canUseBiometric ? (
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Unlock with fingerprint</Text>
          <Switch value={useBiometric} onValueChange={setUseBiometric} />
        </View>
      ) : null}
      <PinPad value={step === 'create' ? pin : confirm} onChange={step === 'create' ? setPin : setConfirm} />
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
  title: {
    color: c.text,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: c.muted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 28,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 24,
  },
  rowLabel: {
    color: c.text,
    fontSize: 16,
  },
  error: {
    color: c.danger,
    textAlign: 'center',
    marginTop: 16,
  },
});
}
