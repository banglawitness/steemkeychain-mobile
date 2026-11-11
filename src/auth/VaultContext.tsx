import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {AppState} from 'react-native';
import {parseKeychainExport} from '../crypto/keychainExport';
import {clearFailures, formatWait, lockoutRemaining, readAutoLock, registerFailure} from '../storage/security';
import {
  biometricAvailable,
  biometricEnabled,
  clearActiveAccount,
  createPin,
  disableBiometric,
  getActiveAccount,
  hasPin,
  readAccounts,
  readBiometricPin,
  saveAccounts,
  saveBiometricPin,
  setActiveAccount,
  wipeDevice,
} from '../storage/vault';
import {StoredAccount} from '../types';

type VaultContextValue = {
  ready: boolean;
  pinReady: boolean;
  unlocked: boolean;
  accounts: StoredAccount[];
  activeName: string | null;
  setup: (pin: string, useBiometric: boolean) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<void>;
  unlockWithBiometric: () => Promise<void>;
  lock: () => void;
  importExport: (raw: string, password: string) => Promise<number>;
  importAccounts: (imported: StoredAccount[]) => Promise<number>;
  saveAccount: (account: StoredAccount) => Promise<void>;
  removeKey: (name: string, role: 'posting' | 'active' | 'memo') => Promise<void>;
  forgetAccount: (name: string) => Promise<void>;
  selectAccount: (name: string) => Promise<void>;
  setBiometric: (enabled: boolean) => Promise<void>;
  wipe: () => Promise<void>;
};

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({children}: {children: React.ReactNode}) {
  const [ready, setReady] = useState(false);
  const [pinReady, setPinReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [activeName, setActiveName] = useState<string | null>(null);

  const unlockedRef = useRef(false);
  unlockedRef.current = unlocked;

  useEffect(() => {
    hasPin()
      .then(setPinReady)
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    let backgroundAt = 0;
    const lockNow = () => {
      setUnlocked(false);
      setPin(null);
      setAccounts([]);
    };
    const sub = AppState.addEventListener('change', async next => {
      if (!unlockedRef.current) return;
      const seconds = await readAutoLock();
      if (seconds < 0) return;
      if (next === 'background') {
        backgroundAt = Date.now();
        if (seconds === 0) lockNow();
      }
      if (next === 'active' && backgroundAt) {
        if (Date.now() - backgroundAt >= seconds * 1000) lockNow();
        backgroundAt = 0;
      }
    });
    return () => sub.remove();
  }, []);

  const openSession = async (nextPin: string, nextAccounts: StoredAccount[]) => {
    const storedActive = await getActiveAccount();
    const active =
      nextAccounts.find(account => account.name === storedActive)?.name ??
      nextAccounts[0]?.name ??
      null;
    setPin(nextPin);
    setAccounts(nextAccounts);
    setActiveName(active);
    if (active) await setActiveAccount(active);
    setUnlocked(true);
    setPinReady(true);
  };

  const storeImported = useCallback(
    async (imported: StoredAccount[]) => {
      if (!pin) throw new Error('Unlock the wallet first.');
      const merged = new Map(accounts.map(account => [account.name, account]));
      for (const account of imported) merged.set(account.name, account);
      const nextAccounts = [...merged.values()];
      await saveAccounts(nextAccounts, pin);
      setAccounts(nextAccounts);
      const stillThere = Boolean(activeName && nextAccounts.some(account => account.name === activeName));
      const chosen = stillThere ? activeName : nextAccounts[0]?.name ?? null;
      setActiveName(chosen);
      if (chosen) await setActiveAccount(chosen);
      else await clearActiveAccount();
      return imported.length;
    },
    [accounts, activeName, pin],
  );

  const value = useMemo<VaultContextValue>(
    () => ({
      ready,
      pinReady,
      unlocked,
      accounts,
      activeName,
      setup: async (nextPin, useBiometric) => {
        await createPin(nextPin, useBiometric);
        await openSession(nextPin, []);
      },
      unlockWithPin: async nextPin => {
        const wait = await lockoutRemaining();
        if (wait > 0) throw new Error(`Too many attempts. Try again in ${formatWait(wait)}.`);
        try {
          const nextAccounts = await readAccounts(nextPin);
          await clearFailures();
          await openSession(nextPin, nextAccounts);
        } catch {
          const result = await registerFailure();
          if (result.locked) throw new Error('Too many attempts. Locked for 5 minutes.');
          throw new Error(result.left ? `Wrong PIN. ${result.left} attempts left.` : 'Wrong PIN.');
        }
      },
      unlockWithBiometric: async () => {
        const wait = await lockoutRemaining();
        if (wait > 0) throw new Error(`Too many attempts. Try again in ${formatWait(wait)}.`);
        const enabled = await biometricEnabled();
        if (!enabled) throw new Error('Biometric unlock is not turned on for this wallet.');
        const nextPin = await readBiometricPin();
        if (!nextPin) throw new Error('Fingerprint was cancelled.');
        const nextAccounts = await readAccounts(nextPin);
        await openSession(nextPin, nextAccounts);
      },
      lock: () => {
        setUnlocked(false);
        setPin(null);
        setAccounts([]);
      },
      importAccounts: storeImported,
      importExport: async (raw, password) => storeImported(parseKeychainExport(raw, password)),
      saveAccount: async account => {
        const existing = accounts.find(item => item.name === account.name);
        const next = existing
          ? {name: account.name, keys: {...existing.keys, ...account.keys}}
          : account;
        await storeImported([next]);
        setActiveName(account.name);
        await setActiveAccount(account.name);
      },
      removeKey: async (name, role) => {
        const existing = accounts.find(item => item.name === name);
        if (!existing) throw new Error('That account is not in this wallet.');
        const keys = {...existing.keys};
        delete keys[role];
        delete keys[role === 'memo' ? 'memoPubkey' : role === 'active' ? 'activePubkey' : 'postingPubkey'];
        if (!keys.posting && !keys.active && !keys.memo) {
          throw new Error('Keep at least one private key, or forget the account.');
        }
        await storeImported([{name, keys}]);
      },
      forgetAccount: async name => {
        if (!pin) throw new Error('Unlock the wallet first.');
        const nextAccounts = accounts.filter(account => account.name !== name);
        await saveAccounts(nextAccounts, pin);
        setAccounts(nextAccounts);
        if (activeName === name) {
          const nextActive = nextAccounts[0]?.name ?? null;
          setActiveName(nextActive);
          if (nextActive) await setActiveAccount(nextActive);
          else await clearActiveAccount();
        }
      },
      selectAccount: async name => {
        setActiveName(name);
        await setActiveAccount(name);
      },
      setBiometric: async enabled => {
        if (!pin) throw new Error('Unlock the wallet first.');
        if (enabled) {
          if (!(await biometricAvailable())) throw new Error('This phone has no fingerprint or Face ID set up.');
          await saveBiometricPin(pin);
        } else {
          await disableBiometric();
        }
      },
      wipe: async () => {
        await wipeDevice();
        setUnlocked(false);
        setPin(null);
        setAccounts([]);
        setActiveName(null);
        setPinReady(false);
      },
    }),
    [ready, pinReady, unlocked, accounts, activeName, pin, storeImported],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault() {
  const value = useContext(VaultContext);
  if (!value) throw new Error('useVault must be used inside VaultProvider');
  return value;
}
