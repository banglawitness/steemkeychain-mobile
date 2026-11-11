import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import {openVault, sealVault} from '../crypto/keychainExport';
import {StoredAccount} from '../types';

const VAULT_KEY = 'steem.vault';
const READY_KEY = 'steem.pin.ready';
const BIOMETRIC_PIN_KEY = 'steem.biometric.pin';
const BIOMETRIC_FLAG_KEY = 'steem.biometric.enabled';
const ACTIVE_ACCOUNT_KEY = 'steem.active.account';

export async function hasPin(): Promise<boolean> {
  return (await AsyncStorage.getItem(READY_KEY)) === '1';
}

export async function biometricAvailable(): Promise<boolean> {
  const hardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return hardware && enrolled;
}

export async function biometricEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(BIOMETRIC_FLAG_KEY)) === '1';
}

export async function createPin(pin: string, useBiometric: boolean): Promise<void> {
  await AsyncStorage.setItem(VAULT_KEY, sealVault([], pin));
  await AsyncStorage.setItem(READY_KEY, '1');
  if (useBiometric) await saveBiometricPin(pin);
}

export async function readAccounts(pin: string): Promise<StoredAccount[]> {
  const sealed = await AsyncStorage.getItem(VAULT_KEY);
  if (!sealed) throw new Error('Set a PIN first.');
  return openVault(sealed, pin);
}

export async function saveAccounts(accounts: StoredAccount[], pin: string): Promise<void> {
  await AsyncStorage.setItem(VAULT_KEY, sealVault(accounts, pin));
}

export async function saveBiometricPin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_PIN_KEY, pin, {
    requireAuthentication: true,
    authenticationPrompt: 'Unlock Steem Keychain',
  });
  await AsyncStorage.setItem(BIOMETRIC_FLAG_KEY, '1');
}

export async function readBiometricPin(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(BIOMETRIC_PIN_KEY, {
      requireAuthentication: true,
      authenticationPrompt: 'Unlock Steem Keychain',
    });
  } catch {
    return null;
  }
}

export async function getActiveAccount(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_ACCOUNT_KEY);
}

export async function setActiveAccount(name: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_ACCOUNT_KEY, name);
}

export async function clearActiveAccount(): Promise<void> {
  await AsyncStorage.removeItem(ACTIVE_ACCOUNT_KEY);
}

export async function disableBiometric(): Promise<void> {
  await AsyncStorage.removeItem(BIOMETRIC_FLAG_KEY);
  try {
    await SecureStore.deleteItemAsync(BIOMETRIC_PIN_KEY);
  } catch {
    /* already gone */
  }
}

export async function wipeDevice(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const ours = keys.filter(key => key.startsWith('steem.'));
  if (ours.length) await AsyncStorage.multiRemove(ours);
  try {
    await SecureStore.deleteItemAsync(BIOMETRIC_PIN_KEY);
  } catch {
    /* already gone */
  }
}
